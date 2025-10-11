import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../config/database.js';

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { numero, password } = req.body;

    if (!numero || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Número e password são obrigatórios' 
      });
    }

    // Buscar utilizador
    const result = await pool.query(
      'SELECT * FROM utilizadores WHERE numero = $1 AND ativo = true',
      [numero]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ 
        success: false, 
        message: 'Funcionário não encontrado' 
      });
    }

    const user = result.rows[0];

    // Verificar password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!validPassword) {
      return res.status(401).json({ 
        success: false, 
        message: 'Password incorreta' 
      });
    }

    // Gerar token JWT
    const token = jwt.sign(
      { 
        id: user.id, 
        numero: user.numero, 
        cargo: user.cargo 
      },
      process.env.JWT_SECRET || 'secret_temporario_mude_em_producao',
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        numero: user.numero,
        nome: user.nome,
        cargo: user.cargo,
        email: user.email
      }
    });

  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro no servidor' 
    });
  }
});

// POST /api/auth/change-password
router.post('/change-password', async (req, res) => {
  try {
    const { numero, currentPassword, newPassword } = req.body;

    if (!numero || !currentPassword || !newPassword) {
      return res.status(400).json({ 
        success: false, 
        message: 'Todos os campos são obrigatórios' 
      });
    }

    // Buscar utilizador
    const result = await pool.query(
      'SELECT * FROM utilizadores WHERE numero = $1',
      [numero]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Utilizador não encontrado' 
      });
    }

    const user = result.rows[0];

    // Verificar password atual
    const validPassword = await bcrypt.compare(currentPassword, user.password_hash);
    
    if (!validPassword) {
      return res.status(401).json({ 
        success: false, 
        message: 'Password atual incorreta' 
      });
    }

    // Hash da nova password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // Atualizar password
    await pool.query(
      'UPDATE utilizadores SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newPasswordHash, user.id]
    );

    res.json({
      success: true,
      message: 'Password alterada com sucesso'
    });

  } catch (error) {
    console.error('Erro ao alterar password:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro no servidor' 
    });
  }
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { numero, nome, email, cargo, password } = req.body;

    // Validações
    if (!numero || !nome || !email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Todos os campos são obrigatórios' 
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: 'A password deve ter pelo menos 6 caracteres' 
      });
    }

    // Verificar se o número já existe
    const existingUser = await pool.query(
      'SELECT id FROM utilizadores WHERE numero = $1',
      [numero]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ 
        success: false, 
        message: 'Número de funcionário já registado' 
      });
    }

    // Verificar se o email já existe
    const existingEmail = await pool.query(
      'SELECT id FROM utilizadores WHERE email = $1',
      [email]
    );

    if (existingEmail.rows.length > 0) {
      return res.status(409).json({ 
        success: false, 
        message: 'Email já registado' 
      });
    }

    // Hash da password
    const passwordHash = await bcrypt.hash(password, 10);

    // Inserir novo utilizador
    const result = await pool.query(
      `INSERT INTO utilizadores (numero, nome, email, cargo, password_hash, ativo) 
       VALUES ($1, $2, $3, $4, $5, true) 
       RETURNING id, numero, nome, email, cargo`,
      [numero, nome, email, cargo || 'Tripulante', passwordHash]
    );

    const newUser = result.rows[0];

    res.status(201).json({
      success: true,
      message: 'Conta criada com sucesso',
      user: {
        id: newUser.id,
        numero: newUser.numero,
        nome: newUser.nome,
        email: newUser.email,
        cargo: newUser.cargo
      }
    });

  } catch (error) {
    console.error('Erro ao criar conta:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro no servidor ao criar conta' 
    });
  }
});

export default router;


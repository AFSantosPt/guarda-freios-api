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

export default router;


require('dotenv').config();
const express = require("express");
const cors = require("cors");
const { Pool } = require('pg');

const app = express();

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());

// PostgreSQL Pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Erro ao conectar ao PostgreSQL:', err);
  } else {
    console.log('✅ PostgreSQL conectado:', res.rows[0].now);
  }
});

// ==========================================
// ROTAS DE AUTENTICAÇÃO
// ==========================================

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
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
      'SELECT * FROM utilizadores WHERE numero = $1',
      [numero]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Funcionário não encontrado'
      });
    }

    const user = result.rows[0];

    // Verificar password (em produção, usar bcrypt)
    if (user.password_hash !== password) {
      return res.status(401).json({
        success: false,
        message: 'Password incorreta'
      });
    }

    // Login bem-sucedido
    res.json({
      success: true,
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
      message: 'Erro interno do servidor'
    });
  }
});

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
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

    // Inserir novo utilizador (em produção, usar bcrypt para hash)
    const result = await pool.query(
      `INSERT INTO utilizadores (numero, nome, email, cargo, password_hash, ativo) 
       VALUES ($1, $2, $3, $4, $5, true) 
       RETURNING id, numero, nome, email, cargo`,
      [numero, nome, email, cargo || 'Tripulante', password]
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

// PUT /api/auth/users/:id
app.put('/api/auth/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, email, cargo, password } = req.body;

    if (!nome || !email || !cargo) {
      return res.status(400).json({
        success: false,
        message: 'Nome, email e cargo são obrigatórios'
      });
    }

    // Verificar se o utilizador existe
    const userCheck = await pool.query(
      'SELECT id FROM utilizadores WHERE id = $1',
      [id]
    );

    if (userCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Utilizador não encontrado'
      });
    }

    // Verificar se o email já existe em outro utilizador
    const emailCheck = await pool.query(
      'SELECT id FROM utilizadores WHERE email = $1 AND id != $2',
      [email, id]
    );

    if (emailCheck.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Email já está em uso por outro utilizador'
      });
    }

    // Atualizar utilizador
    let query, params;
    if (password && password.length >= 6) {
      // Atualizar com nova password
      query = `UPDATE utilizadores 
               SET nome = $1, email = $2, cargo = $3, password_hash = $4, updated_at = NOW() 
               WHERE id = $5 
               RETURNING id, numero, nome, email, cargo`;
      params = [nome, email, cargo, password, id];
    } else {
      // Atualizar sem alterar password
      query = `UPDATE utilizadores 
               SET nome = $1, email = $2, cargo = $3, updated_at = NOW() 
               WHERE id = $4 
               RETURNING id, numero, nome, email, cargo`;
      params = [nome, email, cargo, id];
    }

    const result = await pool.query(query, params);
    const updatedUser = result.rows[0];

    res.json({
      success: true,
      message: 'Utilizador atualizado com sucesso',
      user: updatedUser
    });

  } catch (error) {
    console.error('Erro ao atualizar utilizador:', error);
    res.status(500).json({
      success: false,
      message: 'Erro no servidor ao atualizar utilizador'
    });
  }
});

// DELETE /api/auth/users/:id
app.delete('/api/auth/users/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar se o utilizador existe
    const userCheck = await pool.query(
      'SELECT id, numero, nome FROM utilizadores WHERE id = $1',
      [id]
    );

    if (userCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Utilizador não encontrado'
      });
    }

    // Desativar utilizador em vez de excluir (soft delete)
    await pool.query(
      'UPDATE utilizadores SET ativo = false, updated_at = NOW() WHERE id = $1',
      [id]
    );

    res.json({
      success: true,
      message: 'Utilizador desativado com sucesso'
    });

  } catch (error) {
    console.error('Erro ao excluir utilizador:', error);
    res.status(500).json({
      success: false,
      message: 'Erro no servidor ao excluir utilizador'
    });
  }
});

// GET /api/auth/users
app.get('/api/auth/users', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, numero, nome, email, cargo, ativo, created_at 
       FROM utilizadores 
       WHERE ativo = true 
       ORDER BY nome ASC`
    );

    res.json({
      success: true,
      users: result.rows
    });

  } catch (error) {
    console.error('Erro ao buscar utilizadores:', error);
    res.status(500).json({
      success: false,
      message: 'Erro no servidor ao buscar utilizadores'
    });
  }
});

// POST /api/auth/change-password
app.post('/api/auth/change-password', async (req, res) => {
  try {
    const { numero, currentPassword, newPassword } = req.body;

    if (!numero || !currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Todos os campos são obrigatórios'
      });
    }

    // Verificar password atual
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

    if (user.password_hash !== currentPassword) {
      return res.status(401).json({
        success: false,
        message: 'Password atual incorreta'
      });
    }

    // Atualizar password
    await pool.query(
      'UPDATE utilizadores SET password_hash = $1, updated_at = NOW() WHERE numero = $2',
      [newPassword, numero]
    );

    res.json({
      success: true,
      message: 'Password alterada com sucesso'
    });

  } catch (error) {
    console.error('Erro ao alterar password:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// ==========================================
// ROTAS DE GPS
// ==========================================

// POST /api/gps/update
app.post('/api/gps/update', async (req, res) => {
  try {
    const {
      tripulante_id,
      veiculo_id,
      carreira_id,
      latitude,
      longitude,
      precisao,
      velocidade
    } = req.body;

    if (!tripulante_id || !latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Dados incompletos'
      });
    }

    // Desativar posições antigas do tripulante
    await pool.query(
      'UPDATE gps_positions SET ativo = false WHERE tripulante_id = $1',
      [tripulante_id]
    );

    // Inserir nova posição
    const result = await pool.query(
      `INSERT INTO gps_positions 
       (tripulante_id, veiculo_id, carreira_id, latitude, longitude, precisao, velocidade, ativo) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, true) 
       RETURNING *`,
      [tripulante_id, veiculo_id, carreira_id, latitude, longitude, precisao, velocidade]
    );

    res.json({
      success: true,
      position: result.rows[0]
    });

  } catch (error) {
    console.error('Erro ao atualizar GPS:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// GET /api/gps/carreira/:codigo
app.get('/api/gps/carreira/:codigo', async (req, res) => {
  try {
    const { codigo } = req.params;

    const result = await pool.query(
      `SELECT 
        gp.id,
        gp.latitude,
        gp.longitude,
        gp.precisao,
        gp.velocidade,
        gp.timestamp,
        u.numero as tripulante_numero,
        u.nome as tripulante_nome,
        v.chapa as veiculo_chapa,
        c.codigo as carreira_codigo
       FROM gps_positions gp
       JOIN utilizadores u ON gp.tripulante_id = u.id
       LEFT JOIN veiculos v ON gp.veiculo_id = v.id
       JOIN carreiras c ON gp.carreira_id = c.id
       WHERE c.codigo = $1 AND gp.ativo = true
       ORDER BY gp.timestamp DESC`,
      [codigo]
    );

    res.json({
      success: true,
      positions: result.rows
    });

  } catch (error) {
    console.error('Erro ao buscar GPS:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// POST /api/gps/stop
app.post('/api/gps/stop', async (req, res) => {
  try {
    const { tripulante_id } = req.body;

    if (!tripulante_id) {
      return res.status(400).json({
        success: false,
        message: 'tripulante_id é obrigatório'
      });
    }

    await pool.query(
      'UPDATE gps_positions SET ativo = false WHERE tripulante_id = $1',
      [tripulante_id]
    );

    res.json({
      success: true,
      message: 'GPS desativado'
    });

  } catch (error) {
    console.error('Erro ao parar GPS:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// ==========================================
// ROTAS DE CHECK-INS
// ==========================================

// POST /api/checkins
app.post('/api/checkins', async (req, res) => {
  try {
    const {
      tripulante_id,
      servico_id,
      veiculo_id,
      local,
      latitude,
      longitude,
      tipo
    } = req.body;

    if (!tripulante_id || !local) {
      return res.status(400).json({
        success: false,
        message: 'Dados incompletos'
      });
    }

    const result = await pool.query(
      `INSERT INTO check_ins 
       (tripulante_id, servico_id, veiculo_id, local, latitude, longitude, tipo) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING *`,
      [tripulante_id, servico_id, veiculo_id, local, latitude, longitude, tipo || 'Rendição']
    );

    res.json({
      success: true,
      checkin: result.rows[0]
    });

  } catch (error) {
    console.error('Erro ao criar check-in:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// GET /api/checkins/carreira/:codigo
app.get('/api/checkins/carreira/:codigo', async (req, res) => {
  try {
    const { codigo } = req.params;

    const result = await pool.query(
      `SELECT 
        ci.id,
        ci.local,
        ci.tipo,
        ci.timestamp,
        u.numero as tripulante_numero,
        u.nome as tripulante_nome,
        v.chapa as veiculo_chapa
       FROM check_ins ci
       JOIN utilizadores u ON ci.tripulante_id = u.id
       LEFT JOIN veiculos v ON ci.veiculo_id = v.id
       LEFT JOIN servicos s ON ci.servico_id = s.id
       LEFT JOIN carreiras c ON v.carreira_id = c.id
       WHERE c.codigo = $1
       ORDER BY ci.timestamp DESC
       LIMIT 50`,
      [codigo]
    );

    res.json({
      success: true,
      checkins: result.rows
    });

  } catch (error) {
    console.error('Erro ao buscar check-ins:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// ==========================================
// SERVIÇOS
// ==========================================

// GET /api/servicos - Listar serviços do utilizador
app.get('/api/servicos', async (req, res) => {
  try {
    const { tripulante_id, mes, ano } = req.query;

    if (!tripulante_id) {
      return res.status(400).json({
        success: false,
        message: 'tripulante_id é obrigatório'
      });
    }

    let query = `
      SELECT 
        s.id,
        s.data,
        s.hora_inicio,
        s.hora_fim,
        s.local_inicio,
        s.local_fim,
        s.estado,
        s.observacoes
      FROM servicos s
      WHERE s.tripulante_id = $1
    `;

    const params = [tripulante_id];

    if (mes && ano) {
      query += ` AND EXTRACT(MONTH FROM s.data) = $2 AND EXTRACT(YEAR FROM s.data) = $3`;
      params.push(mes, ano);
    }

    query += ` ORDER BY s.data ASC, s.hora_inicio ASC`;

    const result = await pool.query(query, params);

    res.json({
      success: true,
      servicos: result.rows
    });

  } catch (error) {
    console.error('Erro ao buscar serviços:', error);
    res.status(500).json({
      success: false,
      message: 'Erro no servidor'
    });
  }
});

// GET /api/servicos/auto-preenchimento - Obter sugestão de auto-preenchimento
app.get('/api/servicos/auto-preenchimento', async (req, res) => {
  try {
    const { tripulante_id, numero_servico } = req.query;

    if (!tripulante_id || !numero_servico) {
      return res.status(400).json({
        success: false,
        message: 'tripulante_id e numero_servico são obrigatórios'
      });
    }

    // Buscar histórico do serviço
    const result = await pool.query(
      `SELECT * FROM servicos_historico 
       WHERE tripulante_id = $1 AND numero_servico = $2`,
      [tripulante_id, numero_servico]
    );

    if (result.rows.length > 0 && result.rows[0].contagem >= 5) {
      res.json({
        success: true,
        auto_preenchimento: true,
        dados: {
          local_inicio: result.rows[0].local_inicio,
          local_fim: result.rows[0].local_fim,
          hora_inicio: result.rows[0].hora_inicio,
          hora_fim: result.rows[0].hora_fim,
          numero_chapa: result.rows[0].numero_chapa,
          afetacao: result.rows[0].afetacao
        }
      });
    } else {
      res.json({
        success: true,
        auto_preenchimento: false
      });
    }

  } catch (error) {
    console.error('Erro ao buscar auto-preenchimento:', error);
    res.status(500).json({
      success: false,
      message: 'Erro no servidor'
    });
  }
});

// POST /api/servicos - Criar novo serviço
app.post('/api/servicos', async (req, res) => {
  try {
    const {
      tripulante_id,
      numero_servico,
      data,
      local_inicio,
      local_fim,
      hora_inicio,
      hora_fim,
      numero_chapa,
      afetacao
    } = req.body;

    if (!tripulante_id || !numero_servico || !data || !local_inicio || !local_fim || 
        !hora_inicio || !hora_fim || !numero_chapa || !afetacao) {
      return res.status(400).json({
        success: false,
        message: 'Todos os campos são obrigatórios'
      });
    }

    // Inserir serviço
    const servicoResult = await pool.query(
      `INSERT INTO servicos 
       (tripulante_id, data, hora_inicio, hora_fim, local_inicio, local_fim, estado, observacoes) 
       VALUES ($1, $2, $3, $4, $5, $6, 'Agendado', $7) 
       RETURNING *`,
      [tripulante_id, data, hora_inicio, hora_fim, local_inicio, local_fim, 
       `Serviço: ${numero_servico} | Chapa: ${numero_chapa} | Afetação: ${afetacao}`]
    );

    // Atualizar ou criar histórico
    await pool.query(
      `INSERT INTO servicos_historico 
       (tripulante_id, numero_servico, local_inicio, local_fim, hora_inicio, hora_fim, numero_chapa, afetacao, contagem)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1)
       ON CONFLICT (tripulante_id, numero_servico) 
       DO UPDATE SET 
         local_inicio = $3,
         local_fim = $4,
         hora_inicio = $5,
         hora_fim = $6,
         numero_chapa = $7,
         afetacao = $8,
         contagem = servicos_historico.contagem + 1,
         edicoes_count = CASE 
           WHEN servicos_historico.contagem >= 3 AND 
                (servicos_historico.local_inicio != $3 OR 
                 servicos_historico.local_fim != $4 OR 
                 servicos_historico.hora_inicio != $5 OR 
                 servicos_historico.hora_fim != $6 OR 
                 servicos_historico.numero_chapa != $7 OR 
                 servicos_historico.afetacao != $8)
           THEN servicos_historico.edicoes_count + 1
           ELSE servicos_historico.edicoes_count
         END,
         ultima_edicao = CURRENT_TIMESTAMP`,
      [tripulante_id, numero_servico, local_inicio, local_fim, hora_inicio, hora_fim, numero_chapa, afetacao]
    );

    res.status(201).json({
      success: true,
      message: 'Serviço criado com sucesso',
      servico: servicoResult.rows[0]
    });

  } catch (error) {
    console.error('Erro ao criar serviço:', error);
    res.status(500).json({
      success: false,
      message: 'Erro no servidor'
    });
  }
});

// DELETE /api/servicos/:id - Excluir serviço
app.delete('/api/servicos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { tripulante_id } = req.query;

    if (!tripulante_id) {
      return res.status(400).json({
        success: false,
        message: 'tripulante_id é obrigatório'
      });
    }

    // Verificar se o serviço pertence ao tripulante
    const checkResult = await pool.query(
      'SELECT id FROM servicos WHERE id = $1 AND tripulante_id = $2',
      [id, tripulante_id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Serviço não encontrado ou não pertence ao utilizador'
      });
    }

    // Excluir serviço
    await pool.query('DELETE FROM servicos WHERE id = $1', [id]);

    res.json({
      success: true,
      message: 'Serviço excluído com sucesso'
    });

  } catch (error) {
    console.error('Erro ao excluir serviço:', error);
    res.status(500).json({
      success: false,
      message: 'Erro no servidor'
    });
  }
});

// ==========================================
// HEALTH CHECK
// ==========================================

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Guarda-Freios API',
    version: '2.0.0'
  });
});

// ==========================================
// ROOT
// ==========================================

app.get('/', (req, res) => {
  res.json({
    message: 'API do Guarda-Freios 🚋',
    version: '2.0.0',
    endpoints: {
      auth: ['/api/auth/login', '/api/auth/change-password'],
      gps: ['/api/gps/update', '/api/gps/carreira/:codigo', '/api/gps/stop'],
      checkins: ['/api/checkins', '/api/checkins/carreira/:codigo'],
      health: '/health'
    }
  });
});

// ==========================================
// START SERVER
// ==========================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor a correr na porta ${PORT}`);
  console.log(`📊 Ambiente: ${process.env.NODE_ENV || 'development'}`);
});


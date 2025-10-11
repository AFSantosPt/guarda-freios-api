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
    if (user.password !== password) {
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

    if (user.password !== currentPassword) {
      return res.status(401).json({
        success: false,
        message: 'Password atual incorreta'
      });
    }

    // Atualizar password
    await pool.query(
      'UPDATE utilizadores SET password = $1, updated_at = NOW() WHERE numero = $2',
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


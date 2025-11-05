require('dotenv').config();
const express = require("express");
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require("cors");
const { Pool } = require('pg');

const app = express();

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'https://guarda-freios.vercel.app',
  credentials: true
}));
app.use(express.json());

// Middleware de autenticação JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) return res.sendStatus(401); // Sem token

  jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret', (err, user) => {
    if (err) return res.sendStatus(403); // Token inválido ou expirado
    req.user = user;
    next();
  });
};

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
    
    // Adicionar utilizador de teste 180939/andres91 (Gestor)
    bcrypt.hash('andres91', 10).then(hashedPassword => {
      pool.query(
        `INSERT INTO utilizadores (numero, nome, email, cargo, password_hash, ativo) 
         VALUES ($1, $2, $3, $4, $5, true) 
         ON CONFLICT (numero) DO NOTHING`,
        ['180939', 'André Santos', 'afsantospt91@gmail.com', 'Gestor', hashedPassword]
      ).then(() => {
        console.log('✅ Utilizador de teste 180939 adicionado/verificado.');
      }).catch(err => {
        console.error('❌ Erro ao adicionar utilizador de teste:', err);
      });
    });
  }
});

// ==========================================
// ROTAS DE AUTENTICAÇÃO
// ==========================================

// Iniciar servidor
app.listen(process.env.PORT || 3000, () => {
  console.log(`🚀 Servidor a correr na porta ${process.env.PORT || 3000}`);
});

// POST /api/auth/login
// 🔐 1️⃣ LOGIN - Adicionar mensagem de erro clara: “Utilizador ou senha inválidos”
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

    // Verificar password com bcrypt
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Utilizador ou senha inválidos'
      });
    }

    // Gerar JWT
    const token = jwt.sign(
      { id: user.id, numero: user.numero, cargo: user.cargo },
      process.env.JWT_SECRET || 'your_jwt_secret', // Usar variável de ambiente
      { expiresIn: '1d' } // Token expira em 1 dia
    );

    // Login bem-sucedido
    res.json({
      success: true,
      token: token,
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

    // Hash da password com bcrypt
    const hashedPassword = await bcrypt.hash(password, 10);

    // Inserir novo utilizador
    const result = await pool.query(
      `INSERT INTO utilizadores (numero, nome, email, cargo, password_hash, ativo) 
       VALUES ($1, $2, $3, $4, $5, true) 
       RETURNING id, numero, nome, email, cargo`,
      [numero, nome, email, cargo || 'Tripulante', hashedPassword]
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
app.put('/api/auth/users/:id', authenticateToken, async (req, res) => {
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
      // Hash da nova password
      const hashedPassword = await bcrypt.hash(password, 10);
      
      // Atualizar com nova password
      query = `UPDATE utilizadores 
               SET nome = $1, email = $2, cargo = $3, password_hash = $4, updated_at = NOW() 
               WHERE id = $5 
               RETURNING id, numero, nome, email, cargo`;
      params = [nome, email, cargo, hashedPassword, id];
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
app.delete('/api/auth/users/:id', authenticateToken, async (req, res) => {
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
// 🌍 7️⃣ ATUALIZAÇÃO AUTOMÁTICA DOS TRAJETOS (Carris)
// Implementar cache (24h) e CRON job diário às 03:00 (hora Lisboa) para atualizar todos os trajetos.
const axios = require('axios');
const cheerio = require('cheerio');
const cron = require('node-cron');

// Estrutura de cache para trajetos (simulação)
const trajetosCache = {};

// Função de scraping
async function scrapeTrajeto(carreira) {
  const url = `https://www.carris.pt/viaje/carreiras/${carreira}/`;
  try {
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);

    const nomeCompleto = $('.page-title').text().trim();
    const descricao = $('.page-description').text().trim();
    const paragens = [];
    $('.stop-list li').each((i, el) => {
      paragens.push($(el).text().trim());
    });
    // Simulação de URL do mapa (o scraping real é complexo)
    const mapaUrl = `https://www.carris.pt/mapa-${carreira}.png`; 

    const trajeto = {
      carreira: carreira,
      descricao: nomeCompleto,
      paragens: paragens,
      mapaUrl: mapaUrl,
      ultimaAtualizacao: new Date().toISOString()
    };

    // Guardar na cache (simulação de guardar na DB)
    trajetosCache[carreira] = trajeto;
    return trajeto;

  } catch (error) {
    console.error(`Erro ao fazer scraping da carreira ${carreira}:`, error.message);
    return null;
  }
}

// CRON job diário às 03:00 (hora Lisboa)
cron.schedule('0 0 3 * * *', async () => {
  console.log('A executar CRON job: Atualização automática dos trajetos da Carris...');
  // Lista de carreiras a atualizar (exemplo)
  const carreiras = ['12E', '28E', '736']; 
  for (const carreira of carreiras) {
    await scrapeTrajeto(carreira);
  }
  console.log('CRON job concluído.');
}, {
  timezone: "Europe/Lisbon"
});

// Endpoint GET /api/trajetos/atualizar/:carreira
app.get('/api/trajetos/atualizar/:carreira', authenticateToken, async (req, res) => {
  const { carreira } = req.params;

  // 1. Verificar cache (24h)
  const cacheEntry = trajetosCache[carreira];
  if (cacheEntry && (new Date() - new Date(cacheEntry.ultimaAtualizacao)) < 24 * 60 * 60 * 1000) {
    return res.json({
      success: true,
      source: 'cache',
      trajeto: cacheEntry
    });
  }

  // 2. Fazer scraping
  const trajeto = await scrapeTrajeto(carreira);

  if (trajeto) {
    res.json({
      success: true,
      source: 'scrape',
      trajeto: trajeto
    });
  } else {
    res.status(500).json({
      success: false,
      message: 'Trajeto temporariamente indisponível'
    });
  }
});

// GET /api/auth/users
app.get('/api/auth/users', authenticateToken, async (req, res) => {
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
app.post('/api/auth/change-password', authenticateToken, async (req, res) => {
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
      return res.status(401).json({
        success: false,
        message: 'Utilizador ou senha inválidos'
      });
    }

    const user = result.rows[0];

    if (user.password_hash !== currentPassword) {
      return res.status(401).json({
        success: false,
        message: 'Utilizador ou senha inválidos'
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
// ROTAS DE ORDENS DE SERVIÇO
// ==========================================

// POST /api/ordens
app.post('/api/ordens', authenticateToken, async (req, res) => {
  try {
    // 4️⃣ GESTÃO DE ORDENS DE SERVIÇO
    // Permitir que gestores adicionem: Campo “Assunto”, Upload de ficheiros (PDF, DOCX, imagens), Campo “Tempo estimado da ordem de serviço”
    if (req.user.cargo !== 'Gestor') {
      return res.status(403).json({ success: false, message: 'Apenas gestores podem criar ordens de serviço' });
    }

    const { assunto, tempo_estimado, ficheiros } = req.body; // ficheiros será um array de URLs após upload no frontend

    if (!assunto || !tempo_estimado) {
      return res.status(400).json({ success: false, message: 'Assunto e tempo estimado são obrigatórios' });
    }

    const result = await pool.query(
      `INSERT INTO ordens_servico (assunto, tempo_estimado, ficheiros, criado_por) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [assunto, tempo_estimado, ficheiros || [], req.user.id]
    );

    res.status(201).json({ success: true, ordem: result.rows[0] });

  } catch (error) {
    console.error('Erro ao criar ordem de serviço:', error);
    res.status(500).json({ success: false, message: 'Erro interno do servidor' });
  }
});

// GET /api/ordens
app.get('/api/ordens', authenticateToken, async (req, res) => {
  try {
    // Tornar as ordens visíveis a todos os utilizadores.
    const result = await pool.query(
      `SELECT os.*, u.nome as criado_por_nome 
       FROM ordens_servico os
       JOIN utilizadores u ON os.criado_por = u.id
       ORDER BY os.criado_em DESC`
    );

    res.json({ success: true, ordens: result.rows });

  } catch (error) {
    console.error('Erro ao buscar ordens de serviço:', error);
    res.status(500).json({ success: false, message: 'Erro interno do servidor' });
  }
});

// ==========================================
// ROTAS DE AVARIAS
// ==========================================

// POST /api/avariass
app.post('/api/avariass', authenticateToken, async (req, res) => {
  try {
    // 3️⃣ GESTÃO DE AVARIAS
    // Trocar o campo “Chapa” por “Nº Veículo”.
    const { numero_veiculo, descricao, ficheiros } = req.body; // ficheiros será um array de URLs após upload no frontend

    if (!numero_veiculo || !descricao) {
      return res.status(400).json({ success: false, message: 'Número do veículo e descrição são obrigatórios' });
    }

    const result = await pool.query(
      `INSERT INTO avarias (numero_veiculo, descricao, ficheiros, reportado_por) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [numero_veiculo, descricao, ficheiros || [], req.user.id]
    );

    res.status(201).json({ success: true, avaria: result.rows[0] });

  } catch (error) {
    console.error('Erro ao reportar avaria:', error);
    res.status(500).json({ success: false, message: 'Erro interno do servidor' });
  }
});

// DELETE /api/avariass/:id
app.delete('/api/avariass/:id', authenticateToken, async (req, res) => {
  try {
    // Apenas gestores podem apagar avarias
    if (req.user.cargo !== 'Gestor') {
      return res.status(403).json({ success: false, message: 'Apenas gestores podem apagar avarias' });
    }

    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM avarias WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Avaria não encontrada' });
    }

    res.json({ success: true, message: 'Avaria apagada com sucesso' });

  } catch (error) {
    console.error('Erro ao apagar avaria:', error);
    res.status(500).json({ success: false, message: 'Erro interno do servidor' });
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
// ==========================================
// ORDENS DE SERVIÇO
// ==========================================

// GET /api/ordens - Listar todas as ordens ativas
app.get("/api/ordens", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        o.*,
        u.nome as criador_nome,
        u.cargo as criador_cargo
       FROM ordens_servico o
       LEFT JOIN utilizadores u ON o.criado_por = u.id
       WHERE o.ativo = true AND (o.expira_em IS NULL OR o.expira_em > NOW())
       ORDER BY o.created_at DESC`
    );

    res.json({
      success: true,
      ordens: result.rows
    });

  } catch (error) {
    console.error("Erro ao buscar ordens:", error);
    res.status(500).json({
      success: false,
      message: "Erro no servidor"
    });
  }
});

// POST /api/ordens - Criar nova ordem (apenas Gestores)
app.post("/api/ordens", async (req, res) => {
  try {
    const {
      criado_por,
      assunto,
      descricao,
      ficheiro_url,
      ficheiro_nome,
      tempo_expiracao
    } = req.body;

    if (!criado_por || !assunto || !descricao) {
      return res.status(400).json({
        success: false,
        message: "Criado_por, assunto e descrição são obrigatórios"
      });
    }

    let expira_em = null;
    if (tempo_expiracao && tempo_expiracao > 0) {
      expira_em = new Date();
      expira_em.setHours(expira_em.getHours() + parseInt(tempo_expiracao));
    }

    const result = await pool.query(
      `INSERT INTO ordens_servico 
       (criado_por, assunto, descricao, ficheiro_url, ficheiro_nome, expira_em) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING *`,
      [criado_por, assunto, descricao, ficheiro_url, ficheiro_nome, expira_em]
    );

    res.status(201).json({
      success: true,
      message: "Ordem de serviço criada com sucesso",
      ordem: result.rows[0]
    });

  } catch (error) {
    console.error("Erro ao criar ordem:", error);
    res.status(500).json({
      success: false,
      message: "Erro no servidor"
    });
  }
});

// DELETE /api/ordens/:id - Excluir ordem (apenas Gestores)
app.delete("/api/ordens/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.query;

    if (!user_id) {
      return res.status(400).json({
        success: false,
        message: "user_id é obrigatório"
      });
    }

    const result = await pool.query(
      "UPDATE ordens_servico SET ativo = false, updated_at = NOW() WHERE id = $1 RETURNING *",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Ordem não encontrada"
      });
    }

    res.json({
      success: true,
      message: "Ordem excluída com sucesso"
    });

  } catch (error) {
    console.error("Erro ao excluir ordem:", error);
    res.status(500).json({
      success: false,
      message: "Erro no servidor"
    });
  }
});

setInterval(async () => {
  try {
    await pool.query(
      "UPDATE ordens_servico SET ativo = false WHERE expira_em IS NOT NULL AND expira_em < NOW() AND ativo = true"
    );
  } catch (error) {
    console.error("Erro ao limpar ordens expiradas:", error);
  }
}, 60000);

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


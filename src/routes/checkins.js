import express from 'express';
import pool from '../config/database.js';

const router = express.Router();

// POST /api/checkins - Criar check-in de rendição
router.post('/', async (req, res) => {
  try {
    const { tripulante_id, servico_id, veiculo_id, local, latitude, longitude, tipo } = req.body;

    if (!tripulante_id || !local) {
      return res.status(400).json({ 
        success: false, 
        message: 'Dados incompletos' 
      });
    }

    // Inserir check-in
    const result = await pool.query(
      `INSERT INTO check_ins 
       (tripulante_id, servico_id, veiculo_id, local, latitude, longitude, tipo) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING *`,
      [tripulante_id, servico_id, veiculo_id, local, latitude, longitude, tipo || 'Rendição']
    );

    const checkin = result.rows[0];

    // Adicionar observação de check-in
    await pool.query(
      `INSERT INTO observacoes 
       (carreira_id, tripulante_id, veiculo_id, tipo, mensagem, latitude, longitude) 
       SELECT v.carreira_id, $1, $2, 'Check-in', $3, $4, $5
       FROM veiculos v WHERE v.id = $2`,
      [tripulante_id, veiculo_id, `Cheguei ao ${local}`, latitude, longitude]
    );

    // TODO: Enviar notificação ao tripulante a ser rendido
    // Implementar com WebSocket ou push notifications

    res.json({
      success: true,
      checkin: checkin
    });

  } catch (error) {
    console.error('Erro ao criar check-in:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro no servidor' 
    });
  }
});

// GET /api/checkins/carreira/:codigo - Obter check-ins recentes de uma carreira
router.get('/carreira/:codigo', async (req, res) => {
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
       LEFT JOIN carreiras c ON v.carreira_id = c.id
       WHERE c.codigo = $1
       AND ci.timestamp > (CURRENT_TIMESTAMP - INTERVAL '1 day')
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
      message: 'Erro no servidor' 
    });
  }
});

export default router;


import express from 'express';
import pool from '../config/database.js';

const router = express.Router();

// POST /api/gps/update - Atualizar posição GPS
router.post('/update', async (req, res) => {
  try {
    const { tripulante_id, veiculo_id, carreira_id, latitude, longitude, precisao, velocidade } = req.body;

    if (!tripulante_id || !veiculo_id || !carreira_id || !latitude || !longitude) {
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
      message: 'Erro no servidor' 
    });
  }
});

// GET /api/gps/carreira/:codigo - Obter posições GPS ativas de uma carreira
router.get('/carreira/:codigo', async (req, res) => {
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
       JOIN veiculos v ON gp.veiculo_id = v.id
       JOIN carreiras c ON gp.carreira_id = c.id
       WHERE c.codigo = $1 
       AND gp.ativo = true
       AND gp.timestamp > (CURRENT_TIMESTAMP - INTERVAL '5 minutes')
       ORDER BY gp.timestamp DESC`,
      [codigo]
    );

    res.json({
      success: true,
      positions: result.rows
    });

  } catch (error) {
    console.error('Erro ao buscar posições GPS:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro no servidor' 
    });
  }
});

// POST /api/gps/stop - Parar partilha de GPS
router.post('/stop', async (req, res) => {
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
      message: 'Erro no servidor' 
    });
  }
});

export default router;


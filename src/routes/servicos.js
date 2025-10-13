import express from 'express';
import pool from '../config/database.js';

const router = express.Router();

// GET /api/servicos - Listar serviços do utilizador
router.get('/', async (req, res) => {
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
        s.observacoes,
        v.numero as veiculo_numero,
        v.chapa as numero_chapa,
        c.codigo as carreira_codigo
      FROM servicos s
      LEFT JOIN veiculos v ON s.veiculo_id = v.id
      LEFT JOIN carreiras c ON s.carreira_id = c.id
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
router.get('/auto-preenchimento', async (req, res) => {
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
router.post('/', async (req, res) => {
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
router.delete('/:id', async (req, res) => {
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

export default router;


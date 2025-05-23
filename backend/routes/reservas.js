const express = require('express');
const Reserva = require('../models/Reserva');

const router = express.Router();

// Listar todas as reservas
router.get('/', async (req, res) => {
  try {
    const { status, data_inicio, data_fim, pago } = req.query;
    
    let reservas;
    
    if (status) {
      // Filtrar por status
      reservas = await Reserva.buscarPorStatus(status);
    } else if (data_inicio && data_fim) {
      // Filtrar por período
      reservas = await Reserva.buscarPorPeriodo(data_inicio, data_fim);
    } else if (pago !== undefined) {
      // Filtrar por status de pagamento
      reservas = await Reserva.buscarPorStatusPagamento(pago === 'true');
    } else {
      // Listar todas
      reservas = await Reserva.listarTodas();
    }
    
    res.json({
      sucesso: true,
      reservas
    });
  } catch (error) {
    console.error('Erro ao listar reservas:', error);
    res.status(500).json({ 
      sucesso: false, 
      mensagem: 'Erro ao listar reservas'
    });
  }
});

// Buscar reserva por ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const reserva = await Reserva.buscarPorId(id);
    
    if (!reserva) {
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Reserva não encontrada'
      });
    }
    
    res.json({
      sucesso: true,
      reserva
    });
  } catch (error) {
    console.error('Erro ao buscar reserva:', error);
    res.status(500).json({ 
      sucesso: false, 
      mensagem: 'Erro ao buscar reserva'
    });
  }
});

// Verificar disponibilidade de quarto
router.get('/disponibilidade/:quarto', async (req, res) => {
  try {
    const { quarto } = req.params;
    const { data_entrada, data_saida, reserva_id } = req.query;
    
    if (!data_entrada || !data_saida) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Datas de entrada e saída são obrigatórias'
      });
    }
    
    const disponibilidade = await Reserva.verificarDisponibilidade(
      quarto, data_entrada, data_saida, reserva_id
    );
    
    res.json({
      sucesso: true,
      disponivel: disponibilidade.disponivel,
      conflitos: disponibilidade.conflitos
    });
  } catch (error) {
    console.error('Erro ao verificar disponibilidade:', error);
    res.status(500).json({ 
      sucesso: false, 
      mensagem: 'Erro ao verificar disponibilidade'
    });
  }
});

// Criar nova reserva
router.post('/', async (req, res) => {
  try {
    const { nome, cpf, quarto, data_entrada, data_saida, status, valor, pago, observacoes } = req.body;
    
    // Validações básicas
    if (!nome || !cpf || !quarto || !data_entrada || !data_saida) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Dados incompletos para criar reserva'
      });
    }
    
    const novaReserva = {
      nome,
      cpf,
      quarto,
      data_entrada,
      data_saida,
      status: status || 'ativa',
      valor: valor || null,
      pago: pago || false,
      observacoes,
      criado_por: req.user.id
    };
    
    const reservaCriada = await Reserva.criar(novaReserva);
    
    res.status(201).json({
      sucesso: true,
      mensagem: 'Reserva criada com sucesso',
      reserva: reservaCriada
    });
  } catch (error) {
    console.error('Erro ao criar reserva:', error);
    res.status(error.message.includes('não disponível') ? 409 : 500).json({ 
      sucesso: false, 
      mensagem: error.message || 'Erro ao criar reserva'
    });
  }
});

// Atualizar reserva existente
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, cpf, quarto, data_entrada, data_saida, status, valor, pago, observacoes } = req.body;
    
    // Validações básicas
    if (!nome || !cpf || !quarto || !data_entrada || !data_saida || !status) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Dados incompletos para atualizar reserva'
      });
    }
    
    const reservaAtualizada = {
      nome,
      cpf,
      quarto,
      data_entrada,
      data_saida,
      status,
      valor: valor || null,
      pago: pago || false,
      observacoes
    };
    
    const resultado = await Reserva.atualizar(id, reservaAtualizada);
    
    if (resultado.changes === 0) {
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Reserva não encontrada'
      });
    }
    
    res.json({
      sucesso: true,
      mensagem: 'Reserva atualizada com sucesso',
      id
    });
  } catch (error) {
    console.error('Erro ao atualizar reserva:', error);
    res.status(error.message.includes('não disponível') ? 409 : 500).json({ 
      sucesso: false, 
      mensagem: error.message || 'Erro ao atualizar reserva'
    });
  }
});

// Atualizar apenas o status da reserva
router.patch('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Status da reserva é obrigatório'
      });
    }
    
    const resultado = await Reserva.atualizarStatus(id, status);
    
    if (resultado.changes === 0) {
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Reserva não encontrada'
      });
    }
    
    res.json({
      sucesso: true,
      mensagem: `Reserva marcada como ${status}`,
      id,
      status
    });
  } catch (error) {
    console.error('Erro ao atualizar status da reserva:', error);
    res.status(500).json({ 
      sucesso: false, 
      mensagem: 'Erro ao atualizar status da reserva'
    });
  }
});

// Excluir reserva
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const resultado = await Reserva.excluir(id);
    
    if (resultado.changes === 0) {
      return res.status(404).json({
        sucesso: false,
        mensagem: 'Reserva não encontrada'
      });
    }
    
    res.json({
      sucesso: true,
      mensagem: 'Reserva excluída com sucesso'
    });
  } catch (error) {
    console.error('Erro ao excluir reserva:', error);
    res.status(500).json({ 
      sucesso: false, 
      mensagem: 'Erro ao excluir reserva'
    });
  }
});

module.exports = router; 
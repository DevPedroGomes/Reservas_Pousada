const express = require('express');
const Reserva = require('../models/Reserva');
const { validarReserva, sanitizarReserva } = require('../utils/validation');

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
    
    // Validar ID
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'ID da reserva inválido'
      });
    }
    
    const reserva = await Reserva.buscarPorId(parseInt(id));
    
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
    
    // Validar quarto
    const { validarQuarto, validarData, validarPeriodo } = require('../utils/validation');
    if (!validarQuarto(quarto)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Número do quarto deve estar entre 1 e 25'
      });
    }
    
    // Validar datas
    if (!data_entrada || !data_saida) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Datas de entrada e saída são obrigatórias'
      });
    }
    
    if (!validarData(data_entrada) || !validarData(data_saida)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Formato de data inválido. Use YYYY-MM-DD'
      });
    }
    
    if (!validarPeriodo(data_entrada, data_saida)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Data de entrada deve ser anterior à data de saída'
      });
    }
    
    // Validar reserva_id se fornecido
    if (reserva_id && isNaN(parseInt(reserva_id))) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'ID da reserva inválido'
      });
    }
    
    const disponibilidade = await Reserva.verificarDisponibilidade(
      parseInt(quarto), data_entrada, data_saida, reserva_id ? parseInt(reserva_id) : null
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
    // Sanitizar dados de entrada
    const dadosSanitizados = sanitizarReserva(req.body);
    
    // Validar dados
    const validacao = validarReserva(dadosSanitizados);
    if (!validacao.valido) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Dados inválidos',
        erros: validacao.erros
      });
    }
    
    const novaReserva = {
      ...dadosSanitizados,
      status: dadosSanitizados.status || 'ativa',
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
    
    // Validar ID
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'ID da reserva inválido'
      });
    }
    
    // Sanitizar dados de entrada
    const dadosSanitizados = sanitizarReserva(req.body);
    
    // Validar dados (incluindo status obrigatório para atualização)
    const validacao = validarReserva({...dadosSanitizados, status: dadosSanitizados.status || 'ativa'});
    if (!validacao.valido) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Dados inválidos',
        erros: validacao.erros
      });
    }
    
    const resultado = await Reserva.atualizar(parseInt(id), dadosSanitizados);
    
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
    
    // Validar ID
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'ID da reserva inválido'
      });
    }
    
    // Validar status
    const { validarStatus } = require('../utils/validation');
    if (!status || !validarStatus(status)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Status inválido. Use: ativa, finalizada ou cancelada'
      });
    }
    
    const resultado = await Reserva.atualizarStatus(parseInt(id), status);
    
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
    
    // Validar ID
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'ID da reserva inválido'
      });
    }
    
    const resultado = await Reserva.excluir(parseInt(id));
    
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
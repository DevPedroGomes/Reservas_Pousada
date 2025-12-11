const express = require('express');
const Reserva = require('../models/Reserva');
const Auditoria = require('../models/Auditoria');
const { validarReserva, sanitizarReserva } = require('../utils/validation');

const router = express.Router();
const authorize = (roles = []) => {
  const allowed = roles.length ? roles : ['admin', 'recepcao', 'auditoria', 'operacao'];
  return (req, res, next) => {
    if (!req.user || !allowed.includes(req.user.role)) {
      return res.status(403).json({
        sucesso: false,
        mensagem: 'Acesso negado para este perfil'
      });
    }
    next();
  };
};

// Listar todas as reservas
router.get('/', authorize(['admin', 'recepcao', 'auditoria']), async (req, res) => {
  try {
    const { status, data_inicio, data_fim, pago, page = 1, limit = 50, search = '' } = req.query;

    const pageNum = parseInt(page) || 1;
    const limitNum = Math.min(parseInt(limit) || 50, 200); // proteção
    const pagoBool = pago === 'true' ? true : pago === 'false' ? false : undefined;

    const { data, count } = await Reserva.listarTodas({
      page: pageNum,
      limit: limitNum,
      search,
      status,
      pago: pagoBool,
      data_inicio,
      data_fim
    });

    res.json({
      sucesso: true,
      reservas: data,
      meta: {
        pagina: pageNum,
        limite: limitNum,
        total: count,
        paginas: Math.ceil(count / limitNum) || 0
      }
    });
  } catch (error) {
    console.error('Erro ao listar reservas:', error);
    res.status(500).json({ 
      sucesso: false, 
      mensagem: 'Erro ao listar reservas'
    });
  }
});

// Exportar reservas em CSV
router.get('/export', authorize(['admin', 'recepcao', 'auditoria']), async (req, res) => {
  try {
    const { status, data_inicio, data_fim, pago, search = '' } = req.query;
    const pagoBool = pago === 'true' ? true : pago === 'false' ? false : undefined;

    const { data } = await Reserva.listarTodas({
      page: 1,
      limit: 1000,
      search,
      status,
      pago: pagoBool,
      data_inicio,
      data_fim
    });

    const headers = ['id', 'nome', 'cpf', 'quarto', 'data_entrada', 'data_saida', 'valor', 'pago', 'status', 'observacoes'];
    const linhas = data.map((r) =>
      headers
        .map((h) => {
          const valor = r[h] === undefined || r[h] === null ? '' : r[h];
          const texto = typeof valor === 'string' ? valor.replace(/"/g, '""') : valor;
          return `"${texto}"`;
        })
        .join(',')
    );

    const csv = [headers.join(','), ...linhas].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=\"reservas.csv\"');
    return res.send(csv);
  } catch (error) {
    console.error('Erro ao exportar reservas:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao exportar reservas'
    });
  }
});

// Histórico de auditoria por reserva
router.get('/:id/auditoria', authorize(['admin', 'recepcao', 'auditoria']), async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'ID da reserva inválido'
      });
    }

    const auditoria = await Auditoria.listarPorReserva(parseInt(id));
    res.json({ sucesso: true, auditoria });
  } catch (error) {
    console.error('Erro ao buscar auditoria:', error);
    res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao buscar histórico de auditoria'
    });
  }
});

// Buscar reserva por ID
router.get('/:id', authorize(['admin', 'recepcao', 'auditoria']), async (req, res) => {
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
router.get('/disponibilidade/:quarto', authorize(['admin', 'recepcao', 'auditoria']), async (req, res) => {
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
router.post('/', authorize(['admin', 'recepcao']), async (req, res) => {
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

    // Auditoria
    try {
      await Auditoria.registrar({
        userId: req.user.id,
        action: 'criar',
        entityId: reservaCriada.id,
        detalhes: { depois: reservaCriada },
        ip: req.ip
      });
    } catch (err) {
      console.error('Erro ao registrar auditoria (criar):', err);
    }
    
    res.status(201).json({
      sucesso: true,
      mensagem: 'Reserva criada com sucesso',
      reserva: reservaCriada
    });
  } catch (error) {
    const conflito = error.message && error.message.includes('não disponível');
    console.error('Erro ao criar reserva:', error);
    res.status(conflito ? 409 : 500).json({ 
      sucesso: false, 
      mensagem: conflito ? 'Quarto indisponível no período selecionado' : (error.message || 'Erro ao criar reserva'),
      conflitos: error.conflitos || []
    });
  }
});

// Atualizar reserva existente
router.put('/:id', authorize(['admin', 'recepcao']), async (req, res) => {
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
    
    // Dados anteriores para auditoria
    const reservaAntes = await Reserva.buscarPorId(parseInt(id));

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

    // Auditoria
    try {
      await Auditoria.registrar({
        userId: req.user.id,
        action: 'atualizar',
        entityId: parseInt(id),
        detalhes: { antes: reservaAntes, depois: dadosSanitizados },
        ip: req.ip
      });
    } catch (err) {
      console.error('Erro ao registrar auditoria (atualizar):', err);
    }
  } catch (error) {
    const conflito = error.message && error.message.includes('não disponível');
    console.error('Erro ao atualizar reserva:', error);
    res.status(conflito ? 409 : 500).json({ 
      sucesso: false, 
      mensagem: conflito ? 'Quarto indisponível no período selecionado' : (error.message || 'Erro ao atualizar reserva'),
      conflitos: error.conflitos || []
    });
  }
});

// Atualizar apenas o status da reserva
router.patch('/:id/status', authorize(['admin', 'recepcao']), async (req, res) => {
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
    
    const reservaAntes = await Reserva.buscarPorId(parseInt(id));
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

    // Auditoria
    try {
      await Auditoria.registrar({
        userId: req.user.id,
        action: 'atualizar_status',
        entityId: parseInt(id),
        detalhes: { antes: reservaAntes, depois: { ...reservaAntes, status } },
        ip: req.ip
      });
    } catch (err) {
      console.error('Erro ao registrar auditoria (status):', err);
    }
  } catch (error) {
    console.error('Erro ao atualizar status da reserva:', error);
    res.status(500).json({ 
      sucesso: false, 
      mensagem: 'Erro ao atualizar status da reserva'
    });
  }
});

// Excluir reserva
router.delete('/:id', authorize(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validar ID
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'ID da reserva inválido'
      });
    }
    
    const reservaAntes = await Reserva.buscarPorId(parseInt(id));
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

    // Auditoria
    try {
      await Auditoria.registrar({
        userId: req.user.id,
        action: 'excluir',
        entityId: parseInt(id),
        detalhes: { antes: reservaAntes },
        ip: req.ip
      });
    } catch (err) {
      console.error('Erro ao registrar auditoria (excluir):', err);
    }
  } catch (error) {
    console.error('Erro ao excluir reserva:', error);
    res.status(500).json({ 
      sucesso: false, 
      mensagem: 'Erro ao excluir reserva'
    });
  }
});

module.exports = router; 

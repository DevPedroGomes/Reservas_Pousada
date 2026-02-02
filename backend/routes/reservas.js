const express = require('express');
const Reserva = require('../models/Reserva');
const Auditoria = require('../models/Auditoria');
const { validarReserva, sanitizarReserva, validarQuarto, validarData, validarPeriodo, validarStatus } = require('../utils/validation');
const { AppError, sendError } = require('../utils/errors');
const { authorize, requirePousada } = require('../middleware/setRlsContext');

const router = express.Router();

// Listar todas as reservas
router.get('/', authorize(['admin', 'recepcao', 'auditoria']), requirePousada, async (req, res, next) => {
  try {
    const { status, data_inicio, data_fim, pago, page = 1, limit = 50, search = '' } = req.query;

    const pageNum = parseInt(page) || 1;
    const limitNum = Math.min(parseInt(limit) || 50, 200);
    const pagoBool = pago === 'true' ? true : pago === 'false' ? false : undefined;

    const { data, count } = await Reserva.listarTodas({
      page: pageNum,
      limit: limitNum,
      search,
      status,
      pago: pagoBool,
      data_inicio,
      data_fim,
      pousada_id: req.user.pousada_id
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
    next(new AppError('RES_006', null, error));
  }
});

// Exportar reservas em CSV
router.get('/export', authorize(['admin', 'recepcao', 'auditoria']), requirePousada, async (req, res, next) => {
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
      data_fim,
      pousada_id: req.user.pousada_id
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
    next(new AppError('RES_006', null, error));
  }
});

// Historico de auditoria por reserva
router.get('/:id/auditoria', authorize(['admin', 'recepcao', 'auditoria']), requirePousada, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id || isNaN(parseInt(id))) {
      return sendError(res, 'VAL_005');
    }

    const reserva = await Reserva.buscarPorIdEPousada(parseInt(id), req.user.pousada_id);
    if (!reserva) {
      return sendError(res, 'RES_001');
    }

    const auditoria = await Auditoria.listarPorReserva(parseInt(id));
    res.json({ sucesso: true, auditoria });
  } catch (error) {
    next(new AppError('SRV_001', null, error));
  }
});

// Buscar reserva por ID
router.get('/:id', authorize(['admin', 'recepcao', 'auditoria']), requirePousada, async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(parseInt(id))) {
      return sendError(res, 'VAL_005');
    }

    const reserva = await Reserva.buscarPorIdEPousada(parseInt(id), req.user.pousada_id);

    if (!reserva) {
      return sendError(res, 'RES_001');
    }

    res.json({
      sucesso: true,
      reserva
    });
  } catch (error) {
    next(new AppError('SRV_001', null, error));
  }
});

// Verificar disponibilidade de quarto
router.get('/disponibilidade/:quarto', authorize(['admin', 'recepcao', 'auditoria']), requirePousada, async (req, res, next) => {
  try {
    const { quarto } = req.params;
    const { data_entrada, data_saida, reserva_id } = req.query;

    if (!validarQuarto(quarto)) {
      return sendError(res, 'VAL_001', 'Numero do quarto invalido');
    }

    if (!data_entrada || !data_saida) {
      return sendError(res, 'VAL_008', 'Datas de entrada e saida sao obrigatorias');
    }

    if (!validarData(data_entrada) || !validarData(data_saida)) {
      return sendError(res, 'VAL_003', 'Formato de data invalido. Use YYYY-MM-DD');
    }

    if (!validarPeriodo(data_entrada, data_saida)) {
      return sendError(res, 'VAL_004', 'Data de entrada deve ser anterior a data de saida');
    }

    if (reserva_id && isNaN(parseInt(reserva_id))) {
      return sendError(res, 'VAL_005');
    }

    const disponibilidade = await Reserva.verificarDisponibilidade(
      parseInt(quarto),
      data_entrada,
      data_saida,
      reserva_id ? parseInt(reserva_id) : null,
      req.user.pousada_id
    );

    res.json({
      sucesso: true,
      disponivel: disponibilidade.disponivel,
      conflitos: disponibilidade.conflitos
    });
  } catch (error) {
    next(new AppError('RES_007', null, error));
  }
});

// Criar nova reserva
router.post('/', authorize(['admin', 'recepcao']), requirePousada, async (req, res, next) => {
  try {
    const dadosSanitizados = sanitizarReserva(req.body);

    const validacao = validarReserva(dadosSanitizados);
    if (!validacao.valido) {
      return res.status(400).json({
        sucesso: false,
        codigo: 'VAL_001',
        mensagem: 'Dados invalidos',
        erros: validacao.erros
      });
    }

    const novaReserva = {
      ...dadosSanitizados,
      status: dadosSanitizados.status || 'ativa',
      criado_por: req.user.id,
      pousada_id: req.user.pousada_id
    };

    const reservaCriada = await Reserva.criar(novaReserva);

    // Auditoria (nao bloqueia resposta)
    Auditoria.registrar({
      userId: req.user.id,
      action: 'criar',
      entityId: reservaCriada.id,
      detalhes: { depois: reservaCriada },
      ip: req.ip
    }).catch(err => console.error('[Auditoria] Erro ao registrar criacao:', err.message));

    res.status(201).json({
      sucesso: true,
      mensagem: 'Reserva criada com sucesso',
      reserva: reservaCriada
    });
  } catch (error) {
    const conflito = error.message && error.message.includes('nao disponivel');
    if (conflito) {
      return res.status(409).json({
        sucesso: false,
        codigo: 'RES_002',
        mensagem: 'Quarto indisponivel no periodo selecionado',
        conflitos: error.conflitos || []
      });
    }
    next(new AppError('RES_003', null, error));
  }
});

// Atualizar reserva existente
router.put('/:id', authorize(['admin', 'recepcao']), requirePousada, async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(parseInt(id))) {
      return sendError(res, 'VAL_005');
    }

    const dadosSanitizados = sanitizarReserva(req.body);

    const validacao = validarReserva({...dadosSanitizados, status: dadosSanitizados.status || 'ativa'});
    if (!validacao.valido) {
      return res.status(400).json({
        sucesso: false,
        codigo: 'VAL_001',
        mensagem: 'Dados invalidos',
        erros: validacao.erros
      });
    }

    const reservaAntes = await Reserva.buscarPorIdEPousada(parseInt(id), req.user.pousada_id);
    if (!reservaAntes) {
      return sendError(res, 'RES_001');
    }

    const resultado = await Reserva.atualizar(parseInt(id), dadosSanitizados, req.user.pousada_id);

    if (resultado.changes === 0) {
      return sendError(res, 'RES_001');
    }

    res.json({
      sucesso: true,
      mensagem: 'Reserva atualizada com sucesso',
      id
    });

    // Auditoria (nao bloqueia resposta)
    Auditoria.registrar({
      userId: req.user.id,
      action: 'atualizar',
      entityId: parseInt(id),
      detalhes: { antes: reservaAntes, depois: dadosSanitizados },
      ip: req.ip
    }).catch(err => console.error('[Auditoria] Erro ao registrar atualizacao:', err.message));

  } catch (error) {
    const conflito = error.message && error.message.includes('nao disponivel');
    if (conflito) {
      return res.status(409).json({
        sucesso: false,
        codigo: 'RES_002',
        mensagem: 'Quarto indisponivel no periodo selecionado',
        conflitos: error.conflitos || []
      });
    }
    next(new AppError('RES_004', null, error));
  }
});

// Atualizar apenas o status da reserva
router.patch('/:id/status', authorize(['admin', 'recepcao']), requirePousada, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!id || isNaN(parseInt(id))) {
      return sendError(res, 'VAL_005');
    }

    if (!status || !validarStatus(status)) {
      return sendError(res, 'VAL_001', 'Status invalido. Use: ativa, finalizada ou cancelada');
    }

    const reservaAntes = await Reserva.buscarPorIdEPousada(parseInt(id), req.user.pousada_id);
    if (!reservaAntes) {
      return sendError(res, 'RES_001');
    }

    const resultado = await Reserva.atualizarStatus(parseInt(id), status, req.user.pousada_id);

    if (resultado.changes === 0) {
      return sendError(res, 'RES_001');
    }

    res.json({
      sucesso: true,
      mensagem: `Reserva marcada como ${status}`,
      id,
      status
    });

    // Auditoria (nao bloqueia resposta)
    Auditoria.registrar({
      userId: req.user.id,
      action: 'atualizar_status',
      entityId: parseInt(id),
      detalhes: { antes: reservaAntes, depois: { ...reservaAntes, status } },
      ip: req.ip
    }).catch(err => console.error('[Auditoria] Erro ao registrar status:', err.message));

  } catch (error) {
    next(new AppError('RES_004', null, error));
  }
});

// Excluir reserva
router.delete('/:id', authorize(['admin']), requirePousada, async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(parseInt(id))) {
      return sendError(res, 'VAL_005');
    }

    const reservaAntes = await Reserva.buscarPorIdEPousada(parseInt(id), req.user.pousada_id);
    if (!reservaAntes) {
      return sendError(res, 'RES_001');
    }

    const resultado = await Reserva.excluir(parseInt(id), req.user.pousada_id);

    if (resultado.changes === 0) {
      return sendError(res, 'RES_001');
    }

    res.json({
      sucesso: true,
      mensagem: 'Reserva excluida com sucesso'
    });

    // Auditoria (nao bloqueia resposta)
    Auditoria.registrar({
      userId: req.user.id,
      action: 'excluir',
      entityId: parseInt(id),
      detalhes: { antes: reservaAntes },
      ip: req.ip
    }).catch(err => console.error('[Auditoria] Erro ao registrar exclusao:', err.message));

  } catch (error) {
    next(new AppError('RES_005', null, error));
  }
});

module.exports = router;

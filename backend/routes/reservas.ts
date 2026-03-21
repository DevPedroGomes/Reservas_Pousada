import { Router, Request, Response, NextFunction } from 'express';
import ReservaModel from '../models/Reserva.js';
import AuditoriaModel from '../models/Auditoria.js';
import { validarReserva, sanitizarReserva, validarQuarto, validarData, validarPeriodo, validarStatus } from '../utils/validation.js';
import { authorize } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

// List all reservations
router.get('/', authorize(['admin', 'recepcao', 'auditoria']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, data_inicio, data_fim, pago, page = '1', limit = '50', search = '' } = req.query;

    const pageNum = parseInt(page as string) || 1;
    const limitNum = Math.min(parseInt(limit as string) || 50, 200);
    const pagoBool = pago === 'true' ? true : pago === 'false' ? false : undefined;

    const { data, count } = await ReservaModel.listarTodas({
      page: pageNum,
      limit: limitNum,
      search: search as string,
      status: status as string | undefined,
      pago: pagoBool,
      data_inicio: data_inicio as string | undefined,
      data_fim: data_fim as string | undefined,
      pousada_id: req.user!.pousadaId!
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
    next(new AppError('Erro ao listar reservas', 500, 'RES_006'));
  }
});

// Export reservations as CSV
router.get('/export', authorize(['admin', 'recepcao', 'auditoria']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, data_inicio, data_fim, pago, search = '' } = req.query;
    const pagoBool = pago === 'true' ? true : pago === 'false' ? false : undefined;

    const { data } = await ReservaModel.listarTodas({
      page: 1,
      limit: 5000,
      search: search as string,
      status: status as string | undefined,
      pago: pagoBool,
      data_inicio: data_inicio as string | undefined,
      data_fim: data_fim as string | undefined,
      pousada_id: req.user!.pousadaId!
    });

    const headers = ['id', 'nome', 'cpf', 'quarto', 'dataEntrada', 'dataSaida', 'valor', 'pago', 'status', 'observacoes'];
    const linhas = data.map((r: any) =>
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
    res.setHeader('Content-Disposition', 'attachment; filename="reservas.csv"');
    return res.send(csv);
  } catch (error) {
    next(new AppError('Erro ao exportar reservas', 500, 'RES_006'));
  }
});

// Get reservation audit history
router.get('/:id/auditoria', authorize(['admin', 'recepcao', 'auditoria']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ sucesso: false, codigo: 'VAL_005', mensagem: 'ID inválido' });
    }

    const reserva = await ReservaModel.buscarPorIdEPousada(parseInt(id), req.user!.pousadaId!);
    if (!reserva) {
      return res.status(404).json({ sucesso: false, codigo: 'RES_001', mensagem: 'Reserva não encontrada' });
    }

    const auditoria = await AuditoriaModel.listar({ entity: 'reserva', entityId: parseInt(id), pousadaId: req.user!.pousadaId! });
    res.json({ sucesso: true, auditoria });
  } catch (error) {
    next(new AppError('Erro ao buscar auditoria', 500, 'SRV_001'));
  }
});

// Get reservation by ID
router.get('/:id', authorize(['admin', 'recepcao', 'auditoria']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ sucesso: false, codigo: 'VAL_005', mensagem: 'ID inválido' });
    }

    const reserva = await ReservaModel.buscarPorIdEPousada(parseInt(id), req.user!.pousadaId!);

    if (!reserva) {
      return res.status(404).json({ sucesso: false, codigo: 'RES_001', mensagem: 'Reserva não encontrada' });
    }

    res.json({
      sucesso: true,
      reserva
    });
  } catch (error) {
    next(new AppError('Erro ao buscar reserva', 500, 'SRV_001'));
  }
});

// Check room availability
router.get('/disponibilidade/:quarto', authorize(['admin', 'recepcao', 'auditoria']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { quarto } = req.params;
    const { data_entrada, data_saida, reserva_id } = req.query;

    if (!validarQuarto(quarto)) {
      return res.status(400).json({ sucesso: false, codigo: 'VAL_001', mensagem: 'Número do quarto inválido' });
    }

    if (!data_entrada || !data_saida) {
      return res.status(400).json({ sucesso: false, codigo: 'VAL_008', mensagem: 'Datas de entrada e saída são obrigatórias' });
    }

    if (!validarData(data_entrada as string) || !validarData(data_saida as string)) {
      return res.status(400).json({ sucesso: false, codigo: 'VAL_003', mensagem: 'Formato de data inválido. Use YYYY-MM-DD' });
    }

    if (!validarPeriodo(data_entrada as string, data_saida as string)) {
      return res.status(400).json({ sucesso: false, codigo: 'VAL_004', mensagem: 'Data de entrada deve ser anterior à data de saída' });
    }

    if (reserva_id && isNaN(parseInt(reserva_id as string))) {
      return res.status(400).json({ sucesso: false, codigo: 'VAL_005', mensagem: 'ID da reserva inválido' });
    }

    const disponibilidade = await ReservaModel.verificarDisponibilidade(
      parseInt(quarto),
      data_entrada as string,
      data_saida as string,
      reserva_id ? parseInt(reserva_id as string) : null,
      req.user!.pousadaId!
    );

    res.json({
      sucesso: true,
      disponivel: disponibilidade.disponivel,
      conflitos: disponibilidade.conflitos
    });
  } catch (error) {
    next(new AppError('Erro ao verificar disponibilidade', 500, 'RES_007'));
  }
});

// Create new reservation
router.post('/', authorize(['admin', 'recepcao']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dadosSanitizados = sanitizarReserva(req.body);

    const validacao = validarReserva(dadosSanitizados);
    if (!validacao.valido) {
      return res.status(400).json({
        sucesso: false,
        codigo: 'VAL_001',
        mensagem: 'Dados inválidos',
        erros: validacao.erros
      });
    }

    const novaReserva = {
      nome: dadosSanitizados.nome,
      cpf: dadosSanitizados.cpf,
      quarto: dadosSanitizados.quarto,
      dataEntrada: dadosSanitizados.data_entrada,
      dataSaida: dadosSanitizados.data_saida,
      status: dadosSanitizados.status || 'ativa',
      valor: dadosSanitizados.valor,
      pago: dadosSanitizados.pago,
      observacoes: dadosSanitizados.observacoes,
      criadoPor: req.user!.id,
      pousadaId: req.user!.pousadaId!
    };

    const reservaCriada = await ReservaModel.criar(novaReserva);

    // Audit log (non-blocking)
    AuditoriaModel.log(
      req.user!.id,
      'criar',
      'reserva',
      reservaCriada.id,
      { depois: reservaCriada },
      req.ip || null
    ).catch(err => console.error('[Auditoria] Erro ao registrar criação:', err.message));

    res.status(201).json({
      sucesso: true,
      mensagem: 'Reserva criada com sucesso',
      reserva: reservaCriada
    });
  } catch (error: any) {
    const conflito = error.message && error.message.includes('não disponível');
    if (conflito) {
      return res.status(409).json({
        sucesso: false,
        codigo: 'RES_002',
        mensagem: 'Quarto indisponível no período selecionado',
        conflitos: error.conflitos || []
      });
    }
    next(new AppError('Erro ao criar reserva', 500, 'RES_003'));
  }
});

// Update reservation
router.put('/:id', authorize(['admin', 'recepcao']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ sucesso: false, codigo: 'VAL_005', mensagem: 'ID inválido' });
    }

    const dadosSanitizados = sanitizarReserva(req.body);

    const validacao = validarReserva({ ...dadosSanitizados, status: dadosSanitizados.status || 'ativa' });
    if (!validacao.valido) {
      return res.status(400).json({
        sucesso: false,
        codigo: 'VAL_001',
        mensagem: 'Dados inválidos',
        erros: validacao.erros
      });
    }

    const reservaAntes = await ReservaModel.buscarPorIdEPousada(parseInt(id), req.user!.pousadaId!);
    if (!reservaAntes) {
      return res.status(404).json({ sucesso: false, codigo: 'RES_001', mensagem: 'Reserva não encontrada' });
    }

    const version = req.body.version !== undefined ? parseInt(req.body.version) : undefined;

    const resultado = await ReservaModel.atualizar(parseInt(id), {
      nome: dadosSanitizados.nome,
      cpf: dadosSanitizados.cpf,
      quarto: dadosSanitizados.quarto,
      dataEntrada: dadosSanitizados.data_entrada,
      dataSaida: dadosSanitizados.data_saida,
      status: dadosSanitizados.status,
      valor: dadosSanitizados.valor,
      pago: dadosSanitizados.pago,
      observacoes: dadosSanitizados.observacoes,
    }, req.user!.pousadaId!, version);

    if (resultado.changes === 0) {
      return res.status(404).json({ sucesso: false, codigo: 'RES_001', mensagem: 'Reserva não encontrada' });
    }

    res.json({
      sucesso: true,
      mensagem: 'Reserva atualizada com sucesso',
      id
    });

    // Audit log (non-blocking)
    AuditoriaModel.log(
      req.user!.id,
      'atualizar',
      'reserva',
      parseInt(id),
      { antes: reservaAntes, depois: dadosSanitizados },
      req.ip || null
    ).catch(err => console.error('[Auditoria] Erro ao registrar atualização:', err.message));

  } catch (error: any) {
    if (error.code === 'VERSION_CONFLICT') {
      return res.status(409).json({
        sucesso: false,
        codigo: 'RES_009',
        mensagem: 'Esta reserva foi alterada por outro usuario. Recarregue e tente novamente.'
      });
    }
    const conflito = error.message && error.message.includes('não disponível');
    if (conflito) {
      return res.status(409).json({
        sucesso: false,
        codigo: 'RES_002',
        mensagem: 'Quarto indisponível no período selecionado',
        conflitos: error.conflitos || []
      });
    }
    next(new AppError('Erro ao atualizar reserva', 500, 'RES_004'));
  }
});

// Update reservation status only
router.patch('/:id/status', authorize(['admin', 'recepcao']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ sucesso: false, codigo: 'VAL_005', mensagem: 'ID inválido' });
    }

    if (!status || !validarStatus(status)) {
      return res.status(400).json({ sucesso: false, codigo: 'VAL_001', mensagem: 'Status inválido. Use: ativa, finalizada ou cancelada' });
    }

    const reservaAntes = await ReservaModel.buscarPorIdEPousada(parseInt(id), req.user!.pousadaId!);
    if (!reservaAntes) {
      return res.status(404).json({ sucesso: false, codigo: 'RES_001', mensagem: 'Reserva não encontrada' });
    }

    const version = req.body.version !== undefined ? parseInt(req.body.version) : undefined;
    const resultado = await ReservaModel.atualizarStatus(parseInt(id), status, req.user!.pousadaId!, version);

    if (resultado.changes === 0) {
      return res.status(404).json({ sucesso: false, codigo: 'RES_001', mensagem: 'Reserva não encontrada' });
    }

    res.json({
      sucesso: true,
      mensagem: `Reserva marcada como ${status}`,
      id,
      status
    });

    // Audit log (non-blocking)
    AuditoriaModel.log(
      req.user!.id,
      'atualizar_status',
      'reserva',
      parseInt(id),
      { antes: reservaAntes, depois: { ...reservaAntes, status } },
      req.ip || null
    ).catch(err => console.error('[Auditoria] Erro ao registrar status:', err.message));

  } catch (error: any) {
    if (error.code === 'VERSION_CONFLICT') {
      return res.status(409).json({
        sucesso: false,
        codigo: 'RES_009',
        mensagem: 'Esta reserva foi alterada por outro usuario. Recarregue e tente novamente.'
      });
    }
    next(new AppError('Erro ao atualizar status', 500, 'RES_004'));
  }
});

// Delete reservation
router.delete('/:id', authorize(['admin']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ sucesso: false, codigo: 'VAL_005', mensagem: 'ID inválido' });
    }

    const reservaAntes = await ReservaModel.buscarPorIdEPousada(parseInt(id), req.user!.pousadaId!);
    if (!reservaAntes) {
      return res.status(404).json({ sucesso: false, codigo: 'RES_001', mensagem: 'Reserva não encontrada' });
    }

    const resultado = await ReservaModel.excluir(parseInt(id), req.user!.pousadaId!);

    if (resultado.changes === 0) {
      return res.status(404).json({ sucesso: false, codigo: 'RES_001', mensagem: 'Reserva não encontrada' });
    }

    res.json({
      sucesso: true,
      mensagem: 'Reserva excluída com sucesso'
    });

    // Audit log (non-blocking)
    AuditoriaModel.log(
      req.user!.id,
      'excluir',
      'reserva',
      parseInt(id),
      { antes: reservaAntes },
      req.ip || null
    ).catch(err => console.error('[Auditoria] Erro ao registrar exclusão:', err.message));

  } catch (error) {
    next(new AppError('Erro ao excluir reserva', 500, 'RES_005'));
  }
});

export default router;

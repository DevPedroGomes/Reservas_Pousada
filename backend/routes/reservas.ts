import { Router, Request, Response, NextFunction } from 'express';
import { criarLimitador } from '../utils/limitadores.js';
import ReservaModel, { ConflitoDeReserva, camposDaTransicao } from '../models/Reserva.js';
import type { NewReserva } from '../db/schema.js';
import { podeTransitar, ROTULO_STATUS, STATUS_RESERVA } from '../utils/status.js';
import AuditoriaModel from '../models/Auditoria.js';
import { sanitizarString, validarReserva, sanitizarReserva, validarQuarto, validarData, validarPeriodo, validarStatus } from '../utils/validation.js';
import { authorize } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import QuartoModel from '../models/Quarto.js';
import HospedeModel, { HospedeRecusado, lerDadosHospede, validarDadosHospede } from '../models/Hospede.js';
import { hojeLocal } from '../utils/datas.js';
import { param } from '../utils/http.js';

const router = Router();

/**
 * Prefix CSV field with a leading apostrophe when the first char could trigger
 * formula execution in Excel/LibreOffice/Google Sheets. Defends against CSV
 * injection on imported customer-supplied fields (nome, observacoes).
 */
function prefixoCsvSeguro(v: string): string {
  if (!v) return v;
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

/** Quem opera a reserva vê o CPF completo no detalhe; auditoria vê mascarado. */
function podeVerCpfCompleto(user: NonNullable<Request['user']>): boolean {
  return user.isOwner || user.role === 'admin' || user.role === 'recepcao';
}

// Narrow rate-limit for CSV export: 5 exports/hour per user (prevents bulk
// PII exfiltration). Falls back to IP if user is somehow missing.
const exportLimiter = criarLimitador('export', {
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: (req: any) => req.user?.id || req.ip || 'anonymous',
  standardHeaders: true,
  legacyHeaders: false,
  message: { sucesso: false, mensagem: 'Limite de exportações excedido. Tente novamente em 1 hora.' },
});


/**
 * O quarto existe nesta pousada?
 *
 * A validação genérica aceita 1..100. Sem esta checagem, uma pousada de 10
 * quartos aceitava reserva no quarto 57 — que não aparece em nenhuma tela de
 * ocupação e nunca conflita com nada.
 */
async function quartoInexistente(pousadaId: number, quarto: number): Promise<string | null> {
  if (await QuartoModel.existeAtivo(pousadaId, quarto)) return null;
  return `O quarto ${quarto} não existe ou está desativado nesta pousada.`;
}


/** Prazo da pré-reserva: horas pedidas (1 a 720), padrão 48h. */
function prazoDaPreReserva(horas: unknown): Date {
  const h = Number(horas);
  const valido = Number.isFinite(h) && h >= 1 && h <= 720 ? h : 48;
  return new Date(Date.now() + valido * 60 * 60 * 1000);
}

/**
 * A transição de status é permitida? Devolve o motivo da recusa, ou null.
 * No-show só depois do dia de entrada; check-in não antes do dia de entrada.
 */
function recusaDeTransicao(antes: { status: string; dataEntrada: string }, para: string, temDocumento = true): string | null {
  if (!podeTransitar(antes.status, para)) {
    const de = ROTULO_STATUS[antes.status as keyof typeof ROTULO_STATUS] ?? antes.status;
    const ate = ROTULO_STATUS[para as keyof typeof ROTULO_STATUS] ?? para;
    return `Uma reserva ${de} não pode passar para ${ate}.`;
  }
  const hoje = hojeLocal();
  if (para === 'no_show' && antes.dataEntrada > hoje) return 'Não comparecimento só pode ser marcado a partir do dia da entrada.';
  if (para === 'hospedada' && antes.status !== 'hospedada' && antes.dataEntrada > hoje) return 'Check-in só a partir do dia da entrada.';
  // A ficha do hóspede (FNRH) exige documento: a reserva pode nascer só com o
  // WhatsApp, mas o check-in não acontece sem ele.
  if (para === 'hospedada' && antes.status !== 'hospedada' && !temDocumento) return 'Informe o documento do hóspede (CPF ou passaporte) para fazer o check-in.';
  return null;
}

/** O documento decifrado é utilizável? (não vazio nem marcador de falha de decifra) */
function documentoValido(documento: string | null | undefined): boolean {
  return Boolean(documento) && !String(documento).startsWith('[');
}

/** `hospede_id` do corpo, se for um inteiro positivo. */
function hospedeIdDoCorpo(corpo: Record<string, unknown>): number | null {
  const n = Number(corpo.hospede_id ?? corpo.hospedeId);
  return Number.isInteger(n) && n > 0 ? n : null;
}

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
router.get('/export', authorize(['admin', 'recepcao', 'auditoria']), exportLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, data_inicio, data_fim, pago, search = '' } = req.query;
    const pagoBool = pago === 'true' ? true : pago === 'false' ? false : undefined;

    const cpfCompletoNoCsv = req.user!.role === 'admin' || req.user!.isOwner === true;
    const { data } = await ReservaModel.listarTodas({
      cpfCompleto: cpfCompletoNoCsv,
      page: 1,
      limit: 5000,
      search: search as string,
      status: status as string | undefined,
      pago: pagoBool,
      data_inicio: data_inicio as string | undefined,
      data_fim: data_fim as string | undefined,
      pousada_id: req.user!.pousadaId!
    });

    // CPF completo no CSV só para admin e dono; os demais recebem mascarado.
    const cpfMascarado = !cpfCompletoNoCsv;

    // Fields where customer-supplied text must be neutralized vs CSV formula
    // injection (Excel/Sheets evaluate cells starting with = + - @ tab CR).
    const camposInjetaveis = new Set(['nome', 'observacoes', 'email', 'nacionalidade']);

    const headers = [
      'id', 'nome', 'tipoDocumento', 'documento', 'telefone', 'email', 'nacionalidade', 'quarto', 'dataEntrada', 'dataSaida',
      'adultos', 'criancas', 'canal', 'valor', 'pago', 'status', 'observacoes',
    ];
    const linhas = data.map((r: any) =>
      headers
        .map((h) => {
          let valor = r[h] === undefined || r[h] === null ? '' : r[h];

          if (typeof valor === 'string') {
            let texto = valor;
            if (camposInjetaveis.has(h)) {
              texto = prefixoCsvSeguro(texto);
            }
            texto = texto.replace(/"/g, '""');
            return `"${texto}"`;
          }
          return `"${valor}"`;
        })
        .join(',')
    );

    // Excel expects CRLF line endings.
    // BOM UTF-8 na frente: sem ele o Excel em pt-BR abre o arquivo em latin-1 e
    // todo acento vira mojibake ("JosÃ©"), que é como o contador recebe.
    const csv = '﻿' + [headers.join(','), ...linhas].join('\r\n');

    // Audit the export so PII access is traceable (non-blocking).
    AuditoriaModel.log(
      req.user!.id,
      'export_reservas',
      'reserva',
      0,
      { rowCount: data.length, masked: cpfMascarado },
      req.ip || null,
    ).catch(err => console.error('[Auditoria] Erro ao registrar export:', err.message));

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="reservas.csv"');
    return res.send(csv);
  } catch (error) {
    next(new AppError('Erro ao exportar reservas', 500, 'RES_006'));
  }
});

// Agenda do dia (chegadas, saídas, hospedados, próximas)
router.get('/agenda', authorize(['admin', 'recepcao', 'auditoria']), async (req: Request, res: Response) => {
  const dia = typeof req.query.data === 'string' && validarData(req.query.data) ? req.query.data : hojeLocal();
  const dias = Math.min(Math.max(parseInt(String(req.query.dias ?? '7')) || 7, 1), 60);
  const agenda = await ReservaModel.agenda(req.user!.pousadaId!, dia, dias);
  res.json({ sucesso: true, ...agenda });
});

// Get reservation audit history
router.get('/:id/auditoria', authorize(['admin', 'recepcao', 'auditoria']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = param(req, 'id');
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
    const id = param(req, 'id');

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ sucesso: false, codigo: 'VAL_005', mensagem: 'ID inválido' });
    }

    const reserva = await ReservaModel.buscarPorIdEPousada(parseInt(id), req.user!.pousadaId!);

    if (!reserva) {
      return res.status(404).json({ sucesso: false, codigo: 'RES_001', mensagem: 'Reserva não encontrada' });
    }

    const completo = podeVerCpfCompleto(req.user!);
    if (completo) {
      // Acesso a dado pessoal fica rastreável: "quem viu o CPF de fulano".
      AuditoriaModel.log(req.user!.id, 'visualizar_cpf', 'reserva', reserva.id, null, req.ip || null)
        .catch(err => console.error('[Auditoria] Erro ao registrar visualização:', err.message));
    }

    res.json({
      sucesso: true,
      reserva: ReservaModel.paraApi(reserva, !completo),
    });
  } catch (error) {
    next(new AppError('Erro ao buscar reserva', 500, 'SRV_001'));
  }
});

// Check room availability
router.get('/disponibilidade/:quarto', authorize(['admin', 'recepcao', 'auditoria']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const quarto = param(req, 'quarto');
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

    const semQuarto = await quartoInexistente(req.user!.pousadaId!, parseInt(quarto));
    if (semQuarto) {
      return res.status(400).json({ sucesso: false, codigo: 'VAL_009', mensagem: semQuarto });
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
    const hospedeId = hospedeIdDoCorpo(req.body);
    const dadosHospede = lerDadosHospede(req.body);

    const validacao = validarReserva(dadosSanitizados);
    const errosHospede = validarDadosHospede(dadosHospede, !hospedeId);
    if (!validacao.valido || errosHospede.length > 0) {
      return res.status(400).json({
        sucesso: false,
        codigo: 'VAL_001',
        mensagem: 'Dados inválidos',
        erros: [...validacao.erros, ...errosHospede]
      });
    }

    const semQuarto = await quartoInexistente(req.user!.pousadaId!, dadosSanitizados.quarto);
    if (semQuarto) {
      return res.status(400).json({ sucesso: false, codigo: 'VAL_009', mensagem: semQuarto, erros: [semQuarto] });
    }

    // Na criação: pré-reserva (aguarda sinal, com prazo), confirmada, ou
    // hospedada (hóspede chegando agora, sem reserva prévia).
    const statusInicial = dadosSanitizados.status || 'confirmada';
    if (!['pre_reserva', 'confirmada', 'hospedada'].includes(statusInicial)) {
      return res.status(400).json({ sucesso: false, codigo: 'VAL_001', mensagem: 'Reserva nova deve ser pré-reserva, confirmada ou hospedada.' });
    }
    if (statusInicial === 'hospedada' && dadosSanitizados.data_entrada > hojeLocal()) {
      return res.status(400).json({ sucesso: false, codigo: 'VAL_001', mensagem: 'Check-in só a partir do dia da entrada.' });
    }
    if (statusInicial === 'hospedada' && !hospedeId && !dadosHospede.documento) {
      return res.status(400).json({ sucesso: false, codigo: 'VAL_001', mensagem: 'Informe o documento do hóspede (CPF ou passaporte) para fazer o check-in.' });
    }

    const hospede = await HospedeModel.resolver(req.user!.pousadaId!, dadosHospede, hospedeId);
    if (statusInicial === 'hospedada' && !documentoValido(hospede.documento)) {
      return res.status(400).json({ sucesso: false, codigo: 'VAL_001', mensagem: 'Informe o documento do hóspede (CPF ou passaporte) para fazer o check-in.' });
    }

    const novaReserva = {
      nome: hospede.nome,
      hospedeId: hospede.id,
      adultos: dadosSanitizados.adultos,
      criancas: dadosSanitizados.criancas,
      canal: dadosSanitizados.canal,
      quarto: dadosSanitizados.quarto,
      dataEntrada: dadosSanitizados.data_entrada,
      dataSaida: dadosSanitizados.data_saida,
      status: statusInicial,
      expiraEm: statusInicial === 'pre_reserva' ? prazoDaPreReserva(req.body.prazo_horas) : null,
      checkInEm: statusInicial === 'hospedada' ? new Date() : null,
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
      reserva: ReservaModel.paraApi(reservaCriada, false)
    });
  } catch (error: any) {
    if (error instanceof HospedeRecusado) {
      return res.status(error.status).json({ sucesso: false, codigo: 'HSP_001', mensagem: error.message });
    }
    // Tipo, não substring da mensagem: `error.message.includes('não disponível')`
    // quebrava calado no dia em que alguém reescrevesse o texto do erro.
    if (error instanceof ConflitoDeReserva) {
      return res.status(409).json({
        sucesso: false,
        codigo: 'RES_002',
        mensagem: 'Quarto indisponível no período selecionado',
        conflitos: error.conflitos
      });
    }
    next(new AppError('Erro ao criar reserva', 500, 'RES_003'));
  }
});

// Update reservation
router.put('/:id', authorize(['admin', 'recepcao']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = param(req, 'id');

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ sucesso: false, codigo: 'VAL_005', mensagem: 'ID inválido' });
    }

    const dadosSanitizados = sanitizarReserva(req.body);

    // Edição permite data no passado: corrigir o nome de quem já fez check-in,
    // marcar como paga ou finalizar uma estadia em andamento são operações do
    // dia a dia, e reusar a validação do POST as rejeitava com 400.
    const reservaAntes = await ReservaModel.buscarPorIdEPousada(parseInt(id), req.user!.pousadaId!);
    if (!reservaAntes) {
      return res.status(404).json({ sucesso: false, codigo: 'RES_001', mensagem: 'Reserva não encontrada' });
    }

    // Outro hóspede escolhido no formulário, ou o mesmo (com dados corrigidos).
    // `hospede_id: null` explícito = trocar por um hóspede novo; ausente = o mesmo de antes.
    const hospedeId = 'hospede_id' in req.body ? hospedeIdDoCorpo(req.body) : reservaAntes.hospedeId ?? null;
    const dadosHospede = lerDadosHospede(req.body);

    const validacao = validarReserva(dadosSanitizados, { permitirDataPassada: true });
    const errosHospede = validarDadosHospede(dadosHospede, !hospedeId);
    if (!validacao.valido || errosHospede.length > 0) {
      return res.status(400).json({
        sucesso: false,
        codigo: 'VAL_001',
        mensagem: 'Dados inválidos',
        erros: [...validacao.erros, ...errosHospede]
      });
    }

    // Status pelo formulário de edição segue as mesmas regras do PATCH.
    const statusNovo = dadosSanitizados.status || reservaAntes.status;
    const hospede = await HospedeModel.resolver(req.user!.pousadaId!, dadosHospede, hospedeId);
    if (statusNovo !== reservaAntes.status) {
      const recusa = recusaDeTransicao(reservaAntes, statusNovo, documentoValido(hospede.documento));
      if (recusa) return res.status(409).json({ sucesso: false, codigo: 'RES_010', mensagem: recusa });
    }

    if (dadosSanitizados.quarto !== reservaAntes.quarto) {
      const semQuarto = await quartoInexistente(req.user!.pousadaId!, dadosSanitizados.quarto);
      if (semQuarto) {
        return res.status(400).json({ sucesso: false, codigo: 'VAL_009', mensagem: semQuarto, erros: [semQuarto] });
      }
    }

    const version = req.body.version !== undefined ? parseInt(req.body.version) : undefined;

    const resultado = await ReservaModel.atualizar(parseInt(id), {
      nome: hospede.nome,
      hospedeId: hospede.id,
      adultos: dadosSanitizados.adultos,
      criancas: dadosSanitizados.criancas,
      canal: dadosSanitizados.canal,
      quarto: dadosSanitizados.quarto,
      dataEntrada: dadosSanitizados.data_entrada,
      dataSaida: dadosSanitizados.data_saida,
      status: statusNovo,
      ...(statusNovo !== reservaAntes.status ? camposDaTransicao(statusNovo, {
        expiraEm: statusNovo === 'pre_reserva' ? prazoDaPreReserva(req.body.prazo_horas) : null,
        motivo: typeof req.body.motivo === 'string' ? sanitizarString(req.body.motivo, 300) || null : null,
      }) : {}),
      valor: dadosSanitizados.valor,
      pago: dadosSanitizados.pago,
      observacoes: dadosSanitizados.observacoes,
    } as Partial<NewReserva>, req.user!.pousadaId!, version);

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
    if (error instanceof HospedeRecusado) {
      return res.status(error.status).json({ sucesso: false, codigo: 'HSP_001', mensagem: error.message });
    }
    if (error.code === 'VERSION_CONFLICT') {
      return res.status(409).json({
        sucesso: false,
        codigo: 'RES_009',
        mensagem: 'Esta reserva foi alterada por outro usuario. Recarregue e tente novamente.'
      });
    }
    if (error instanceof ConflitoDeReserva) {
      return res.status(409).json({
        sucesso: false,
        codigo: 'RES_002',
        mensagem: 'Quarto indisponível no período selecionado',
        conflitos: error.conflitos
      });
    }
    next(new AppError('Erro ao atualizar reserva', 500, 'RES_004'));
  }
});

// Update reservation status only
router.patch('/:id/status', authorize(['admin', 'recepcao']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = param(req, 'id');
    const { status } = req.body;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ sucesso: false, codigo: 'VAL_005', mensagem: 'ID inválido' });
    }

    if (!status || !validarStatus(status)) {
      return res.status(400).json({ sucesso: false, codigo: 'VAL_001', mensagem: `Status inválido. Use: ${STATUS_RESERVA.join(', ')}` });
    }

    const reservaAntes = await ReservaModel.buscarPorIdEPousada(parseInt(id), req.user!.pousadaId!);
    if (!reservaAntes) {
      return res.status(404).json({ sucesso: false, codigo: 'RES_001', mensagem: 'Reserva não encontrada' });
    }

    const recusa = recusaDeTransicao(reservaAntes, status, documentoValido(reservaAntes.documento));
    if (recusa) return res.status(409).json({ sucesso: false, codigo: 'RES_010', mensagem: recusa });

    const version = req.body.version !== undefined ? parseInt(req.body.version) : undefined;
    const resultado = await ReservaModel.atualizarStatus(parseInt(id), status, req.user!.pousadaId!, version, {
      motivo: typeof req.body.motivo === 'string' ? sanitizarString(req.body.motivo, 300) || null : null,
      expiraEm: status === 'pre_reserva' ? prazoDaPreReserva(req.body.prazo_horas) : null,
    });

    if (resultado.changes === 0) {
      return res.status(404).json({ sucesso: false, codigo: 'RES_001', mensagem: 'Reserva não encontrada' });
    }

    res.json({
      sucesso: true,
      mensagem: `Reserva marcada como ${ROTULO_STATUS[status as keyof typeof ROTULO_STATUS]}`,
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
    if (error instanceof ConflitoDeReserva) {
      return res.status(409).json({
        sucesso: false,
        codigo: 'RES_002',
        mensagem: 'Não é possível reativar: o quarto já foi ocupado neste período',
        conflitos: error.conflitos
      });
    }
    next(new AppError('Erro ao atualizar status', 500, 'RES_004'));
  }
});

// Delete reservation
router.delete('/:id', authorize(['admin']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = param(req, 'id');

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

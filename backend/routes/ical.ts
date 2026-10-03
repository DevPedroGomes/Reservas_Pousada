import { Router, Request, Response, NextFunction } from 'express';
import AuditoriaModel from '../models/Auditoria.js';
import QuartoModel from '../models/Quarto.js';
import {
  buscarImportacao, criarImportacao, listarCalendarios, novoLinkDoQuarto, removerImportacao, sincronizarImportacao,
} from '../models/Ical.js';
import { validarUrlIcal } from '../lib/ical.js';
import { authorize } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { sanitizarString, CANAIS_RESERVA } from '../utils/validation.js';
import { param } from '../utils/http.js';

const router = Router();

/** Endereço público da API, para montar o link que a OTA vai ler. */
function baseUrl(req: Request): string {
  return (process.env.API_PUBLIC_URL || process.env.BETTER_AUTH_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
}

// Calendários da pousada: links para exportar e calendários importados.
router.get('/', authorize(['admin']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { quartos, importacoes } = await listarCalendarios(req.user!.pousadaId!);
    res.json({
      sucesso: true,
      exportar: quartos.map((q) => ({ quarto: q.numero, nome: q.nome, url: `${baseUrl(req)}/ical/${q.ical_token}.ics` })),
      importar: importacoes.map((i) => ({
        id: i.id, quarto: i.quarto_numero, nome: i.nome, canal: i.canal, url: i.url, ativo: i.ativo,
        ultimaSincronizacao: i.ultima_sincronizacao, aviso: i.ultimo_erro, eventos: i.eventos,
      })),
    });
  } catch (err) {
    next(new AppError('Erro ao listar calendários', 500, 'ICS_001'));
  }
});

router.post('/importacoes', authorize(['admin']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const erros: string[] = [];
    const quarto = Number(req.body.quarto);
    const nome = sanitizarString(String(req.body.nome ?? ''), 40);
    const canal = String(req.body.canal ?? 'outro');
    const url = String(req.body.url ?? '').trim();
    if (nome.length < 2) erros.push('Dê um nome ao calendário (ex.: Airbnb, Booking)');
    if (!(CANAIS_RESERVA as readonly string[]).includes(canal)) erros.push('Canal inválido');
    const erroUrl = validarUrlIcal(url);
    if (erroUrl) erros.push(erroUrl);
    const quartos = await QuartoModel.listar(req.user!.pousadaId!);
    if (!quartos.some((q) => q.numero === quarto)) erros.push('Quarto não encontrado nesta pousada');
    if (erros.length) return res.status(400).json({ sucesso: false, codigo: 'VAL_001', mensagem: 'Dados inválidos', erros });

    let imp;
    try {
      imp = await criarImportacao(req.user!.pousadaId!, { quarto, nome, canal, url });
    } catch (err) {
      const e = err as { code?: string; cause?: { code?: string } };
      if (e.code === '23505' || e.cause?.code === '23505') {
        return res.status(409).json({ sucesso: false, codigo: 'ICS_002', mensagem: 'Este calendário já está ligado a este quarto.' });
      }
      throw err;
    }
    AuditoriaModel.log(req.user!.id, 'criar', 'ical_importacao', imp.id, { depois: { quarto, nome, canal } }, req.ip || null).catch(() => {});
    // Primeira sincronização na hora: a pessoa vê se o link funciona.
    const resumo = await sincronizarImportacao(imp).catch((err: Error) => ({ erro: err.message }));
    res.status(201).json({ sucesso: true, id: imp.id, resumo });
  } catch (err) {
    next(new AppError('Erro ao adicionar calendário', 500, 'ICS_003'));
  }
});

router.post('/importacoes/:id/sincronizar', authorize(['admin', 'recepcao']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const imp = await buscarImportacao(req.user!.pousadaId!, Number(param(req, 'id')));
    if (!imp) return res.status(404).json({ sucesso: false, codigo: 'ICS_404', mensagem: 'Calendário não encontrado' });
    try {
      res.json({ sucesso: true, resumo: await sincronizarImportacao(imp) });
    } catch (err) {
      res.status(502).json({ sucesso: false, codigo: 'ICS_004', mensagem: `Não foi possível ler o calendário: ${(err as Error).message}` });
    }
  } catch (err) {
    next(new AppError('Erro ao sincronizar', 500, 'ICS_005'));
  }
});

router.delete('/importacoes/:id', authorize(['admin']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(param(req, 'id'));
    if (!(await removerImportacao(req.user!.pousadaId!, id))) {
      return res.status(404).json({ sucesso: false, codigo: 'ICS_404', mensagem: 'Calendário não encontrado' });
    }
    AuditoriaModel.log(req.user!.id, 'excluir', 'ical_importacao', id, null, req.ip || null).catch(() => {});
    res.json({ sucesso: true });
  } catch (err) {
    next(new AppError('Erro ao remover calendário', 500, 'ICS_006'));
  }
});

// Link vazou? Gera outro (o antigo para de funcionar na hora).
router.post('/quartos/:numero/novo-link', authorize(['admin']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = await novoLinkDoQuarto(req.user!.pousadaId!, Number(param(req, 'numero')));
    if (!token) return res.status(404).json({ sucesso: false, codigo: 'ICS_404', mensagem: 'Quarto não encontrado' });
    AuditoriaModel.log(req.user!.id, 'novo_link_ical', 'quarto', Number(param(req, 'numero')), null, req.ip || null).catch(() => {});
    res.json({ sucesso: true, url: `${baseUrl(req)}/ical/${token}.ics` });
  } catch (err) {
    next(new AppError('Erro ao gerar link', 500, 'ICS_007'));
  }
});

export default router;

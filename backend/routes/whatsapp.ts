/**
 * WhatsApp Business da pousada, pelo painel: conexão (Embedded Signup da
 * Meta), atendente virtual e conversas.
 *
 * Conectar, desconectar e ligar o atendente é do dono/admin; conversar com o
 * hóspede é também da recepção. Auditoria não entra nas conversas.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { authorize } from '../middleware/auth.js';
import { metaConfigurada } from '../lib/metaWhatsapp.js';
import { agenteConfigurado } from '../lib/llm.js';
import AuditoriaModel from '../models/Auditoria.js';
import {
  conectar, definirAgente, desconectar, devolverAoAgente, listarConversas, mensagensDaConversa,
  responderPelaEquipe, situacao, WhatsappRecusado,
} from '../models/WhatsappBusiness.js';
import { param } from '../utils/http.js';

const router = Router();
const gestao = authorize(['admin']);
const atendimento = authorize(['admin', 'recepcao']);

function falha(res: Response, next: NextFunction, err: unknown) {
  if (err instanceof WhatsappRecusado) return res.status(err.status).json({ sucesso: false, mensagem: err.message });
  next(err);
}

/** O que o navegador precisa para abrir o cadastro da Meta (nada secreto). */
router.get('/config', (_req: Request, res: Response) => {
  res.json({
    sucesso: true,
    disponivel: metaConfigurada(),
    appId: process.env.META_APP_ID ?? null,
    configId: process.env.META_CONFIG_ID ?? null,
    versao: process.env.META_GRAPH_VERSAO || 'v21.0',
    agenteDisponivel: agenteConfigurado(),
  });
});

router.get('/conta', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ sucesso: true, conta: await situacao(req.user!.pousadaId!) });
  } catch (err) { next(err); }
});

router.post('/conectar', gestao, async (req: Request, res: Response, next: NextFunction) => {
  if (!metaConfigurada()) return res.status(409).json({ sucesso: false, mensagem: 'A conexão com o WhatsApp ainda não está disponível nesta instalação.' });
  const b = req.body ?? {};
  try {
    const conta = await conectar(req.user!.pousadaId!, {
      code: typeof b.code === 'string' ? b.code.slice(0, 2000) : '',
      wabaId: String(b.waba_id ?? ''),
      phoneNumberId: String(b.phone_number_id ?? ''),
      coexistencia: b.coexistencia === true,
    });
    await AuditoriaModel.log(req.user!.id, 'whatsapp_conectado', 'pousada', req.user!.pousadaId!, { coexistencia: b.coexistencia === true }, req.ip || null);
    res.json({ sucesso: true, conta });
  } catch (err) { falha(res, next, err); }
});

router.post('/desconectar', gestao, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await desconectar(req.user!.pousadaId!);
    await AuditoriaModel.log(req.user!.id, 'whatsapp_desconectado', 'pousada', req.user!.pousadaId!, {}, req.ip || null);
    res.json({ sucesso: true, conta: { conectado: false } });
  } catch (err) { next(err); }
});

router.put('/agente', gestao, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await definirAgente(req.user!.pousadaId!, req.body?.ativo === true);
    res.json({ sucesso: true, conta: await situacao(req.user!.pousadaId!) });
  } catch (err) { falha(res, next, err); }
});

router.get('/conversas', atendimento, async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ sucesso: true, conversas: await listarConversas(req.user!.pousadaId!) });
  } catch (err) { next(err); }
});

router.get('/conversas/:id', atendimento, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const mensagens = await mensagensDaConversa(req.user!.pousadaId!, parseInt(param(req, 'id')) || 0);
    if (!mensagens) return res.status(404).json({ sucesso: false, mensagem: 'Conversa não encontrada.' });
    res.json({ sucesso: true, mensagens });
  } catch (err) { next(err); }
});

router.post('/conversas/:id/responder', atendimento, async (req: Request, res: Response, next: NextFunction) => {
  const texto = typeof req.body?.texto === 'string' ? req.body.texto.trim() : '';
  if (!texto) return res.status(400).json({ sucesso: false, mensagem: 'Escreva a mensagem.' });
  try {
    await responderPelaEquipe(req.user!.pousadaId!, parseInt(param(req, 'id')) || 0, texto);
    res.json({ sucesso: true });
  } catch (err) { falha(res, next, err); }
});

router.post('/conversas/:id/agente', atendimento, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!(await devolverAoAgente(req.user!.pousadaId!, parseInt(param(req, 'id')) || 0))) {
      return res.status(404).json({ sucesso: false, mensagem: 'Conversa não encontrada.' });
    }
    res.json({ sucesso: true });
  } catch (err) { next(err); }
});

export default router;

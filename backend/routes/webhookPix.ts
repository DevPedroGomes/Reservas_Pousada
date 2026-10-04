/**
 * Aviso de pagamento Pix do gateway da pousada (Asaas). O endereço carrega o
 * token que identifica a pousada; o cabeçalho asaas-access-token autentica o
 * aviso; e o status vem sempre de uma consulta ao próprio Asaas
 * (models/Pix.ts > processarAviso) — o corpo só diz QUAL cobrança olhar.
 */
import { Router, Request, Response } from 'express';
import { processarAviso } from '../models/Pix.js';
import { reportarErro } from '../lib/observabilidade.js';
import { param } from '../utils/http.js';

const router = Router();

router.post('/asaas/:token', async (req: Request, res: Response) => {
  const evento = String(req.body?.event ?? '');
  const id = String(req.body?.payment?.id ?? '');
  if (!evento.startsWith('PAYMENT_') || !/^pay_[A-Za-z0-9]{1,60}$/.test(id)) return res.sendStatus(200);
  try {
    const resultado = await processarAviso(param(req, 'token'), String(req.get('asaas-access-token') ?? ''), id);
    console.log(`[Pix] aviso Asaas ${evento} ${id}: ${resultado}`);
    res.sendStatus(200);
  } catch (err) {
    // 500 faz o Asaas tentar de novo (a fila de avisos dele é sequencial).
    console.error('[Pix] falha ao processar aviso:', err);
    reportarErro(err, { webhook: 'pix-asaas', pagamento: id });
    res.sendStatus(500);
  }
});

export default router;

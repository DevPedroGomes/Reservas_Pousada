/**
 * Webhook da Meta para o WhatsApp de TODAS as pousadas conectadas (um app,
 * um endereço). A pousada sai do phone_number_id de cada evento.
 *
 * Montado ANTES do express.json: a assinatura X-Hub-Signature-256 é o HMAC
 * dos bytes exatos do corpo com o segredo do app.
 */
import express, { Router, Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { assinaturaValida } from '../lib/metaWhatsapp.js';
import { receberWebhook } from '../models/WhatsappBusiness.js';
import { reportarErro } from '../lib/observabilidade.js';

const router = Router();

/** Validação do endereço no painel da Meta (hub.challenge). */
router.get('/', (req: Request, res: Response) => {
  const esperado = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? '';
  const recebido = String(req.query['hub.verify_token'] ?? '');
  const ok = esperado.length > 0 && esperado.length === recebido.length && timingSafeEqual(Buffer.from(esperado), Buffer.from(recebido));
  if (req.query['hub.mode'] === 'subscribe' && ok) return res.type('text/plain').send(String(req.query['hub.challenge'] ?? ''));
  res.sendStatus(403);
});

router.post('/', express.raw({ type: '*/*', limit: '1mb' }), async (req: Request, res: Response) => {
  const corpo = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!assinaturaValida(corpo, req.get('x-hub-signature-256'))) return res.sendStatus(401);
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(corpo.toString('utf8'));
  } catch {
    return res.sendStatus(400);
  }
  try {
    await receberWebhook(json);
    res.sendStatus(200);
  } catch (err) {
    // 500 faz a Meta reenviar (a mensagem repetida é descartada pelo wamid).
    console.error('[WhatsApp] falha ao receber webhook:', err);
    reportarErro(err, { webhook: 'whatsapp' });
    res.sendStatus(500);
  }
});

export default router;

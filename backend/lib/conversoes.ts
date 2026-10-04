/**
 * Conversões enviadas pelo SERVIDOR para as plataformas de anúncio.
 *
 * O pixel no navegador perde parte das conversões (bloqueador, aba fechada
 * antes do retorno do Stripe, iOS). O pagamento confirmado pelo webhook é a
 * conversão que importa para otimizar campanha, então vai daqui:
 * - Meta Conversions API (META_PIXEL_ID + META_CAPI_TOKEN)
 * - GA4 Measurement Protocol (GA_MEASUREMENT_ID + GA_API_SECRET)
 *
 * Só envia para quem consentiu com cookies de anúncio no cadastro
 * (origem.consentimento_anuncios). E-mail vai em SHA-256, nunca em claro.
 * Sem as variáveis, nada é enviado. Roda pela fila (com retentativa).
 */
import { createHash } from 'node:crypto';
import { pool } from '../db/index.js';
import { enfileirar, FILAS, registrarTrabalhador } from './fila.js';
import type { Origem } from '../utils/origem.js';

export interface ConversaoDePagamento {
  pousadaId: number;
  valorCentavos: number;
  moeda: string;
  referencia: string; // id da fatura: deduplica dos dois lados
}

const sha256 = (v: string) => createHash('sha256').update(v.trim().toLowerCase()).digest('hex');

export function conversoesConfiguradas(): boolean {
  return Boolean(
    (process.env.META_PIXEL_ID && process.env.META_CAPI_TOKEN) ||
    (process.env.GA_MEASUREMENT_ID && process.env.GA_API_SECRET),
  );
}

/** Enfileira a conversão de um pagamento confirmado. Sem configuração, não faz nada. */
export async function registrarConversaoDePagamento(c: ConversaoDePagamento): Promise<void> {
  if (!conversoesConfiguradas()) return;
  await enfileirar(FILAS.conversao, c as unknown as Record<string, unknown>);
}

async function enviar(c: ConversaoDePagamento): Promise<void> {
  const { rows } = await pool.query<{ email: string; origem: Origem | null; criado: Date }>(
    `SELECT u.email, u.origem, u.created_at AS criado
       FROM user_pousadas up JOIN "user" u ON u.id = up.user_id
      WHERE up.pousada_id = $1 AND up.is_owner = true LIMIT 1`,
    [c.pousadaId],
  );
  const dono = rows[0];
  if (!dono?.origem?.consentimento_anuncios) return; // sem consentimento, sem envio

  const valor = c.valorCentavos / 100;
  const moeda = c.moeda.toUpperCase();
  const agora = Math.floor(Date.now() / 1000);

  if (process.env.META_PIXEL_ID && process.env.META_CAPI_TOKEN) {
    const fbc = dono.origem.fbclid
      ? `fb.1.${new Date(dono.origem.primeira_visita ?? dono.criado).getTime()}.${dono.origem.fbclid}`
      : undefined;
    const r = await fetch(
      `https://graph.facebook.com/v21.0/${process.env.META_PIXEL_ID}/events?access_token=${encodeURIComponent(process.env.META_CAPI_TOKEN)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: [{
            event_name: 'Purchase',
            event_time: agora,
            event_id: c.referencia,
            action_source: 'website',
            user_data: { em: [sha256(dono.email)], ...(fbc ? { fbc } : {}), ...(dono.origem.fbp ? { fbp: dono.origem.fbp } : {}) },
            custom_data: { value: valor, currency: moeda },
          }],
        }),
      },
    );
    if (!r.ok) throw new Error(`Meta CAPI respondeu ${r.status}: ${(await r.text()).slice(0, 300)}`);
  }

  if (process.env.GA_MEASUREMENT_ID && process.env.GA_API_SECRET && dono.origem.ga_client_id) {
    const r = await fetch(
      `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(process.env.GA_MEASUREMENT_ID)}&api_secret=${encodeURIComponent(process.env.GA_API_SECRET)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: dono.origem.ga_client_id,
          events: [{ name: 'purchase', params: { transaction_id: c.referencia, value: valor, currency: moeda } }],
        }),
      },
    );
    if (!r.ok) throw new Error(`GA4 respondeu ${r.status}`);
  }
}

registrarTrabalhador(FILAS.conversao, (dados) => enviar(dados as unknown as ConversaoDePagamento));

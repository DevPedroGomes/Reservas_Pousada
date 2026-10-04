/**
 * Cliente da Cloud API do WhatsApp (Graph API da Meta) para a conta de UMA
 * pousada — cada chamada leva o token daquela conta.
 *
 * App da Meta (Diária, como Tech Provider):
 *   META_APP_ID, META_APP_SECRET   app do tipo Business com o produto WhatsApp
 *   META_CONFIG_ID                 configuração do Embedded Signup (Login for Business)
 *   WHATSAPP_WEBHOOK_VERIFY_TOKEN  token que a Meta manda ao validar o webhook
 * Passo a passo em docs/whatsapp-meta.md.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

const VERSAO = () => process.env.META_GRAPH_VERSAO || 'v21.0';
const GRAPH = () => `https://graph.facebook.com/${VERSAO()}`;

export function metaConfigurada(): boolean {
  return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET && process.env.META_CONFIG_ID);
}

/** Confere a assinatura X-Hub-Signature-256 do webhook (HMAC do corpo cru com o segredo do app). */
export function assinaturaValida(corpoCru: Buffer, cabecalho: string | undefined): boolean {
  const segredo = process.env.META_APP_SECRET;
  if (!segredo || !cabecalho?.startsWith('sha256=')) return false;
  const esperado = Buffer.from(`sha256=${createHmac('sha256', segredo).update(corpoCru).digest('hex')}`);
  const recebido = Buffer.from(cabecalho);
  return esperado.length === recebido.length && timingSafeEqual(esperado, recebido);
}

export class MetaRecusou extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'MetaRecusou';
  }
}

type Fetch = typeof fetch;

async function chamar(fetchImpl: Fetch, url: string, token: string | null, init: RequestInit = {}): Promise<Record<string, any>> {
  const r = await fetchImpl(url, {
    ...init,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  const j = (await r.json().catch(() => ({}))) as Record<string, any>;
  if (!r.ok) throw new MetaRecusou(`Meta: ${j.error?.message ?? `HTTP ${r.status}`}`);
  return j;
}

export interface ClienteMeta {
  trocarCodigo(code: string): Promise<string>;
  assinarWebhooks(wabaId: string, token: string): Promise<void>;
  desassinarWebhooks(wabaId: string, token: string): Promise<void>;
  registrarNumero(phoneNumberId: string, token: string, pin: string): Promise<void>;
  dadosDoNumero(phoneNumberId: string, token: string): Promise<{ numero: string | null; nome: string | null }>;
  enviarTexto(phoneNumberId: string, token: string, para: string, texto: string): Promise<string>;
  enviarModelo(phoneNumberId: string, token: string, para: string, modelo: string, parametros: string[]): Promise<string>;
  criarModelo(wabaId: string, token: string, modelo: { nome: string; texto: string; exemplo: string[] }): Promise<void>;
}

export function clienteMeta(fetchImpl: Fetch = fetch): ClienteMeta {
  return {
    async trocarCodigo(code) {
      const q = new URLSearchParams({ client_id: process.env.META_APP_ID ?? '', client_secret: process.env.META_APP_SECRET ?? '', code });
      const j = await chamar(fetchImpl, `${GRAPH()}/oauth/access_token?${q}`, null);
      if (!j.access_token) throw new MetaRecusou('Meta não devolveu o token da conta.');
      return j.access_token as string;
    },
    async assinarWebhooks(wabaId, token) {
      await chamar(fetchImpl, `${GRAPH()}/${wabaId}/subscribed_apps`, token, { method: 'POST' });
    },
    async desassinarWebhooks(wabaId, token) {
      await chamar(fetchImpl, `${GRAPH()}/${wabaId}/subscribed_apps`, token, { method: 'DELETE' });
    },
    async registrarNumero(phoneNumberId, token, pin) {
      await chamar(fetchImpl, `${GRAPH()}/${phoneNumberId}/register`, token, {
        method: 'POST', body: JSON.stringify({ messaging_product: 'whatsapp', pin }),
      });
    },
    async dadosDoNumero(phoneNumberId, token) {
      const j = await chamar(fetchImpl, `${GRAPH()}/${phoneNumberId}?fields=display_phone_number,verified_name`, token);
      return { numero: j.display_phone_number ?? null, nome: j.verified_name ?? null };
    },
    async enviarTexto(phoneNumberId, token, para, texto) {
      const j = await chamar(fetchImpl, `${GRAPH()}/${phoneNumberId}/messages`, token, {
        method: 'POST',
        body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: para, type: 'text', text: { preview_url: true, body: texto.slice(0, 4096) } }),
      });
      return String(j.messages?.[0]?.id ?? '');
    },
    async enviarModelo(phoneNumberId, token, para, modelo, parametros) {
      const j = await chamar(fetchImpl, `${GRAPH()}/${phoneNumberId}/messages`, token, {
        method: 'POST',
        body: JSON.stringify({
          messaging_product: 'whatsapp', to: para, type: 'template',
          template: { name: modelo, language: { code: 'pt_BR' }, components: [{ type: 'body', parameters: parametros.map((text) => ({ type: 'text', text: text.slice(0, 200) })) }] },
        }),
      });
      return String(j.messages?.[0]?.id ?? '');
    },
    async criarModelo(wabaId, token, m) {
      await chamar(fetchImpl, `${GRAPH()}/${wabaId}/message_templates`, token, {
        method: 'POST',
        body: JSON.stringify({
          name: m.nome, category: 'UTILITY', language: 'pt_BR',
          components: [{ type: 'BODY', text: m.texto, example: { body_text: [m.exemplo] } }],
        }),
      });
    },
  };
}

// Testes trocam o cliente por um falso (sem rede).
let clienteDeTeste: ClienteMeta | null = null;
export function usarClienteMetaDeTeste(c: ClienteMeta | null): void {
  clienteDeTeste = c;
}
export function meta(): ClienteMeta {
  return clienteDeTeste ?? clienteMeta();
}

/** Modelos criados na conta da pousada ao conectar (categoria utilidade). */
export const MODELOS_PADRAO = [
  {
    nome: 'lembrete_chegada',
    texto: 'Olá, {{1}}! Passando para lembrar que a {{2}} espera você em {{3}} ({{4}}). Qualquer dúvida, é só responder esta mensagem.',
    exemplo: ['Maria', 'Pousada Sol', '20/12', 'Suíte Mar'],
  },
  {
    nome: 'reserva_confirmada',
    texto: 'Olá, {{1}}! Sua reserva na {{2}} está confirmada: {{3}}, de {{4}} a {{5}}. Até breve!',
    exemplo: ['Maria', 'Pousada Sol', 'Suíte Mar', '20/12', '23/12'],
  },
];

/**
 * Funil pago de ponta a ponta, pela API de verdade:
 * cadastro com UTM → pousada (trial) → fim do trial → checkout → webhook
 * assinado → plano ativo, conferindo as conversões enviadas à Meta.
 *
 * O Stripe é simulado (sem rede), mas o webhook passa pela verificação de
 * assinatura real do SDK. A Conversions API é interceptada no fetch. O mesmo
 * roteiro com a Stripe em modo de teste está em docs/funil-pago.md.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import Stripe from 'stripe';
import { prepararBanco, temBanco } from './helpers/banco.js';
import { Cliente } from './helpers/cliente.js';

const SEGREDO = 'whsec_teste_funil';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Instagram';

type EventoMeta = { event_name: string; event_id: string; action_source: string; event_source_url?: string; user_data: Record<string, any>; custom_data?: Record<string, any> };

describe('funil pago: cadastro → trial → assinatura, com conversões', { skip: !temBanco && 'DATABASE_URL não definida' }, () => {
  let descartar: () => Promise<void>;
  let fechar: () => Promise<void>;
  let pool: import('pg').Pool;
  let servidor: Server;
  let base: string;
  let ipSeq = 20;
  const fetchOriginal = globalThis.fetch;
  const enviados: { url: string; corpo: any }[] = [];
  const eventos = () => enviados.flatMap((e) => e.corpo.data as EventoMeta[]);

  // Estado do Stripe simulado.
  let customerId = '';
  const assinatura = (status: Stripe.Subscription.Status): Stripe.Subscription => ({
    id: 'sub_funil', object: 'subscription', status, customer: customerId, cancel_at_period_end: false, metadata: {},
    items: { data: [{ price: { id: 'price_pousada_m' }, current_period_end: Math.floor(Date.now() / 1000) + 30 * 864e2 }] },
  } as unknown as Stripe.Subscription);
  let statusNoStripe: Stripe.Subscription.Status = 'incomplete';

  const assinador = new Stripe('sk_test_assinador');
  async function webhook(tipo: string, objeto: Record<string, unknown>) {
    const corpo = JSON.stringify({ id: `evt_${tipo}_${Math.random().toString(36).slice(2)}`, object: 'event', type: tipo, created: Math.floor(Date.now() / 1000), data: { object: objeto } });
    const assinaturaHeader = assinador.webhooks.generateTestHeaderString({ payload: corpo, secret: SEGREDO });
    const r = await fetch(`${base}/api/webhooks/stripe`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': assinaturaHeader }, body: corpo });
    return { status: r.status, json: await r.json() };
  }

  async function cadastrar(email: string, origem: Record<string, unknown>): Promise<Cliente> {
    const c = new Cliente(base, `203.0.113.${ipSeq++}`);
    const cad = await c.req('POST', '/api/auth/sign-up/email', { email, password: 'senha-forte-123', name: 'Dona da Pousada', origem }, { 'User-Agent': UA });
    assert.equal(cad.status, 200, JSON.stringify(cad.json));
    await pool.query(`UPDATE "user" SET email_verified = true WHERE email = $1`, [email]);
    const login = await c.req('POST', '/api/auth/sign-in/email', { email, password: 'senha-forte-123' }, { 'User-Agent': UA });
    assert.equal(login.status, 200, JSON.stringify(login.json));
    return c;
  }

  // Conversões são pela fila, sem await: espera o envio chegar.
  async function esperarEvento(nome: string, total = 1): Promise<EventoMeta[]> {
    for (let i = 0; i < 50; i++) {
      const achados = eventos().filter((e) => e.event_name === nome);
      if (achados.length >= total) return achados;
      await new Promise((ok) => setTimeout(ok, 20));
    }
    return eventos().filter((e) => e.event_name === nome);
  }

  before(async () => {
    ({ descartar } = await prepararBanco('funil'));
    Object.assign(process.env, {
      BILLING_ENABLED: 'true',
      STRIPE_SECRET_KEY: 'sk_test_funil',
      STRIPE_WEBHOOK_SECRET: SEGREDO,
      STRIPE_PRICE_POUSADA_MENSAL: 'price_pousada_m',
      META_PIXEL_ID: '999',
      META_CAPI_TOKEN: 'token-de-teste',
      APP_URL: 'http://localhost:3000',
      FILA_HABILITADA: 'false',
    });
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url instanceof Request ? url.url : url);
      if (u.startsWith('https://graph.facebook.com/')) {
        enviados.push({ url: u, corpo: JSON.parse(String(init?.body)) });
        return new Response('{"events_received":1}', { status: 200 });
      }
      return fetchOriginal(url as never, init);
    }) as typeof fetch;

    const dbmod = await import('../db/index.js');
    await (await import('../db/migrate.js')).runMigrations();
    pool = dbmod.pool;
    fechar = dbmod.closeConnection;

    (await import('../lib/stripe.js')).usarStripeDeTeste({
      webhooks: assinador.webhooks,
      customers: { create: async () => { customerId = 'cus_funil'; return { id: customerId }; } },
      subscriptions: {
        list: async () => ({ data: [] }),
        retrieve: async () => assinatura(statusNoStripe),
      },
      checkout: { sessions: {
        list: async () => ({ data: [] }),
        expire: async () => ({}),
        create: async (p: Record<string, any>) => ({ id: 'cs_funil', url: 'https://checkout.stripe.com/c/pay/cs_funil', metadata: p.metadata }),
      } },
      invoicePayments: { list: async () => ({ data: [] }) },
    } as never);

    const { app } = await import('../app.js');
    servidor = await new Promise<Server>((ok) => { const s = app.listen(0, () => ok(s)); });
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  });

  after(async () => {
    globalThis.fetch = fetchOriginal;
    (await import('../lib/stripe.js')).usarStripeDeTeste(null);
    servidor?.close();
    await fechar?.();
    await descartar?.();
  });

  let dona: Cliente;
  let userId: string;
  let pousadaId: number;

  it('cadastro guarda a UTM na conta e envia CompleteRegistration com IP e user agent', async () => {
    dona = await cadastrar('dona@pousadadomar.com', {
      utm_source: 'meta', utm_medium: 'paid', utm_campaign: 'reels-pousada-nov', utm_content: 'video-mapa',
      fbclid: 'IwAR-teste', fbp: 'fb.1.1700000000000.123', primeira_visita: '2026-11-09T12:00:00.000Z',
      landing: '/', consentimento_anuncios: true, chave_estranha: 'descartada',
    });
    const { rows } = await pool.query(`SELECT id, origem FROM "user" WHERE email = 'dona@pousadadomar.com'`);
    userId = rows[0].id;
    assert.equal(rows[0].origem.utm_campaign, 'reels-pousada-nov');
    assert.equal(rows[0].origem.consentimento_anuncios, true);
    assert.equal(rows[0].origem.chave_estranha, undefined);

    const [cad] = await esperarEvento('CompleteRegistration');
    assert.ok(cad, 'CompleteRegistration não foi enviado');
    assert.equal(cad.event_id, `cadastro:${userId}`);
    assert.equal(cad.action_source, 'website');
    assert.equal(cad.event_source_url, 'http://localhost:3000/cadastro');
    assert.equal(cad.user_data.client_user_agent, UA);
    assert.match(cad.user_data.client_ip_address, /^203\.0\.113\./);
    assert.match(cad.user_data.em[0], /^[a-f0-9]{64}$/);
    assert.equal(cad.user_data.fbc, `fb.1.${Date.parse('2026-11-09T12:00:00.000Z')}.IwAR-teste`);
    assert.equal(cad.user_data.fbp, 'fb.1.1700000000000.123');
    assert.match(enviados[0].url, /graph\.facebook\.com\/v26\.0\/999\/events$/);
    assert.equal(enviados[0].corpo.access_token, 'token-de-teste');
  });

  it('onboarding cria a pousada em trial de 14 dias e envia StartTrial', async () => {
    const r = await dona.req('POST', '/api/pousadas', { nome: 'Pousada do Mar', num_quartos: 8 }, { 'User-Agent': UA });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    dona.pousada = pousadaId = r.json.pousada.id;

    const s = await dona.req('GET', '/api/billing/situacao');
    assert.equal(s.json.assinatura.status, 'trial');
    assert.equal(s.json.assinatura.liberado, true);
    assert.ok(s.json.assinatura.diasRestantes >= 13 && s.json.assinatura.diasRestantes <= 14, String(s.json.assinatura.diasRestantes));

    const [trial] = await esperarEvento('StartTrial');
    assert.ok(trial, 'StartTrial não foi enviado');
    assert.equal(trial.event_id, `trial:${pousadaId}`);
    assert.equal(trial.user_data.client_user_agent, UA);
  });

  it('fim do trial bloqueia a operação com 402', async () => {
    await pool.query(`UPDATE assinaturas SET trial_termina_em = now() - interval '1 hour' WHERE pousada_id = $1`, [pousadaId]);
    const r = await dona.req('GET', '/api/reservas');
    assert.equal(r.status, 402, JSON.stringify(r.json));
    assert.equal(r.json.codigo, 'BILLING_001');
    const planos = await dona.req('GET', '/api/billing/planos?ciclo=mensal');
    assert.deepEqual(planos.json.planos.map((p: any) => p.codigo), ['pousada']);
  });

  it('checkout devolve a URL do Stripe e guarda o contexto para a conversão', async () => {
    const r = await dona.req('POST', '/api/billing/checkout', { plano: 'pousada', ciclo: 'mensal' }, { 'User-Agent': UA });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.match(r.json.url, /^https:\/\/checkout\.stripe\.com\//);
    // O guardado é sem await: dá um instante.
    await new Promise((ok) => setTimeout(ok, 50));
    const { rows } = await pool.query(`SELECT stripe_customer_id, contexto_conversao FROM assinaturas WHERE pousada_id = $1`, [pousadaId]);
    assert.equal(rows[0].stripe_customer_id, 'cus_funil');
    assert.equal(rows[0].contexto_conversao.ua, UA);
  });

  it('webhook assinado ativa o plano, libera a operação e envia Subscribe uma vez', async () => {
    statusNoStripe = 'active';
    const sessao = await webhook('checkout.session.completed', { id: 'cs_funil', object: 'checkout.session', subscription: 'sub_funil', customer: customerId });
    assert.equal(sessao.status, 200, JSON.stringify(sessao.json));

    const fatura = {
      id: 'in_primeira', object: 'invoice', customer: customerId, amount_paid: 14900, currency: 'brl', billing_reason: 'subscription_create',
      parent: { subscription_details: { subscription: 'sub_funil' } }, lines: { data: [{ period: { start: Math.floor(Date.now() / 1000) } }] },
    };
    assert.equal((await webhook('invoice.paid', fatura)).status, 200);

    const s = await dona.req('GET', '/api/billing/situacao');
    assert.equal(s.json.assinatura.status, 'ativa');
    assert.equal(s.json.assinatura.plano, 'pousada');
    assert.equal((await dona.req('GET', '/api/reservas')).status, 200);

    const [sub] = await esperarEvento('Subscribe');
    assert.ok(sub, 'Subscribe não foi enviado');
    assert.equal(sub.event_id, 'assinatura:sub_funil');
    assert.deepEqual(sub.custom_data, { value: 149, currency: 'BRL' });
    assert.equal(sub.action_source, 'website');
    assert.equal(sub.user_data.client_user_agent, UA);

    const { rows } = await pool.query(`SELECT categoria, valor_centavos FROM financeiro_lancamentos WHERE pousada_id = $1 AND categoria = 'receita_assinatura'`, [pousadaId]);
    assert.equal(rows[0]?.valor_centavos, 14900);
  });

  it('renovação não é conversão de anúncio', async () => {
    const antes = eventos().length;
    const renovacao = {
      id: 'in_renovacao', object: 'invoice', customer: customerId, amount_paid: 14900, currency: 'brl', billing_reason: 'subscription_cycle',
      parent: { subscription_details: { subscription: 'sub_funil' } }, lines: { data: [{ period: { start: Math.floor(Date.now() / 1000) + 30 * 864e2 } }] },
    };
    assert.equal((await webhook('invoice.paid', renovacao)).status, 200);
    await new Promise((ok) => setTimeout(ok, 100));
    assert.equal(eventos().length, antes);
  });

  it('sem consentimento nada vai para a Meta, e revogar pelo aviso de cookies chega ao servidor', async () => {
    const antes = eventos().length;
    const semConsentimento = await cadastrar('recusou@pousada.com', { utm_source: 'meta', consentimento_anuncios: false });
    const r = await semConsentimento.req('POST', '/api/pousadas', { nome: 'Pousada Recusa', num_quartos: 4 });
    assert.equal(r.status, 201);
    await new Promise((ok) => setTimeout(ok, 100));
    assert.equal(eventos().length, antes);

    const rev = await dona.req('PUT', '/api/conta/consentimento', { anuncios: false });
    assert.equal(rev.status, 200, JSON.stringify(rev.json));
    const { rows } = await pool.query(`SELECT origem FROM "user" WHERE id = $1`, [userId]);
    assert.equal(rows[0].origem.consentimento_anuncios, false);
    assert.equal(rows[0].origem.utm_campaign, 'reels-pousada-nov');
    assert.equal((await dona.req('PUT', '/api/conta/consentimento', { anuncios: 'sim' })).status, 400);
  });
});

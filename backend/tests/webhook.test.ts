/**
 * Webhook do Stripe contra Postgres real.
 *
 * Cobre as duas falhas de entrega encontradas na auditoria de 2026-10:
 * - evento marcado como processado ANTES dos efeitos (falha no meio = evento
 *   perdido para sempre, porque o reenvio era tratado como duplicado);
 * - eventos fora de ordem sobrescrevendo o estado com dado velho.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type Stripe from 'stripe';
import { prepararBanco, temBanco } from './helpers/banco.js';

describe('webhook do Stripe', { skip: !temBanco && 'DATABASE_URL não definida' }, () => {
  let descartar: () => Promise<void>;
  let pool: import('pg').Pool;
  let processarEvento: typeof import('../routes/stripe-webhook.js').processarEvento;
  let fechar: () => Promise<void>;

  /** Assinatura do Stripe mínima, no formato que o processamento lê. */
  function sub(id: string, status: Stripe.Subscription.Status, customer = 'cus_teste'): Stripe.Subscription {
    return {
      id,
      object: 'subscription',
      customer,
      status,
      cancel_at_period_end: false,
      metadata: { plano: 'pousada', ciclo: 'mensal' },
      items: { data: [{ current_period_end: 1893456000, price: { id: 'price_x' } }] },
    } as unknown as Stripe.Subscription;
  }

  function evento(id: string, type: string, object: unknown): Stripe.Event {
    return { id, type, data: { object } } as unknown as Stripe.Event;
  }

  /** Leitura falsa da API: devolve o estado "atual" que o teste definir. */
  function leitura(estado: Record<string, Stripe.Subscription>) {
    return {
      assinatura: async (id: string) => {
        const s = estado[id];
        if (!s) throw new Error(`assinatura ${id} inexistente`);
        return s;
      },
      taxaDaFatura: async () => ({ centavos: 620, estimado: false }),
    };
  }

  async function statusLocal() {
    const { rows } = await pool.query(
      `SELECT status, plano, stripe_subscription_id FROM assinaturas WHERE stripe_customer_id = 'cus_teste'`,
    );
    return rows[0];
  }

  before(async () => {
    ({ descartar } = await prepararBanco('webhook'));
    const dbmod = await import('../db/index.js');
    const { runMigrations } = await import('../db/migrate.js');
    await runMigrations();
    pool = dbmod.pool;
    fechar = dbmod.closeConnection;
    ({ processarEvento } = await import('../routes/stripe-webhook.js'));

    await pool.query(`INSERT INTO pousadas (id, nome, slug, num_quartos) VALUES (1, 'P', 'p', 10)`);
    await pool.query(
      `INSERT INTO assinaturas (pousada_id, status, stripe_customer_id) VALUES (1, 'trial', 'cus_teste')`,
    );
  });

  after(async () => {
    await fechar?.();
    await descartar?.();
  });

  it('aplica o estado e registra o evento', async () => {
    const r = await processarEvento(
      evento('evt_1', 'customer.subscription.created', { id: 'sub_A' }),
      leitura({ sub_A: sub('sub_A', 'active') }),
    );
    assert.equal(r, 'processado');
    const s = await statusLocal();
    assert.equal(s.status, 'ativa');
    assert.equal(s.plano, 'pousada');
    assert.equal(s.stripe_subscription_id, 'sub_A');
  });

  it('evento repetido é duplicado e não reaplica', async () => {
    const r = await processarEvento(
      evento('evt_1', 'customer.subscription.created', { id: 'sub_A' }),
      leitura({ sub_A: sub('sub_A', 'canceled') }),
    );
    assert.equal(r, 'duplicado');
    assert.equal((await statusLocal()).status, 'ativa');
  });

  it('FALHA no meio não grava nada — e o reenvio do Stripe processa', async () => {
    // Banco recusa o lançamento financeiro: simula falha transitória no meio
    // do processamento de uma fatura paga.
    await pool.query(`
      CREATE FUNCTION falhar() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'falha simulada'; END $$ LANGUAGE plpgsql;
      CREATE TRIGGER t_falhar BEFORE INSERT ON financeiro_lancamentos FOR EACH ROW EXECUTE FUNCTION falhar();
    `);

    const fatura = {
      id: 'in_1',
      customer: 'cus_teste',
      amount_paid: 14900,
      currency: 'brl',
      created: 1790000000,
      parent: { subscription_details: { subscription: 'sub_A' } },
      lines: { data: [{ period: { start: 1790000000 } }] },
    };
    const ev = evento('evt_fatura', 'invoice.paid', fatura);

    await assert.rejects(processarEvento(ev, leitura({ sub_A: sub('sub_A', 'active') })), (err: unknown) => {
      // O Drizzle embrulha o erro do Postgres em "Failed query"; o motivo fica em `cause`.
      const e = err as { message?: string; cause?: { message?: string } };
      return /falha simulada/.test(`${e.message} ${e.cause?.message ?? ''}`);
    });

    const { rows: registrados } = await pool.query(`SELECT 1 FROM stripe_events WHERE id = 'evt_fatura'`);
    assert.equal(registrados.length, 0, 'evento não pode constar como processado após falha');

    await pool.query(`DROP TRIGGER t_falhar ON financeiro_lancamentos; DROP FUNCTION falhar();`);

    // Reenvio do Stripe: agora processa de verdade.
    assert.equal(await processarEvento(ev, leitura({ sub_A: sub('sub_A', 'active') })), 'processado');
    const { rows } = await pool.query(
      `SELECT categoria, valor_centavos FROM financeiro_lancamentos WHERE referencia_externa = 'in_1' ORDER BY categoria`,
    );
    assert.deepEqual(
      rows.map((r) => [r.categoria, r.valor_centavos]),
      [['receita_assinatura', 14900], ['taxa_stripe', 620]],
    );
  });

  it('evento ATRASADO aplica o estado atual do Stripe, não o do payload', async () => {
    // Payload antigo diz "incomplete"; a assinatura hoje está ativa.
    await processarEvento(
      evento('evt_atrasado', 'customer.subscription.updated', { id: 'sub_A', status: 'incomplete' }),
      leitura({ sub_A: sub('sub_A', 'active') }),
    );
    assert.equal((await statusLocal()).status, 'ativa');
  });

  it('cancelamento de OUTRA assinatura do cliente não derruba a corrente', async () => {
    await processarEvento(
      evento('evt_paralela', 'customer.subscription.deleted', { id: 'sub_B' }),
      leitura({ sub_B: sub('sub_B', 'canceled') }),
    );
    const s = await statusLocal();
    assert.equal(s.status, 'ativa');
    assert.equal(s.stripe_subscription_id, 'sub_A');
  });

  it('cancelamento da assinatura corrente é aplicado', async () => {
    await processarEvento(
      evento('evt_cancel', 'customer.subscription.deleted', { id: 'sub_A' }),
      leitura({ sub_A: sub('sub_A', 'canceled') }),
    );
    assert.equal((await statusLocal()).status, 'cancelada');
  });
});

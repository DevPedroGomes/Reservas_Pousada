/**
 * Regras de negócio da reserva, do Pix e do iCal, pela API e pelos models.
 */
import { after, before, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { prepararBanco, temBanco } from './helpers/banco.js';
import { Cliente } from './helpers/cliente.js';

const d = (dias: number) => new Date(Date.now() + dias * 864e5).toISOString().slice(0, 10);

describe('regras de negócio', { skip: !temBanco && 'DATABASE_URL não definida' }, () => {
  let descartar: () => Promise<void>;
  let fechar: () => Promise<void>;
  let pool: import('pg').Pool;
  let servidor: Server;
  let base: string;
  let ipSeq = 10;

  let dono: Cliente, admin: Cliente, recep: Cliente;
  let pousada: number;
  let quartoSeq = 0;
  /** Cada reserva de teste num quarto próprio, para os testes não se esbarrarem. */
  const novoQuarto = () => ++quartoSeq;

  async function novoUsuario(email: string, nome: string): Promise<Cliente> {
    const c = new Cliente(base, `198.51.100.${ipSeq++}`);
    const cad = await c.req('POST', '/api/auth/sign-up/email', { email, password: 'senha-forte-123', name: nome });
    assert.equal(cad.status, 200, JSON.stringify(cad.json));
    await pool.query(`UPDATE "user" SET email_verified = true WHERE email = $1`, [email]);
    const login = await c.req('POST', '/api/auth/sign-in/email', { email, password: 'senha-forte-123' });
    assert.equal(login.status, 200, JSON.stringify(login.json));
    return c;
  }

  async function convidar(email: string, nome: string, role: string): Promise<Cliente> {
    const conv = await dono.req('POST', `/api/pousadas/${pousada}/convites`, { email, role });
    assert.equal(conv.status, 201, JSON.stringify(conv.json));
    const { rows } = await pool.query(`SELECT token FROM staff_invites WHERE email = $1 AND status = 'pending'`, [email]);
    const c = await novoUsuario(email, nome);
    const aceite = await c.req('POST', `/api/convites/${rows[0].token}/aceitar`);
    assert.equal(aceite.status, 200, JSON.stringify(aceite.json));
    c.pousada = pousada;
    return c;
  }

  /** Reserva criada pela recepção; devolve o id. */
  async function novaReserva(extra: Record<string, unknown> = {}): Promise<number> {
    const r = await recep.req('POST', '/api/reservas', {
      nome: 'Teste Dominio', telefone: `4896${String(1000000 + ipSeq++).slice(-7)}`, quarto: novoQuarto(),
      data_entrada: d(100), data_saida: d(102), valor: 500, ...extra,
    });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    return r.json.reserva.id;
  }

  before(async () => {
    ({ descartar } = await prepararBanco('dominio'));
    process.env.BILLING_ENABLED = 'false';
    const dbmod = await import('../db/index.js');
    await (await import('../db/migrate.js')).runMigrations();
    pool = dbmod.pool;
    fechar = dbmod.closeConnection;
    const { app } = await import('../app.js');
    servidor = await new Promise<Server>((ok) => { const s = app.listen(0, () => ok(s)); });
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;

    dono = await novoUsuario('dono@dominio.com', 'Dono');
    const p = await dono.req('POST', '/api/pousadas', {
      nome: 'Pousada Dominio', num_quartos: 90, endereco: 'Rua das Flores, 100', telefone: '48999990000', email: 'contato@dominio.com',
    });
    assert.equal(p.status, 201, JSON.stringify(p.json));
    pousada = p.json.pousada.id;
    dono.pousada = pousada;
    recep = await convidar('recep@dominio.com', 'Recepcao', 'recepcao');
    admin = await convidar('admin@dominio.com', 'Administracao', 'admin');
    const pix = await dono.req('PUT', `/api/pousadas/${pousada}/pix`, { tipo_chave: 'telefone', chave: '48999990000', nome: 'Pousada Dominio', cidade: 'Floripa' });
    assert.equal(pix.status, 200, JSON.stringify(pix.json));
  });

  after(async () => {
    servidor?.close();
    await fechar?.();
    await descartar?.();
  });

  describe('valor da cobrança Pix', () => {
    const gerar = (id: number, valor: unknown) => recep.req('POST', `/api/reservas/${id}/pix`, { valor });

    it('"150.50" é R$ 150,50, não R$ 15.050,00', async () => {
      const r = await gerar(await novaReserva(), '150.50');
      assert.equal(r.status, 201, JSON.stringify(r.json));
      assert.equal(r.json.cobranca.valorCentavos, 15050);
    });

    it('aceita vírgula, milhar pt-BR e número', async () => {
      const id = await novaReserva({ valor: 5000 });
      assert.equal((await gerar(id, '150,50')).json.cobranca.valorCentavos, 15050);
      assert.equal((await gerar(id, '1.234,56')).json.cobranca.valorCentavos, 123456);
      assert.equal((await gerar(id, '1.500')).json.cobranca.valorCentavos, 150000);
      assert.equal((await gerar(id, 99.9)).json.cobranca.valorCentavos, 9990);
    });

    it('não cobra acima do saldo da reserva', async () => {
      const id = await novaReserva({ valor: 500 });
      assert.equal((await gerar(id, '500.01')).status, 400);
      assert.equal((await recep.req('POST', `/api/reservas/${id}/pagamentos`, { valor: 100, forma: 'dinheiro' })).status, 201);
      const acima = await gerar(id, '400.01');
      assert.equal(acima.status, 400);
      assert.match(acima.json.mensagem, /saldo/i);
      assert.equal((await gerar(id, '400')).status, 201);
    });

    it('valor que não é número é recusado', async () => {
      assert.equal((await gerar(await novaReserva(), 'abc')).status, 400);
    });
  });

  // -------------------------------------------------------------------------
  // iCal
  const ev = (uid: string, ini: string, fim: string, resumo = 'Reserved') =>
    `BEGIN:VEVENT\r\nUID:${uid}\r\nDTSTART;VALUE=DATE:${ini.replace(/-/g, '')}\r\nDTEND;VALUE=DATE:${fim.replace(/-/g, '')}\r\nSUMMARY:${resumo}\r\nEND:VEVENT`;
  const feed = (...eventos: string[]) => async () => ['BEGIN:VCALENDAR', ...eventos, 'END:VCALENDAR'].join('\r\n');
  let calendarioSeq = 0;
  async function novoCalendario(canal = 'airbnb') {
    const Ical = await import('../models/Ical.js');
    const imp = await Ical.criarImportacao(pousada, {
      quarto: novoQuarto(), nome: 'Airbnb', canal, url: `https://www.airbnb.com/calendar/ical/${++calendarioSeq}.ics`,
    });
    return { Ical, imp };
  }
  const statusDoUid = async (impId: number, uid: string) =>
    (await pool.query(`SELECT status FROM reservas WHERE ical_importacao_id = $1 AND ical_uid = $2`, [impId, uid])).rows[0]?.status;
  const avisoDoCalendario = async (impId: number) =>
    (await pool.query(`SELECT ultimo_erro FROM ical_importacoes WHERE id = $1`, [impId])).rows[0].ultimo_erro as string | null;

  describe('iCal: feed vazio e evento ausente', () => {
    it('feed sem eventos não cancela nada e grava aviso', async () => {
      const { Ical, imp } = await novoCalendario();
      await Ical.sincronizarImportacao(imp, feed(ev('a', d(150), d(153))));
      for (let i = 0; i < 4; i++) {
        const r = await Ical.sincronizarImportacao(imp, feed());
        assert.equal(r.canceladas, 0);
      }
      assert.equal(await statusDoUid(imp.id, 'a'), 'confirmada');
      assert.match((await avisoDoCalendario(imp.id))!, /sem nenhum evento/);
    });

    it('feed cortado (sem END:VCALENDAR) falha, não cancela e grava aviso', async () => {
      const { Ical, imp } = await novoCalendario();
      await Ical.sincronizarImportacao(imp, feed(ev('a', d(150), d(153)), ev('b', d(155), d(157))));
      const cortado = async () => `BEGIN:VCALENDAR\r\n${ev('a', d(150), d(153))}\r\n`;
      await assert.rejects(Ical.sincronizarImportacao(imp, cortado));
      assert.equal(await statusDoUid(imp.id, 'b'), 'confirmada');
      assert.match((await avisoDoCalendario(imp.id))!, /incompleto/);
    });

    it('evento ausente só cancela na terceira sincronização seguida', async () => {
      const { Ical, imp } = await novoCalendario();
      const comOutro = feed(ev('fica', d(160), d(161)));
      await Ical.sincronizarImportacao(imp, feed(ev('fica', d(160), d(161)), ev('some', d(150), d(153))));
      assert.equal((await Ical.sincronizarImportacao(imp, comOutro)).canceladas, 0);
      assert.equal(await statusDoUid(imp.id, 'some'), 'confirmada');
      assert.match((await avisoDoCalendario(imp.id))!, /sumiu|sumiram/);
      assert.equal((await Ical.sincronizarImportacao(imp, comOutro)).canceladas, 0);
      assert.equal(await statusDoUid(imp.id, 'some'), 'confirmada');
      assert.equal((await Ical.sincronizarImportacao(imp, comOutro)).canceladas, 1);
      assert.equal(await statusDoUid(imp.id, 'some'), 'cancelada');
    });

    it('voltar ao feed zera a contagem; feed vazio não conta como ausência', async () => {
      const { Ical, imp } = await novoCalendario();
      const com = feed(ev('fica', d(160), d(161)), ev('volta', d(150), d(153)));
      const sem = feed(ev('fica', d(160), d(161)));
      await Ical.sincronizarImportacao(imp, com);
      await Ical.sincronizarImportacao(imp, sem);
      await Ical.sincronizarImportacao(imp, sem);
      await Ical.sincronizarImportacao(imp, com);
      await Ical.sincronizarImportacao(imp, sem);
      await Ical.sincronizarImportacao(imp, feed());
      await Ical.sincronizarImportacao(imp, sem);
      assert.equal(await statusDoUid(imp.id, 'volta'), 'confirmada');
      assert.equal((await Ical.sincronizarImportacao(imp, sem)).canceladas, 1);
    });
  });

  // -------------------------------------------------------------------------
  /** Roda `fn` e devolve os assuntos dos e-mails entregues (sem Resend, vão ao log). */
  async function emailsDe(fn: () => Promise<unknown>): Promise<{ para: string; assunto: string }[]> {
    const log = mock.method(console, 'log', () => {});
    try {
      await fn();
      return log.mock.calls
        .map((c) => /\[Email\] \(sem RESEND_API_KEY\) Para: (.*) \| Assunto: (.*)/.exec(String(c.arguments[0])))
        .filter((m): m is RegExpExecArray => Boolean(m))
        .map((m) => ({ para: m[1], assunto: m[2] }));
    } finally {
      log.mock.restore();
    }
  }

  describe('Pix pago depois de encerrar a reserva', () => {
    const cancelados: string[] = [];
    const situacao = new Map<string, 'pendente' | 'paga'>();
    let falharCancelamento = false;
    let consultaRecusa = false;
    let seq = 0;
    let cred: { webhook_token: string; webhook_auth: string };
    const anon = () => new Cliente(base, `203.0.113.${ipSeq++}`);

    before(async () => {
      const { GatewayRecusou, usarGatewayDeTeste } = await import('../lib/gatewayPix.js');
      usarGatewayDeTeste(() => ({
        exigeDocumento: true,
        async criarCobranca() { const id = `pay_tardio${++seq}`; return { id, copiaECola: `00020101-${id}`, expiraEm: null }; },
        async consultar(id) {
          if (consultaRecusa) throw new GatewayRecusou('Asaas: cobrança removida');
          return { status: situacao.get(id) ?? 'pendente', valorCentavos: 15000, referencia: null };
        },
        async cancelarCobranca(id) {
          if (falharCancelamento) throw new Error('fora do ar');
          cancelados.push(id);
        },
        async registrarWebhook() {},
      }));
      const r = await dono.req('PUT', `/api/pousadas/${pousada}/pix`, {
        tipo_chave: 'telefone', chave: '48999990000', nome: 'Pousada Dominio', cidade: 'Floripa',
        asaas_chave: '$aact_hmlg_000MzkwODA2MWY2OGM3MWRlMDU2NWM3MzJlNzZmNGZhZGY6OmFkZmM',
      });
      assert.equal(r.status, 200, JSON.stringify(r.json));
      cred = (await pool.query(`SELECT webhook_token, webhook_auth FROM credenciais_pagamento WHERE pousada_id = $1`, [pousada])).rows[0];
    });

    after(async () => {
      (await import('../lib/gatewayPix.js')).usarGatewayDeTeste(null);
      await dono.req('PUT', `/api/pousadas/${pousada}/pix`, { tipo_chave: 'telefone', chave: '48999990000', nome: 'Pousada Dominio', cidade: 'Floripa', remover_asaas: true });
    });

    async function preComPix(quarto = novoQuarto()) {
      const r = await recep.req('POST', '/api/reservas', {
        nome: 'Hospede Tardio', cpf: '86288366757', telefone: '48966660000', quarto, data_entrada: d(120), data_saida: d(122), valor: 500, status: 'pre_reserva', prazo_horas: 24,
      });
      assert.equal(r.status, 201, JSON.stringify(r.json));
      const c = await recep.req('POST', `/api/reservas/${r.json.reserva.id}/pix`, { valor: 150 });
      assert.equal(c.status, 201, JSON.stringify(c.json));
      assert.equal(c.json.cobranca.provedor, 'asaas');
      const { rows: [linha] } = await pool.query(`SELECT provedor_id FROM cobrancas_pix WHERE id = $1`, [c.json.cobranca.id]);
      return { id: r.json.reserva.id as number, quarto, version: r.json.reserva.version as number, cobranca: c.json.cobranca.id as number, pagamento: linha.provedor_id as string };
    }
    const expirar = async (id: number) => {
      await pool.query(`UPDATE reservas SET expira_em = now() - interval '1 minute' WHERE id = $1`, [id]);
      await (await import('../jobs/estadias.js')).expirarPreReservas();
    };
    const avisoPago = (pagamento: string) => {
      situacao.set(pagamento, 'paga');
      return anon().req('POST', `/api/webhooks/pix/asaas/${cred.webhook_token}`, { event: 'PAYMENT_RECEIVED', payment: { id: pagamento } }, { 'asaas-access-token': cred.webhook_auth });
    };
    const linha = async (id: number) => (await pool.query(`SELECT status, deleted_at FROM reservas WHERE id = $1`, [id])).rows[0];
    const cobrancaDe = async (id: number) => (await pool.query(`SELECT status, estorno_pendente, pagamento_id FROM cobrancas_pix WHERE id = $1`, [id])).rows[0];
    const pagamentosDe = async (id: number) => (await pool.query(`SELECT valor_centavos, forma, observacao FROM pagamentos WHERE reserva_id = $1`, [id])).rows;

    it('expirar a pré-reserva cancela a cobrança no gateway', async () => {
      const p = await preComPix();
      await expirar(p.id);
      assert.ok(cancelados.includes(p.pagamento));
      assert.equal((await cobrancaDe(p.cobranca)).status, 'expirada');
    });

    it('PATCH para cancelada cancela a cobrança no gateway', async () => {
      const p = await preComPix();
      const r = await recep.req('PATCH', `/api/reservas/${p.id}/status`, { status: 'cancelada', version: p.version });
      assert.equal(r.status, 200, JSON.stringify(r.json));
      assert.ok(cancelados.includes(p.pagamento));
      assert.equal((await cobrancaDe(p.cobranca)).status, 'cancelada');
    });

    it('DELETE cancela a cobrança no gateway', async () => {
      const p = await preComPix();
      assert.equal((await admin.req('DELETE', `/api/reservas/${p.id}`)).status, 200);
      assert.ok(cancelados.includes(p.pagamento));
      assert.equal((await cobrancaDe(p.cobranca)).status, 'cancelada');
    });

    it('gateway fora do ar não impede encerrar a reserva', async () => {
      const p = await preComPix();
      falharCancelamento = true;
      const erro = mock.method(console, 'error', () => {});
      try {
        const r = await recep.req('PATCH', `/api/reservas/${p.id}/status`, { status: 'cancelada', version: p.version });
        assert.equal(r.status, 200, JSON.stringify(r.json));
      } finally {
        falharCancelamento = false;
        erro.mock.restore();
      }
      assert.equal((await linha(p.id)).status, 'cancelada');
    });

    it('pago após expirar com o quarto livre: reativa, lança o pagamento e avisa', async () => {
      const p = await preComPix();
      await expirar(p.id);
      const emails = await emailsDe(async () => assert.equal((await avisoPago(p.pagamento)).status, 200));
      assert.equal((await linha(p.id)).status, 'confirmada');
      const c = await cobrancaDe(p.cobranca);
      assert.deepEqual([c.status, c.estorno_pendente], ['paga', false]);
      assert.equal((await pagamentosDe(p.id))[0].valor_centavos, 15000);
      assert.ok(emails.some((e) => /Pix/.test(e.assunto) && /reativada/.test(e.assunto)), JSON.stringify(emails));
    });

    it('pago após expirar com o quarto ocupado: registra, marca para estorno e avisa a equipe, uma vez só', async () => {
      const p = await preComPix();
      await expirar(p.id);
      await novaReserva({ quarto: p.quarto, data_entrada: d(120), data_saida: d(122) });
      const emails = await emailsDe(async () => {
        assert.equal((await avisoPago(p.pagamento)).status, 200);
        assert.equal((await avisoPago(p.pagamento)).status, 200);
      });
      assert.equal((await linha(p.id)).status, 'cancelada', 'o EXCLUDE decide: quarto de outra reserva');
      const c = await cobrancaDe(p.cobranca);
      assert.deepEqual([c.status, c.estorno_pendente], ['paga', true]);
      const pgs = await pagamentosDe(p.id);
      assert.equal(pgs.length, 1, 'aviso repetido não lança de novo');
      assert.deepEqual([pgs[0].valor_centavos, pgs[0].forma], [15000, 'pix']);
      assert.match(pgs[0].observacao, /estornar/i);
      const paraEquipe = emails.filter((e) => /estornar/i.test(e.assunto));
      assert.ok(paraEquipe.some((e) => e.para === 'dono@dominio.com'), JSON.stringify(emails));
      assert.equal(paraEquipe.filter((e) => e.para === 'dono@dominio.com').length, 1);
      const { rows: [aud] } = await pool.query(`SELECT details FROM auditoria WHERE action = 'pix_estorno_pendente' AND entity_id = $1`, [p.id]);
      assert.equal(aud.details.valorCentavos, 15000);
      const lista = await recep.req('GET', `/api/reservas/${p.id}/pix`);
      assert.equal(lista.json.cobrancas[0].estornoPendente, true);
    });

    it('reserva excluída não volta: pago depois vai para estorno', async () => {
      const p = await preComPix();
      assert.equal((await admin.req('DELETE', `/api/reservas/${p.id}`)).status, 200);
      await emailsDe(async () => assert.equal((await avisoPago(p.pagamento)).status, 200));
      const l = await linha(p.id);
      assert.ok(l.deleted_at, 'continua excluída');
      assert.equal((await cobrancaDe(p.cobranca)).estorno_pendente, true);
    });

    it('estadia que já passou não reativa: vai para estorno', async () => {
      const p = await preComPix();
      await expirar(p.id);
      await pool.query(`UPDATE reservas SET data_entrada = $2, data_saida = $3 WHERE id = $1`, [p.id, d(-10), d(-8)]);
      await emailsDe(async () => avisoPago(p.pagamento));
      assert.equal((await linha(p.id)).status, 'cancelada');
      assert.equal((await cobrancaDe(p.cobranca)).estorno_pendente, true);
    });

    it('"Recebi o Pix" em reserva encerrada segue a mesma regra', async () => {
      const r = await recep.req('POST', '/api/reservas', {
        nome: 'Sem Cpf Tardio', telefone: '48966660001', quarto: novoQuarto(), data_entrada: d(120), data_saida: d(122), valor: 500, status: 'pre_reserva', prazo_horas: 24,
      });
      const id = r.json.reserva.id;
      const c = await recep.req('POST', `/api/reservas/${id}/pix`, { valor: 100 });
      assert.equal(c.json.cobranca.provedor, 'chave');
      await expirar(id);
      await novaReserva({ quarto: r.json.reserva.quarto, data_entrada: d(120), data_saida: d(122) });
      let baixa: { status: number; json: any } | undefined;
      await emailsDe(async () => { baixa = await recep.req('POST', `/api/reservas/${id}/pix/${c.json.cobranca.id}/recebida`); });
      assert.equal(baixa!.status, 200, JSON.stringify(baixa!.json));
      assert.match(baixa!.json.mensagem, /estorn/i);
      assert.equal((await cobrancaDe(c.json.cobranca.id)).estorno_pendente, true);
    });

    it('aviso de cobrança já encerrada que o gateway recusa consultar não vira 500', async () => {
      const p = await preComPix();
      await recep.req('PATCH', `/api/reservas/${p.id}/status`, { status: 'cancelada', version: p.version });
      consultaRecusa = true;
      try {
        const r = await anon().req('POST', `/api/webhooks/pix/asaas/${cred.webhook_token}`, { event: 'PAYMENT_DELETED', payment: { id: p.pagamento } }, { 'asaas-access-token': cred.webhook_auth });
        assert.equal(r.status, 200);
      } finally {
        consultaRecusa = false;
      }
    });
  });
});

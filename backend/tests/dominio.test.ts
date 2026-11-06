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
});

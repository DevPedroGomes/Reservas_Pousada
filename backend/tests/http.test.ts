/**
 * Autorização e isolamento entre pousadas, pela API de verdade.
 *
 * Sobe o app (app.ts) numa porta qualquer, contra um Postgres descartável, e
 * exercita o caminho completo: cadastro e login reais (better-auth),
 * cookies, header X-Pousada-Id, papéis e billing. É a rede de segurança que
 * faltava: até aqui, nenhum teste passava por uma rota.
 *
 * Cada usuário usa um X-Forwarded-For próprio (o app confia no proxy), como
 * clientes distintos na internet — sem isso os limites de login/cadastro por
 * IP, corretamente, barrariam o próprio teste.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { prepararBanco, temBanco } from './helpers/banco.js';

type Resposta = { status: number; json: any };

class Cliente {
  private cookies = new Map<string, string>();
  pousada: number | null = null;
  constructor(private readonly base: string, private readonly ip: string) {}

  async req(metodo: string, caminho: string, corpo?: unknown, extra: Record<string, string> = {}): Promise<Resposta> {
    const headers: Record<string, string> = { Origin: 'http://localhost:3000', 'X-Forwarded-For': this.ip, ...extra };
    if (corpo !== undefined) headers['Content-Type'] = 'application/json';
    if (this.cookies.size) headers.Cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    if (this.pousada && !('X-Pousada-Id' in extra)) headers['X-Pousada-Id'] = String(this.pousada);
    const r = await fetch(this.base + caminho, {
      method: metodo,
      headers,
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
      redirect: 'manual',
    });
    for (const c of r.headers.getSetCookie()) {
      const [par] = c.split(';');
      const i = par.indexOf('=');
      const [k, v] = [par.slice(0, i), par.slice(i + 1)];
      if (v) this.cookies.set(k, v);
      else this.cookies.delete(k);
    }
    const texto = await r.text();
    let json: any = texto;
    try { json = JSON.parse(texto); } catch { /* texto puro (CSV) */ }
    return { status: r.status, json };
  }
}

const CPF = '52998224725';
const d = (dias: number) => new Date(Date.now() + dias * 864e5).toISOString().slice(0, 10);

describe('API — autorização e isolamento', { skip: !temBanco && 'DATABASE_URL não definida' }, () => {
  let descartar: () => Promise<void>;
  let fechar: () => Promise<void>;
  let pool: import('pg').Pool;
  let servidor: Server;
  let base: string;
  let ipSeq = 10;

  let donoA: Cliente, donoB: Cliente, recep: Cliente, aud: Cliente;
  let pousadaA: number, pousadaB: number, reservaA: number;

  async function novoUsuario(email: string, nome: string): Promise<Cliente> {
    const c = new Cliente(base, `198.51.100.${ipSeq++}`);
    const cad = await c.req('POST', '/api/auth/sign-up/email', { email, password: 'senha-forte-123', name: nome });
    assert.equal(cad.status, 200, JSON.stringify(cad.json));
    // E-mail confirmado (o link é testado à parte; aqui interessa o depois).
    await pool.query(`UPDATE "user" SET email_verified = true WHERE email = $1`, [email]);
    const login = await c.req('POST', '/api/auth/sign-in/email', { email, password: 'senha-forte-123' });
    assert.equal(login.status, 200, JSON.stringify(login.json));
    return c;
  }

  async function criarPousada(c: Cliente, nome: string): Promise<number> {
    const r = await c.req('POST', '/api/pousadas', {
      nome, num_quartos: 10, endereco: 'Rua das Flores, 100', telefone: '48999990000', email: 'contato@pousada.com',
    });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    c.pousada = r.json.pousada.id;
    return r.json.pousada.id;
  }

  async function convidarEAceitar(dono: Cliente, pousadaId: number, email: string, nome: string, role: string): Promise<Cliente> {
    const conv = await dono.req('POST', `/api/pousadas/${pousadaId}/convites`, { email, role });
    assert.equal(conv.status, 201, JSON.stringify(conv.json));
    const { rows } = await pool.query(`SELECT token FROM staff_invites WHERE email = $1 AND status = 'pending'`, [email]);
    const c = await novoUsuario(email, nome);
    const aceite = await c.req('POST', `/api/convites/${rows[0].token}/aceitar`);
    assert.equal(aceite.status, 200, JSON.stringify(aceite.json));
    c.pousada = pousadaId;
    return c;
  }

  before(async () => {
    ({ descartar } = await prepararBanco('http'));
    process.env.BILLING_ENABLED = 'false';
    const dbmod = await import('../db/index.js');
    await (await import('../db/migrate.js')).runMigrations();
    pool = dbmod.pool;
    fechar = dbmod.closeConnection;
    const { app } = await import('../app.js');
    servidor = await new Promise<Server>((ok) => { const s = app.listen(0, () => ok(s)); });
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;

    donoA = await novoUsuario('dono.a@teste.com', 'Dono A');
    donoB = await novoUsuario('dono.b@teste.com', 'Dono B');
    pousadaA = await criarPousada(donoA, 'Pousada A');
    pousadaB = await criarPousada(donoB, 'Pousada B');

    const r = await donoA.req('POST', '/api/reservas', {
      nome: 'Hóspede da A', cpf: CPF, quarto: 3, data_entrada: d(10), data_saida: d(12), valor: 450,
    });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    reservaA = r.json.reserva.id;

    recep = await convidarEAceitar(donoA, pousadaA, 'recep@teste.com', 'Recepcionista', 'recepcao');
    aud = await convidarEAceitar(donoA, pousadaA, 'aud@teste.com', 'Auditora', 'auditoria');
  });

  after(async () => {
    servidor?.close();
    await fechar?.();
    await descartar?.();
  });

  describe('autenticação', () => {
    it('sem sessão: 401 nas rotas da operação', async () => {
      const anon = new Cliente(base, '198.51.100.250');
      for (const rota of ['/api/reservas', '/api/pousadas/minha', '/api/billing/situacao', '/api/conta/exportar']) {
        assert.equal((await anon.req('GET', rota)).status, 401, rota);
      }
    });

    it('cadastro sem e-mail confirmado não abre sessão', async () => {
      const c = new Cliente(base, '198.51.100.251');
      await c.req('POST', '/api/auth/sign-up/email', { email: 'nao.confirmado@teste.com', password: 'senha-forte-123', name: 'X' });
      assert.equal((await c.req('GET', '/api/reservas')).status, 401);
      const login = await c.req('POST', '/api/auth/sign-in/email', { email: 'nao.confirmado@teste.com', password: 'senha-forte-123' });
      assert.equal(login.status, 403);
      assert.equal(login.json.code, 'EMAIL_NOT_VERIFIED');
    });
  });

  describe('isolamento entre pousadas', () => {
    it('dono B não lê, não altera e não exclui reserva da pousada A', async () => {
      assert.equal((await donoB.req('GET', `/api/reservas/${reservaA}`)).status, 404);
      assert.equal((await donoB.req('PUT', `/api/reservas/${reservaA}`, {
        nome: 'Invasor', cpf: CPF, quarto: 3, data_entrada: d(10), data_saida: d(12),
      })).status, 404);
      assert.equal((await donoB.req('PATCH', `/api/reservas/${reservaA}/status`, { status: 'cancelada' })).status, 404);
      assert.equal((await donoB.req('DELETE', `/api/reservas/${reservaA}`)).status, 404);
      assert.equal((await donoB.req('GET', `/api/reservas/${reservaA}/auditoria`)).status, 404);
      const lista = await donoB.req('GET', '/api/reservas');
      assert.equal(lista.json.meta.total, 0);
    });

    it('header X-Pousada-Id de pousada alheia é recusado (403), não ignorado', async () => {
      const r = await donoB.req('GET', '/api/reservas', undefined, { 'X-Pousada-Id': String(pousadaA) });
      assert.equal(r.status, 403);
      assert.equal(r.json.pousadaInvalida, true);
    });

    it('rotas de pousada por id exigem ser membro daquela pousada', async () => {
      for (const rota of [`/api/pousadas/${pousadaA}`, `/api/pousadas/${pousadaA}/dashboard`, `/api/pousadas/${pousadaA}/usuarios`, `/api/pousadas/${pousadaA}/convites`]) {
        assert.equal((await donoB.req('GET', rota)).status, 403, rota);
      }
      assert.equal((await donoB.req('PUT', `/api/pousadas/${pousadaA}`, { nome: 'Tomada' })).status, 403);
    });

    it('vincular usuário pelo id não existe mais', async () => {
      assert.equal((await donoA.req('POST', `/api/pousadas/${pousadaA}/usuarios`, { user_id: 'qualquer' })).status, 404);
    });

    it('agenda e exportação só enxergam a própria pousada', async () => {
      const agB = await donoB.req('GET', `/api/reservas/agenda?data=${d(10)}`);
      assert.equal(agB.json.chegadas.length, 0);
      const agA = await donoA.req('GET', `/api/reservas/agenda?data=${d(10)}`);
      assert.equal(agA.json.chegadas.length, 1);
      const csvB = await donoB.req('GET', '/api/reservas/export');
      assert.ok(!String(csvB.json).includes('Hóspede da A'));
    });
  });

  describe('papéis', () => {
    it('recepção cria e edita reserva, mas não exclui', async () => {
      const r = await recep.req('POST', '/api/reservas', {
        nome: 'Lançada pela recepção', cpf: '11144477735', quarto: 4, data_entrada: d(20), data_saida: d(22),
      });
      assert.equal(r.status, 201, JSON.stringify(r.json));
      assert.equal((await recep.req('DELETE', `/api/reservas/${r.json.reserva.id}`)).status, 403);
    });

    it('recepção não administra a pousada nem a equipe', async () => {
      assert.equal((await recep.req('PUT', `/api/pousadas/${pousadaA}`, { num_quartos: 50 })).status, 403);
      assert.equal((await recep.req('GET', `/api/pousadas/${pousadaA}/usuarios`)).status, 403);
      assert.equal((await recep.req('POST', `/api/pousadas/${pousadaA}/convites`, { email: 'x@y.com', role: 'admin' })).status, 403);
    });

    it('auditoria só lê, e vê CPF mascarado inclusive no detalhe', async () => {
      assert.equal((await aud.req('POST', '/api/reservas', {
        nome: 'Não pode', cpf: CPF, quarto: 5, data_entrada: d(30), data_saida: d(31),
      })).status, 403);
      const lista = await aud.req('GET', '/api/reservas');
      assert.ok(lista.json.reservas.every((x: { cpf: string }) => x.cpf.startsWith('***')));
      const det = await aud.req('GET', `/api/reservas/${reservaA}`);
      assert.equal(det.json.reserva.cpf, '***.***.***-25');
      assert.equal(det.json.reserva.cpfHash, undefined);
    });

    it('dono vê CPF completo no detalhe, e a visualização fica na auditoria', async () => {
      const det = await donoA.req('GET', `/api/reservas/${reservaA}`);
      assert.equal(det.json.reserva.cpf, CPF);
      // O registro é gravado sem segurar a resposta: espera até 1s por ele.
      let achou = 0;
      for (let i = 0; i < 20 && !achou; i++) {
        achou = (await pool.query(`SELECT 1 FROM auditoria WHERE action = 'visualizar_cpf' AND entity_id = $1`, [reservaA])).rowCount ?? 0;
        if (!achou) await new Promise((r) => setTimeout(r, 50));
      }
      assert.ok(achou >= 1);
    });

    it('listagem nunca devolve CPF completo nem hash, nem para o dono', async () => {
      const lista = await donoA.req('GET', '/api/reservas');
      for (const r of lista.json.reservas) {
        assert.ok(r.cpf.startsWith('***'));
        assert.equal(r.cpfHash, undefined);
      }
    });

    it('conflito de quarto não vaza dados de outro hóspede', async () => {
      const r = await recep.req('POST', '/api/reservas', {
        nome: 'Choque', cpf: '11144477735', quarto: 3, data_entrada: d(11), data_saida: d(13),
      });
      assert.equal(r.status, 409);
      assert.deepEqual(Object.keys(r.json.conflitos[0]).sort(), ['dataEntrada', 'dataSaida', 'id', 'nome', 'quarto', 'status']);
    });

    it('quarto inexistente na pousada é recusado', async () => {
      const r = await donoA.req('POST', '/api/reservas', {
        nome: 'Quarto fantasma', cpf: CPF, quarto: 57, data_entrada: d(40), data_saida: d(41),
      });
      assert.equal(r.status, 400);
    });

    it('admin não promove ninguém a admin; dono sim', async () => {
      const { rows } = await pool.query(`SELECT id FROM "user" WHERE email IN ('recep@teste.com', 'aud@teste.com') ORDER BY email`);
      const [audId, recepId] = [rows[0].id, rows[1].id];
      assert.equal((await donoA.req('PATCH', `/api/pousadas/${pousadaA}/usuarios/${recepId}`, { role: 'admin' })).status, 200);
      // recep agora é admin, mas não pode criar outro admin
      assert.equal((await recep.req('PATCH', `/api/pousadas/${pousadaA}/usuarios/${audId}`, { role: 'admin' })).status, 403);
      // e pode trocar a auditora para recepção
      assert.equal((await recep.req('PATCH', `/api/pousadas/${pousadaA}/usuarios/${audId}`, { role: 'recepcao' })).status, 200);
      assert.equal((await donoA.req('PATCH', `/api/pousadas/${pousadaA}/usuarios/${recepId}`, { role: 'recepcao' })).status, 200);
    });

    it('remover da equipe tira o acesso na hora', async () => {
      const { rows } = await pool.query(`SELECT id FROM "user" WHERE email = 'aud@teste.com'`);
      assert.equal((await donoA.req('DELETE', `/api/pousadas/${pousadaA}/usuarios/${rows[0].id}`)).status, 200);
      const r = await aud.req('GET', '/api/reservas');
      assert.equal(r.status, 403);
      assert.equal(r.json.pousadaInvalida, true);
    });
  });

  describe('quartos', () => {
    it('pousada nasce com os quartos do onboarding, nomeados', async () => {
      const r = await donoA.req('GET', '/api/quartos');
      assert.equal(r.json.quartos.length, 10);
      assert.equal(r.json.quartos[0].nome, 'Quarto 1');
    });

    it('cria quarto com nome, tipo, capacidade e preço; aceita reserva nele', async () => {
      const r = await donoA.req('POST', '/api/quartos', { nome: 'Suíte Mar', tipo: 'Suíte', capacidade: 4, preco_base: 350 });
      assert.equal(r.status, 201, JSON.stringify(r.json));
      assert.deepEqual([r.json.quarto.numero, r.json.quarto.preco_base, r.json.quarto.capacidade], [11, 350, 4]);
      const res = await donoA.req('POST', '/api/reservas', { nome: 'Na suíte', cpf: CPF, quarto: 11, data_entrada: d(50), data_saida: d(52) });
      assert.equal(res.status, 201, JSON.stringify(res.json));
    });

    it('não desativa quarto com reserva a partir de hoje', async () => {
      const lista = await donoA.req('GET', '/api/quartos');
      const suite = lista.json.quartos.find((q: { numero: number }) => q.numero === 11);
      const r = await donoA.req('PUT', `/api/quartos/${suite.id}`, { ativo: false });
      assert.equal(r.status, 409);
    });

    it('quarto desativado não recebe reserva; sem histórico, remover apaga', async () => {
      const lista = await donoA.req('GET', '/api/quartos');
      const q10 = lista.json.quartos.find((q: { numero: number }) => q.numero === 10);
      assert.equal((await donoA.req('PUT', `/api/quartos/${q10.id}`, { ativo: false })).status, 200);
      const res = await donoA.req('POST', '/api/reservas', { nome: 'Q10', cpf: CPF, quarto: 10, data_entrada: d(60), data_saida: d(61) });
      assert.equal(res.status, 400);
      assert.equal((await donoA.req('DELETE', `/api/quartos/${q10.id}`)).json.resultado, 'removido');
    });

    it('recepção vê os quartos mas não altera', async () => {
      assert.equal((await recep.req('GET', '/api/quartos')).status, 200);
      assert.equal((await recep.req('POST', '/api/quartos', { nome: 'X' })).status, 403);
    });

    it('reduzir o número de quartos recusa quando sairia um com reserva', async () => {
      const r = await donoA.req('PUT', `/api/pousadas/${pousadaA}`, { num_quartos: 2 });
      assert.equal(r.status, 409);
      assert.match(r.json.mensagem, /quartos/);
    });
  });

  describe('onboarding', () => {
    it('cria a pousada só com nome e quartos (endereço e contato depois)', async () => {
      const c = await novoUsuario('minimo@teste.com', 'Dona Mínima');
      const r = await c.req('POST', '/api/pousadas', { nome: "Pousada D'Água", num_quartos: 4 });
      assert.equal(r.status, 201, JSON.stringify(r.json));
      assert.equal(r.json.pousada.nome, "Pousada D'Água");
    });

    it('contato informado ainda é validado', async () => {
      const c = await novoUsuario('contato.ruim@teste.com', 'Contato Ruim');
      const r = await c.req('POST', '/api/pousadas', { nome: 'Pousada X', num_quartos: 4, telefone: '123' });
      assert.equal(r.status, 400);
    });
  });

  describe('billing (com cobrança ligada)', () => {
    let antes: Record<string, string | undefined>;
    before(() => {
      antes = { BILLING_ENABLED: process.env.BILLING_ENABLED, STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY };
      process.env.BILLING_ENABLED = 'true';
      process.env.STRIPE_SECRET_KEY = 'sk_test_nao_usada';
    });
    after(() => {
      process.env.BILLING_ENABLED = antes.BILLING_ENABLED;
      process.env.STRIPE_SECRET_KEY = antes.STRIPE_SECRET_KEY;
    });

    it('trial vencido bloqueia a operação (402) mas não as configurações', async () => {
      await pool.query(`UPDATE assinaturas SET trial_termina_em = now() - interval '1 day' WHERE pousada_id = $1`, [pousadaB]);
      const r = await donoB.req('GET', '/api/reservas');
      assert.equal(r.status, 402);
      assert.equal(r.json.precisaAssinar, true);
      assert.equal((await donoB.req('GET', `/api/pousadas/${pousadaB}`)).status, 200);
      assert.equal((await donoB.req('GET', '/api/billing/situacao')).json.assinatura.liberado, false);
    });

    it('segunda pousada em trial é recusada (402)', async () => {
      const r = await donoA.req('POST', '/api/pousadas', {
        nome: 'Segunda da A', num_quartos: 5, endereco: 'Rua B, 200', telefone: '48999990000', email: 'b@b.com',
      });
      assert.equal(r.status, 402);
    });

    it('só o dono abre checkout', async () => {
      assert.equal((await recep.req('POST', '/api/billing/checkout', { plano: 'pousada', ciclo: 'mensal' })).status, 403);
    });
  });
});

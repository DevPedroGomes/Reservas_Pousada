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

  describe('ciclo de status', () => {
    it('pré-reserva com prazo -> confirmada -> check-in -> check-out', async () => {
      const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
      const amanha = new Date(Date.now() + 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
      const r = await recep.req('POST', '/api/reservas', {
        nome: 'Ciclo', cpf: CPF, quarto: 6, data_entrada: hoje, data_saida: amanha, status: 'pre_reserva', prazo_horas: 24,
      });
      assert.equal(r.status, 201, JSON.stringify(r.json));
      assert.equal(r.json.reserva.status, 'pre_reserva');
      assert.ok(r.json.reserva.expiraEm);
      const id = r.json.reserva.id;
      const ag = await recep.req('GET', '/api/reservas/agenda');
      assert.ok(ag.json.chegadas.some((x: { id: number }) => x.id === id), 'chega hoje');
      assert.ok(!ag.json.hospedados.some((x: { id: number }) => x.id === id), 'pré-reserva não é hóspede');
      // pré-reserva não faz check-in direto
      assert.equal((await recep.req('PATCH', `/api/reservas/${id}/status`, { status: 'hospedada' })).status, 409);
      for (const status of ['confirmada', 'hospedada', 'finalizada']) {
        const t = await recep.req('PATCH', `/api/reservas/${id}/status`, { status });
        assert.equal(t.status, 200, `${status}: ${JSON.stringify(t.json)}`);
      }
      const det = await donoA.req('GET', `/api/reservas/${id}`);
      assert.equal(det.json.reserva.status, 'finalizada');
      assert.ok(det.json.reserva.checkInEm && det.json.reserva.checkOutEm);
    });

    it('check-in antes do dia da entrada e no-show antecipado são recusados', async () => {
      assert.equal((await recep.req('PATCH', `/api/reservas/${reservaA}/status`, { status: 'hospedada' })).status, 409);
      assert.equal((await recep.req('PATCH', `/api/reservas/${reservaA}/status`, { status: 'no_show' })).status, 409);
    });

    it('cancelamento guarda o motivo e libera o quarto', async () => {
      const r = await recep.req('POST', '/api/reservas', { nome: 'Vai cancelar', cpf: CPF, quarto: 7, data_entrada: d(70), data_saida: d(72) });
      const c = await recep.req('PATCH', `/api/reservas/${r.json.reserva.id}/status`, { status: 'cancelada', motivo: 'Hóspede desistiu' });
      assert.equal(c.status, 200);
      const det = await donoA.req('GET', `/api/reservas/${r.json.reserva.id}`);
      assert.equal(det.json.reserva.motivoCancelamento, 'Hóspede desistiu');
      const outra = await recep.req('POST', '/api/reservas', { nome: 'Pegou a vaga', cpf: CPF, quarto: 7, data_entrada: d(70), data_saida: d(72) });
      assert.equal(outra.status, 201);
    });
  });

  describe('hóspedes', () => {
    const hoje = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const amanha = () => new Date(Date.now() + 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    let estrangeiro: number;

    it('estrangeiro com passaporte, nome com letras não latinas, nº de hóspedes e canal', async () => {
      const r = await recep.req('POST', '/api/reservas', {
        nome: 'Łukasz Nowak', tipo_documento: 'passaporte', documento: 'ab 123456', telefone: '+48 600 100 200',
        nacionalidade: 'Polônia', email: 'Lukasz@Example.com', quarto: 8, data_entrada: d(80), data_saida: d(83),
        adultos: 2, criancas: 1, canal: 'booking',
      });
      assert.equal(r.status, 201, JSON.stringify(r.json));
      const res = r.json.reserva;
      assert.equal(res.nome, 'Łukasz Nowak');
      assert.equal(res.tipoDocumento, 'passaporte');
      assert.equal(res.documento, 'AB123456');
      assert.equal(res.cpf, '', 'passaporte não aparece como CPF');
      assert.equal(res.telefone, '48600100200', 'com +, o DDI é o do país (não DDD 48)');
      assert.equal(res.email, 'lukasz@example.com');
      assert.deepEqual([res.adultos, res.criancas, res.canal], [2, 1, 'booking']);
      assert.ok(res.hospedeId);
      estrangeiro = res.hospedeId;
      const { rows } = await pool.query(`SELECT documento, documento_hash FROM hospedes WHERE id = $1`, [estrangeiro]);
      assert.ok(!rows[0].documento.includes('AB123456'), 'documento cifrado no banco');
    });

    it('mesmo CPF em outra reserva reaproveita o cadastro e soma no histórico', async () => {
      const det = await donoA.req('GET', `/api/reservas/${reservaA}`);
      const r = await recep.req('POST', '/api/reservas', {
        nome: 'Hóspede da A', cpf: CPF, telefone: '48988887777', quarto: 9, data_entrada: d(90), data_saida: d(92),
      });
      assert.equal(r.status, 201, JSON.stringify(r.json));
      assert.equal(r.json.reserva.hospedeId, det.json.reserva.hospedeId);
      const lista = await recep.req('GET', `/api/hospedes?busca=${CPF}`);
      assert.equal(lista.json.total, 1);
      // O resumo bate com as reservas dele (o CPF aparece em vários testes acima).
      const { rows: [esperado] } = await pool.query(
        `SELECT count(*)::int AS n, max(data_entrada)::text AS ultima, COALESCE(sum(valor), 0)::float AS total
           FROM reservas WHERE hospede_id = $1 AND deleted_at IS NULL AND status NOT IN ('cancelada', 'no_show')`,
        [r.json.reserva.hospedeId],
      );
      assert.ok(esperado.n >= 2);
      assert.deepEqual(
        [lista.json.hospedes[0].estadias, lista.json.hospedes[0].ultimaEstadia, lista.json.hospedes[0].totalGasto],
        [esperado.n, esperado.ultima, esperado.total],
      );
      assert.equal(lista.json.hospedes[0].telefone, '5548988887777', 'contato novo completa o cadastro, com DDI');
      assert.match(lista.json.hospedes[0].documento, /^\*\*\*/, 'lista sempre mascarada');
      const porTelefone = await recep.req('GET', '/api/hospedes?busca=88887777');
      assert.equal(porTelefone.json.hospedes[0].nome, 'Hóspede da A');
    });

    it('reserva só com WhatsApp é aceita, mas o check-in pede o documento', async () => {
      const r = await recep.req('POST', '/api/reservas', {
        nome: 'Cliente do Zap', telefone: '48977776666', quarto: 9, data_entrada: hoje(), data_saida: amanha(),
        canal: 'whatsapp',
      });
      assert.equal(r.status, 201, JSON.stringify(r.json));
      const id = r.json.reserva.id;
      const sem = await recep.req('PATCH', `/api/reservas/${id}/status`, { status: 'hospedada' });
      assert.equal(sem.status, 409);
      assert.match(sem.json.mensagem, /documento/);
      // Completa o documento pela edição e faz o check-in no mesmo passo.
      const det = (await recep.req('GET', `/api/reservas/${id}`)).json.reserva;
      const ed = await recep.req('PUT', `/api/reservas/${id}`, {
        nome: det.nome, telefone: det.telefone, cpf: '39053344705', quarto: det.quarto,
        data_entrada: det.dataEntrada, data_saida: det.dataSaida, status: 'hospedada', version: det.version,
      });
      assert.equal(ed.status, 200, JSON.stringify(ed.json));
      assert.equal((await recep.req('GET', `/api/reservas/${id}`)).json.reserva.status, 'hospedada');
    });

    it('sem documento nem telefone, recusa', async () => {
      const r = await recep.req('POST', '/api/reservas', { nome: 'Fantasma', quarto: 10, data_entrada: d(95), data_saida: d(96) });
      assert.equal(r.status, 400);
      assert.ok(r.json.erros.some((e: string) => /documento ou o telefone/.test(e)));
    });

    it('ficha: documento completo para a recepção, mascarado para auditoria, histórico junto', async () => {
      const r = await recep.req('GET', `/api/hospedes/${estrangeiro}`);
      assert.equal(r.status, 200);
      assert.equal(r.json.hospede.documento, 'AB123456');
      assert.equal(r.json.historico.length, 1);
      const daLista = (await recep.req('GET', '/api/hospedes?busca=Nowak')).json.hospedes[0];
      assert.deepEqual([daLista.estadias, daLista.ultimaEstadia], [1, d(80)]);
      // A auditora do começo foi removida da equipe num teste anterior.
      const aud2 = await convidarEAceitar(donoA, pousadaA, 'aud2@teste.com', 'Auditora Dois', 'auditoria');
      const a = await aud2.req('GET', `/api/hospedes/${estrangeiro}`);
      assert.equal(a.json.hospede.documento, '•••••456');
      assert.equal((await aud2.req('PUT', `/api/hospedes/${estrangeiro}`, { nome: 'X' })).status, 403);
    });

    it('editar o nome no cadastro vale nas reservas; documento de outro é recusado', async () => {
      const ok = await recep.req('PUT', `/api/hospedes/${estrangeiro}`, { nome: 'Łukasz Nowak Jr' });
      assert.equal(ok.status, 200, JSON.stringify(ok.json));
      const { rows } = await pool.query(`SELECT nome FROM reservas WHERE hospede_id = $1`, [estrangeiro]);
      assert.equal(rows[0].nome, 'Łukasz Nowak Jr');
      const dup = await recep.req('PUT', `/api/hospedes/${estrangeiro}`, { tipo_documento: 'cpf', documento: CPF });
      assert.equal(dup.status, 409);
    });

    it('outra pousada não vê nem encontra o hóspede', async () => {
      assert.equal((await donoB.req('GET', `/api/hospedes/${estrangeiro}`)).status, 404);
      assert.equal((await donoB.req('GET', `/api/hospedes?busca=${CPF}`)).json.total, 0);
      assert.equal((await donoB.req('PUT', `/api/hospedes/${estrangeiro}`, { nome: 'Invasor' })).status, 404);
      // Nem usando o id do hóspede da A numa reserva da B.
      const r = await donoB.req('POST', '/api/reservas', {
        nome: 'Tentativa', hospede_id: estrangeiro, quarto: 1, data_entrada: d(30), data_saida: d(31),
      });
      assert.equal(r.status, 404);
    });

    it('CSV traz documento, contato, nº de hóspedes e canal', async () => {
      const r = await donoA.req('GET', '/api/reservas/export');
      assert.equal(r.status, 200);
      const [cabecalho] = String(r.json).replace(/^\uFEFF/, '').split('\r\n');
      for (const col of ['documento', 'telefone', 'adultos', 'criancas', 'canal']) assert.ok(cabecalho.includes(col), col);
    });
  });

  describe('conta da reserva', () => {
    let id: number;
    const conta = async () => (await recep.req('GET', `/api/reservas/${id}/conta`)).json.conta;
    const pago = async () => (await pool.query(`SELECT pago FROM reservas WHERE id = $1`, [id])).rows[0].pago;

    before(async () => {
      const r = await recep.req('POST', '/api/reservas', {
        nome: 'Conta Teste', telefone: '48955554444', quarto: 5, data_entrada: d(100), data_saida: d(102), valor: 450,
      });
      assert.equal(r.status, 201, JSON.stringify(r.json));
      id = r.json.reserva.id;
    });

    it('sinal por Pix deixa saldo e a reserva continua "a pagar"', async () => {
      const r = await recep.req('POST', `/api/reservas/${id}/pagamentos`, { valor: 150, forma: 'pix', tipo: 'sinal' });
      assert.equal(r.status, 201, JSON.stringify(r.json));
      assert.deepEqual([r.json.conta.totalCentavos, r.json.conta.pagoCentavos, r.json.conta.saldoCentavos], [45000, 15000, 30000]);
      assert.equal(await pago(), false);
      const lista = await recep.req('GET', `/api/reservas?search=Conta%20Teste`);
      assert.equal(lista.json.reservas[0].pagoCentavos, 15000);
    });

    it('consumo entra no total; o restante em "325,00" quita a conta', async () => {
      const c = await recep.req('POST', `/api/reservas/${id}/consumos`, { descricao: 'Frigobar', quantidade: 2, valor_unitario: '12,50' });
      assert.equal(c.status, 201, JSON.stringify(c.json));
      assert.equal(c.json.conta.totalCentavos, 47500);
      const p = await recep.req('POST', `/api/reservas/${id}/pagamentos`, { valor: '325,00', forma: 'cartao_credito' });
      assert.equal(p.status, 201, JSON.stringify(p.json));
      assert.equal(p.json.conta.saldoCentavos, 0);
      assert.equal(await pago(), true, 'pago é consequência da conta');
    });

    it('estorno reabre o saldo; a caixinha "pago" do formulário não passa por cima', async () => {
      const e = await recep.req('POST', `/api/reservas/${id}/pagamentos`, { valor: 50, forma: 'pix', tipo: 'estorno' });
      assert.equal(e.status, 201, JSON.stringify(e.json));
      assert.equal(e.json.conta.pagamentos.at(-1).valorCentavos, -5000);
      assert.equal(e.json.conta.saldoCentavos, 5000);
      assert.equal(await pago(), false);
      const det = (await recep.req('GET', `/api/reservas/${id}`)).json.reserva;
      const ed = await recep.req('PUT', `/api/reservas/${id}`, {
        nome: det.nome, telefone: det.telefone, quarto: det.quarto, data_entrada: det.dataEntrada, data_saida: det.dataSaida,
        valor: 450, pago: true, version: det.version,
      });
      assert.equal(ed.status, 200, JSON.stringify(ed.json));
      assert.equal(await pago(), false);
    });

    it('a receber do painel é o saldo, recebido é o que entrou', async () => {
      const { rows: [esperado] } = await pool.query(
        `SELECT COALESCE(sum(valor_centavos), 0)::int AS recebido FROM pagamentos WHERE pousada_id = $1`, [pousadaA],
      );
      const dash = await donoA.req('GET', `/api/pousadas/${pousadaA}/dashboard`);
      assert.equal(dash.status, 200);
      assert.equal(Math.round(dash.json.estatisticas.receita_total * 100), esperado.recebido);
      assert.ok(dash.json.estatisticas.receita_pendente >= 50, 'o saldo de R$ 50 desta conta está no a receber');
    });

    it('validação: forma desconhecida e valor zero são recusados', async () => {
      assert.equal((await recep.req('POST', `/api/reservas/${id}/pagamentos`, { valor: 10, forma: 'cheque' })).status, 400);
      assert.equal((await recep.req('POST', `/api/reservas/${id}/pagamentos`, { valor: 0, forma: 'pix' })).status, 400);
      assert.equal((await recep.req('POST', `/api/reservas/${id}/consumos`, { descricao: '', valor_unitario: 5 })).status, 400);
    });

    it('recepção não apaga pagamento; o dono apaga e a conta recalcula', async () => {
      const antes = await conta();
      const ultimo = antes.pagamentos.at(-1).id;
      assert.equal((await recep.req('DELETE', `/api/reservas/${id}/pagamentos/${ultimo}`)).status, 403);
      const r = await donoA.req('DELETE', `/api/reservas/${id}/pagamentos/${ultimo}`);
      assert.equal(r.status, 200, JSON.stringify(r.json));
      assert.equal(r.json.conta.saldoCentavos, 0);
      assert.equal(await pago(), true);
      // Auditoria é gravada em segundo plano: espera aparecer (até 2 s).
      let acoes: string[] = [];
      for (let i = 0; i < 20 && !(acoes.includes('remover_pagamento') && acoes.includes('lancar_consumo')); i++) {
        if (i) await new Promise((ok) => setTimeout(ok, 100));
        acoes = (await pool.query(`SELECT action FROM auditoria WHERE entity = 'reserva' AND entity_id = $1`, [id])).rows.map((x) => x.action);
      }
      assert.ok(acoes.includes('remover_pagamento') && acoes.includes('lancar_consumo'), acoes.join(','));
    });

    it('outra pousada não vê nem lança na conta', async () => {
      assert.equal((await donoB.req('GET', `/api/reservas/${id}/conta`)).status, 404);
      assert.equal((await donoB.req('POST', `/api/reservas/${id}/pagamentos`, { valor: 10, forma: 'pix' })).status, 404);
      const c = await conta();
      assert.equal((await donoB.req('DELETE', `/api/reservas/${id}/consumos/${c.consumos[0].id}`)).status, 404);
    });
  });

  describe('mapa de ocupação', () => {
    it('traz os quartos e as reservas que tocam o período, sem canceladas', async () => {
      const r = await recep.req('GET', `/api/reservas/mapa?inicio=${d(9)}&dias=7`);
      assert.equal(r.status, 200, JSON.stringify(r.json));
      assert.equal(r.json.inicio, d(9));
      assert.equal(r.json.fim, d(16));
      assert.ok(r.json.quartos.length >= 1);
      assert.ok(r.json.reservas.some((x: { id: number }) => x.id === reservaA), 'reserva de d10 a d12 aparece');
      assert.ok(r.json.reservas.every((x: { status: string }) => !['cancelada', 'no_show'].includes(x.status)));
      const longe = await recep.req('GET', `/api/reservas/mapa?inicio=${d(300)}&dias=7`);
      assert.equal(longe.json.reservas.length, 0);
    });

    it('cada pousada vê só o próprio mapa; parâmetros absurdos são contidos', async () => {
      const b = await donoB.req('GET', `/api/reservas/mapa?inicio=${d(9)}&dias=7`);
      assert.ok(!b.json.reservas.some((x: { id: number }) => x.id === reservaA));
      const c = await recep.req('GET', '/api/reservas/mapa?inicio=ontem&dias=9999');
      assert.equal(c.status, 200);
      assert.equal(c.json.dias, 62);
    });
  });

  describe('tarifário', () => {
    let regra: number;

    it('dono cria regra; recepção vê mas não cria', async () => {
      const q = (await donoA.req('GET', '/api/quartos')).json.quartos.find((x: { numero: number }) => x.numero === 4);
      assert.equal((await donoA.req('PUT', `/api/quartos/${q.id}`, { preco_base: 200 })).status, 200);
      const r = await donoA.req('POST', '/api/tarifas', { nome: 'Fim de semana', dias_semana: [5, 6], ajuste_percentual: 25 });
      assert.equal(r.status, 201, JSON.stringify(r.json));
      regra = r.json.tarifa.id;
      assert.equal((await recep.req('GET', '/api/tarifas')).json.tarifas.length, 1);
      assert.equal((await recep.req('POST', '/api/tarifas', { nome: 'X', ajuste_percentual: 10 })).status, 403);
    });

    it('cotação soma as noites com a regra certa', async () => {
      // Uma semana inteira: 5 noites a R$ 200 e 2 (sex, sáb) a R$ 250.
      const r = await recep.req('GET', `/api/tarifas/cotacao?quarto=4&entrada=${d(140)}&saida=${d(147)}`);
      assert.equal(r.status, 200, JSON.stringify(r.json));
      assert.equal(r.json.cotacao.noites.length, 7);
      assert.equal(r.json.cotacao.totalCentavos, 5 * 20000 + 2 * 25000);
      assert.equal((await recep.req('GET', `/api/tarifas/cotacao?quarto=4&entrada=${d(5)}&saida=${d(3)}`)).status, 400);
      assert.equal((await recep.req('GET', `/api/tarifas/cotacao?quarto=999&entrada=${d(5)}&saida=${d(6)}`)).status, 404);
    });

    it('validação: período pela metade, os dois ajustes, quarto de outra pousada', async () => {
      const r = await donoA.req('POST', '/api/tarifas', { nome: 'Ruim', data_inicio: d(10), preco: 300, ajuste_percentual: 10, quarto: 999 });
      assert.equal(r.status, 400);
      assert.equal(r.json.erros.length, 3, JSON.stringify(r.json.erros));
      assert.equal((await donoA.req('POST', '/api/tarifas', { nome: 'Nada' })).status, 400);
    });

    it('outra pousada não altera nem remove a regra; a cotação dela não usa a regra', async () => {
      assert.equal((await donoB.req('PUT', `/api/tarifas/${regra}`, { nome: 'Invasão', ajuste_percentual: 90 })).status, 404);
      assert.equal((await donoB.req('DELETE', `/api/tarifas/${regra}`)).status, 404);
      assert.equal((await donoB.req('GET', '/api/tarifas')).json.tarifas.length, 0);
      assert.equal((await donoA.req('DELETE', `/api/tarifas/${regra}`)).status, 200);
    });
  });

  describe('iCal', () => {
    it('cada quarto tem link público só com "Reservado"; link errado é 404', async () => {
      const r = await donoA.req('GET', '/api/ical');
      assert.equal(r.status, 200, JSON.stringify(r.json));
      const q3 = r.json.exportar.find((x: { quarto: number }) => x.quarto === 3);
      const caminho = new URL(q3.url).pathname;
      assert.match(caminho, /^\/ical\/[0-9a-f]{64}\.ics$/);
      const anon = new Cliente(base, '198.51.100.240');
      const ics = await anon.req('GET', caminho);
      assert.equal(ics.status, 200);
      assert.ok(String(ics.json).includes(`UID:reserva-${reservaA}@`), 'reserva do quarto 3 está no calendário');
      assert.ok(!String(ics.json).includes('Hóspede'), 'nome de hóspede nunca sai no link');
      assert.equal((await anon.req('GET', '/ical/' + 'f'.repeat(64) + '.ics')).status, 404);
      assert.equal((await recep.req('GET', '/api/ical')).status, 403, 'links são do dono/admin');
    });

    it('novo link invalida o antigo', async () => {
      const antes = (await donoA.req('GET', '/api/ical')).json.exportar.find((x: { quarto: number }) => x.quarto === 3).url;
      const novo = await donoA.req('POST', '/api/ical/quartos/3/novo-link');
      assert.equal(novo.status, 200);
      const anon = new Cliente(base, '198.51.100.241');
      assert.equal((await anon.req('GET', new URL(antes).pathname)).status, 404);
      assert.equal((await anon.req('GET', new URL(novo.json.url).pathname)).status, 200);
    });

    it('importar recusa link que não é https ou aponta para rede interna', async () => {
      const r = await donoA.req('POST', '/api/ical/importacoes', { quarto: 2, nome: 'Airbnb', canal: 'airbnb', url: 'http://169.254.169.254/x' });
      assert.equal(r.status, 400);
      const r2 = await donoA.req('POST', '/api/ical/importacoes', { quarto: 2, nome: 'Airbnb', canal: 'airbnb', url: 'https://10.0.0.5/cal.ics' });
      assert.equal(r2.status, 400);
    });

    it('sincronização cria, move e cancela reservas e acusa overbooking', async () => {
      const Ical = await import('../models/Ical.js');
      const imp = await Ical.criarImportacao(pousadaA, { quarto: 2, nome: 'Airbnb', canal: 'airbnb', url: 'https://www.airbnb.com/calendar/ical/1.ics' });
      const ev = (uid: string, ini: string, fim: string) =>
        `BEGIN:VEVENT\r\nUID:${uid}\r\nDTSTART;VALUE=DATE:${ini.replace(/-/g, '')}\r\nDTEND;VALUE=DATE:${fim.replace(/-/g, '')}\r\nSUMMARY:Reserved\r\nEND:VEVENT`;
      const feed = (...eventos: string[]) => async () => `BEGIN:VCALENDAR\r\n${eventos.join('\r\n')}\r\nEND:VCALENDAR`;
      // Reserva do sistema no quarto 2, para provocar o choque.
      const local = await recep.req('POST', '/api/reservas', { nome: 'Local', telefone: '48933332222', quarto: 2, data_entrada: d(160), data_saida: d(162) });
      assert.equal(local.status, 201, JSON.stringify(local.json));

      const r1 = await Ical.sincronizarImportacao(imp, feed(ev('a', d(150), d(153)), ev('b', d(155), d(157)), ev('c', d(161), d(163))));
      assert.deepEqual([r1.criadas, r1.conflitos.length], [2, 1]);
      const { rows: criadas } = await pool.query(
        `SELECT ical_uid, nome, canal, status, data_entrada::text AS ini FROM reservas WHERE ical_importacao_id = $1 ORDER BY ical_uid`, [imp.id]);
      assert.deepEqual(criadas.map((x) => [x.ical_uid, x.canal, x.status]), [['a', 'airbnb', 'confirmada'], ['b', 'airbnb', 'confirmada']]);
      const { rows: [aviso] } = await pool.query(`SELECT ultimo_erro FROM ical_importacoes WHERE id = $1`, [imp.id]);
      assert.match(aviso.ultimo_erro, /overbooking/);

      // Na OTA: "a" mudou de data, "b" foi cancelada.
      const r2 = await Ical.sincronizarImportacao(imp, feed(ev('a', d(151), d(154))));
      assert.deepEqual([r2.criadas, r2.atualizadas, r2.canceladas], [0, 1, 1]);
      const { rows: depois } = await pool.query(
        `SELECT ical_uid, status, data_entrada::text AS ini, motivo_cancelamento FROM reservas WHERE ical_importacao_id = $1 ORDER BY ical_uid`, [imp.id]);
      assert.equal(depois[0].ini, d(151));
      assert.equal(depois[1].status, 'cancelada');
      assert.match(depois[1].motivo_cancelamento, /Airbnb/);

      // Sincronizar de novo com o mesmo feed não muda nada.
      const r3 = await Ical.sincronizarImportacao(imp, feed(ev('a', d(151), d(154))));
      assert.deepEqual([r3.criadas, r3.atualizadas, r3.canceladas], [0, 0, 0]);

      // Outra pousada não sincroniza nem remove o calendário da A.
      assert.equal((await donoB.req('POST', `/api/ical/importacoes/${imp.id}/sincronizar`)).status, 404);
      assert.equal((await donoB.req('DELETE', `/api/ical/importacoes/${imp.id}`)).status, 404);

      // Remover o calendário cancela as reservas futuras que vieram dele.
      assert.equal((await donoA.req('DELETE', `/api/ical/importacoes/${imp.id}`)).status, 200);
      const { rows: fim } = await pool.query(`SELECT status FROM reservas WHERE ical_uid = 'a' AND pousada_id = $1`, [pousadaA]);
      assert.equal(fim[0].status, 'cancelada');
    });
  });

  describe('relatórios', () => {
    it('dono vê; recepção não vê faturamento; período invertido é recusado', async () => {
      const r = await donoA.req('GET', `/api/relatorios?inicio=${d(0)}&fim=${d(30)}`);
      assert.equal(r.status, 200, JSON.stringify(r.json));
      assert.equal(r.json.relatorio.dias, 31);
      assert.ok(r.json.relatorio.noitesVendidas >= 1);
      assert.equal((await recep.req('GET', '/api/relatorios')).status, 403);
      assert.equal((await donoA.req('GET', `/api/relatorios?inicio=${d(10)}&fim=${d(1)}`)).status, 400);
      const b = await donoB.req('GET', `/api/relatorios?inicio=${d(0)}&fim=${d(30)}`);
      assert.equal(b.json.relatorio.noitesVendidas, 0, 'cada pousada vê só os seus números');
    });
  });

  describe('importação de planilha', () => {
    const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
    const linhas = () => [
      { nome: 'Ana Planilha', cpf: '153.509.460-56', telefone: '(48) 99999-1111', quarto: 'quarto 1', data_entrada: '10/01/2025', data_saida: '12/01/2025', valor: 'R$ 1.234,56', pago: 'sim', canal: 'Booking.com' },
      { nome: 'Bruno Futuro', quarto: '1', data_entrada: br(d(200)), data_saida: br(d(203)), telefone: '48988880000', status: 'ativa' },
      { nome: 'Carla Choque', quarto: '1', data_entrada: br(d(201)), data_saida: br(d(202)), telefone: '48988880001' },
      { nome: 'Data Ruim', quarto: '1', data_entrada: '31/02/2026', data_saida: '02/03/2026' },
      { nome: 'Sem Quarto', quarto: 'Suíte Inexistente', data_entrada: br(d(210)), data_saida: br(d(211)) },
      { nome: 'Cpf Errado', cpf: '123.456.789-00', quarto: '1', data_entrada: br(d(220)), data_saida: br(d(221)) },
      { nome: 'Só Nome', quarto: '1', data_entrada: '01/02/2025', data_saida: '03/02/2025' },
    ];

    it('simular aponta o que entra e o porquê de cada recusa, sem gravar', async () => {
      const r = await donoA.req('POST', '/api/reservas/importar', { linhas: linhas(), simular: true });
      assert.equal(r.status, 200, JSON.stringify(r.json));
      assert.equal(r.json.simulacao, true);
      const porLinha = Object.fromEntries(r.json.resultados.map((x: { linha: number; ok: boolean; erro?: string }) => [x.linha, x.ok ? 'ok' : x.erro]));
      assert.equal(porLinha[2], 'ok');
      assert.equal(porLinha[3], 'ok');
      assert.match(porLinha[4], /Choca com a linha 3/);
      assert.match(porLinha[5], /Data/);
      assert.match(porLinha[6], /não existe/);
      assert.match(porLinha[7], /CPF inválido/);
      assert.equal(porLinha[8], 'ok');
      assert.equal(r.json.resultados[0].resumo.status, 'finalizada', 'estadia passada entra como finalizada');
      assert.equal((await pool.query(`SELECT 1 FROM reservas WHERE nome = 'Ana Planilha'`)).rowCount, 0);
    });

    it('importar grava as válidas, com hóspede, pagamento e canal; reimportar não duplica', async () => {
      const r = await donoA.req('POST', '/api/reservas/importar', { linhas: linhas(), simular: false });
      assert.equal(r.status, 200, JSON.stringify(r.json));
      assert.deepEqual([r.json.criadas, r.json.comErro], [3, 4]);
      const { rows: [ana] } = await pool.query(
        `SELECT r.status, r.valor::float AS valor, r.pago, r.canal, h.telefone, (SELECT sum(valor_centavos) FROM pagamentos p WHERE p.reserva_id = r.id)::int AS pago_c
           FROM reservas r LEFT JOIN hospedes h ON h.id = r.hospede_id WHERE r.nome = 'Ana Planilha' AND r.data_entrada = '2025-01-10'`);
      assert.deepEqual(ana, { status: 'finalizada', valor: 1234.56, pago: true, canal: 'booking', telefone: '5548999991111', pago_c: 123456 });
      const { rows: [bruno] } = await pool.query(`SELECT status FROM reservas WHERE nome = 'Bruno Futuro'`);
      assert.equal(bruno.status, 'confirmada', '"ativa" da planilha vira confirmada');
      const { rows: [so] } = await pool.query(`SELECT hospede_id FROM reservas WHERE nome = 'Só Nome'`);
      assert.equal(so.hospede_id, null, 'sem documento nem telefone, sem cadastro de hóspede');
      const de_novo = await donoA.req('POST', '/api/reservas/importar', { linhas: linhas().slice(0, 1), simular: false });
      assert.equal(de_novo.json.criadas, 0);
      assert.match(de_novo.json.resultados[0].aviso, /Já existe/);
    });

    it('só dono/admin importa; limite de linhas', async () => {
      assert.equal((await recep.req('POST', '/api/reservas/importar', { linhas: linhas() })).status, 403);
      const muitas = Array.from({ length: 2001 }, () => ({ nome: 'X' }));
      assert.equal((await donoA.req('POST', '/api/reservas/importar', { linhas: muitas })).status, 400);
    });
  });

  describe('motor de reservas público', () => {
    const SLUG = 'pousada-a-praia';
    const visitante = () => new Cliente(base, `203.0.113.${ipSeq++}`);
    const pedido = (extra: Record<string, unknown> = {}) => ({
      quarto: 4, entrada: d(250), saida: d(252), adultos: 2, criancas: 0,
      nome: 'Marta Visitante', telefone: '(48) 99123-4567', email: 'marta@example.com', aceite: true, ...extra,
    });

    it('fica fora do ar até o dono ligar; endereço próprio e único', async () => {
      assert.equal((await visitante().req('GET', `/api/publico/${SLUG}`)).status, 404);
      const lig = await donoA.req('PUT', `/api/pousadas/${pousadaA}/motor`, { ativo: true, prazo_horas: 12, sinal_percentual: 50, slug: SLUG, politicas: 'Cancelamento grátis até 7 dias antes.' });
      assert.equal(lig.status, 200, JSON.stringify(lig.json));
      assert.equal((await donoB.req('PUT', `/api/pousadas/${pousadaB}/motor`, { ativo: true, slug: SLUG })).status, 400, 'endereço já usado');
      assert.equal((await recep.req('PUT', `/api/pousadas/${pousadaA}/motor`, { ativo: false })).status, 403);
      const r = await visitante().req('GET', `/api/publico/${SLUG}`);
      assert.equal(r.status, 200, JSON.stringify(r.json));
      assert.equal(r.json.pousada.sinalPercentual, 50);
      assert.ok(r.json.quartos.length > 0);
      assert.ok(!JSON.stringify(r.json).includes('ical'), 'nada interno na vitrine');
    });

    it('renomear a pousada não muda o link; salvar outra configuração não desliga o motor', async () => {
      assert.equal((await donoA.req('PUT', `/api/pousadas/${pousadaA}`, { nome: 'Pousada A da Praia' })).status, 200);
      assert.equal((await donoA.req('PUT', `/api/pousadas/${pousadaA}`, { configuracoes: { retencao_hospedes_meses: 24 } })).status, 200);
      assert.equal((await visitante().req('GET', `/api/publico/${SLUG}`)).status, 200);
    });

    it('disponibilidade traz só quarto livre, com preço, que cabe o grupo', async () => {
      const r = await visitante().req('GET', `/api/publico/${SLUG}/disponibilidade?entrada=${d(250)}&saida=${d(252)}&pessoas=2`);
      assert.equal(r.status, 200, JSON.stringify(r.json));
      const q4 = r.json.quartos.find((q: { numero: number }) => q.numero === 4);
      assert.equal(q4.totalCentavos, 40000, '2 noites a R$ 200 (preço base do quarto 4)');
      assert.ok(r.json.quartos.every((q: { totalCentavos: number | null }) => q.totalCentavos !== null));
      assert.equal((await visitante().req('GET', `/api/publico/${SLUG}/disponibilidade?entrada=${d(-3)}&saida=${d(-1)}`)).status, 400);
      assert.equal((await visitante().req('GET', `/api/publico/${SLUG}/disponibilidade?entrada=${d(10)}&saida=${d(60)}`)).status, 400, 'mais de 30 noites');
    });

    it('pedido vira pré-reserva com prazo e sinal; o quarto sai da vitrine', async () => {
      const v = visitante();
      assert.equal((await v.req('POST', `/api/publico/${SLUG}/reservas`, pedido({ aceite: false }))).status, 400);
      assert.equal((await v.req('POST', `/api/publico/${SLUG}/reservas`, pedido({ site: 'http://spam' }))).status, 400, 'campo isca');
      const r = await v.req('POST', `/api/publico/${SLUG}/reservas`, pedido());
      assert.equal(r.status, 201, JSON.stringify(r.json));
      assert.deepEqual([r.json.pedido.totalCentavos, r.json.pedido.sinalCentavos], [40000, 20000]);
      const { rows: [res] } = await pool.query(
        `SELECT r.status, r.canal, r.valor::float AS valor, extract(epoch FROM (r.expira_em - now())) / 3600 AS horas, h.telefone, h.email
           FROM reservas r JOIN hospedes h ON h.id = r.hospede_id WHERE r.id = $1`, [r.json.pedido.id]);
      assert.equal(res.status, 'pre_reserva');
      assert.equal(res.canal, 'site');
      assert.equal(res.valor, 400);
      assert.ok(res.horas > 11.9 && res.horas <= 12, `prazo de 12h (${res.horas})`);
      assert.equal(res.telefone, '5548991234567');
      const de_novo = await visitante().req('POST', `/api/publico/${SLUG}/reservas`, pedido({ nome: 'Outra Pessoa', telefone: '48990000000' }));
      assert.equal(de_novo.status, 409, 'quarto não está mais livre');
      const disp = await visitante().req('GET', `/api/publico/${SLUG}/disponibilidade?entrada=${d(250)}&saida=${d(252)}&pessoas=2`);
      assert.ok(!disp.json.quartos.some((q: { numero: number }) => q.numero === 4));
    });

    it('desligado, some do ar', async () => {
      assert.equal((await donoA.req('PUT', `/api/pousadas/${pousadaA}/motor`, { ativo: false })).status, 200);
      assert.equal((await visitante().req('GET', `/api/publico/${SLUG}`)).status, 404);
      assert.equal((await visitante().req('POST', `/api/publico/${SLUG}/reservas`, pedido({ entrada: d(260), saida: d(261) }))).status, 404);
    });
  });

  describe('Pix do sinal', () => {
    const novaPre = async (quarto: number, ini: number) => {
      const r = await recep.req('POST', '/api/reservas', {
        nome: 'Pix Teste', telefone: '48966665555', quarto, data_entrada: d(ini), data_saida: d(ini + 2), valor: 500, status: 'pre_reserva', prazo_horas: 24,
      });
      assert.equal(r.status, 201, JSON.stringify(r.json));
      return r.json.reserva.id as number;
    };
    const status = async (id: number) => (await pool.query(`SELECT status FROM reservas WHERE id = $1`, [id])).rows[0].status;

    it('dono cadastra a chave; chave inválida e recepção são recusadas', async () => {
      assert.equal((await donoA.req('PUT', `/api/pousadas/${pousadaA}/pix`, { tipo_chave: 'cpf', chave: '123', nome: 'Pousada A', cidade: 'Floripa' })).status, 400);
      assert.equal((await recep.req('PUT', `/api/pousadas/${pousadaA}/pix`, { tipo_chave: 'telefone', chave: '48999990000', nome: 'A', cidade: 'B' })).status, 403);
      const r = await donoA.req('PUT', `/api/pousadas/${pousadaA}/pix`, { tipo_chave: 'telefone', chave: '(48) 99999-0000', nome: 'Pousada A da Praia', cidade: 'Florianópolis' });
      assert.equal(r.status, 200, JSON.stringify(r.json));
      assert.equal(r.json.pix.chave.chave, '+5548999990000');
      assert.equal(r.json.pix.automatico, false);
    });

    it('Pix pela chave: copia e cola com o sinal; "Recebi o Pix" lança o pagamento e confirma', async () => {
      assert.equal((await donoA.req('PUT', `/api/pousadas/${pousadaA}/motor`, { ativo: false, sinal_percentual: 50 })).status, 200);
      const id = await novaPre(6, 300);
      const c = await recep.req('POST', `/api/reservas/${id}/pix`);
      assert.equal(c.status, 201, JSON.stringify(c.json));
      assert.equal(c.json.cobranca.provedor, 'chave');
      assert.equal(c.json.cobranca.valorCentavos, 25000, 'sinal de 50% (configurado no motor) de R$ 500');
      assert.match(c.json.cobranca.copiaECola, /^000201.*br\.gov\.bcb\.pix.*\+5548999990000.*5406250\.00/);
      assert.match(c.json.cobranca.qrCode, /^data:image\/png;base64,/);
      const ok = await recep.req('POST', `/api/reservas/${id}/pix/${c.json.cobranca.id}/recebida`);
      assert.equal(ok.status, 200, JSON.stringify(ok.json));
      assert.equal(ok.json.confirmou, true);
      assert.equal(await status(id), 'confirmada');
      const { rows: [pg] } = await pool.query(`SELECT valor_centavos, forma, tipo FROM pagamentos WHERE reserva_id = $1`, [id]);
      assert.deepEqual(pg, { valor_centavos: 25000, forma: 'pix', tipo: 'sinal' });
      assert.equal((await recep.req('POST', `/api/reservas/${id}/pix/${c.json.cobranca.id}/recebida`)).status, 409, 'baixa uma vez só');
      assert.equal((await donoB.req('POST', `/api/reservas/${id}/pix`)).status, 404);
    });

    it('Asaas: webhook autenticado consulta a cobrança no Asaas e confirma sozinho, uma vez só', async () => {
      const { usarGatewayDeTeste } = await import('../lib/gatewayPix.js');
      let situacao: 'pendente' | 'paga' = 'pendente';
      const consultas: string[] = [];
      const webhooks: { url: string; tokenAutenticacao: string }[] = [];
      const clientes: (string | null)[] = [];
      usarGatewayDeTeste(() => ({
        exigeDocumento: true,
        async criarCobranca(d) {
          clientes.push(d.cliente.cpfCnpj);
          return { id: 'pay_abc123', copiaECola: `00020101021226-asaas-${d.referencia}`, expiraEm: d.expiraEm };
        },
        async consultar(idPg) { consultas.push(idPg); return { status: situacao, valorCentavos: 25000, referencia: null }; },
        async registrarWebhook(w) { webhooks.push(w); },
      }));
      try {
        assert.equal((await donoA.req('PUT', `/api/pousadas/${pousadaA}/pix`, { asaas_chave: 'chave-sem-formato' })).status, 400);
        const cfg = await donoA.req('PUT', `/api/pousadas/${pousadaA}/pix`, {
          tipo_chave: 'telefone', chave: '48999990000', nome: 'Pousada A', cidade: 'Floripa',
          asaas_chave: '$aact_hmlg_000MzkwODA2MWY2OGM3MWRlMDU2NWM3MzJlNzZmNGZhZGY6OmFkZmM',
        });
        assert.equal(cfg.status, 200, JSON.stringify(cfg.json));
        assert.equal(cfg.json.pix.automatico, true);
        assert.equal(cfg.json.pix.webhook.registrado, true);
        assert.ok(!JSON.stringify(cfg.json).includes('$aact'), 'a chave nunca volta');
        assert.match(webhooks[0].url, /\/api\/webhooks\/pix\/asaas\/[0-9a-f]{48}$/);
        const { rows: [cred] } = await pool.query(`SELECT token_cifrado, webhook_token, webhook_auth FROM credenciais_pagamento WHERE pousada_id = $1`, [pousadaA]);
        assert.ok(!cred.token_cifrado.includes('$aact'), 'chave cifrada no banco');
        assert.equal(webhooks[0].tokenAutenticacao, cred.webhook_auth);

        // Sem CPF do hóspede, o Asaas não cobra: cai no Pix pela chave.
        const semCpf = await novaPre(7, 310);
        const c1 = await recep.req('POST', `/api/reservas/${semCpf}/pix`);
        assert.equal(c1.json.cobranca.provedor, 'chave');

        const r = await recep.req('POST', '/api/reservas', {
          nome: 'Pix Com Cpf', cpf: '86288366757', telefone: '48966665554', quarto: 8, data_entrada: d(320), data_saida: d(322), valor: 500, status: 'pre_reserva',
        });
        assert.equal(r.status, 201, JSON.stringify(r.json));
        const id = r.json.reserva.id;
        const c = await recep.req('POST', `/api/reservas/${id}/pix`);
        assert.equal(c.json.cobranca.provedor, 'asaas');
        assert.equal(clientes.at(-1), '86288366757', 'CPF vai para o Asaas');

        const anon = new Cliente(base, '198.51.100.230');
        const aviso = (token: string, auth: string) =>
          anon.req('POST', `/api/webhooks/pix/asaas/${token}`, { event: 'PAYMENT_RECEIVED', payment: { id: 'pay_abc123', status: 'RECEIVED' } }, { 'asaas-access-token': auth });

        assert.equal((await aviso(cred.webhook_token, cred.webhook_auth)).status, 200);
        assert.equal(await status(id), 'pre_reserva', 'pendente no Asaas: nada muda');
        situacao = 'paga';
        assert.equal((await aviso(cred.webhook_token, 'f'.repeat(48))).status, 200);
        assert.equal(await status(id), 'pre_reserva', 'cabeçalho errado não baixa nada');
        assert.equal((await aviso('f'.repeat(48), cred.webhook_auth)).status, 200);
        assert.equal(await status(id), 'pre_reserva', 'endereço errado não baixa nada');
        assert.equal((await aviso(cred.webhook_token, cred.webhook_auth)).status, 200);
        assert.equal(await status(id), 'confirmada');
        await aviso(cred.webhook_token, cred.webhook_auth);
        const { rows } = await pool.query(`SELECT forma, tipo FROM pagamentos WHERE reserva_id = $1`, [id]);
        assert.deepEqual(rows, [{ forma: 'pix', tipo: 'sinal' }], 'aviso repetido não lança de novo');
        assert.ok(consultas.length >= 2, 'status sempre consultado no Asaas');

        const pub = await anon.req('GET', `/api/publico/pix/${c.json.cobranca.tokenPublico}`);
        assert.deepEqual([pub.json.status, pub.json.reserva], ['paga', 'confirmada']);
      } finally {
        usarGatewayDeTeste(null);
        await donoA.req('PUT', `/api/pousadas/${pousadaA}/pix`, { tipo_chave: 'telefone', chave: '48999990000', nome: 'Pousada A', cidade: 'Floripa', remover_asaas: true });
      }
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

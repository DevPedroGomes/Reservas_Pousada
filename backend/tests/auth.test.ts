/**
 * Esqueci a senha de ponta a ponta, proteção contra envio em massa e CSRF de
 * subdomínio irmão, pela API de verdade.
 *
 * O link de redefinição é lido do log que o envio de e-mail escreve fora de
 * produção. O cliente é o mesmo `createAuthClient` que o frontend usa: é ele
 * quem decide qual caminho é chamado, então é ele que precisa ser exercitado.
 */
import { after, before, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createAuthClient } from 'better-auth/client';
import { prepararBanco, temBanco } from './helpers/banco.js';

const ORIGEM = 'http://localhost:3000';
const SENHA = 'senha-forte-123';
const SENHA_NOVA = 'senha-nova-456789';

type Resposta = { status: number; json: any; headers: Headers };

class Navegador {
  cookies = new Map<string, string>();
  constructor(private readonly base: string, readonly ip: string, private readonly origem: string | null = ORIGEM) {}

  async req(metodo: string, caminho: string, corpo?: unknown, extra: Record<string, string> = {}): Promise<Resposta> {
    const headers: Record<string, string> = { 'X-Forwarded-For': this.ip, ...extra };
    if (this.origem) headers.Origin = this.origem;
    if (corpo !== undefined && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    if (this.cookies.size) headers.Cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    const r = await fetch(this.base + caminho, {
      method: metodo,
      headers,
      body: corpo === undefined ? undefined : typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
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
    try { json = JSON.parse(texto); } catch { /* corpo sem JSON */ }
    return { status: r.status, json, headers: r.headers };
  }
}

describe('auth — esqueci a senha, limites e origem', { skip: !temBanco && 'DATABASE_URL não definida' }, () => {
  let descartar: () => Promise<void>;
  let fechar: () => Promise<void>;
  let pool: import('pg').Pool;
  let servidor: Server;
  let base: string;
  let ipSeq = 10;
  const proximoIp = () => `203.0.113.${ipSeq++}`;

  async function contaConfirmada(email: string): Promise<void> {
    const c = new Navegador(base, proximoIp());
    const cad = await c.req('POST', '/api/auth/sign-up/email', { email, password: SENHA, name: 'Dona Teste' });
    assert.equal(cad.status, 200, JSON.stringify(cad.json));
    await pool.query(`UPDATE "user" SET email_verified = true WHERE email = $1`, [email]);
  }

  async function entrar(email: string, senha = SENHA): Promise<Navegador> {
    const n = new Navegador(base, proximoIp());
    const r = await n.req('POST', '/api/auth/sign-in/email', { email, password: senha });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    return n;
  }

  /** Cliente do better-auth igual ao do frontend, com IP próprio e origem do app. */
  function clienteDoApp(ip: string) {
    return createAuthClient({
      baseURL: base,
      fetchOptions: { headers: { Origin: ORIGEM, 'X-Forwarded-For': ip } },
    });
  }

  before(async () => {
    ({ descartar } = await prepararBanco('auth'));
    process.env.BILLING_ENABLED = 'false';
    const dbmod = await import('../db/index.js');
    await (await import('../db/migrate.js')).runMigrations();
    pool = dbmod.pool;
    fechar = dbmod.closeConnection;
    const { app } = await import('../app.js');
    servidor = await new Promise<Server>((ok) => { const s = app.listen(0, () => ok(s)); });
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  });

  after(async () => {
    servidor?.close();
    await fechar?.();
    await descartar?.();
  });

  describe('esqueci a senha', () => {
    it('o caminho antigo não existe nesta versão do better-auth', async () => {
      const r = await new Navegador(base, proximoIp()).req('POST', '/api/auth/forget-password', { email: 'x@teste.com', redirectTo: `${ORIGEM}/reset-password` });
      assert.equal(r.status, 404);
      // É para lá que o cliente mandaria quem chamasse `forgetPassword`.
      const antigo = await (clienteDoApp(proximoIp()) as any).forgetPassword({ email: 'x@teste.com', redirectTo: `${ORIGEM}/reset-password` });
      assert.equal(antigo.error?.status, 404);
    });

    it('de ponta a ponta: pede, recebe o link, redefine e derruba as sessões abertas', async () => {
      const email = 'esqueci@teste.com';
      await contaConfirmada(email);
      const celular = await entrar(email);
      const notebook = await entrar(email);
      assert.equal((await celular.req('GET', '/api/conta/exportar')).status, 200);

      const logs = mock.method(console, 'log', () => {});
      const pedido = await clienteDoApp(proximoIp()).requestPasswordReset({ email, redirectTo: `${ORIGEM}/reset-password` });
      const linhas = logs.mock.calls.map((c) => String(c.arguments[0]));
      logs.mock.restore();
      assert.equal(pedido.error, null, JSON.stringify(pedido.error));

      const linha = linhas.find((l) => l.includes('[Email] link:'));
      assert.ok(linha, 'o link de redefinição deveria ter saído pela fila de e-mail');
      const link = new URL(linha!.split('link: ')[1]);
      assert.match(link.pathname, /^\/api\/auth\/reset-password\//);

      // Abrir o link do e-mail leva à tela do app com o token.
      const abriu = await new Navegador(base, proximoIp()).req('GET', link.pathname + link.search);
      assert.equal(abriu.status, 302);
      const destino = new URL(abriu.headers.get('location')!);
      assert.equal(destino.origin + destino.pathname, `${ORIGEM}/reset-password`);
      const token = destino.searchParams.get('token');
      assert.ok(token);

      const trocou = await new Navegador(base, proximoIp()).req('POST', '/api/auth/reset-password', { newPassword: SENHA_NOVA, token });
      assert.equal(trocou.status, 200, JSON.stringify(trocou.json));

      // Sessões antigas caem na hora: com cache de sessão no cookie elas
      // continuavam válidas por minutos depois da troca.
      assert.equal((await celular.req('GET', '/api/conta/exportar')).status, 401);
      assert.equal((await notebook.req('GET', '/api/conta/exportar')).status, 401);
      const { rows } = await pool.query(`SELECT count(*)::int AS n FROM session s JOIN "user" u ON u.id = s.user_id WHERE u.email = $1`, [email]);
      assert.equal(rows[0].n, 0);

      const velha = await new Navegador(base, proximoIp()).req('POST', '/api/auth/sign-in/email', { email, password: SENHA });
      assert.equal(velha.status, 401);
      await entrar(email, SENHA_NOVA);

      // O token não vale duas vezes.
      const repetiu = await new Navegador(base, proximoIp()).req('POST', '/api/auth/reset-password', { newPassword: 'outra-senha-99999', token });
      assert.equal(repetiu.status, 400);
    });

    it('envio bem-sucedido consome o limite: sem isso o e-mail de qualquer um vira alvo de spam', async () => {
      const email = 'alvo@teste.com';
      await contaConfirmada(email);
      const n = new Navegador(base, proximoIp());
      const corpo = { email, redirectTo: `${ORIGEM}/reset-password` };
      const logs = mock.method(console, 'log', () => {});
      const statuses: number[] = [];
      let ultima: Resposta | null = null;
      for (let i = 0; i < 6; i++) {
        ultima = await n.req('POST', '/api/auth/request-password-reset', corpo);
        statuses.push(ultima.status);
      }
      logs.mock.restore();
      assert.equal(statuses[0], 200);
      assert.equal(statuses[5], 429, statuses.join(','));
      // A sexta foi barrada pelo limitador do app, não pelo interno do better-auth.
      assert.match(JSON.stringify(ultima!.json), /Muitos pedidos/);
    });
  });

  describe('sessão', () => {
    it('trocar a senha logado derruba as outras sessões na hora', async () => {
      const email = 'troca@teste.com';
      await contaConfirmada(email);
      const a = await entrar(email);
      const b = await entrar(email);
      assert.equal((await b.req('GET', '/api/conta/exportar')).status, 200);
      const r = await a.req('POST', '/api/auth/change-password', { currentPassword: SENHA, newPassword: SENHA_NOVA, revokeOtherSessions: true });
      assert.equal(r.status, 200, JSON.stringify(r.json));
      assert.equal((await b.req('GET', '/api/conta/exportar')).status, 401);
    });
  });

  describe('origem nas escritas com cookie', () => {
    const CAMINHO = '/api/pousadas';

    it('subdomínio irmão com o cookie da sessão é recusado antes da rota', async () => {
      const email = 'csrf@teste.com';
      await contaConfirmada(email);
      const dono = await entrar(email);
      const irmao = new Navegador(base, dono.ip, 'https://evil.pgdev.com.br');
      irmao.cookies = dono.cookies;
      for (const metodo of ['POST', 'PUT', 'PATCH', 'DELETE']) {
        const r = await irmao.req(metodo, CAMINHO);
        assert.equal(r.status, 403, metodo);
        assert.equal(r.json.codigo, 'ORIGEM_RECUSADA');
      }
      const semOrigem = new Navegador(base, dono.ip, null);
      semOrigem.cookies = dono.cookies;
      assert.equal((await semOrigem.req('POST', CAMINHO)).status, 403);
      const nula = new Navegador(base, dono.ip, 'null');
      nula.cookies = dono.cookies;
      assert.equal((await nula.req('POST', CAMINHO)).status, 403);

      // A origem do app passa; quem responde já é a rota (corpo vazio = 400).
      assert.equal((await dono.req('POST', CAMINHO)).status, 400);
      // Leitura com cookie não é barrada: a origem só importa na escrita.
      assert.equal((await semOrigem.req('GET', '/api/conta/exportar')).status, 200);
    });

    it('sem cookie o cheque não se aplica (motor de reservas, telemetria)', async () => {
      const anon = new Navegador(base, proximoIp(), 'https://site-da-pousada.example');
      assert.notEqual((await anon.req('POST', '/api/telemetria/erro', { mensagem: 'x' })).status, 403);
    });

    it('webhook fica de fora mesmo com cookie e sem origem', async () => {
      const w = new Navegador(base, proximoIp(), null);
      w.cookies.set('qualquer', '1');
      assert.notEqual((await w.req('POST', '/api/webhooks/pix/asaas/token-inexistente', { event: 'x' })).status, 403);
    });

    it('formulário não é mais interpretado', async () => {
      const email = 'form@teste.com';
      await contaConfirmada(email);
      const dono = await entrar(email);
      const r = await dono.req('POST', '/api/pousadas', 'nome=Forjada&num_quartos=3', { 'Content-Type': 'application/x-www-form-urlencoded' });
      assert.equal(r.status, 400, JSON.stringify(r.json));
      const { rows } = await pool.query(`SELECT count(*)::int AS n FROM pousadas WHERE nome = 'Forjada'`);
      assert.equal(rows[0].n, 0);
    });
  });
});

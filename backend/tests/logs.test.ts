/**
 * O caminho de várias rotas é a própria credencial (calendário, webhook Pix,
 * convite, pré-check-in). Nada disso pode aparecer em log nem ir ao Sentry.
 */
import { after, before, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { Request, Response } from 'express';
import { prepararBanco, temBanco } from './helpers/banco.js';
import { rotaSegura } from '../utils/rotaSegura.js';
import { limparEventoDoSentry } from '../lib/observabilidade.js';
import { mascararEmail } from '../utils/pii.js';

describe('rotaSegura', () => {
  it('usa o template quando a rota casou', () => {
    assert.equal(rotaSegura({ route: { path: '/asaas/:token' }, baseUrl: '/api/webhooks/pix', path: '/asaas/segredo' } as never), '/api/webhooks/pix/asaas/:token');
    assert.equal(rotaSegura({ route: { path: '/' }, baseUrl: '/api/reservas', path: '/' } as never), '/api/reservas');
    assert.equal(rotaSegura({ route: { path: '/' }, baseUrl: '', path: '/' } as never), '/');
  });

  it('sem rota casada, corta o caminho em vez de repetir o que foi pedido', () => {
    const r = (path: string) => rotaSegura({ path, baseUrl: '' } as never);
    assert.equal(r('/api/convites/segredo/qualquer'), '/api/convites/*');
    assert.equal(r('/api/convites/segredo'), '/api/convites/*');
    assert.equal(r('/ical/segredo.ics'), '/ical/*');
    assert.equal(r('/api/nada'), '/api/nada');
    assert.equal(r('/'), '/');
  });
});

describe('limparEventoDoSentry', () => {
  it('não deixa sair URL, cookies, usuário nem trilha de navegação', () => {
    const evento = {
      transaction: 'GET /api/convites/segredo',
      request: { method: 'GET', url: 'https://api/api/convites/segredo', query_string: 'token=segredo', cookies: { a: '1' }, headers: { cookie: 'a=1' }, data: '{}' },
      user: { id: '1', email: 'a@b.com' },
      breadcrumbs: [{ message: 'GET /ical/segredo.ics' }],
      exception: { values: [{ value: 'falhou' }] },
    };
    const limpo = limparEventoDoSentry(evento);
    assert.doesNotMatch(JSON.stringify(limpo), /segredo|a@b\.com|cookie/);
    assert.equal(limpo.request?.method, 'GET');
    assert.equal(limpo.exception?.values?.[0]?.value, 'falhou');
  });
});

describe('mascararEmail', () => {
  it('mantém o bastante para investigar entrega', () => {
    assert.equal(mascararEmail('joana.silva@gmail.com'), 'j***@gmail.com');
    assert.equal(mascararEmail('sem-arroba'), '***');
    assert.equal(mascararEmail(''), '***');
  });
});

describe('logs de requisição', { skip: !temBanco && 'DATABASE_URL não definida' }, () => {
  let descartar: () => Promise<void>;
  let fechar: () => Promise<void>;
  let servidor: Server;
  let base: string;
  const SEGREDO = 'a'.repeat(48);

  before(async () => {
    ({ descartar } = await prepararBanco('logs'));
    const dbmod = await import('../db/index.js');
    await (await import('../db/migrate.js')).runMigrations();
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

  async function linhasDoLog(fn: () => Promise<unknown>): Promise<string[]> {
    const log = mock.method(console, 'log', () => {});
    const erro = mock.method(console, 'error', () => {});
    await fn();
    // O log sai no evento `finish`, logo depois de a resposta chegar.
    await new Promise((ok) => setTimeout(ok, 30));
    const linhas = [...log.mock.calls, ...erro.mock.calls].map((c) => c.arguments.map(String).join(' '));
    log.mock.restore();
    erro.mock.restore();
    return linhas;
  }

  for (const producao of [false, true]) {
    it(`nenhuma rota com token no caminho vai para o log (${producao ? 'produção' : 'desenvolvimento'})`, async () => {
      const antes = process.env.NODE_ENV;
      if (producao) process.env.NODE_ENV = 'production';
      try {
        const linhas = await linhasDoLog(async () => {
          await fetch(`${base}/ical/${SEGREDO}.ics`);
          await fetch(`${base}/api/convites/${SEGREDO}`);
          await fetch(`${base}/api/publico/checkin/${SEGREDO}`);
          await fetch(`${base}/api/webhooks/pix/asaas/${SEGREDO}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
          // Rota inexistente debaixo de um prefixo que carrega token.
          await fetch(`${base}/api/convites/${SEGREDO}/nada`);
          await fetch(`${base}/ical/${SEGREDO}.ics`, { method: 'POST' });
        });
        const texto = linhas.join('\n');
        assert.doesNotMatch(texto, new RegExp(SEGREDO));
        assert.match(texto, /\/ical\/:arquivo/);
        assert.match(texto, /\/api\/publico\/checkin\/:token/);
        assert.match(texto, /\/api\/webhooks\/pix\/asaas\/:token/);
      } finally {
        if (producao) process.env.NODE_ENV = antes;
      }
    });
  }

  it('o tratador de erro registra o template', async () => {
    const { errorHandler } = await import('../middleware/errorHandler.js');
    const erro = mock.method(console, 'error', () => {});
    const res = { status() { return this; }, json() { return this; } } as unknown as Response;
    errorHandler(new Error('falhou'), { route: { path: '/:token' }, baseUrl: '/api/convites', path: `/${SEGREDO}`, method: 'GET' } as unknown as Request, res, () => {});
    const registrado = JSON.stringify(erro.mock.calls[0].arguments);
    erro.mock.restore();
    assert.doesNotMatch(registrado, new RegExp(SEGREDO));
    assert.match(registrado, /\/api\/convites\/:token/);
  });

  it('/health/live informa a versão da imagem', async () => {
    const antes = process.env.APP_VERSION;
    process.env.APP_VERSION = 'abc123def456';
    const comVersao = await (await fetch(`${base}/health/live`)).json() as { version: string };
    delete process.env.APP_VERSION;
    const semVersao = await (await fetch(`${base}/health/live`)).json() as { version: string };
    if (antes) process.env.APP_VERSION = antes;
    assert.equal(comVersao.version, 'abc123def456');
    assert.equal(semVersao.version, 'desconhecida');
  });
});

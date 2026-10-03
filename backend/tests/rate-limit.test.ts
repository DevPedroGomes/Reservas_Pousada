/**
 * Rate limit com contador no Postgres.
 *
 * O contador em memória se perdia a cada deploy (o limite de tentativas de
 * login reiniciava) e não era compartilhado entre réplicas. Aqui: duas
 * "instâncias" do limitador somam no mesmo contador, e a janela reinicia.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { prepararBanco, temBanco } from './helpers/banco.js';

describe('rate limit no Postgres', { skip: !temBanco && 'DATABASE_URL não definida' }, () => {
  let descartar: () => Promise<void>;
  let fechar: () => Promise<void>;
  let pool: import('pg').Pool;
  let StorePostgres: typeof import('../utils/rateLimitStore.js').StorePostgres;
  const servidores: Server[] = [];

  before(async () => {
    ({ descartar } = await prepararBanco('ratelimit'));
    const dbmod = await import('../db/index.js');
    await (await import('../db/migrate.js')).runMigrations();
    pool = dbmod.pool;
    fechar = dbmod.closeConnection;
    ({ StorePostgres } = await import('../utils/rateLimitStore.js'));
  });

  after(async () => {
    for (const s of servidores) s.close();
    await fechar?.();
    await descartar?.();
  });

  it('conta, reinicia a janela e decrementa', async () => {
    const store = new StorePostgres(pool, 'teste');
    store.init({ windowMs: 300 } as never);
    assert.equal((await store.increment('ip1')).totalHits, 1);
    assert.equal((await store.increment('ip1')).totalHits, 2);
    await store.decrement('ip1');
    assert.equal((await store.increment('ip1')).totalHits, 2);
    await new Promise((r) => setTimeout(r, 350));
    assert.equal((await store.increment('ip1')).totalHits, 1, 'janela vencida recomeça do zero');
  });

  it('prefixos diferentes não somam', async () => {
    const a = new StorePostgres(pool, 'auth');
    const b = new StorePostgres(pool, 'global');
    a.init({ windowMs: 60_000 } as never);
    b.init({ windowMs: 60_000 } as never);
    await a.increment('ip2');
    await a.increment('ip2');
    assert.equal((await b.increment('ip2')).totalHits, 1);
  });

  it('duas réplicas da API somam no mesmo contador', async () => {
    const express = (await import('express')).default;
    const { criarLimitador } = await import('../utils/limitadores.js');

    async function subirReplica(): Promise<string> {
      const app = express();
      app.set('trust proxy', true);
      app.use(criarLimitador('replica', { windowMs: 60_000, max: 3, keyGenerator: () => 'cliente-fixo' }));
      app.get('/', (_req, res) => { res.send('ok'); });
      const s = await new Promise<Server>((ok) => { const srv = app.listen(0, () => ok(srv)); });
      servidores.push(s);
      return `http://127.0.0.1:${(s.address() as AddressInfo).port}/`;
    }

    const [r1, r2] = [await subirReplica(), await subirReplica()];
    const status = [];
    for (const url of [r1, r2, r1, r2]) status.push((await fetch(url)).status);
    assert.deepEqual(status, [200, 200, 200, 429]);
  });
});

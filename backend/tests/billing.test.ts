/**
 * Avaliação de acesso e efeitos do Stripe, contra Postgres real.
 *
 * Cada caso é um jeito de o sistema entregar produto sem receber, ou de cortar
 * quem pagou.
 */
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { prepararBanco, temBanco } from './helpers/banco.js';

describe('billing — acesso', { skip: !temBanco && 'DATABASE_URL não definida' }, () => {
  let descartar: () => Promise<void>;
  let fechar: () => Promise<void>;
  let pool: import('pg').Pool;
  let requerAssinaturaAtiva: typeof import('../middleware/assinatura.js').requerAssinaturaAtiva;
  const envAntes = { ...process.env };

  /** Chama o guard como o Express chamaria e devolve o que ele respondeu. */
  async function guard(pousadaId: number): Promise<{ passou: boolean; status?: number; corpo?: any }> {
    let passou = false;
    let status: number | undefined;
    let corpo: any;
    const res = {
      status(s: number) { status = s; return this; },
      json(c: unknown) { corpo = c; return this; },
    } as unknown as Response;
    await requerAssinaturaAtiva({ user: { pousadaId } } as unknown as Request, res, () => { passou = true; });
    return { passou, status, corpo };
  }

  before(async () => {
    ({ descartar } = await prepararBanco('billing'));
    const dbmod = await import('../db/index.js');
    await (await import('../db/migrate.js')).runMigrations();
    pool = dbmod.pool;
    fechar = dbmod.closeConnection;
    process.env.BILLING_ENABLED = 'true';
    process.env.STRIPE_SECRET_KEY = 'sk_test_nao_usada';
    ({ requerAssinaturaAtiva } = await import('../middleware/assinatura.js'));

    await pool.query(`
      INSERT INTO "user" (id, name, email, email_verified) VALUES ('u1', 'A', 'a@t.com', true), ('u2', 'B', 'b@t.com', true), ('u3', 'C', 'c@t.com', true), ('u4', 'D', 'd@t.com', true);
      INSERT INTO pousadas (id, nome, slug, num_quartos) VALUES (1, 'Um', 'um', 5), (2, 'Dois', 'dois', 5), (3, 'Três', 'tres', 5);
    `);
  });

  after(async () => {
    process.env = envAntes;
    await fechar?.();
    await descartar?.();
  });

  beforeEach(async () => {
    await pool.query(`DELETE FROM assinaturas; DELETE FROM user_pousadas; DELETE FROM quartos;`);
  });

  async function assinatura(pousadaId: number, plano: string, extra: { status?: string; cobertaPor?: number } = {}) {
    await pool.query(
      `INSERT INTO assinaturas (pousada_id, status, plano, coberta_por_pousada_id) VALUES ($1, $2, $3, $4)`,
      [pousadaId, extra.status ?? 'ativa', plano, extra.cobertaPor ?? null],
    );
  }
  async function quartos(pousadaId: number, n: number) {
    await pool.query(`INSERT INTO quartos (pousada_id, numero, nome) SELECT $1, g, 'Q' || g FROM generate_series(1, $2::int) g`, [pousadaId, n]);
  }

  describe('inadimplência e cancelamento', () => {
    it('inadimplente há mais de 7 dias é cortado mesmo com o período avançado pelo Stripe', async () => {
      await assinatura(1, 'pousada', { status: 'inadimplente' });
      await pool.query(`UPDATE assinaturas SET periodo_termina_em = now() + interval '25 days', inadimplente_desde = now() - interval '8 days' WHERE pousada_id = 1`);
      const r = await guard(1);
      assert.equal(r.status, 402);
      assert.equal(r.corpo.motivo, 'tolerancia_esgotada');
    });

    it('cancelada sem agendamento é cortada na hora', async () => {
      await assinatura(1, 'pousada', { status: 'cancelada' });
      await pool.query(`UPDATE assinaturas SET periodo_termina_em = now() + interval '25 days', cancela_no_fim = false WHERE pousada_id = 1`);
      assert.equal((await guard(1)).corpo?.motivo, 'cancelada');
    });

    it('migration dá a carência a quem já estava inadimplente em vez de cortar no deploy', async () => {
      const { readFileSync } = await import('node:fs');
      const { fileURLToPath } = await import('node:url');
      const sql = readFileSync(fileURLToPath(new URL('../migrations/027_inadimplencia_e_estorno.sql', import.meta.url)), 'utf8');
      assert.match(sql, /inadimplente_desde\s*=\s*now\(\)[\s\S]*status\s*=\s*'inadimplente'/);
    });
  });

  describe('recursos acima do limite do plano vigente', () => {
    it('quartos acima do limite bloqueiam a operação, com mensagem clara e sem apagar nada', async () => {
      await assinatura(1, 'essencial');
      await quartos(1, 12);
      const r = await guard(1);
      assert.equal(r.passou, false);
      assert.equal(r.status, 402);
      assert.equal(r.corpo.motivo, 'acima_do_limite');
      assert.match(r.corpo.mensagem, /12 quartos/);
      assert.match(r.corpo.mensagem, /permite 10/);
      assert.match(r.corpo.mensagem, /[Nn]enhum dado/);
      assert.equal((await pool.query(`SELECT 1 FROM quartos WHERE pousada_id = 1`)).rows.length, 12);
    });

    it('reduzir os quartos devolve o acesso', async () => {
      await assinatura(1, 'essencial');
      await quartos(1, 12);
      assert.equal((await guard(1)).passou, false);
      await pool.query(`UPDATE quartos SET ativo = false WHERE pousada_id = 1 AND numero > 10`);
      assert.equal((await guard(1)).passou, true);
    });

    it('usuários acima do limite bloqueiam', async () => {
      await assinatura(1, 'essencial');
      await pool.query(`INSERT INTO user_pousadas (user_id, pousada_id, role) VALUES ('u1', 1, 'admin'), ('u2', 1, 'recepcao'), ('u3', 1, 'recepcao'), ('u4', 1, 'recepcao')`);
      const r = await guard(1);
      assert.equal(r.corpo?.motivo, 'acima_do_limite');
      assert.match(r.corpo.mensagem, /4 usuários/);
    });

    it('pousadas cobertas acima do limite bloqueiam a pagadora e as cobertas', async () => {
      await assinatura(1, 'pousada');
      await assinatura(2, 'pousada', { status: 'trial', cobertaPor: 1 });
      for (const id of [1, 2]) {
        const r = await guard(id);
        assert.equal(r.corpo?.motivo, 'acima_do_limite', `pousada ${id}`);
        assert.match(r.corpo.mensagem, /2 pousadas/);
      }
    });

    it('dentro do limite passa; cortesia e trial não têm essa avaliação', async () => {
      await assinatura(1, 'rede');
      await quartos(1, 12);
      assert.equal((await guard(1)).passou, true);
      await pool.query(`INSERT INTO assinaturas (pousada_id, status) VALUES (2, 'cortesia')`);
      await quartos(2, 200);
      assert.equal((await guard(2)).passou, true);
    });

    it('a situação da tela mostra o mesmo veredito', async () => {
      await assinatura(1, 'essencial');
      await quartos(1, 12);
      const AssinaturaModel = (await import('../models/Assinatura.js')).default;
      const s = await AssinaturaModel.situacao(1);
      assert.equal(s!.veredito.liberado, false);
      assert.equal(s!.quartos, 12);
    });
  });
});

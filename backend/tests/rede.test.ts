/**
 * Plano Rede e limite de pousadas, contra Postgres real.
 *
 * A regra pura está em assinatura.test.ts; aqui vale o que só o banco prova:
 * a cobertura gravada, a assinatura efetiva lida pela pousada extra, e o lock
 * que impede três cliques simultâneos de passarem do limite.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, temBanco } from './helpers/banco.js';

describe('plano Rede — cobertura de pousadas', { skip: !temBanco && 'DATABASE_URL não definida' }, () => {
  let descartar: () => Promise<void>;
  let fechar: () => Promise<void>;
  let pool: import('pg').Pool;
  let PousadaModel: typeof import('../models/Pousada.js').default;
  let LimiteDoPlano: typeof import('../models/Pousada.js').LimiteDoPlano;
  let AssinaturaModel: typeof import('../models/Assinatura.js').default;
  let avaliarAcesso: typeof import('../utils/assinatura.js').avaliarAcesso;

  const criar = (userId: string, nome: string, numQuartos = 5) =>
    PousadaModel.criarComOwner({ nome, numQuartos }, userId, { aplicarLimites: true });

  async function usuario(id: string) {
    await pool.query(
      `INSERT INTO "user" (id, name, email, email_verified) VALUES ($1, $1, $1 || '@teste.com', true)`,
      [id],
    );
  }

  before(async () => {
    ({ descartar } = await prepararBanco('rede'));
    const dbmod = await import('../db/index.js');
    await (await import('../db/migrate.js')).runMigrations();
    pool = dbmod.pool;
    fechar = dbmod.closeConnection;
    const pm = await import('../models/Pousada.js');
    PousadaModel = pm.default;
    LimiteDoPlano = pm.LimiteDoPlano;
    AssinaturaModel = (await import('../models/Assinatura.js')).default;
    avaliarAcesso = (await import('../utils/assinatura.js')).avaliarAcesso;
  });

  after(async () => {
    await fechar?.();
    await descartar?.();
  });

  it('primeira pousada nasce em trial próprio', async () => {
    await usuario('dono1');
    const p = await criar('dono1', 'Primeira');
    const row = await AssinaturaModel.buscarPorPousada(p.id);
    assert.equal(row?.status, 'trial');
    assert.ok(row?.trialTerminaEm);
    assert.equal(row?.cobertaPorPousadaId, null);
  });

  it('segunda pousada em trial é recusada (fim do trial infinito)', async () => {
    await assert.rejects(criar('dono1', 'Segunda'), (e) => e instanceof LimiteDoPlano && /Rede/.test(e.message));
  });

  it('com Rede ativo, a 2ª e a 3ª nascem cobertas e liberadas; a 4ª é recusada', async () => {
    const { rows } = await pool.query(`SELECT p.id FROM pousadas p WHERE p.nome = 'Primeira'`);
    const pagadoraId = rows[0].id;
    await pool.query(`UPDATE assinaturas SET status = 'ativa', plano = 'rede' WHERE pousada_id = $1`, [pagadoraId]);

    const p2 = await criar('dono1', 'Segunda');
    const p3 = await criar('dono1', 'Terceira');
    for (const p of [p2, p3]) {
      const ef = await AssinaturaModel.efetiva(p.id);
      assert.equal(ef?.pagadoraId, pagadoraId);
      assert.equal(avaliarAcesso(AssinaturaModel.paraEstado(ef!.row)).liberado, true);
    }
    assert.equal(await AssinaturaModel.pousadasCobertas(pagadoraId), 3);
    await assert.rejects(criar('dono1', 'Quarta'), LimiteDoPlano);
  });

  it('cancelado o Rede, a pousada coberta fica bloqueada — não ganha trial', async () => {
    const { rows } = await pool.query(`SELECT id FROM pousadas WHERE nome IN ('Primeira', 'Segunda') ORDER BY id`);
    await pool.query(
      `UPDATE assinaturas SET status = 'cancelada', periodo_termina_em = now() - interval '1 day' WHERE pousada_id = $1`,
      [rows[0].id],
    );
    const ef = await AssinaturaModel.efetiva(rows[1].id);
    assert.equal(avaliarAcesso(AssinaturaModel.paraEstado(ef!.row)).liberado, false);
  });

  it('CORRIDA: três criações simultâneas com uma vaga — só uma passa', async () => {
    await usuario('dono2');
    const p1 = await criar('dono2', 'Base');
    await pool.query(`UPDATE assinaturas SET status = 'ativa', plano = 'rede' WHERE pousada_id = $1`, [p1.id]);
    await criar('dono2', 'Extra 1'); // ocupa 2 de 3

    const resultados = await Promise.allSettled([
      criar('dono2', 'Disputa A'),
      criar('dono2', 'Disputa B'),
      criar('dono2', 'Disputa C'),
    ]);
    assert.equal(resultados.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(await AssinaturaModel.pousadasCobertas(p1.id), 3);
  });

  it('quartos acima do limite do plano efetivo são recusados na criação', async () => {
    await usuario('dono3');
    // Trial vale o plano Pousada: 25 quartos.
    await assert.rejects(criar('dono3', 'Grande', 40), (e) => e instanceof LimiteDoPlano && /25 quartos/.test(e.message));
  });
});

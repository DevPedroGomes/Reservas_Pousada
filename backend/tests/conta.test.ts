/**
 * Direitos do titular e retenção, contra Postgres real.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, temBanco } from './helpers/banco.js';

describe('LGPD — exportar, excluir e reter', { skip: !temBanco && 'DATABASE_URL não definida' }, () => {
  let descartar: () => Promise<void>;
  let fechar: () => Promise<void>;
  let pool: import('pg').Pool;
  let Conta: typeof import('../models/Conta.js');

  before(async () => {
    ({ descartar } = await prepararBanco('conta'));
    const dbmod = await import('../db/index.js');
    await (await import('../db/migrate.js')).runMigrations();
    pool = dbmod.pool;
    fechar = dbmod.closeConnection;
    Conta = await import('../models/Conta.js');

    await pool.query(`
      INSERT INTO "user" (id, name, email, email_verified) VALUES
        ('dono', 'Dona Maria', 'dona@teste.com', true),
        ('recep', 'Carla Recepção', 'carla@teste.com', true);
      INSERT INTO pousadas (id, nome, slug, num_quartos, configuracoes) VALUES
        (1, 'Pousada Sol', 'sol', 10, '{"retencao_hospedes_meses": 12}');
      INSERT INTO user_pousadas (user_id, pousada_id, role, is_owner) VALUES
        ('dono', 1, 'admin', true), ('recep', 1, 'recepcao', false);
      UPDATE "user" SET pousada_id = 1 WHERE id IN ('dono', 'recep');
      INSERT INTO assinaturas (pousada_id, status) VALUES (1, 'trial');
      INSERT INTO session (id, token, user_id, expires_at, ip_address) VALUES
        ('s1', 't1', 'recep', now() + interval '1 day', '200.1.2.3');
      INSERT INTO reservas (id, pousada_id, nome, cpf, cpf_hash, quarto, data_entrada, data_saida, observacoes, criado_por) VALUES
        (10, 1, 'Hóspede Antigo', 'cifrado', 'hash', 1, '2024-01-10', '2024-01-12', 'alergia', 'recep'),
        (11, 1, 'Hóspede Recente', 'cifrado', 'hash', 2, current_date - 10, current_date - 8, 'nada', 'recep');
      INSERT INTO auditoria (user_id, action, entity, entity_id, details) VALUES
        ('recep', 'criar', 'reserva', 10, '{"depois":{"nome":"Hóspede Antigo"}}');
      INSERT INTO hospedes (id, pousada_id, nome, documento, documento_hash, telefone, created_at) VALUES
        (1, 1, 'Hóspede Antigo', 'cifrado', 'h-antigo', '48911112222', '2024-01-01'),
        (2, 1, 'Hóspede Recente', 'cifrado', 'h-recente', '48933334444', '2024-01-01');
      UPDATE reservas SET hospede_id = 1 WHERE id = 10;
      UPDATE reservas SET hospede_id = 2 WHERE id = 11;
      INSERT INTO financeiro_lancamentos (pousada_id, competencia, categoria, valor_centavos) VALUES
        (1, '2026-09', 'receita_assinatura', 14900);
    `);
  });

  after(async () => {
    await fechar?.();
    await descartar?.();
  });

  it('exportar traz os dados da pessoa e não os dos hóspedes', async () => {
    const d = await Conta.exportarDadosDoUsuario('recep');
    assert.equal(d.usuario.email, 'carla@teste.com');
    assert.equal(d.vinculos[0].pousada, 'Pousada Sol');
    assert.equal(d.sessoes[0].ip_address, '200.1.2.3');
    assert.equal(d.acoesRegistradas[0].acao, 'criar');
    assert.ok(!JSON.stringify(d).includes('Hóspede Antigo'), 'detalhes com dados de hóspede não podem sair');
  });

  it('retenção anonimiza só estadias além do prazo, inclusive no histórico', async () => {
    assert.equal(await Conta.anonimizarHospedesAntigos(), 1);
    const { rows } = await pool.query(`SELECT id, nome, cpf, cpf_hash, observacoes FROM reservas ORDER BY id`);
    assert.deepEqual(rows[0], { id: 10, nome: Conta.NOME_ANONIMIZADO, cpf: Conta.CPF_ANONIMIZADO, cpf_hash: null, observacoes: null });
    assert.equal(rows[1].nome, 'Hóspede Recente');
    const { rows: aud } = await pool.query(`SELECT details FROM auditoria WHERE entity_id = 10`);
    assert.deepEqual(aud[0].details, { anonimizado: true });
    // A ficha de quem só tem estadia antiga também some; a de quem voltou fica.
    const { rows: fichas } = await pool.query(`SELECT id, nome, documento, telefone, anonimizado_em FROM hospedes ORDER BY id`);
    assert.equal(fichas[0].nome, Conta.NOME_ANONIMIZADO);
    assert.equal(fichas[0].documento, null);
    assert.equal(fichas[0].telefone, null);
    assert.ok(fichas[0].anonimizado_em);
    assert.equal(fichas[1].nome, 'Hóspede Recente');
    assert.equal(fichas[1].telefone, '48933334444');
    const { rows: [antiga] } = await pool.query(`SELECT hospede_id FROM reservas WHERE id = 10`);
    assert.equal(antiga.hospede_id, null, 'estadia antiga sai do histórico da pessoa');
    assert.equal(await Conta.anonimizarHospedesAntigos(), 0, 'idempotente');
  });

  it('dono não exclui a conta enquanto tiver pousada', async () => {
    await assert.rejects(Conta.excluirConta('dono'), Conta.ExclusaoRecusada);
  });

  it('excluir conta da equipe anonimiza, encerra sessões e tira o acesso', async () => {
    await Conta.excluirConta('recep');
    const { rows: [u] } = await pool.query(`SELECT name, email, pousada_id FROM "user" WHERE id = 'recep'`);
    assert.equal(u.name, 'Usuário removido');
    assert.match(u.email, /@diaria\.invalid$/);
    assert.equal(u.pousada_id, null);
    assert.equal((await pool.query(`SELECT 1 FROM session WHERE user_id = 'recep'`)).rowCount, 0);
    assert.equal((await pool.query(`SELECT 1 FROM user_pousadas WHERE user_id = 'recep'`)).rowCount, 0);
    // A reserva que ela criou continua íntegra (FK preservada).
    assert.equal((await pool.query(`SELECT 1 FROM reservas WHERE criado_por = 'recep'`)).rowCount, 2);
  });

  it('excluir pousada exige o nome exato e assinatura não viva', async () => {
    await assert.rejects(Conta.excluirPousada(1, 'pousada sol'), /digite o nome/);
    await pool.query(`UPDATE assinaturas SET status = 'ativa', stripe_subscription_id = 'sub_1' WHERE pousada_id = 1`);
    await assert.rejects(Conta.excluirPousada(1, 'Pousada Sol'), /Cancele a assinatura/);
    await pool.query(`UPDATE assinaturas SET status = 'cancelada' WHERE pousada_id = 1`);
  });

  it('excluir pousada apaga hóspedes e vínculos, preserva o financeiro do SaaS', async () => {
    await Conta.excluirPousada(1, 'Pousada Sol');
    assert.equal((await pool.query(`SELECT 1 FROM reservas WHERE pousada_id = 1`)).rowCount, 0);
    assert.equal((await pool.query(`SELECT 1 FROM hospedes WHERE pousada_id = 1`)).rowCount, 0);
    assert.equal((await pool.query(`SELECT 1 FROM user_pousadas WHERE pousada_id = 1`)).rowCount, 0);
    assert.equal((await pool.query(`SELECT 1 FROM auditoria WHERE entity = 'reserva'`)).rowCount, 0);
    const { rows: [p] } = await pool.query(`SELECT nome, excluida_em FROM pousadas WHERE id = 1`);
    assert.equal(p.nome, 'Pousada excluída #1');
    assert.ok(p.excluida_em);
    assert.equal((await pool.query(`SELECT 1 FROM financeiro_lancamentos WHERE pousada_id = 1`)).rowCount, 1);
    // Agora o dono pode excluir a própria conta.
    await Conta.excluirConta('dono');
  });
});

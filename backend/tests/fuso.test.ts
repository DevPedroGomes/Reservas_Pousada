/**
 * Data contábil no fuso da operação, com o banco num fuso em que o dia é outro.
 * Arquivo próprio: o fuso é do banco inteiro e valeria para os outros testes.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { prepararBanco, temBanco } from './helpers/banco.js';
import { hojeLocal } from '../utils/datas.js';

describe('Pix e o fuso do banco', { skip: !temBanco && 'DATABASE_URL não definida' }, () => {
  let descartar: () => Promise<void>;
  let fechar: () => Promise<void>;
  let pool: pg.Pool;

  before(async () => {
    const preparado = await prepararBanco('fuso');
    descartar = preparado.descartar;
    // Um destes dois está sempre em outro dia civil em relação ao fuso da operação.
    const fuso = ['Pacific/Kiritimati', 'Etc/GMT+12'].find((z) => new Date().toLocaleDateString('en-CA', { timeZone: z }) !== hojeLocal())!;
    const admin = new pg.Client({ connectionString: preparado.url });
    await admin.connect();
    await admin.query(`ALTER DATABASE ${new URL(preparado.url).pathname.slice(1)} SET timezone TO '${fuso}'`);
    await admin.end();
    const dbmod = await import('../db/index.js');
    await (await import('../db/migrate.js')).runMigrations();
    pool = dbmod.pool;
    fechar = dbmod.closeConnection;
    const { rows: [{ dia }] } = await pool.query(`SELECT current_date::text AS dia`);
    assert.notEqual(dia, hojeLocal(), 'o teste só vale com o banco em outro dia');
    await pool.query(`
      INSERT INTO pousadas (id, nome, slug, num_quartos) VALUES (1, 'P', 'p', 2);
      INSERT INTO "user" (id, name, email, email_verified) VALUES ('u1', 'Equipe', 'equipe@fuso.test', true);
      INSERT INTO reservas (id, pousada_id, nome, quarto, data_entrada, data_saida, status, valor) VALUES (1, 1, 'R', 1, current_date + 5, current_date + 7, 'confirmada', 100);
      INSERT INTO cobrancas_pix (id, pousada_id, reserva_id, provedor, valor_centavos, copia_e_cola, token_publico) VALUES (1, 1, 1, 'chave', 5000, '000201', 'a');`);
  });

  after(async () => {
    await fechar?.();
    await descartar?.();
  });

  it('o pagamento entra com a data da pousada, não a do banco', async () => {
    const { marcarRecebida } = await import('../models/Pix.js');
    await marcarRecebida(1, 1, 1, 'u1');
    const { rows: [p] } = await pool.query(`SELECT recebido_em::text AS dia FROM pagamentos WHERE reserva_id = 1`);
    assert.equal(p.dia, hojeLocal());
  });
});

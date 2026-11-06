/**
 * Conexão do WhatsApp da pousada, contra Postgres real e Meta falsa.
 *
 * O id do número vem do navegador: sem conferir com a Meta, uma pousada ocuparia
 * o número de outra, e a falha no meio deixaria webhooks assinados sem conta.
 */
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, temBanco } from './helpers/banco.js';

const WABA = '100200300';
const NUMERO = '700100200';

describe('conectar o WhatsApp da pousada', { skip: !temBanco && 'DATABASE_URL não definida' }, () => {
  let descartar: () => Promise<void>;
  let fechar: () => Promise<void>;
  let pool: import('pg').Pool;
  let Whats: typeof import('../models/WhatsappBusiness.js');
  let pousada: number;
  let numerosDaWaba: string[];
  let falhaAoRegistrar: boolean;
  let chamadas: string[];
  let pinRegistrado: string | null;

  before(async () => {
    ({ descartar } = await prepararBanco('whatsapp_conexao'));
    const dbmod = await import('../db/index.js');
    await (await import('../db/migrate.js')).runMigrations();
    pool = dbmod.pool;
    fechar = dbmod.closeConnection;
    Whats = await import('../models/WhatsappBusiness.js');
    const { rows: [p] } = await pool.query(`INSERT INTO pousadas (nome, slug, num_quartos) VALUES ('Conexão', 'conexao', 1) RETURNING id`);
    pousada = p.id;
    (await import('../lib/metaWhatsapp.js')).usarClienteMetaDeTeste({
      async trocarCodigo() { return 'token-da-pousada'; },
      async numerosDaWaba() { chamadas.push('numeros'); return numerosDaWaba; },
      async assinarWebhooks() { chamadas.push('assinar'); },
      async desassinarWebhooks() { chamadas.push('desassinar'); },
      async registrarNumero(_n: string, _t: string, pin: string) {
        chamadas.push('registrar');
        if (falhaAoRegistrar) throw new Error('número em uso');
        pinRegistrado = pin;
      },
      async dadosDoNumero() { return { numero: '+55 48 3000-0000', nome: 'Conexão' }; },
      async criarModelo() {},
    } as never);
  });

  after(async () => {
    (await import('../lib/metaWhatsapp.js')).usarClienteMetaDeTeste(null);
    await fechar();
    await descartar();
  });

  beforeEach(async () => {
    await pool.query(`DELETE FROM whatsapp_contas`);
    numerosDaWaba = [NUMERO];
    falhaAoRegistrar = false;
    chamadas = [];
    pinRegistrado = null;
  });

  const conectar = (coexistencia = false) => Whats.conectar(pousada, { code: 'c', wabaId: WABA, phoneNumberId: NUMERO, coexistencia });

  it('recusa número que não pertence à conta informada, sem assinar nem gravar nada', async () => {
    numerosDaWaba = ['999888777'];
    await assert.rejects(conectar(true), (e: Error & { status?: number }) => {
      assert.equal(e.status, 400);
      assert.match(e.message, /não pertence/);
      return true;
    });
    assert.deepEqual(chamadas, ['numeros']);
    assert.equal((await pool.query(`SELECT 1 FROM whatsapp_contas`)).rowCount, 0);
  });

  it('falha ao registrar o número desfaz a assinatura dos webhooks', async () => {
    falhaAoRegistrar = true;
    await assert.rejects(conectar(), /Meta recusou/);
    assert.deepEqual(chamadas, ['numeros', 'assinar', 'registrar', 'desassinar']);
    assert.equal((await pool.query(`SELECT 1 FROM whatsapp_contas`)).rowCount, 0);
  });

  it('guarda cifrado o PIN usado no registro, para o número poder ser registrado de novo', async () => {
    await conectar();
    assert.ok(pinRegistrado);
    const { rows: [c] } = await pool.query(`SELECT pin_cifrado FROM whatsapp_contas WHERE pousada_id = $1`, [pousada]);
    assert.ok(c.pin_cifrado && !c.pin_cifrado.includes(pinRegistrado!), 'cifrado no banco');
    const { decifrarSegredo } = await import('../utils/crypto.js');
    assert.equal(decifrarSegredo(c.pin_cifrado), pinRegistrado);
  });

  it('em coexistência o número segue no celular: não registra e não há PIN', async () => {
    await conectar(true);
    assert.ok(!chamadas.includes('registrar'));
    const { rows: [c] } = await pool.query(`SELECT pin_cifrado FROM whatsapp_contas WHERE pousada_id = $1`, [pousada]);
    assert.equal(c.pin_cifrado, null);
  });

  it('falha ao consultar os números não libera a conexão', async () => {
    (await import('../lib/metaWhatsapp.js')).usarClienteMetaDeTeste({
      async trocarCodigo() { return 'token'; },
      async numerosDaWaba() { throw new Error('Meta fora do ar'); },
      async assinarWebhooks() { chamadas.push('assinar'); },
    } as never);
    await assert.rejects(conectar(true), /Meta recusou/);
    assert.ok(!chamadas.includes('assinar'));
  });
});

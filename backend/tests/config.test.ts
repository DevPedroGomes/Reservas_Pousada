/** Configuração que derruba o boot em produção. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { problemasDeProducao } from '../lib/configProducao.js';

const OK = { NODE_ENV: 'production', BETTER_AUTH_URL: 'https://api.exemplo.com', RESEND_API_KEY: 're_x' };

describe('problemasDeProducao', () => {
  it('fora de produção não exige nada', () => {
    assert.deepEqual(problemasDeProducao({ NODE_ENV: 'development' }), []);
    assert.deepEqual(problemasDeProducao({}), []);
  });

  it('produção completa passa', () => {
    assert.deepEqual(problemasDeProducao(OK), []);
  });

  it('sem Resend é fatal, inclusive com a variável vazia que o compose entrega', () => {
    for (const env of [{ ...OK, RESEND_API_KEY: undefined }, { ...OK, RESEND_API_KEY: '' }, { ...OK, RESEND_API_KEY: '   ' }]) {
      const p = problemasDeProducao(env);
      assert.equal(p.length, 1);
      assert.match(p[0], /RESEND_API_KEY/);
    }
  });

  it('sem URL pública é fatal', () => {
    assert.match(problemasDeProducao({ ...OK, BETTER_AUTH_URL: '' })[0], /BETTER_AUTH_URL/);
  });

  it('cobrança ligada exige o segredo do webhook; desligada, não', () => {
    assert.match(problemasDeProducao({ ...OK, BILLING_ENABLED: 'true' })[0], /STRIPE_WEBHOOK_SECRET/);
    assert.deepEqual(problemasDeProducao({ ...OK, BILLING_ENABLED: 'true', STRIPE_WEBHOOK_SECRET: 'whsec_x' }), []);
    assert.deepEqual(problemasDeProducao({ ...OK, BILLING_ENABLED: 'false' }), []);
  });

  it('informa todos os problemas de uma vez', () => {
    assert.equal(problemasDeProducao({ NODE_ENV: 'production', BILLING_ENABLED: 'true' }).length, 3);
  });
});

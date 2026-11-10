/**
 * Quem concede o papel de admin — regra pura, sem banco.
 *
 * O convite (POST /api/pousadas/:id/convites) só checava se o papel existia:
 * um admin convidava outro admin, ou o próprio e-mail, e contornava a regra
 * que a troca de papel (PATCH) já aplicava. As duas rotas agora usam esta
 * função; o caminho completo pela API está em `tests/http.test.ts`.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { podeAtribuirPapel, MENSAGEM_SO_DONO_ADMIN } from '../utils/papeis.js';

const dono = { isOwner: true };
const admin = { isOwner: false };

describe('papéis — só o dono concede ou retira admin', () => {
  it('convite: admin não convida admin', () => {
    assert.equal(podeAtribuirPapel(admin, 'admin'), false);
  });

  it('convite: admin convida recepção e auditoria', () => {
    assert.equal(podeAtribuirPapel(admin, 'recepcao'), true);
    assert.equal(podeAtribuirPapel(admin, 'auditoria'), true);
  });

  it('convite: dono convida admin', () => {
    assert.equal(podeAtribuirPapel(dono, 'admin'), true);
  });

  it('troca de papel: admin não promove a admin nem rebaixa outro admin', () => {
    assert.equal(podeAtribuirPapel(admin, 'admin', 'recepcao'), false);
    assert.equal(podeAtribuirPapel(admin, 'recepcao', 'admin'), false);
  });

  it('troca de papel: admin troca entre recepção e auditoria; dono troca tudo', () => {
    assert.equal(podeAtribuirPapel(admin, 'recepcao', 'auditoria'), true);
    assert.equal(podeAtribuirPapel(dono, 'recepcao', 'admin'), true);
    assert.equal(podeAtribuirPapel(dono, 'admin', 'auditoria'), true);
  });

  it('a mensagem é a mesma nas duas rotas', () => {
    assert.equal(MENSAGEM_SO_DONO_ADMIN, 'Só o proprietário concede ou retira o papel de administrador.');
  });
});

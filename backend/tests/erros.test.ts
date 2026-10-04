/**
 * Erro em handler async não pode derrubar o processo.
 *
 * No Express 4, uma rejeição dentro de um handler async não chegava ao
 * errorHandler: virava `unhandledRejection` e, no Node 22, encerrava o
 * processo — a API de todos os clientes caía porque UMA consulta falhou.
 * Estes testes sobem um app mínimo com o mesmo errorHandler da aplicação.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { errorHandler, notFoundHandler } from '../middleware/errorHandler.js';

let servidor: Server;
let base: string;

before(async () => {
  const app = express();
  app.use(express.json());
  app.get('/async-falha', async () => {
    throw new Error('consulta ao banco falhou');
  });
  app.post('/eco', (req, res) => {
    res.json(req.body);
  });
  app.use(notFoundHandler);
  app.use(errorHandler);
  await new Promise<void>((ok) => {
    servidor = app.listen(0, () => ok());
  });
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});

after(() => {
  servidor?.close();
});

describe('tratamento de erro', () => {
  it('rejeição em handler async vira 500 — e o processo continua de pé', async () => {
    const r = await fetch(`${base}/async-falha`);
    assert.equal(r.status, 500);
    const corpo = (await r.json()) as { codigo: string; mensagem: string };
    assert.equal(corpo.codigo, 'ERR_INTERNAL');
    assert.equal(corpo.mensagem, 'Erro interno do servidor');

    // Mesma instância responde de novo: não caiu.
    const r2 = await fetch(`${base}/async-falha`);
    assert.equal(r2.status, 500);
  });

  it('JSON malformado é erro do cliente (400), não do servidor', async () => {
    const r = await fetch(`${base}/eco`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{malformado',
    });
    assert.equal(r.status, 400);
    assert.equal(((await r.json()) as { codigo: string }).codigo, 'ERR_REQUEST');
  });

  it('500 nunca devolve a mensagem interna ao cliente', async () => {
    const r = await fetch(`${base}/async-falha`);
    const texto = await r.text();
    assert.ok(!texto.includes('consulta ao banco falhou'));
  });
});

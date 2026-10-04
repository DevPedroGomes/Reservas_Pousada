/**
 * WhatsApp pela API oficial — formato do envio (sem rede).
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { enviarModelo, whatsappApiConfigurada } from '../lib/whatsapp.js';

describe('WhatsApp — API oficial', () => {
  const antes = { ...process.env };
  before(() => { delete process.env.WHATSAPP_TOKEN; delete process.env.WHATSAPP_PHONE_NUMBER_ID; });
  after(() => { process.env = antes; });

  it('sem variáveis de ambiente, fica desligado', async () => {
    assert.equal(whatsappApiConfigurada(), false);
    await assert.rejects(enviarModelo('5548999990000', 'x', []), /não configurada/);
  });

  it('envia modelo com as variáveis do corpo, no número com DDI', async () => {
    process.env.WHATSAPP_TOKEN = 'tok';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123';
    let chamada: { url: string; corpo: any; auth: string } | null = null;
    const falso = (async (url: string, init?: RequestInit) => {
      chamada = { url, corpo: JSON.parse(String(init?.body)), auth: (init?.headers as Record<string, string>).Authorization };
      return new Response(JSON.stringify({ messages: [{ id: 'wamid.1' }] }), { status: 200 });
    }) as typeof fetch;
    const id = await enviarModelo('+55 (48) 99999-0000', 'lembrete_chegada', ['Ana', 'Pousada Sol', '20/11', 'Suíte'], falso);
    assert.equal(id, 'wamid.1');
    assert.equal(chamada!.url, 'https://graph.facebook.com/v21.0/123/messages');
    assert.equal(chamada!.auth, 'Bearer tok');
    assert.equal(chamada!.corpo.to, '5548999990000');
    assert.equal(chamada!.corpo.template.name, 'lembrete_chegada');
    assert.deepEqual(chamada!.corpo.template.components[0].parameters.map((p: { text: string }) => p.text), ['Ana', 'Pousada Sol', '20/11', 'Suíte']);
    await assert.rejects(enviarModelo('48999990000'.slice(0, 8), 'x', [], falso), /DDI/);
  });
});

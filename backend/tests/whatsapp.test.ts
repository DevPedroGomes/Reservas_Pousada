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

describe('WhatsApp Business — assinatura do webhook da Meta', () => {
  const antes = { ...process.env };
  after(() => { process.env = antes; });

  it('confere o HMAC do corpo cru com o segredo do app', async () => {
    const { createHmac } = await import('node:crypto');
    const { assinaturaValida } = await import('../lib/metaWhatsapp.js');
    process.env.META_APP_SECRET = 'segredo';
    const corpo = Buffer.from('{"entry":[]}');
    const certa = `sha256=${createHmac('sha256', 'segredo').update(corpo).digest('hex')}`;
    assert.equal(assinaturaValida(corpo, certa), true);
    assert.equal(assinaturaValida(Buffer.from('{"entry": []}'), certa), false, 'um byte diferente invalida');
    assert.equal(assinaturaValida(corpo, certa.slice(0, -2)), false);
    assert.equal(assinaturaValida(corpo, undefined), false);
    delete process.env.META_APP_SECRET;
    assert.equal(assinaturaValida(corpo, certa), false, 'sem segredo configurado, nada passa');
  });
});

describe('Atendente virtual — adaptadores de modelo', () => {
  const ferramentas = [{ nome: 'consultar_disponibilidade', descricao: 'vagas', parametros: { type: 'object', properties: {} } }];
  const historico = [
    { papel: 'usuario' as const, texto: 'tem vaga?' },
    { papel: 'assistente' as const, texto: null, chamadas: [{ id: 'c1', nome: 'consultar_disponibilidade', argumentos: { a: 1 } }, { id: 'c2', nome: 'informacoes_da_pousada', argumentos: {} }] },
    { papel: 'ferramenta' as const, id: 'c1', nome: 'consultar_disponibilidade', resultado: '[]' },
    { papel: 'ferramenta' as const, id: 'c2', nome: 'informacoes_da_pousada', resultado: '{}' },
  ];
  const capturar = (resposta: unknown) => {
    const chamadas: { url: string; corpo: any; headers: Record<string, string> }[] = [];
    const f = (async (url: string, init?: RequestInit) => {
      chamadas.push({ url, corpo: JSON.parse(String(init?.body)), headers: init?.headers as Record<string, string> });
      return new Response(JSON.stringify(resposta), { status: 200 });
    }) as typeof fetch;
    return { f, chamadas };
  };

  it('Anthropic: resultados de ferramenta seguidos vão numa mensagem; lê texto e tool_use', async () => {
    const { anthropic } = await import('../lib/llm.js');
    const { f, chamadas } = capturar({ content: [{ type: 'text', text: 'Vou ver.' }, { type: 'tool_use', id: 't9', name: 'minhas_reservas', input: {} }] });
    const r = await anthropic('k', 'modelo-x', f).responder('sistema', historico, ferramentas);
    assert.deepEqual(r, { texto: 'Vou ver.', chamadas: [{ id: 't9', nome: 'minhas_reservas', argumentos: {} }] });
    const c = chamadas[0];
    assert.equal(c.url, 'https://api.anthropic.com/v1/messages');
    assert.equal(c.headers['x-api-key'], 'k');
    assert.equal(c.corpo.system, 'sistema');
    assert.deepEqual(c.corpo.messages.map((m: { role: string }) => m.role), ['user', 'assistant', 'user']);
    assert.deepEqual(c.corpo.messages[2].content.map((b: { tool_use_id: string }) => b.tool_use_id), ['c1', 'c2']);
    assert.equal(c.corpo.tools[0].input_schema.type, 'object');
  });

  it('compatível com OpenAI: tool_calls com argumentos em JSON; argumento quebrado vira vazio', async () => {
    const { compativelOpenAI } = await import('../lib/llm.js');
    const { f, chamadas } = capturar({ choices: [{ message: { content: null, tool_calls: [
      { id: 'x1', type: 'function', function: { name: 'consultar_disponibilidade', arguments: '{"entrada":"2026-12-20"}' } },
      { id: 'x2', type: 'function', function: { name: 'chamar_atendente', arguments: '{quebrado' } },
    ] } }] });
    const r = await compativelOpenAI('https://api.groq.com/openai/v1/', 'k', 'llama', f).responder('sistema', historico, ferramentas);
    assert.deepEqual(r.chamadas, [
      { id: 'x1', nome: 'consultar_disponibilidade', argumentos: { entrada: '2026-12-20' } },
      { id: 'x2', nome: 'chamar_atendente', argumentos: {} },
    ]);
    assert.equal(r.texto, null);
    const c = chamadas[0];
    assert.equal(c.url, 'https://api.groq.com/openai/v1/chat/completions');
    assert.equal(c.headers.Authorization, 'Bearer k');
    assert.deepEqual(c.corpo.messages.map((m: { role: string }) => m.role), ['system', 'user', 'assistant', 'tool', 'tool']);
    assert.equal(c.corpo.messages[2].tool_calls[0].function.arguments, '{"a":1}');
  });

  it('erro do provedor vira exceção (o atendimento passa para a equipe)', async () => {
    const { anthropic } = await import('../lib/llm.js');
    const f = (async () => new Response(JSON.stringify({ error: { message: 'overloaded' } }), { status: 529 })) as typeof fetch;
    await assert.rejects(anthropic('k', 'm', f).responder('s', historico, ferramentas), /overloaded/);
  });
});

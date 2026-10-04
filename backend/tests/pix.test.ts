/**
 * Pix copia e cola (BR Code).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { crc16, normalizarChavePix, payloadPix, qrCodeDataUrl } from '../lib/pix.js';

describe('Pix — BR Code', () => {
  it('CRC16-CCITT confere com o valor de referência', () => {
    assert.equal(crc16('123456789'), '29B1');
  });

  it('reproduz o exemplo do manual do Banco Central', () => {
    // Exemplo do Manual de Padrões para Iniciação do Pix (Pix estático sem valor).
    const payload = payloadPix({ chave: '123e4567-e12b-12d1-a456-426655440000', nome: 'Fulano de Tal', cidade: 'BRASILIA' });
    assert.equal(
      payload,
      '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D',
    );
  });

  it('inclui valor e txid, tira acento e respeita os tamanhos', () => {
    const p = payloadPix({ chave: '+5548999990000', nome: 'Pousada Ondas do Mar e Céu Azul Ltda', cidade: 'Florianópolis', valorCentavos: 21000, txid: 'RESERVA-22' });
    assert.ok(p.includes('5406210.00'));
    assert.ok(p.includes('5925Pousada Ondas do Mar e Ce'), p);
    assert.ok(p.includes('6013Florianopolis'));
    assert.ok(p.includes('62130509RESERVA22'), p);
    assert.equal(p.slice(-4), crc16(p.slice(0, -4)));
  });

  it('normaliza chaves e recusa as inválidas', () => {
    assert.equal(normalizarChavePix('telefone', '(48) 99999-0000'), '+5548999990000');
    assert.equal(normalizarChavePix('cpf', '529.982.247-25'), '52998224725');
    assert.equal(normalizarChavePix('cnpj', '12.345.678/0001-95'), '12345678000195');
    assert.equal(normalizarChavePix('email', 'Pousada@Exemplo.com'), 'pousada@exemplo.com');
    assert.equal(normalizarChavePix('aleatoria', 'nao-e-uuid'), null);
    assert.equal(normalizarChavePix('cpf', '123'), null);
  });

  it('gera o QR Code como imagem', async () => {
    const url = await qrCodeDataUrl(payloadPix({ chave: 'a@b.com', nome: 'X', cidade: 'Y', valorCentavos: 100 }));
    assert.match(url, /^data:image\/png;base64,/);
  });
});

describe('Pix — adaptador Asaas', () => {
  it('sandbox pela chave; reaproveita o cliente pelo CPF; cobrança Pix e código', async () => {
    const { asaas } = await import('../lib/gatewayPix.js');
    const chamadas: { url: string; metodo: string; corpo?: any; chave?: string }[] = [];
    const respostas: Record<string, unknown> = {
      'GET /customers?cpfCnpj=86288366757&limit=1': { data: [] },
      'POST /customers': { id: 'cus_1' },
      'POST /payments': { id: 'pay_9' },
      'GET /payments/pay_9/pixQrCode': { payload: '000201...asaas', expirationDate: '2026-12-01 23:59:59' },
      'GET /payments/pay_9': { status: 'RECEIVED', value: 150.5, externalReference: 'reserva-7' },
    };
    const falso = (async (url: string, init?: RequestInit) => {
      const u = new URL(url);
      const chave = (init?.headers as Record<string, string>)?.access_token;
      const rota = `${init?.method ?? 'GET'} ${u.pathname.replace('/v3', '')}${u.search}`;
      chamadas.push({ url, metodo: init?.method ?? 'GET', corpo: init?.body ? JSON.parse(String(init.body)) : undefined, chave });
      return new Response(JSON.stringify(respostas[rota] ?? {}), { status: rota in respostas ? 200 : 404 });
    }) as typeof fetch;
    const g = asaas('$aact_hmlg_abc', falso);
    const c = await g.criarCobranca({
      valorCentavos: 15050, descricao: 'Reserva #7', referencia: 'reserva-7', expiraEm: new Date('2026-12-01T12:00:00Z'),
      cliente: { nome: 'Ana', cpfCnpj: '86288366757', email: null, telefone: '5548999990000' },
    });
    assert.deepEqual([c.id, c.copiaECola], ['pay_9', '000201...asaas']);
    assert.ok(chamadas.every((x) => x.url.startsWith('https://api-sandbox.asaas.com/v3/') && x.chave === '$aact_hmlg_abc'));
    const pagamento = chamadas.find((x) => x.metodo === 'POST' && x.url.endsWith('/payments'))!.corpo;
    assert.deepEqual(pagamento, { customer: 'cus_1', billingType: 'PIX', value: 150.5, dueDate: '2026-12-01', description: 'Reserva #7', externalReference: 'reserva-7' });
    assert.equal(chamadas.find((x) => x.url.endsWith('/customers'))!.corpo.mobilePhone, '48999990000');
    assert.deepEqual(await g.consultar('pay_9'), { status: 'paga', valorCentavos: 15050, referencia: 'reserva-7' });
    await assert.rejects(g.consultar('../admin'), /inválido/);
    assert.ok(asaas('$aact_prod_x', falso) && true);
  });

  it('sem CPF o Asaas não cobra', async () => {
    const { asaas } = await import('../lib/gatewayPix.js');
    await assert.rejects(
      asaas('$aact_prod_x', (async () => new Response('{}')) as typeof fetch).criarCobranca({
        valorCentavos: 100, descricao: 'x', referencia: 'r', expiraEm: new Date(), cliente: { nome: 'A', cpfCnpj: null, email: null, telefone: null },
      }),
      /CPF/,
    );
  });
});

/**
 * Testes de regressão dos bugs encontrados na auditoria de 2026-08-03.
 *
 * Cada bloco aqui existe porque o comportamento oposto estava em produção.
 * Rode com: npm test
 *
 * Cobre só lógica pura — as garantias que dependem do banco (constraint
 * anti-overbooking) são verificadas contra um Postgres descartável em
 * `tests/banco.test.ts`.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { hojeLocal, compararDatas, eHojeOuFuturo } from '../utils/datas.js';
import { chaveDeRateLimit } from '../utils/rede.js';
import { redigirPII } from '../utils/pii.js';
import {
  validarReserva,
  sanitizarReserva,
  sanitizarNome,
  validarCPF,
} from '../utils/validation.js';

// CPF válido pelo módulo 11, usado só em teste.
const CPF_VALIDO = '52998224725';

describe('datas — fuso da operação, não UTC', () => {
  it('às 22h de Brasília ainda é o mesmo dia (era o dia seguinte em UTC)', () => {
    // 2026-08-04T01:00Z == 2026-08-03 22:00 em São Paulo
    assert.equal(hojeLocal(new Date('2026-08-04T01:00:00Z')), '2026-08-03');
  });

  it('às 15h de Brasília o dia é o corrente', () => {
    assert.equal(hojeLocal(new Date('2026-08-03T18:00:00Z')), '2026-08-03');
  });

  it('vira o dia à meia-noite local, não à meia-noite UTC', () => {
    assert.equal(hojeLocal(new Date('2026-08-04T02:59:00Z')), '2026-08-03');
    assert.equal(hojeLocal(new Date('2026-08-04T03:01:00Z')), '2026-08-04');
  });

  it('compara datas ISO cronologicamente', () => {
    assert.ok(compararDatas('2026-08-03', '2026-08-04') < 0);
    assert.ok(compararDatas('2026-12-01', '2026-11-30') > 0);
    assert.equal(compararDatas('2026-08-03', '2026-08-03'), 0);
  });

  it('hoje conta como "hoje ou futuro"', () => {
    assert.equal(eHojeOuFuturo(hojeLocal()), true);
  });
});

describe('reserva — validação de criação vs edição', () => {
  const base = {
    nome: 'Maria Souza',
    cpf: CPF_VALIDO,
    quarto: 3,
    data_entrada: '2020-01-10',
    data_saida: '2020-01-12',
    status: 'ativa',
  };

  it('recusa criar reserva com data no passado', () => {
    const r = validarReserva(base);
    assert.equal(r.valido, false);
    assert.ok(r.erros.some((e) => e.includes('passado')));
  });

  it('PERMITE editar reserva em andamento (corrigir nome de quem já fez check-in)', () => {
    const r = validarReserva(base, { permitirDataPassada: true });
    assert.equal(r.valido, true, `erros inesperados: ${r.erros.join(' | ')}`);
  });

  it('continua exigindo saída depois da entrada, mesmo na edição', () => {
    const r = validarReserva(
      { ...base, data_entrada: '2020-01-12', data_saida: '2020-01-10' },
      { permitirDataPassada: true },
    );
    assert.equal(r.valido, false);
  });
});

describe('reserva — sanitização', () => {
  it('preserva diária de cortesia (R$ 0,00) em vez de virar null', () => {
    assert.equal(sanitizarReserva({ valor: 0 } as never).valor, '0');
  });

  it('mantém null para valor ausente ou vazio', () => {
    assert.equal(sanitizarReserva({ valor: null } as never).valor, null);
    assert.equal(sanitizarReserva({ valor: '' } as never).valor, null);
    assert.equal(sanitizarReserva({} as never).valor, null);
  });

  it('não engole valor não numérico como NaN', () => {
    assert.equal(sanitizarReserva({ valor: 'abc' } as never).valor, null);
  });

  it('preserva apóstrofo e hífen em nomes brasileiros', () => {
    assert.equal(sanitizarNome("Maria Sant'Ana"), "Maria Sant'Ana");
    assert.equal(sanitizarNome('João Costa-Silva'), 'João Costa-Silva');
    assert.equal(sanitizarNome("Pedro D'Ávila"), "Pedro D'Ávila");
  });

  it('ainda remove caracteres de marcação', () => {
    assert.equal(sanitizarNome('<script>alert</script>'), 'scriptalertscript');
  });

  it('valida CPF pelo módulo 11', () => {
    assert.equal(validarCPF(CPF_VALIDO), true);
    assert.equal(validarCPF('11111111111'), false);
    assert.equal(validarCPF('12345678900'), false);
  });
});

describe('rate limit — IPv6 não pode ter orçamento infinito', () => {
  it('agrupa endereços do mesmo /64 na mesma chave', () => {
    const a = chaveDeRateLimit('2001:db8:abcd:1234:0000:0000:0000:0001');
    const b = chaveDeRateLimit('2001:db8:abcd:1234:ffff:ffff:ffff:ffff');
    assert.equal(a, b, 'dois endereços do mesmo /64 devem compartilhar o limite');
  });

  it('separa /64 diferentes', () => {
    const a = chaveDeRateLimit('2001:db8:abcd:1234::1');
    const b = chaveDeRateLimit('2001:db8:abcd:9999::1');
    assert.notEqual(a, b);
  });

  it('expande a forma abreviada corretamente', () => {
    assert.equal(
      chaveDeRateLimit('2001:db8::1'),
      chaveDeRateLimit('2001:0db8:0000:0000:0000:0000:0000:0002'),
    );
  });

  it('mantém IPv4 pelo endereço inteiro', () => {
    assert.equal(chaveDeRateLimit('203.0.113.7'), '203.0.113.7');
    assert.notEqual(chaveDeRateLimit('203.0.113.7'), chaveDeRateLimit('203.0.113.8'));
  });

  it('desembrulha IPv4 mapeado em IPv6', () => {
    assert.equal(chaveDeRateLimit('::ffff:203.0.113.7'), '203.0.113.7');
  });

  it('não deixa IP ausente virar chave compartilhada com um IP real', () => {
    assert.equal(chaveDeRateLimit(undefined), 'desconhecido');
  });
});

describe('auditoria — CPF nunca em texto puro no details', () => {
  it('redige o CPF do objeto da reserva', () => {
    const entrada = {
      depois: { id: 1, nome: 'Maria', cpf: CPF_VALIDO, cpfHash: 'abc', quarto: 3 },
    };
    const saida = redigirPII(entrada) as typeof entrada;
    assert.equal(saida.depois.cpf, '[redigido]');
    assert.equal(saida.depois.cpfHash, '[redigido]');
    assert.equal(saida.depois.nome, 'Maria', 'campos não sensíveis devem sobreviver');
    assert.equal(saida.depois.quarto, 3);
  });

  it('redige em antes e depois ao mesmo tempo', () => {
    const saida = redigirPII({
      antes: { cpf: CPF_VALIDO },
      depois: { cpf: '11122233396' },
    }) as Record<string, { cpf: string }>;
    assert.equal(saida.antes.cpf, '[redigido]');
    assert.equal(saida.depois.cpf, '[redigido]');
  });

  it('redige dentro de arrays e aninhamentos', () => {
    const saida = redigirPII({ lote: [{ reserva: { cpf: CPF_VALIDO } }] }) as {
      lote: { reserva: { cpf: string } }[];
    };
    assert.equal(saida.lote[0].reserva.cpf, '[redigido]');
  });

  it('aceita a variação snake_case do nome do campo', () => {
    const saida = redigirPII({ cpf_hash: 'abc' }) as Record<string, string>;
    assert.equal(saida.cpf_hash, '[redigido]');
  });

  it('não quebra com null nem com tipos primitivos', () => {
    assert.equal(redigirPII(null), null);
    assert.equal(redigirPII('texto'), 'texto');
    assert.equal(redigirPII(42), 42);
  });
});

describe('crypto — cifra e hash de CPF', () => {
  // Chave só de teste, fixa e descartável.
  process.env.CPF_ENCRYPTION_KEY =
    process.env.CPF_ENCRYPTION_KEY ||
    '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';

  it('faz round-trip da cifra', async () => {
    const { encryptCpf, decryptCpf } = await import('../utils/crypto.js');
    assert.equal(decryptCpf(encryptCpf(CPF_VALIDO)), CPF_VALIDO);
  });

  it('gera ciphertext diferente a cada chamada (IV aleatório)', async () => {
    const { encryptCpf } = await import('../utils/crypto.js');
    assert.notEqual(encryptCpf(CPF_VALIDO), encryptCpf(CPF_VALIDO));
  });

  it('recusa valor que não está no formato cifrado, em vez de devolvê-lo como CPF', async () => {
    const { decryptCpf } = await import('../utils/crypto.js');
    assert.throws(() => decryptCpf('52998224725'));
    assert.throws(() => decryptCpf('lixo qualquer'));
  });

  it('detecta adulteração do ciphertext (GCM autenticado)', async () => {
    const { encryptCpf, decryptCpf } = await import('../utils/crypto.js');
    const cifrado = encryptCpf(CPF_VALIDO);
    const [iv, tag, ct] = cifrado.split(':');
    const adulterado = `${iv}:${tag}:${ct.slice(0, -2)}AA`;
    assert.throws(() => decryptCpf(adulterado));
  });

  it('hash é determinístico e normaliza a formatação do CPF', async () => {
    const { hashCpf } = await import('../utils/crypto.js');
    assert.equal(hashCpf('529.982.247-25'), hashCpf(CPF_VALIDO));
  });

  it('hash é COM CHAVE — não é SHA-256 puro do CPF', async () => {
    const { hashCpf } = await import('../utils/crypto.js');
    const { createHash } = await import('node:crypto');
    const shaPuro = createHash('sha256').update(CPF_VALIDO).digest('hex');
    assert.notEqual(
      hashCpf(CPF_VALIDO),
      shaPuro,
      'um SHA-256 sem chave é varrido por força bruta em ~24 min: o hash precisa ser HMAC',
    );
  });
});

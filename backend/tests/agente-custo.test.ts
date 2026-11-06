/**
 * Custo do atendente virtual, contra Postgres real.
 *
 * Qualquer número de WhatsApp pode acionar o modelo de linguagem, então cada
 * teto aqui é o que separa uma conversa de uma conta do provedor sem limite.
 */
import { after, afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, temBanco } from './helpers/banco.js';
import type { MensagemLLM, RespostaLLM } from '../lib/llm.js';
import { COTA_AGENTE_TRIAL, PLANOS, cotaDoAgente } from '../config/planos.js';

const NUMERO = '700100200';

describe('atendente virtual — tetos de custo', { skip: !temBanco && 'DATABASE_URL não definida' }, () => {
  let descartar: () => Promise<void>;
  let fechar: () => Promise<void>;
  let pool: import('pg').Pool;
  let Whats: typeof import('../models/WhatsappBusiness.js');
  let envAntes: NodeJS.ProcessEnv;

  const enviadas: { para: string; texto: string }[] = [];
  const emails: { para: string; assunto: string }[] = [];
  const chamadasAoModelo: MensagemLLM[][] = [];
  let resposta: () => RespostaLLM = () => ({ texto: 'Olá!', chamadas: [], uso: { entrada: 100, saida: 20 } });
  let falhaNoEnvio = 0;
  let seq = 0;

  const entrada = (contato: string, texto: string, wamid = `wamid.${seq++}`) =>
    Whats.tratarEntrada({ phoneNumberId: NUMERO, contato, nome: 'Joana', wamid, tipo: 'text', texto });
  const paraContato = (contato: string) => enviadas.filter((e) => e.para === contato).map((e) => e.texto);
  const emailsDaFila = async () => {
    await new Promise((ok) => setTimeout(ok, 50));
    return emails;
  };

  before(async () => {
    ({ descartar } = await prepararBanco('agente_custo'));
    const dbmod = await import('../db/index.js');
    await (await import('../db/migrate.js')).runMigrations();
    pool = dbmod.pool;
    fechar = dbmod.closeConnection;

    envAntes = { ...process.env };
    process.env.AGENTE_API_KEY = 'chave-teste';
    process.env.META_APP_ID = '1';
    process.env.AGENTE_DEMO_SEM_BILLING = 'true';

    const { cifrarSegredo } = await import('../utils/crypto.js');
    await pool.query(`INSERT INTO pousadas (id, nome, slug, num_quartos, email) VALUES (1, 'Pousada Sol', 'sol', 5, 'sol@teste.com')`);
    await pool.query(`INSERT INTO assinaturas (pousada_id, status, trial_termina_em) VALUES (1, 'trial', now() + interval '10 days')`);
    await pool.query(
      `INSERT INTO whatsapp_contas (pousada_id, waba_id, phone_number_id, token_cifrado, agente_ativo) VALUES (1, '100200300', $1, $2, true)`,
      [NUMERO, cifrarSegredo('token')],
    );

    const { usarClienteMetaDeTeste } = await import('../lib/metaWhatsapp.js');
    usarClienteMetaDeTeste({
      async enviarTexto(_phone: string, _token: string, para: string, texto: string) {
        if (falhaNoEnvio > 0) { falhaNoEnvio--; throw new Error('Meta fora do ar'); }
        enviadas.push({ para, texto });
        return `wamid.S${seq++}`;
      },
    } as never);
    (await import('../lib/llm.js')).usarModeloDeTeste({
      async responder(_sistema, msgs) {
        chamadasAoModelo.push(structuredClone(msgs));
        return resposta();
      },
    });
    const { FILAS, registrarTrabalhador } = await import('../lib/fila.js');
    Whats = await import('../models/WhatsappBusiness.js');
    registrarTrabalhador(FILAS.email, async (d) => { emails.push({ para: String(d.para), assunto: String(d.assunto) }); });
  });

  after(async () => {
    (await import('../lib/metaWhatsapp.js')).usarClienteMetaDeTeste(null);
    (await import('../lib/llm.js')).usarModeloDeTeste(null);
    process.env = envAntes;
    await fechar?.();
    await descartar?.();
  });

  beforeEach(async () => {
    enviadas.length = 0;
    emails.length = 0;
    chamadasAoModelo.length = 0;
    falhaNoEnvio = 0;
    resposta = () => ({ texto: 'Olá!', chamadas: [], uso: { entrada: 100, saida: 20 } });
    await pool.query(`TRUNCATE whatsapp_conversas, agente_uso_diario, agente_alertas CASCADE`);
  });

  afterEach(() => {
    for (const k of ['AGENTE_LIMITE_CONTATO_HORA', 'AGENTE_TETO_GLOBAL_TOKENS_DIA', 'AGENTE_MAX_CHARS_MENSAGEM', 'AGENTE_MAX_CHARS_HISTORICO']) {
      delete process.env[k];
    }
    mock.restoreAll();
  });

  describe('tamanho do que vai ao modelo', () => {
    it('trunca a mensagem do hóspede em 2.000 caracteres, mas a equipe lê o texto inteiro', async () => {
      const contato = '5548900000001';
      const longa = 'a'.repeat(9000);
      await entrada(contato, longa);
      const ultima = chamadasAoModelo[0].at(-1) as { papel: 'usuario'; texto: string };
      assert.equal(ultima.papel, 'usuario');
      assert.equal(ultima.texto.length, 2000);

      const { rows: [c] } = await pool.query(`SELECT id FROM whatsapp_conversas WHERE contato = $1`, [contato]);
      const msgs = await Whats.mensagensDaConversa(1, c.id);
      assert.equal(msgs![0].texto.length, 9000);
    });

    it('o histórico inteiro respeita o teto total, mantendo as mensagens mais novas', async () => {
      const contato = '5548900000002';
      for (let i = 0; i < 6; i++) await entrada(contato, `${i}`.repeat(1900));
      const enviado = chamadasAoModelo.at(-1)!;
      const total = enviado.reduce((s, m) => s + ('texto' in m ? (m.texto ?? '').length : 0), 0);
      assert.ok(total <= 6000, `histórico com ${total} caracteres`);
      assert.equal(enviado[0].papel, 'usuario', 'o modelo precisa começar pelo hóspede');
      assert.ok((enviado.at(-1) as { texto: string }).texto.startsWith('5'), 'a última mensagem sempre vai');
    });
  });

  describe('ao bater um teto', () => {
    async function conferirAvisoEPassagem(contato: string, chamadasAntes: number) {
      assert.equal(chamadasAoModelo.length, chamadasAntes, 'o modelo não pode ser chamado');
      assert.match(paraContato(contato).at(-1)!, /equipe/i, 'o hóspede recebe um aviso em vez de silêncio');
      const { rows: [c] } = await pool.query(`SELECT modo FROM whatsapp_conversas WHERE contato = $1`, [contato]);
      assert.equal(c.modo, 'humano');
      assert.ok((await emailsDaFila()).some((e) => /quer falar com a equipe/.test(e.assunto)), 'a equipe é notificada');
    }

    it('limite por contato por hora: a mensagem seguinte não chega ao modelo', async () => {
      process.env.AGENTE_LIMITE_CONTATO_HORA = '2';
      const contato = '5548900000003';
      assert.equal(await entrada(contato, 'um'), 'respondeu');
      assert.equal(await entrada(contato, 'dois'), 'respondeu');
      assert.equal(await entrada(contato, 'três'), 'limite do contato');
      await conferirAvisoEPassagem(contato, 2);
    });

    it('teto diário em tokens por pousada', async () => {
      resposta = () => ({ texto: 'Olá!', chamadas: [], uso: { entrada: COTA_AGENTE_TRIAL.tokensDia, saida: 200 } });
      const contato = '5548900000004';
      assert.equal(await entrada(contato, 'um'), 'respondeu');
      assert.equal(await entrada(contato, 'dois'), 'limite diário');
      await conferirAvisoEPassagem(contato, 1);
    });

    it('teto diário em respostas por pousada também avisa o hóspede', async () => {
      const contato = '5548900000005';
      const { rows: [c] } = await pool.query(`INSERT INTO whatsapp_conversas (pousada_id, contato, aviso_enviado) VALUES (1, $1, true) RETURNING id`, [contato]);
      await pool.query(
        `INSERT INTO whatsapp_mensagens (conversa_id, direcao, texto_cifrado) SELECT $1, 'agente', NULL FROM generate_series(1, 1000)`,
        [c.id],
      );
      assert.equal(await entrada(contato, 'oi'), 'limite diário');
      await conferirAvisoEPassagem(contato, 0);
    });

    it('teto global desliga o atendente para todas as conversas e alerta uma vez só', async () => {
      process.env.AGENTE_TETO_GLOBAL_TOKENS_DIA = '1000';
      const erro = mock.method(console, 'error', () => {});
      resposta = () => ({ texto: 'Olá!', chamadas: [], uso: { entrada: 900, saida: 200 } });
      assert.equal(await entrada('5548900000006', 'um'), 'respondeu');
      assert.equal(await entrada('5548900000007', 'oi'), 'teto global');
      assert.equal(await entrada('5548900000008', 'oi'), 'teto global');
      await conferirAvisoEPassagem('5548900000008', 1);
      const alertas = erro.mock.calls.filter((c) => /teto global/i.test(String(c.arguments[0])));
      assert.equal(alertas.length, 1, 'alerta único por dia, não um por mensagem');
    });

    it('teto inválido no ambiente não desliga a proteção', async () => {
      process.env.AGENTE_TETO_GLOBAL_TOKENS_DIA = 'muito';
      const { limitesAgente } = await import('../config/agente.js');
      assert.ok(limitesAgente().tetoGlobalTokensDia > 0);
    });
  });

  describe('cota por plano', () => {
    const antes = { BILLING_ENABLED: process.env.BILLING_ENABLED, STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY };
    beforeEach(() => {
      process.env.BILLING_ENABLED = 'true';
      process.env.STRIPE_SECRET_KEY = 'sk_test_nao_usada';
    });
    afterEach(async () => {
      if (antes.BILLING_ENABLED === undefined) delete process.env.BILLING_ENABLED; else process.env.BILLING_ENABLED = antes.BILLING_ENABLED;
      if (antes.STRIPE_SECRET_KEY === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = antes.STRIPE_SECRET_KEY;
      await pool.query(`UPDATE assinaturas SET status = 'trial', plano = NULL, trial_termina_em = now() + interval '10 days' WHERE pousada_id = 1`);
    });

    it('cada plano tem a sua cota, e o trial fica abaixo de todos', () => {
      assert.ok(PLANOS.essencial.agente.tokensDia < PLANOS.pousada.agente.tokensDia);
      assert.ok(PLANOS.pousada.agente.tokensDia < PLANOS.rede.agente.tokensDia);
      assert.ok(COTA_AGENTE_TRIAL.tokensDia <= PLANOS.essencial.agente.tokensDia);
      assert.deepEqual(cotaDoAgente({ status: 'trial', plano: null }), COTA_AGENTE_TRIAL);
      assert.deepEqual(cotaDoAgente({ status: 'ativa', plano: 'rede' }), PLANOS.rede.agente);
      assert.deepEqual(cotaDoAgente({ status: 'cortesia', plano: null }), PLANOS.pousada.agente);
    });

    it('a cota vigente sai do plano da pousada: o mesmo consumo passa num plano e barra no outro', async () => {
      const contato = '5548900000040';
      await pool.query(
        `INSERT INTO agente_uso_diario (pousada_id, dia, tokens_entrada) VALUES (1, $1, $2)`,
        [(await import('../utils/datas.js')).hojeLocal(), PLANOS.essencial.agente.tokensDia],
      );
      await pool.query(`UPDATE assinaturas SET status = 'ativa', plano = 'essencial' WHERE pousada_id = 1`);
      assert.equal(await entrada(contato, 'oi'), 'limite diário');
      await pool.query(`UPDATE whatsapp_conversas SET modo = 'agente', humano_ate = NULL WHERE contato = $1`, [contato]);
      await pool.query(`UPDATE assinaturas SET plano = 'rede' WHERE pousada_id = 1`);
      assert.equal(await entrada(contato, 'oi de novo'), 'respondeu');
    });

    it('assinatura bloqueada não chama o modelo: o hóspede é avisado e a equipe, chamada', async () => {
      const contato = '5548900000041';
      await pool.query(`UPDATE assinaturas SET trial_termina_em = now() - interval '1 day' WHERE pousada_id = 1`);
      assert.equal(await entrada(contato, 'oi'), 'assinatura bloqueada');
      assert.equal(chamadasAoModelo.length, 0);
      assert.match(paraContato(contato).at(-1)!, /equipe/i);
      assert.ok((await emailsDaFila()).length > 0);
    });
  });

  describe('atendente com a cobrança desligada', () => {
    afterEach(() => { process.env.AGENTE_DEMO_SEM_BILLING = 'true'; });

    it('não liga e não chama o modelo, salvo a variável explícita de demonstração', async () => {
      delete process.env.AGENTE_DEMO_SEM_BILLING;
      await assert.rejects(Whats.definirAgente(1, true), (e: Error & { status?: number }) => e.status === 409 && /cobrança/.test(e.message));
      assert.equal(Whats.agenteDisponivel(), false);

      const contato = '5548900000050';
      assert.equal(await entrada(contato, 'oi'), 'agente desligado');
      assert.equal(chamadasAoModelo.length, 0);

      await Whats.definirAgente(1, false);
      process.env.AGENTE_DEMO_SEM_BILLING = 'true';
      assert.equal(Whats.agenteDisponivel(), true);
      await Whats.definirAgente(1, true);
      assert.equal(await entrada(contato, 'oi de novo'), 'respondeu');
    });
  });

  describe('custo de IA por pousada', () => {
    const custoIa = async () => (await pool.query(`SELECT valor_centavos, estimado, competencia FROM financeiro_lancamentos WHERE pousada_id = 1 AND categoria = 'custo_ia'`)).rows;

    beforeEach(async () => {
      await pool.query(`DELETE FROM financeiro_lancamentos`);
      Object.assign(process.env, { AGENTE_PRECO_ENTRADA_USD_MTOK: '2', AGENTE_PRECO_SAIDA_USD_MTOK: '10', AGENTE_COTACAO_USD_BRL: '5' });
    });
    afterEach(() => {
      for (const k of ['AGENTE_PRECO_ENTRADA_USD_MTOK', 'AGENTE_PRECO_SAIDA_USD_MTOK', 'AGENTE_COTACAO_USD_BRL']) delete process.env[k];
    });

    it('grava custo_ia na mesma execução, e o painel de margem reflete', async () => {
      resposta = () => ({ texto: 'Olá!', chamadas: [], uso: { entrada: 100_000, saida: 10_000 } });
      await entrada('5548900000020', 'oi');
      // (100 mil x US$ 2 + 10 mil x US$ 10) / 1 milhão = US$ 0,30 = R$ 1,50.
      const linhas = await custoIa();
      assert.equal(linhas.length, 1);
      assert.equal(linhas[0].valor_centavos, 150);
      assert.equal(linhas[0].estimado, false, 'tokens reais com preço configurado');

      const FinanceiroModel = (await import('../models/Financeiro.js')).default;
      const rel = await FinanceiroModel.relatorio(linhas[0].competencia);
      const linha = rel.linhas.find((l) => l.pousadaId === 1)!;
      assert.equal(linha.margem.custoPorCategoria.custo_ia, 150);
      assert.equal(linha.margem.margemCentavos, -150);
    });

    it('frações de centavo se acumulam em vez de sumir no arredondamento', async () => {
      // Cada chamada custa 0,4 centavo: arredondar uma a uma daria zero para sempre.
      resposta = () => ({ texto: 'Olá!', chamadas: [], uso: { entrada: 40_000 / 100, saida: 0 } });
      for (let i = 0; i < 3; i++) await entrada(`55489000003${i}`, 'oi');
      const { rows: [u] } = await pool.query(`SELECT custo_microcentavos FROM agente_uso_diario WHERE pousada_id = 1`);
      assert.equal(Number(u.custo_microcentavos), 1_200_000);
      assert.equal((await custoIa())[0].valor_centavos, 1);
    });

    it('sem preço configurado usa o padrão marcado como estimado, e o painel avisa', async () => {
      for (const k of ['AGENTE_PRECO_ENTRADA_USD_MTOK', 'AGENTE_PRECO_SAIDA_USD_MTOK', 'AGENTE_COTACAO_USD_BRL']) delete process.env[k];
      resposta = () => ({ texto: 'Olá!', chamadas: [], uso: { entrada: 100_000, saida: 10_000 } });
      await entrada('5548900000021', 'oi');
      const [l] = await custoIa();
      assert.ok(l.valor_centavos > 0);
      assert.equal(l.estimado, true);
      const { avisoDePrecoLLM } = await import('../config/agente.js');
      assert.match(avisoDePrecoLLM() ?? '', /AGENTE_PRECO/);
    });

    it('uso estimado pelo tamanho do texto marca o lançamento como estimado', async () => {
      resposta = () => ({ texto: 'x'.repeat(400), chamadas: [] });
      await entrada('5548900000022', 'y'.repeat(2000));
      assert.equal((await custoIa())[0].estimado, true);
    });
  });

  describe('contabilidade de tokens', () => {
    it('modelo que não informa uso é estimado em vez de virar zero', async () => {
      resposta = () => ({ texto: 'Resposta sem contagem de tokens.', chamadas: [] });
      await entrada('5548900000009', 'x'.repeat(400));
      const { rows: [u] } = await pool.query(`SELECT tokens_entrada, tokens_saida FROM agente_uso_diario WHERE pousada_id = 1`);
      assert.ok(Number(u.tokens_entrada) >= 100, 'estimativa pelo tamanho do texto');
      assert.ok(Number(u.tokens_saida) > 0);
    });

    it('cada rodada de ferramenta conta, inclusive quando a seguinte falha', async () => {
      let n = 0;
      resposta = () => {
        n++;
        if (n === 1) return { texto: null, chamadas: [{ id: 't1', nome: 'minhas_reservas', argumentos: {} }], uso: { entrada: 300, saida: 40 } };
        throw new Error('modelo fora do ar');
      };
      await entrada('5548900000010', 'oi');
      const { rows: [u] } = await pool.query(`SELECT chamadas, tokens_entrada, tokens_saida FROM agente_uso_diario WHERE pousada_id = 1`);
      assert.deepEqual([u.chamadas, Number(u.tokens_entrada), Number(u.tokens_saida)], [1, 300, 40]);
    });
  });
});

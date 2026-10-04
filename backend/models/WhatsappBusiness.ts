/**
 * WhatsApp Business da pousada (migration 025): conexão pelo Embedded
 * Signup, recebimento das mensagens (webhook único para todas as pousadas)
 * e atendimento pelo agente, com passagem para a equipe.
 */
import { randomInt } from 'node:crypto';
import { pool } from '../db/index.js';
import { meta, MODELOS_PADRAO } from '../lib/metaWhatsapp.js';
import { agenteConfigurado, type MensagemLLM } from '../lib/llm.js';
import { enfileirar, FILAS, registrarTrabalhador } from '../lib/fila.js';
import { enviarAtendimentoSolicitado } from '../lib/email.js';
import { cifrarSegredo, decifrarSegredo } from '../utils/crypto.js';
import { responder } from './Agente.js';
import { emailsDaPousada } from './Motor.js';

/** Equipe respondeu: o agente fica calado por este tempo. */
const HORAS_HUMANO = 12;
const LIMITE_DIARIO = () => Number(process.env.AGENTE_LIMITE_DIARIO) || 300;

export class WhatsappRecusado extends Error {
  constructor(mensagem: string, readonly status: 400 | 404 | 409 | 502 = 400) {
    super(mensagem);
    this.name = 'WhatsappRecusado';
  }
}

interface Conta { pousada_id: number; waba_id: string; phone_number_id: string; token: string; agente_ativo: boolean; coexistencia: boolean }

async function contaPorNumero(phoneNumberId: string): Promise<Conta | null> {
  const { rows: [c] } = await pool.query(
    `SELECT w.* FROM whatsapp_contas w JOIN pousadas p ON p.id = w.pousada_id WHERE w.phone_number_id = $1 AND p.excluida_em IS NULL`,
    [phoneNumberId],
  );
  return c ? { ...c, token: decifrarSegredo(c.token_cifrado) } : null;
}

export async function contaDaPousada(pousadaId: number): Promise<Conta | null> {
  const { rows: [c] } = await pool.query(`SELECT * FROM whatsapp_contas WHERE pousada_id = $1`, [pousadaId]);
  return c ? { ...c, token: decifrarSegredo(c.token_cifrado) } : null;
}

export async function situacao(pousadaId: number) {
  const { rows: [c] } = await pool.query(
    `SELECT numero_exibicao, nome_verificado, coexistencia, agente_ativo, modelos_criados, conectado_em FROM whatsapp_contas WHERE pousada_id = $1`,
    [pousadaId],
  );
  return c
    ? { conectado: true, numero: c.numero_exibicao, nome: c.nome_verificado, coexistencia: c.coexistencia, agenteAtivo: c.agente_ativo, modelosCriados: c.modelos_criados, conectadoEm: c.conectado_em }
    : { conectado: false };
}

/**
 * Fim do Embedded Signup: troca o código pelo token da conta da pousada,
 * assina os webhooks, registra o número na Cloud API (exceto coexistência,
 * em que o número segue no app do celular) e cria os modelos de mensagem.
 */
export async function conectar(pousadaId: number, d: { code: string; wabaId: string; phoneNumberId: string; coexistencia: boolean }) {
  if (!/^\d{5,30}$/.test(d.wabaId) || !/^\d{5,30}$/.test(d.phoneNumberId) || !d.code) {
    throw new WhatsappRecusado('Dados do cadastro do WhatsApp incompletos. Tente conectar de novo.');
  }
  const { rows: [outra] } = await pool.query(`SELECT pousada_id FROM whatsapp_contas WHERE phone_number_id = $1 AND pousada_id <> $2`, [d.phoneNumberId, pousadaId]);
  if (outra) throw new WhatsappRecusado('Este número já está conectado a outra pousada.', 409);
  const m = meta();
  let token: string;
  try {
    token = await m.trocarCodigo(d.code);
    await m.assinarWebhooks(d.wabaId, token);
    if (!d.coexistencia) await m.registrarNumero(d.phoneNumberId, token, String(randomInt(100000, 1000000)));
  } catch (err) {
    throw new WhatsappRecusado(`Não foi possível concluir a conexão com a Meta (${(err as Error).message}).`, 502);
  }
  const numero = await m.dadosDoNumero(d.phoneNumberId, token).catch(() => ({ numero: null, nome: null }));
  await pool.query(
    `INSERT INTO whatsapp_contas (pousada_id, waba_id, phone_number_id, numero_exibicao, nome_verificado, token_cifrado, coexistencia)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (pousada_id) DO UPDATE SET waba_id = EXCLUDED.waba_id, phone_number_id = EXCLUDED.phone_number_id,
       numero_exibicao = EXCLUDED.numero_exibicao, nome_verificado = EXCLUDED.nome_verificado, token_cifrado = EXCLUDED.token_cifrado,
       coexistencia = EXCLUDED.coexistencia, modelos_criados = false, atualizado_em = now()`,
    [pousadaId, d.wabaId, d.phoneNumberId, numero.numero, numero.nome, cifrarSegredo(token), d.coexistencia],
  );
  // Modelos para mensagens iniciadas pela pousada (lembrete, confirmação). A
  // Meta aprova em minutos a horas; falha aqui não impede a conexão.
  let criados = 0;
  for (const modelo of MODELOS_PADRAO) {
    await m.criarModelo(d.wabaId, token, modelo).then(() => { criados++; }).catch((e: Error) => console.warn(`[WhatsApp] modelo ${modelo.nome}:`, e.message));
  }
  if (criados === MODELOS_PADRAO.length) await pool.query(`UPDATE whatsapp_contas SET modelos_criados = true WHERE pousada_id = $1`, [pousadaId]);
  return situacao(pousadaId);
}

export async function desconectar(pousadaId: number): Promise<void> {
  const conta = await contaDaPousada(pousadaId);
  if (!conta) return;
  // Avisa a Meta para parar de mandar eventos desta conta (sem isso o webhook
  // só os ignora). Falha aqui não impede desconectar.
  await meta().desassinarWebhooks(conta.waba_id, conta.token).catch((e: Error) => console.warn('[WhatsApp] desassinar webhooks:', e.message));
  await pool.query(`DELETE FROM whatsapp_contas WHERE pousada_id = $1`, [pousadaId]);
}

export async function definirAgente(pousadaId: number, ativo: boolean): Promise<void> {
  if (ativo && !agenteConfigurado()) throw new WhatsappRecusado('O atendente virtual ainda não está disponível nesta instalação.', 409);
  const r = await pool.query(`UPDATE whatsapp_contas SET agente_ativo = $2, atualizado_em = now() WHERE pousada_id = $1`, [pousadaId, ativo]);
  if (!r.rowCount) throw new WhatsappRecusado('Conecte o WhatsApp primeiro.', 404);
}

// ---------------------------------------------------------------------------
// Recebimento

export interface Entrada {
  phoneNumberId: string;
  contato: string;
  nome: string | null;
  wamid: string;
  tipo: string;
  texto: string | null;
}

/**
 * Lê o corpo do webhook (já com assinatura conferida). Mensagem de hóspede
 * vai para a fila (resposta rápida para a Meta; o agente roda depois, com
 * retentativa). Eco de mensagem enviada pelo app do celular (coexistência)
 * marca que a equipe assumiu a conversa.
 */
export async function receberWebhook(corpo: Record<string, any>): Promise<number> {
  let n = 0;
  for (const entrada of corpo?.entry ?? []) {
    for (const mudanca of entrada?.changes ?? []) {
      const v = mudanca?.value ?? {};
      const phoneNumberId = String(v.metadata?.phone_number_id ?? '');
      if (!phoneNumberId) continue;
      if (mudanca.field === 'messages') {
        const nomes = new Map<string, string>((v.contacts ?? []).map((c: any) => [String(c.wa_id), c.profile?.name ?? null]));
        for (const m of v.messages ?? []) {
          const contato = String(m.from ?? '').replace(/\D/g, '');
          if (!contato || !m.id) continue;
          const texto = m.type === 'text' ? m.text?.body ?? '' : m.type === 'button' ? m.button?.text ?? '' : m.type === 'interactive' ? (m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? '') : null;
          await enfileirar(FILAS.whatsappEntrada, { phoneNumberId, contato, nome: nomes.get(contato) ?? null, wamid: String(m.id), tipo: String(m.type), texto } satisfies Entrada as unknown as Record<string, unknown>);
          n++;
        }
      } else if (mudanca.field === 'smb_message_echoes') {
        for (const m of v.message_echoes ?? []) {
          await registrarEco(phoneNumberId, String(m.to ?? '').replace(/\D/g, ''), String(m.id ?? ''), m.type === 'text' ? m.text?.body ?? '' : `[${m.type}]`);
          n++;
        }
      }
    }
  }
  return n;
}

async function conversa(pousadaId: number, contato: string, nome: string | null) {
  const { rows: [c] } = await pool.query(
    `INSERT INTO whatsapp_conversas (pousada_id, contato, nome_contato) VALUES ($1, $2, $3)
     ON CONFLICT (pousada_id, contato) DO UPDATE SET nome_contato = COALESCE(EXCLUDED.nome_contato, whatsapp_conversas.nome_contato)
     RETURNING *`,
    [pousadaId, contato, nome],
  );
  return c;
}

/** Grava a mensagem; devolve o id, ou null se o wamid já estava gravado. */
async function gravar(conversaId: number, direcao: 'entrada' | 'agente' | 'equipe' | 'sistema', texto: string | null, wamid: string | null): Promise<number | null> {
  const { rows: [m] } = await pool.query(
    `INSERT INTO whatsapp_mensagens (conversa_id, wamid, direcao, texto_cifrado) VALUES ($1, $2, $3, $4) ON CONFLICT (wamid) DO NOTHING RETURNING id`,
    [conversaId, wamid || null, direcao, texto ? cifrarSegredo(texto) : null],
  );
  await pool.query(`UPDATE whatsapp_conversas SET ultima_mensagem_em = now() WHERE id = $1`, [conversaId]);
  return m?.id ?? null;
}

/**
 * Mensagem já gravada (reenvio da Meta ou retentativa da fila): só volta a
 * ser tratada se nada saiu depois dela — a tentativa anterior falhou antes
 * de responder.
 */
async function idSemResposta(conversaId: number, wamid: string): Promise<number | null> {
  const { rows: [m] } = await pool.query(
    `SELECT m.id FROM whatsapp_mensagens m
      WHERE m.wamid = $1 AND m.conversa_id = $2
        AND NOT EXISTS (SELECT 1 FROM whatsapp_mensagens d WHERE d.conversa_id = m.conversa_id AND d.id > m.id)`,
    [wamid, conversaId],
  );
  return m?.id ?? null;
}

/** Chegou outra mensagem do hóspede depois desta? A resposta fica para a mais nova (com o histórico todo). */
async function superada(conversaId: number, entradaId: number): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM whatsapp_mensagens WHERE conversa_id = $1 AND direcao = 'entrada' AND id > $2 LIMIT 1`,
    [conversaId, entradaId],
  );
  return rows.length > 0;
}

async function registrarEco(phoneNumberId: string, contato: string, wamid: string, texto: string) {
  const conta = await contaPorNumero(phoneNumberId);
  if (!conta || !contato) return;
  const c = await conversa(conta.pousada_id, contato, null);
  if ((await gravar(c.id, 'equipe', texto, wamid || null)) !== null) {
    await pool.query(`UPDATE whatsapp_conversas SET modo = 'humano', humano_ate = now() + make_interval(hours => $2) WHERE id = $1`, [c.id, HORAS_HUMANO]);
  }
}

async function enviar(conta: Conta, conversaId: number, contato: string, texto: string, direcao: 'agente' | 'sistema' | 'equipe') {
  const wamid = await meta().enviarTexto(conta.phone_number_id, conta.token, contato, texto);
  await gravar(conversaId, direcao, texto, wamid || null);
}

async function passarParaEquipe(conta: Conta, c: { id: number; contato: string; nome_contato: string | null }, motivo: string) {
  await pool.query(`UPDATE whatsapp_conversas SET modo = 'humano', humano_ate = now() + make_interval(hours => $2) WHERE id = $1`, [c.id, HORAS_HUMANO]);
  const { rows: [p] } = await pool.query(`SELECT nome FROM pousadas WHERE id = $1`, [conta.pousada_id]);
  const base = (process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
  void emailsDaPousada(conta.pousada_id)
    .then((emails) => enviarAtendimentoSolicitado(emails, { pousada: p?.nome ?? '', contato: c.contato, nome: c.nome_contato, motivo, link: `${base}/whatsapp?conversa=${c.id}` }))
    .catch((e) => console.error('[WhatsApp] aviso de atendimento:', e));
}

const PARAR = /^(parar|pare|sair|stop|cancelar mensagens|não quero mais mensagens|nao quero mais mensagens)$/i;
const VOLTAR = /^(voltar|start|quero receber)$/i;
const HUMANO = /\b(atendente|humano|pessoa|recep[cç][aã]o|falar com algu[eé]m)\b/i;

/** Trata uma mensagem recebida (job da fila). */
export async function tratarEntrada(e: Entrada): Promise<string> {
  const conta = await contaPorNumero(e.phoneNumberId);
  if (!conta) return 'número desconhecido';
  const c = await conversa(conta.pousada_id, e.contato, e.nome);
  const entradaId = (await gravar(c.id, 'entrada', e.texto ?? `[${e.tipo}]`, e.wamid)) ?? (await idSemResposta(c.id, e.wamid));
  if (entradaId === null) return 'repetida';
  await pool.query(`UPDATE whatsapp_conversas SET janela_ate = now() + interval '24 hours' WHERE id = $1`, [c.id]);
  const texto = (e.texto ?? '').trim();

  if (PARAR.test(texto)) {
    await pool.query(`UPDATE whatsapp_conversas SET optout = true WHERE id = $1`, [c.id]);
    await enviar(conta, c.id, e.contato, 'Tudo bem, você não vai mais receber mensagens automáticas. Para voltar, responda "voltar".', 'sistema');
    return 'optout';
  }
  if (c.optout) {
    if (!VOLTAR.test(texto)) return 'optout ativo';
    await pool.query(`UPDATE whatsapp_conversas SET optout = false WHERE id = $1`, [c.id]);
    await enviar(conta, c.id, e.contato, 'Pronto, você voltou a receber nossas mensagens.', 'sistema');
    return 'voltou';
  }
  if (!conta.agente_ativo || !agenteConfigurado()) return 'agente desligado';
  if (c.modo === 'humano' && c.humano_ate && new Date(c.humano_ate) > new Date()) return 'equipe na conversa';

  if (!c.aviso_enviado) {
    const { rows: [p] } = await pool.query(`SELECT nome FROM pousadas WHERE id = $1`, [conta.pousada_id]);
    const base = (process.env.APP_URL || process.env.FRONTEND_URL || '').replace(/\/$/, '');
    await enviar(conta, c.id, e.contato,
      `Olá! Sou o atendente virtual da ${p?.nome ?? 'pousada'}: consulto vagas e preços e faço sua pré-reserva. Seus dados são usados só para o seu atendimento${base ? ` (${base}/privacidade)` : ''}. Para falar com uma pessoa, escreva "atendente".`,
      'sistema');
    await pool.query(`UPDATE whatsapp_conversas SET aviso_enviado = true WHERE id = $1`, [c.id]);
  }
  if (e.texto === null) {
    await enviar(conta, c.id, e.contato, 'Por enquanto entendo só mensagens de texto. Vou chamar alguém da equipe para ver isso com você.', 'agente');
    await passarParaEquipe(conta, c, `mensagem do tipo ${e.tipo}`);
    return 'não-texto';
  }
  if (HUMANO.test(texto)) {
    await enviar(conta, c.id, e.contato, 'Certo! Vou chamar alguém da equipe. Em instantes alguém responde por aqui.', 'agente');
    await passarParaEquipe(conta, c, 'hóspede pediu atendimento');
    return 'pediu humano';
  }

  // Teto diário de respostas do agente por pousada (custo previsível).
  const { rows: [uso] } = await pool.query(
    `SELECT count(*)::int AS n FROM whatsapp_mensagens m JOIN whatsapp_conversas cv ON cv.id = m.conversa_id
      WHERE cv.pousada_id = $1 AND m.direcao = 'agente' AND m.created_at > now() - interval '1 day'`,
    [conta.pousada_id],
  );
  if (uso.n >= LIMITE_DIARIO()) {
    await passarParaEquipe(conta, c, 'limite diário do atendente virtual');
    return 'limite diário';
  }

  if (await superada(c.id, entradaId)) return 'superada';
  const historico = await historicoParaAgente(c.id);
  let r: { texto: string; transferir?: string };
  try {
    r = await responder({ pousadaId: conta.pousada_id, conversaId: c.id, contato: e.contato, nomeContato: c.nome_contato ?? e.nome }, historico);
  } catch (err) {
    // Provedor do modelo fora do ar: o hóspede não fica sem resposta.
    console.error('[WhatsApp] atendente virtual falhou:', err);
    r = { texto: 'Desculpe, tive um problema para responder agora. Vou chamar alguém da equipe.', transferir: 'falha do atendente virtual' };
  }
  if (await superada(c.id, entradaId)) return 'superada';
  await enviar(conta, c.id, e.contato, r.texto, 'agente');
  if (r.transferir) await passarParaEquipe(conta, c, r.transferir);
  return r.transferir ? 'respondeu e passou para a equipe' : 'respondeu';
}

/** Últimas mensagens da conversa, no formato do modelo (mensagens da equipe entram como do atendente). */
async function historicoParaAgente(conversaId: number): Promise<MensagemLLM[]> {
  const { rows } = await pool.query(
    `SELECT direcao, texto_cifrado FROM (SELECT * FROM whatsapp_mensagens WHERE conversa_id = $1 ORDER BY id DESC LIMIT 12) t ORDER BY id`,
    [conversaId],
  );
  const msgs: MensagemLLM[] = [];
  for (const r of rows) {
    const texto = r.texto_cifrado ? decifrarSegredo(r.texto_cifrado) : '';
    if (!texto || r.direcao === 'sistema') continue;
    const nova: MensagemLLM = r.direcao === 'entrada' ? { papel: 'usuario', texto } : { papel: 'assistente', texto };
    // Mensagens seguidas do mesmo lado viram uma (os provedores alternam papéis).
    const ultima = msgs.at(-1);
    if (ultima && ultima.papel === nova.papel && 'texto' in ultima && ultima.texto) ultima.texto += `\n${texto}`;
    else msgs.push(nova);
  }
  // O modelo precisa começar e terminar com o hóspede.
  while (msgs.length && msgs[0].papel !== 'usuario') msgs.shift();
  return msgs;
}

registrarTrabalhador(FILAS.whatsappEntrada, async (dados) => {
  const r = await tratarEntrada(dados as unknown as Entrada);
  console.log(`[WhatsApp] entrada ${(dados as unknown as Entrada).wamid}: ${r}`);
});

// ---------------------------------------------------------------------------
// Painel: conversas

export async function listarConversas(pousadaId: number) {
  const { rows } = await pool.query(
    `SELECT c.id, c.contato, c.nome_contato, c.modo, c.humano_ate, c.optout, c.janela_ate, c.ultima_mensagem_em,
            (SELECT m.texto_cifrado FROM whatsapp_mensagens m WHERE m.conversa_id = c.id ORDER BY m.id DESC LIMIT 1) AS ultima
       FROM whatsapp_conversas c WHERE c.pousada_id = $1 ORDER BY c.ultima_mensagem_em DESC LIMIT 100`,
    [pousadaId],
  );
  return rows.map((r) => ({
    id: r.id, contato: r.contato, nome: r.nome_contato, optout: r.optout, ultimaEm: r.ultima_mensagem_em,
    equipeAte: r.modo === 'humano' && r.humano_ate && new Date(r.humano_ate) > new Date() ? r.humano_ate : null,
    janelaAberta: Boolean(r.janela_ate && new Date(r.janela_ate) > new Date()),
    ultima: r.ultima ? decifrarSegredo(r.ultima).slice(0, 120) : '',
  }));
}

export async function mensagensDaConversa(pousadaId: number, conversaId: number) {
  const { rows: [c] } = await pool.query(`SELECT id FROM whatsapp_conversas WHERE id = $1 AND pousada_id = $2`, [conversaId, pousadaId]);
  if (!c) return null;
  const { rows } = await pool.query(
    `SELECT id, direcao, texto_cifrado, created_at FROM whatsapp_mensagens WHERE conversa_id = $1 ORDER BY id DESC LIMIT 200`,
    [conversaId],
  );
  return rows.reverse().map((m) => ({ id: m.id, direcao: m.direcao, texto: m.texto_cifrado ? decifrarSegredo(m.texto_cifrado) : '', em: m.created_at }));
}

/** Equipe responde pelo painel (dentro da janela de 24h) e assume a conversa. */
export async function responderPelaEquipe(pousadaId: number, conversaId: number, texto: string): Promise<void> {
  const { rows: [c] } = await pool.query(`SELECT * FROM whatsapp_conversas WHERE id = $1 AND pousada_id = $2`, [conversaId, pousadaId]);
  if (!c) throw new WhatsappRecusado('Conversa não encontrada.', 404);
  if (!c.janela_ate || new Date(c.janela_ate) < new Date()) {
    throw new WhatsappRecusado('Passaram 24 horas da última mensagem do hóspede: a Meta só permite mensagem por modelo aprovado. Responda quando ele escrever de novo.', 409);
  }
  const conta = await contaDaPousada(pousadaId);
  if (!conta) throw new WhatsappRecusado('Conecte o WhatsApp primeiro.', 404);
  try {
    await enviar(conta, c.id, c.contato, texto.slice(0, 4000), 'equipe');
  } catch (err) {
    throw new WhatsappRecusado(`A Meta recusou o envio (${(err as Error).message}).`, 502);
  }
  await pool.query(`UPDATE whatsapp_conversas SET modo = 'humano', humano_ate = now() + make_interval(hours => $2) WHERE id = $1`, [c.id, HORAS_HUMANO]);
}

export async function devolverAoAgente(pousadaId: number, conversaId: number): Promise<boolean> {
  const r = await pool.query(`UPDATE whatsapp_conversas SET modo = 'agente', humano_ate = NULL WHERE id = $1 AND pousada_id = $2`, [conversaId, pousadaId]);
  return (r.rowCount ?? 0) > 0;
}

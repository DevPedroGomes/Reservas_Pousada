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
import { reportarErro } from '../lib/observabilidade.js';
import { limitesAgente } from '../config/agente.js';
import { cotaDoAgente } from '../config/planos.js';
import { billingHabilitado } from '../lib/stripe.js';
import { hojeLocal } from '../utils/datas.js';
import AssinaturaModel from './Assinatura.js';
import { responder } from './Agente.js';
import { primeiroAlerta, tokensHojeDaPlataforma, tokensHojeDaPousada } from './AgenteUso.js';
import { emailsDaPousada } from './Motor.js';

/** Equipe respondeu: o agente fica calado por este tempo. */
const HORAS_HUMANO = 12;

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

/** Pousada em trial tentando conectar uma WABA que já passou por outra pousada? */
async function wabaJaUsadaEmTrial(pousadaId: number, wabaId: string): Promise<boolean> {
  if (!billingHabilitado()) return false;
  const efetiva = await AssinaturaModel.efetiva(pousadaId);
  if (efetiva?.row.status !== 'trial') return false;
  const { rows } = await pool.query(`SELECT 1 FROM whatsapp_wabas_usadas WHERE waba_id = $1 AND pousada_id <> $2`, [wabaId, pousadaId]);
  return rows.length > 0;
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
  if (await wabaJaUsadaEmTrial(pousadaId, d.wabaId)) {
    throw new WhatsappRecusado('Este WhatsApp já foi usado em outra pousada do Diária. Assine um plano para conectá-lo aqui.', 409);
  }
  const m = meta();
  let token: string;
  try {
    token = await m.trocarCodigo(d.code);
    await m.assinarWebhooks(d.wabaId, token);
    if (!d.coexistencia) await m.registrarNumero(d.phoneNumberId, token, String(randomInt(100000, 1000000)));
  } catch (err) {
    // O detalhe da Meta fica no log; pode citar token ou identificadores internos.
    console.error('[WhatsApp] conexão recusada pela Meta:', (err as Error).message);
    throw new WhatsappRecusado('A Meta recusou a conexão. Confira o número escolhido e tente de novo.', 502);
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
  await pool.query(`INSERT INTO whatsapp_wabas_usadas (waba_id, pousada_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [d.wabaId, pousadaId]);
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

/**
 * O atendente custa dinheiro a cada resposta, e sem cobrança nenhuma pousada paga
 * por isso nem tem plano que limite o uso. Só roda sem billing com a variável
 * explícita de demonstração.
 */
function cobrancaPermiteAgente(): boolean {
  return billingHabilitado() || process.env.AGENTE_DEMO_SEM_BILLING === 'true';
}

export function agenteDisponivel(): boolean {
  return agenteConfigurado() && cobrancaPermiteAgente();
}

export async function definirAgente(pousadaId: number, ativo: boolean): Promise<void> {
  if (ativo && !agenteConfigurado()) throw new WhatsappRecusado('O atendente virtual ainda não está disponível nesta instalação.', 409);
  if (ativo && !cobrancaPermiteAgente()) throw new WhatsappRecusado('O atendente virtual depende da cobrança ativa, que está desligada nesta instalação.', 409);
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
          const entrada: Entrada = { phoneNumberId, contato, nome: nomes.get(contato) ?? null, wamid: String(m.id), tipo: String(m.type), texto };
          // A tabela de jobs não guarda a conversa em claro: o conteúdo vai cifrado, como em whatsapp_mensagens.
          await enfileirar(FILAS.whatsappEntrada, { cifrado: cifrarSegredo(JSON.stringify(entrada)) });
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
 * de responder. Com resposta pendente, só a própria resposta do atendente conta:
 * o aviso de privacidade pode ter saído antes da falha.
 */
async function idSemResposta(conversaId: number, wamid: string): Promise<number | null> {
  const { rows: [m] } = await pool.query(
    `SELECT m.id FROM whatsapp_mensagens m
      WHERE m.wamid = $1 AND m.conversa_id = $2
        AND NOT EXISTS (
          SELECT 1 FROM whatsapp_mensagens d
           WHERE d.conversa_id = m.conversa_id AND d.id > m.id
             AND (m.resposta_pendente_cifrada IS NULL OR d.direcao = 'agente')
        )`,
    [wamid, conversaId],
  );
  return m?.id ?? null;
}

interface RespostaDoAgente { texto: string; transferir?: string }

/** Resposta já paga ao modelo e ainda não entregue. */
async function respostaPendente(entradaId: number): Promise<RespostaDoAgente | null> {
  const { rows: [m] } = await pool.query(
    `SELECT resposta_pendente_cifrada, resposta_transferir FROM whatsapp_mensagens WHERE id = $1`,
    [entradaId],
  );
  if (!m?.resposta_pendente_cifrada) return null;
  return { texto: decifrarSegredo(m.resposta_pendente_cifrada), transferir: m.resposta_transferir ?? undefined };
}

async function guardarResposta(entradaId: number, r: RespostaDoAgente): Promise<void> {
  await pool.query(
    `UPDATE whatsapp_mensagens SET resposta_pendente_cifrada = $2, resposta_transferir = $3 WHERE id = $1`,
    [entradaId, cifrarSegredo(r.texto), r.transferir ?? null],
  );
}

async function limparResposta(entradaId: number): Promise<void> {
  await pool.query(`UPDATE whatsapp_mensagens SET resposta_pendente_cifrada = NULL, resposta_transferir = NULL WHERE id = $1`, [entradaId]);
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

const AVISO_TETO = 'No momento o atendente virtual não consegue continuar por aqui. Já avisei a equipe da pousada e alguém vai responder você em breve.';

interface Barreira { codigo: string; motivo: string }

/**
 * Algum teto de custo impede chamar o modelo agora? Só lê: quem decide o que
 * dizer ao hóspede e à equipe é o chamador.
 */
async function barreiraDeCusto(pousadaId: number, conversaId: number): Promise<Barreira | null> {
  const limites = limitesAgente();

  // Com a cobrança desligada (demonstração), vale a menor cota.
  let cota = cotaDoAgente({ status: 'trial', plano: null });
  if (billingHabilitado()) {
    const veredito = await AssinaturaModel.vereditoDaPousada(pousadaId);
    if (veredito && !veredito.liberado) {
      return { codigo: 'assinatura bloqueada', motivo: 'a assinatura da pousada precisa de atenção, e o atendente virtual fica parado até regularizar' };
    }
    const efetiva = await AssinaturaModel.efetiva(pousadaId);
    if (efetiva) cota = cotaDoAgente(AssinaturaModel.paraEstado(efetiva.row));
  }

  const { rows: [contato] } = await pool.query(
    `SELECT count(*)::int AS n FROM whatsapp_mensagens WHERE conversa_id = $1 AND direcao = 'entrada' AND created_at > now() - interval '1 hour'`,
    [conversaId],
  );
  if (contato.n > limites.mensagensContatoHora) {
    return { codigo: 'limite do contato', motivo: 'muitas mensagens deste contato na última hora' };
  }

  const tokensPlataforma = await tokensHojeDaPlataforma();
  if (tokensPlataforma >= limites.tetoGlobalTokensDia) {
    if (await primeiroAlerta(`teto-global:${hojeLocal()}`)) {
      const erro = new Error(`Teto global do atendente virtual atingido: ${tokensPlataforma} tokens hoje (teto ${limites.tetoGlobalTokensDia}). O atendente fica desligado até a virada do dia.`);
      console.error(erro.message);
      reportarErro(erro, { origem: 'agente_teto_global' });
    }
    return { codigo: 'teto global', motivo: 'atendente virtual indisponível no momento' };
  }

  if ((await tokensHojeDaPousada(pousadaId)) >= cota.tokensDia) {
    return { codigo: 'limite diário', motivo: 'limite diário do atendente virtual' };
  }
  const { rows: [uso] } = await pool.query(
    `SELECT count(*)::int AS n FROM whatsapp_mensagens m JOIN whatsapp_conversas cv ON cv.id = m.conversa_id
      WHERE cv.pousada_id = $1 AND m.direcao = 'agente' AND m.created_at > now() - interval '1 day'`,
    [pousadaId],
  );
  if (uso.n >= cota.respostasDia) {
    return { codigo: 'limite diário', motivo: 'limite diário do atendente virtual' };
  }
  return null;
}

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
  if (!conta.agente_ativo || !agenteDisponivel()) return 'agente desligado';
  if (c.modo === 'humano' && c.humano_ate && new Date(c.humano_ate) > new Date()) return 'equipe na conversa';

  if (!c.aviso_enviado) {
    const { rows: [p] } = await pool.query(`SELECT nome FROM pousadas WHERE id = $1`, [conta.pousada_id]);
    const base = (process.env.APP_URL || process.env.FRONTEND_URL || '').replace(/\/$/, '');
    await enviar(conta, c.id, e.contato,
      `Olá! Sou o atendente virtual da ${p?.nome ?? 'pousada'}: consulto vagas e preços e faço sua pré-reserva. Seus dados são usados para este atendimento e passam pelos fornecedores listados na política de privacidade${base ? ` (${base}/privacidade)` : ''}. Para falar com uma pessoa, escreva "atendente".`,
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

  // Retentativa com a resposta já paga: só falta entregar. Nem o teto se aplica,
  // porque o custo já aconteceu.
  let r = await respostaPendente(entradaId);
  if (!r) {
    const barreira = await barreiraDeCusto(conta.pousada_id, c.id);
    if (barreira) {
      // O aviso é cortesia: Meta fora do ar não pode impedir de chamar a equipe.
      await enviar(conta, c.id, e.contato, AVISO_TETO, 'sistema').catch((err) => console.error('[WhatsApp] aviso de teto:', err));
      await passarParaEquipe(conta, c, barreira.motivo);
      return barreira.codigo;
    }

    if (await superada(c.id, entradaId)) return 'superada';
    const historico = await historicoParaAgente(c.id);
    try {
      r = await responder({ pousadaId: conta.pousada_id, conversaId: c.id, contato: e.contato, nomeContato: c.nome_contato ?? e.nome }, historico);
    } catch (err) {
      // Provedor do modelo fora do ar: o hóspede não fica sem resposta.
      console.error('[WhatsApp] atendente virtual falhou:', err);
      r = { texto: 'Desculpe, tive um problema para responder agora. Vou chamar alguém da equipe.', transferir: 'falha do atendente virtual' };
    }
    await guardarResposta(entradaId, r);
  }
  if (await superada(c.id, entradaId)) {
    await limparResposta(entradaId);
    return 'superada';
  }
  await enviar(conta, c.id, e.contato, r.texto, 'agente');
  await limparResposta(entradaId);
  if (r.transferir) await passarParaEquipe(conta, c, r.transferir);
  return r.transferir ? 'respondeu e passou para a equipe' : 'respondeu';
}

/** Últimas mensagens da conversa, no formato do modelo (mensagens da equipe entram como do atendente). */
async function historicoParaAgente(conversaId: number): Promise<MensagemLLM[]> {
  const { rows } = await pool.query(
    `SELECT direcao, texto_cifrado FROM (SELECT * FROM whatsapp_mensagens WHERE conversa_id = $1 ORDER BY id DESC LIMIT 12) t ORDER BY id`,
    [conversaId],
  );
  const { maxCharsMensagem, maxCharsHistorico } = limitesAgente();
  const msgs: MensagemLLM[] = [];
  for (const r of rows) {
    const texto = r.texto_cifrado ? decifrarSegredo(r.texto_cifrado).slice(0, maxCharsMensagem) : '';
    if (!texto || r.direcao === 'sistema') continue;
    const nova: MensagemLLM = r.direcao === 'entrada' ? { papel: 'usuario', texto } : { papel: 'assistente', texto };
    // Mensagens seguidas do mesmo lado viram uma (os provedores alternam papéis).
    const ultima = msgs.at(-1);
    if (ultima && ultima.papel === nova.papel && 'texto' in ultima && ultima.texto) ultima.texto += `\n${texto}`;
    else msgs.push(nova);
  }
  const recentes = dentroDoTeto(msgs, maxCharsHistorico);
  // O modelo precisa começar e terminar com o hóspede.
  while (recentes.length && recentes[0].papel !== 'usuario') recentes.shift();
  return recentes;
}

/** Fica com as mensagens mais novas que cabem no teto; a que estoura entra só pelo final. */
function dentroDoTeto(msgs: MensagemLLM[], teto: number): MensagemLLM[] {
  const cabem: MensagemLLM[] = [];
  let restante = teto;
  for (let i = msgs.length - 1; i >= 0 && restante > 0; i--) {
    const m = msgs[i];
    if (m.papel === 'ferramenta') continue;
    const texto = m.texto ?? '';
    cabem.unshift({ ...m, texto: texto.length > restante ? texto.slice(-restante) : texto });
    restante -= texto.length;
  }
  return cabem;
}

registrarTrabalhador(FILAS.whatsappEntrada, async (dados) => {
  // Jobs enfileirados antes da cifra ainda chegam em claro.
  const cifrado = (dados as { cifrado?: unknown }).cifrado;
  const entrada = (typeof cifrado === 'string' ? JSON.parse(decifrarSegredo(cifrado)) : dados) as Entrada;
  const r = await tratarEntrada(entrada);
  console.log(`[WhatsApp] entrada ${entrada.wamid}: ${r}`);
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

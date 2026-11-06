/**
 * Cobrança Pix da reserva (migration 022).
 *
 * Dois caminhos, mesmo resultado (pagamento lançado na conta e pré-reserva
 * confirmada):
 *  - chave: "copia e cola" gerado com a chave Pix da pousada; ela vê o
 *    dinheiro entrar e clica em "Recebi o Pix".
 *  - asaas: a conta Asaas da pousada cobra e avisa por webhook; tudo
 *    acontece sozinho. (O Asaas exige o CPF de quem paga; sem CPF, vale o
 *    Pix pela chave.)
 */
import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool } from '../db/index.js';
import { gatewayPara, GatewayRecusou, type SituacaoCobranca } from '../lib/gatewayPix.js';
import { reportarErro } from '../lib/observabilidade.js';
import { normalizarChavePix, payloadPix, qrCodeDataUrl, type TipoChavePix } from '../lib/pix.js';
import { cifrarSegredo, decifrarSegredo } from '../utils/crypto.js';
import { hojeLocal } from '../utils/datas.js';
import { sanitizarString } from '../utils/validation.js';
import { recalcularPago } from './ContaReserva.js';
import { configMotor, emailsDaPousada } from './Motor.js';

/** Postgres: exclusion_violation — a constraint anti-overbooking barrou o write. */
const PG_EXCLUSION_VIOLATION = '23P01';

export class PixIndisponivel extends Error {
  constructor(mensagem: string, readonly status: 400 | 404 | 409 | 502 = 400) {
    super(mensagem);
    this.name = 'PixIndisponivel';
  }
}

export interface ConfigPix {
  tipoChave: TipoChavePix;
  chave: string;
  nome: string;
  cidade: string;
}

export function configPix(configuracoes: unknown): ConfigPix | null {
  const c = ((configuracoes as Record<string, unknown> | null)?.pix ?? null) as Record<string, string> | null;
  if (!c?.chave || !c.tipo_chave) return null;
  return { tipoChave: c.tipo_chave as TipoChavePix, chave: c.chave, nome: c.nome ?? '', cidade: c.cidade ?? '' };
}

export function lerConfigPix(corpo: Record<string, unknown>): { config: Record<string, string> | null; erros: string[] } {
  const erros: string[] = [];
  const tipo = String(corpo.tipo_chave ?? '') as TipoChavePix;
  const bruta = String(corpo.chave ?? '').trim();
  if (!bruta) return { config: null, erros };
  if (!['cpf', 'cnpj', 'email', 'telefone', 'aleatoria'].includes(tipo)) erros.push('Escolha o tipo da chave Pix.');
  const chave = normalizarChavePix(tipo, bruta);
  if (!chave) erros.push('Chave Pix inválida para o tipo escolhido.');
  const nome = sanitizarString(String(corpo.nome ?? ''), 60);
  const cidade = sanitizarString(String(corpo.cidade ?? ''), 40);
  if (nome.length < 2) erros.push('Informe o nome do titular da conta (aparece no app do banco).');
  if (cidade.length < 2) erros.push('Informe a cidade do titular.');
  return { config: chave ? { tipo_chave: tipo, chave, nome, cidade } : null, erros };
}

async function credencial(pousadaId: number) {
  const { rows: [c] } = await pool.query(
    `SELECT provedor, token_cifrado, webhook_token FROM credenciais_pagamento WHERE pousada_id = $1 AND provedor = 'asaas'`,
    [pousadaId],
  );
  return c ? { provedor: c.provedor as 'asaas', token: decifrarSegredo(c.token_cifrado), webhookToken: c.webhook_token as string } : null;
}

function baseApi(): string {
  return (process.env.API_PUBLIC_URL || process.env.BETTER_AUTH_URL || 'http://localhost:4000').replace(/\/$/, '');
}

const urlDoWebhook = (webhookToken: string) => `${baseApi()}/api/webhooks/pix/asaas/${webhookToken}`;

/**
 * Liga a conta Asaas da pousada: guarda a chave cifrada e registra o
 * webhook na conta dela pela API. Se o registro falhar (permissão da
 * chave), a tela mostra endereço e token para cadastro manual.
 */
export async function salvarCredencial(pousadaId: number, chave: string | null, email = ''): Promise<{ webhookRegistrado: boolean; erro?: string }> {
  if (!chave) {
    await pool.query(`DELETE FROM credenciais_pagamento WHERE pousada_id = $1 AND provedor = 'asaas'`, [pousadaId]);
    return { webhookRegistrado: false };
  }
  const webhookToken = randomBytes(24).toString('hex');
  const webhookAuth = randomBytes(24).toString('hex');
  let registrado = false;
  let erro: string | undefined;
  try {
    await gatewayPara('asaas', chave).registrarWebhook({ url: urlDoWebhook(webhookToken), tokenAutenticacao: webhookAuth, email });
    registrado = true;
  } catch (err) {
    erro = err instanceof Error ? err.message : String(err);
  }
  await pool.query(
    `INSERT INTO credenciais_pagamento (pousada_id, provedor, token_cifrado, webhook_token, webhook_auth, webhook_registrado)
     VALUES ($1, 'asaas', $2, $3, $4, $5)
     ON CONFLICT (pousada_id, provedor) DO UPDATE SET token_cifrado = EXCLUDED.token_cifrado, webhook_token = EXCLUDED.webhook_token,
       webhook_auth = EXCLUDED.webhook_auth, webhook_registrado = EXCLUDED.webhook_registrado, updated_at = now()`,
    [pousadaId, cifrarSegredo(chave), webhookToken, webhookAuth, registrado],
  );
  return { webhookRegistrado: registrado, erro };
}

/** O que a pousada tem configurado (sem expor a chave do gateway). */
export async function situacaoPix(pousadaId: number) {
  const { rows: [p] } = await pool.query(`SELECT configuracoes FROM pousadas WHERE id = $1`, [pousadaId]);
  const cfg = configPix(p?.configuracoes);
  const { rows: [c] } = await pool.query(
    `SELECT webhook_token, webhook_auth, webhook_registrado FROM credenciais_pagamento WHERE pousada_id = $1 AND provedor = 'asaas'`,
    [pousadaId],
  );
  return {
    chave: cfg,
    automatico: Boolean(c),
    disponivel: Boolean(cfg) || Boolean(c),
    // Para cadastro manual do webhook no painel do Asaas, se a API não deixou.
    webhook: c ? { registrado: c.webhook_registrado as boolean, url: urlDoWebhook(c.webhook_token), token: c.webhook_registrado ? null : (c.webhook_auth as string) } : null,
  };
}

export interface CobrancaApi {
  id: number;
  provedor: 'chave' | 'asaas';
  valorCentavos: number;
  copiaECola: string;
  qrCode: string;
  status: string;
  tokenPublico: string;
  expiraEm: Date | null;
  pagaEm: Date | null;
  /** Pago com a reserva encerrada: a pousada precisa devolver ao hóspede. */
  estornoPendente: boolean;
}

async function paraApi(c: Record<string, any>): Promise<CobrancaApi> {
  return {
    id: c.id, provedor: c.provedor, valorCentavos: c.valor_centavos, copiaECola: c.copia_e_cola, qrCode: await qrCodeDataUrl(c.copia_e_cola),
    status: c.status, tokenPublico: c.token_publico, expiraEm: c.expira_em, pagaEm: c.paga_em, estornoPendente: c.estorno_pendente,
  };
}

async function contaDaReserva(reservaId: number, pousadaId: number) {
  const { rows: [r] } = await pool.query(
    `SELECT r.status, p.configuracoes,
            COALESCE(round(r.valor * 100), 0)::int
              + COALESCE((SELECT sum(c.quantidade * c.valor_unitario_centavos) FROM consumos c WHERE c.reserva_id = r.id), 0)::int AS total,
            COALESCE((SELECT sum(pg.valor_centavos) FROM pagamentos pg WHERE pg.reserva_id = r.id), 0)::int AS pago
       FROM reservas r JOIN pousadas p ON p.id = r.pousada_id WHERE r.id = $1 AND r.pousada_id = $2`,
    [reservaId, pousadaId],
  );
  return r as { status: string; configuracoes: unknown; total: number; pago: number } | undefined;
}

/** Quanto ainda falta pagar na reserva (0 se a conta já fechou). */
export async function saldoDaReserva(reservaId: number, pousadaId: number): Promise<number> {
  const r = await contaDaReserva(reservaId, pousadaId);
  return r ? Math.max(r.total - r.pago, 0) : 0;
}

/** Valor sugerido: o sinal da pré-reserva, ou o saldo da conta. */
export async function valorSugerido(reservaId: number, pousadaId: number): Promise<number> {
  const r = await contaDaReserva(reservaId, pousadaId);
  if (!r) return 0;
  const saldo = r.total - r.pago;
  if (r.status === 'pre_reserva' && r.pago === 0) return Math.round((r.total * configMotor(r.configuracoes).sinalPercentual) / 100) || saldo;
  return Math.max(saldo, 0);
}

export async function gerarCobranca(
  pousadaId: number,
  reservaId: number,
  valorCentavos: number,
  opcoes: { userId?: string | null } = {},
): Promise<CobrancaApi> {
  if (!Number.isInteger(valorCentavos) || valorCentavos <= 0) throw new PixIndisponivel('Não há valor a cobrar nesta reserva.');
  const { rows: [r] } = await pool.query(
    `SELECT r.id, r.status, r.expira_em, r.nome, p.nome AS pousada, p.cidade, p.configuracoes,
            h.nome AS hospede, h.tipo_documento, h.documento, h.email, h.telefone
       FROM reservas r JOIN pousadas p ON p.id = r.pousada_id LEFT JOIN hospedes h ON h.id = r.hospede_id
      WHERE r.id = $1 AND r.pousada_id = $2 AND r.deleted_at IS NULL`,
    [reservaId, pousadaId],
  );
  if (!r) throw new PixIndisponivel('Reserva não encontrada.', 404);
  if (['cancelada', 'no_show'].includes(r.status)) throw new PixIndisponivel('Reserva cancelada não recebe cobrança.', 409);

  const tokenPublico = randomBytes(18).toString('hex');
  const expiraEm: Date = r.status === 'pre_reserva' && r.expira_em ? new Date(r.expira_em) : new Date(Date.now() + 24 * 3600_000);
  const cred = await credencial(pousadaId);
  const cfg = configPix(r.configuracoes);
  // CPF do hóspede (o Asaas exige). Sem CPF, cai no Pix pela chave.
  let cpf: string | null = null;
  if (r.documento && r.tipo_documento === 'cpf') {
    try { cpf = decifrarSegredo(r.documento); } catch { cpf = null; }
  }
  let provedor: 'chave' | 'asaas';
  let provedorId: string | null = null;
  let copiaECola: string;

  if (cred && (cpf || !cfg)) {
    provedor = 'asaas';
    if (!cpf) throw new PixIndisponivel('Para gerar o Pix pelo Asaas, informe o CPF do hóspede na reserva (ou cadastre também a chave Pix da pousada).');
    try {
      const c = await gatewayPara(cred.provedor, cred.token).criarCobranca({
        valorCentavos,
        descricao: `Reserva #${reservaId} — ${r.pousada}`,
        referencia: `reserva-${reservaId}`,
        cliente: { nome: r.hospede || r.nome, cpfCnpj: cpf, email: r.email, telefone: r.telefone },
        expiraEm,
      });
      provedorId = c.id;
      copiaECola = c.copiaECola;
    } catch (err) {
      const msg = err instanceof GatewayRecusou ? err.message : 'falha de comunicação';
      throw new PixIndisponivel(`Não foi possível gerar o Pix no Asaas (${msg}).`, 502);
    }
  } else {
    if (!cfg) throw new PixIndisponivel('Cadastre a chave Pix da pousada em Configurações para cobrar por Pix.');
    provedor = 'chave';
    copiaECola = payloadPix({
      chave: cfg.chave, nome: cfg.nome || r.pousada, cidade: cfg.cidade || r.cidade || '', valorCentavos, txid: `DIARIA${reservaId}`,
    });
  }

  const { rows: [c] } = await pool.query(
    `INSERT INTO cobrancas_pix (pousada_id, reserva_id, provedor, provedor_id, valor_centavos, copia_e_cola, token_publico, expira_em, criado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [pousadaId, reservaId, provedor, provedorId, valorCentavos, copiaECola, tokenPublico, expiraEm, opcoes.userId ?? null],
  );
  return paraApi(c);
}

export async function listarCobrancas(reservaId: number, pousadaId: number): Promise<CobrancaApi[]> {
  const { rows } = await pool.query(
    `SELECT * FROM cobrancas_pix WHERE reserva_id = $1 AND pousada_id = $2 ORDER BY id DESC LIMIT 20`,
    [reservaId, pousadaId],
  );
  return Promise.all(rows.map(paraApi));
}

export interface ResultadoBaixa {
  jaPaga: boolean;
  confirmou: boolean;
  /** A reserva estava encerrada e voltou a valer com este pagamento. */
  reativou: boolean;
  /** A reserva está encerrada e não pôde voltar: o dinheiro precisa ser devolvido. */
  estornar: boolean;
}

/**
 * Tenta devolver a vida à reserva encerrada. O EXCLUDE decide: quarto tomado
 * por outra reserva recusa. Savepoint porque a violação aborta a transação,
 * e o pagamento ainda precisa ser registrado.
 */
async function tentarReativar(cliente: PoolClient, reservaId: number): Promise<boolean> {
  await cliente.query('SAVEPOINT reativar');
  try {
    await cliente.query(
      `UPDATE reservas SET status = 'confirmada', cancelada_em = NULL, motivo_cancelamento = NULL, expira_em = NULL,
              version = version + 1, updated_at = now()
        WHERE id = $1`,
      [reservaId],
    );
    await cliente.query('RELEASE SAVEPOINT reativar');
    return true;
  } catch (err) {
    if ((err as { code?: string }).code !== PG_EXCLUSION_VIOLATION) throw err;
    await cliente.query('ROLLBACK TO SAVEPOINT reativar');
    return false;
  }
}

/**
 * Baixa a cobrança: lança o pagamento (sinal, se a reserva ainda é
 * pré-reserva), recalcula a conta e confirma a pré-reserva. Idempotente.
 *
 * Pix pago com a reserva encerrada: o dinheiro já entrou, então o pagamento é
 * lançado de qualquer forma. A reserva cancelada volta a valer se o quarto
 * estiver livre e a estadia não tiver passado; senão fica marcada para estorno.
 * Reserva excluída não volta nunca.
 */
async function baixar(cliente: PoolClient, cobrancaId: number, valorCentavos: number, origem: string, userId: string | null): Promise<ResultadoBaixa> {
  const { rows: [c] } = await cliente.query(`SELECT * FROM cobrancas_pix WHERE id = $1 FOR UPDATE`, [cobrancaId]);
  if (!c || c.status === 'paga') return { jaPaga: true, confirmou: false, reativou: false, estornar: false };
  const { rows: [r] } = await cliente.query(
    `SELECT status, deleted_at, data_saida::text AS data_saida FROM reservas WHERE id = $1 FOR UPDATE`,
    [c.reserva_id],
  );
  const encerrada = Boolean(r?.deleted_at) || ['cancelada', 'no_show'].includes(r?.status);
  const podeVoltar = encerrada && !r.deleted_at && r.data_saida >= hojeLocal();
  const reativou = podeVoltar ? await tentarReativar(cliente, c.reserva_id) : false;
  const estornar = encerrada && !reativou;
  const { rows: [pg] } = await cliente.query(
    `INSERT INTO pagamentos (pousada_id, reserva_id, valor_centavos, forma, tipo, recebido_em, observacao, criado_por)
     VALUES ($1, $2, $3, 'pix', $4, current_date, $5, $6) RETURNING id`,
    [c.pousada_id, c.reserva_id, valorCentavos, r?.status === 'pre_reserva' ? 'sinal' : 'pagamento',
      estornar ? `${origem} — reserva encerrada: estornar ao hóspede` : origem, userId],
  );
  await cliente.query(
    `UPDATE cobrancas_pix SET status = 'paga', paga_em = now(), pagamento_id = $2, estorno_pendente = $3 WHERE id = $1`,
    [cobrancaId, pg.id, estornar],
  );
  await recalcularPago(cliente, c.reserva_id);
  let confirmou = false;
  if (r?.status === 'pre_reserva') {
    const up = await cliente.query(
      `UPDATE reservas SET status = 'confirmada', expira_em = NULL, version = version + 1, updated_at = now()
        WHERE id = $1 AND status = 'pre_reserva'`,
      [c.reserva_id],
    );
    confirmou = (up.rowCount ?? 0) > 0;
  }
  await cliente.query(
    `INSERT INTO auditoria (user_id, action, entity, entity_id, details) VALUES ($1, $2, 'reserva', $3, $4)`,
    [userId, estornar ? 'pix_estorno_pendente' : 'pix_recebido', c.reserva_id, JSON.stringify({ cobranca: cobrancaId, valorCentavos, origem, confirmou, reativou })],
  );
  return { jaPaga: false, confirmou, reativou, estornar };
}

/** Avisa a equipe do Pix tardio. Falha de e-mail não desfaz a baixa já gravada. */
async function avisarPixTardio(cobrancaId: number, valorCentavos: number, reativou: boolean): Promise<void> {
  try {
    const { rows: [c] } = await pool.query(
      `SELECT c.pousada_id, c.reserva_id, r.nome AS hospede, p.nome AS pousada
         FROM cobrancas_pix c JOIN reservas r ON r.id = c.reserva_id JOIN pousadas p ON p.id = c.pousada_id WHERE c.id = $1`,
      [cobrancaId],
    );
    // Import tardio: lib/fila carrega este módulo pelos jobs, e lib/email usa a
    // fila ao ser carregado; no topo do arquivo o ciclo quebra a inicialização.
    const { enviarPixTardio } = await import('../lib/email.js');
    await enviarPixTardio(await emailsDaPousada(c.pousada_id), {
      pousada: c.pousada,
      reservaId: c.reserva_id,
      hospede: c.hospede,
      valor: (valorCentavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      reativou,
      link: `${(process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '')}/reservas/${c.reserva_id}`,
    });
  } catch (err) {
    console.error('[Pix] aviso de Pix tardio:', err);
    reportarErro(err, { cobranca: cobrancaId });
  }
}

async function baixarEAvisar(cobrancaId: number, valorCentavos: number, origem: string, userId: string | null): Promise<ResultadoBaixa> {
  const r = await emTransacao((cl) => baixar(cl, cobrancaId, valorCentavos, origem, userId));
  if (r.reativou || r.estornar) await avisarPixTardio(cobrancaId, valorCentavos, r.reativou);
  return r;
}

export interface CobrancaEncerrada {
  pousada_id: number;
  provedor: string;
  provedor_id: string | null;
}

/**
 * Anula no gateway o que foi encerrado aqui, para o hóspede não conseguir mais
 * pagar. Fora da transação e sem derrubar quem chamou: se falhar, a cobrança
 * segue viva no gateway e um pagamento tardio cai na regra de `baixar`.
 */
export async function cancelarNoGateway(cobrancas: CobrancaEncerrada[]): Promise<void> {
  for (const c of cobrancas) {
    if (c.provedor !== 'asaas' || !c.provedor_id) continue;
    try {
      const cred = await credencial(c.pousada_id);
      if (cred) await gatewayPara(cred.provedor, cred.token).cancelarCobranca(c.provedor_id);
    } catch (err) {
      console.error(`[Pix] não foi possível cancelar ${c.provedor_id} no gateway:`, err instanceof Error ? err.message : err);
      reportarErro(err, { cobranca: c.provedor_id });
    }
  }
}

/** A reserva foi encerrada: as cobranças em aberto deixam de valer, aqui e no gateway. */
export async function encerrarCobrancas(pousadaId: number, reservaId: number): Promise<void> {
  const { rows } = await pool.query<CobrancaEncerrada>(
    `UPDATE cobrancas_pix SET status = 'cancelada' WHERE reserva_id = $1 AND pousada_id = $2 AND status = 'pendente'
     RETURNING pousada_id, provedor, provedor_id`,
    [reservaId, pousadaId],
  );
  await cancelarNoGateway(rows);
}

async function emTransacao<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const r = await fn(cliente);
    await cliente.query('COMMIT');
    return r;
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}

/** "Recebi o Pix": baixa manual de cobrança pela chave. */
export async function marcarRecebida(pousadaId: number, reservaId: number, cobrancaId: number, userId: string) {
  const { rows: [c] } = await pool.query(
    `SELECT id, valor_centavos, status FROM cobrancas_pix WHERE id = $1 AND reserva_id = $2 AND pousada_id = $3`,
    [cobrancaId, reservaId, pousadaId],
  );
  if (!c) throw new PixIndisponivel('Cobrança não encontrada.', 404);
  if (c.status === 'paga') throw new PixIndisponivel('Esta cobrança já foi baixada.', 409);
  return baixarEAvisar(c.id, c.valor_centavos, 'Pix recebido (conferido pela pousada)', userId);
}

/**
 * Aviso do gateway: identifica a pousada pelo token do endereço, confere o
 * token do cabeçalho, consulta o pagamento no provedor e só então baixa.
 * Devolve o que fez (para log).
 */
export async function processarAviso(webhookToken: string, tokenCabecalho: string, idPagamento: string): Promise<string> {
  if (!/^[0-9a-f]{48}$/.test(webhookToken)) return 'token inválido';
  const { rows: [cred] } = await pool.query(
    `SELECT pousada_id, token_cifrado, webhook_auth FROM credenciais_pagamento WHERE webhook_token = $1 AND provedor = 'asaas'`,
    [webhookToken],
  );
  if (!cred) return 'pousada desconhecida';
  const a = Buffer.from(String(tokenCabecalho));
  const b = Buffer.from(String(cred.webhook_auth));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return 'cabeçalho de autenticação inválido';
  const { rows: [c] } = await pool.query(
    `SELECT id, status, valor_centavos FROM cobrancas_pix WHERE provedor = 'asaas' AND provedor_id = $1 AND pousada_id = $2`,
    [idPagamento, cred.pousada_id],
  );
  if (!c) return 'cobrança desconhecida';
  if (c.status === 'paga') return 'já paga';
  let situacao: SituacaoCobranca;
  try {
    situacao = await gatewayPara('asaas', decifrarSegredo(cred.token_cifrado)).consultar(idPagamento);
  } catch (err) {
    // Cobrança que nós mesmos anulamos pode não existir mais no gateway; repetir
    // o aviso (500) só travaria a fila sequencial de avisos dele.
    if (err instanceof GatewayRecusou && c.status !== 'pendente') return 'cobrança já encerrada';
    throw err;
  }
  if (situacao.status === 'paga') {
    const r = await baixarEAvisar(c.id, situacao.valorCentavos || c.valor_centavos, `Pix confirmado pelo Asaas (${idPagamento})`, null);
    if (r.estornar) return 'paga com a reserva encerrada: marcada para estorno';
    if (r.reativou) return 'paga e reserva reativada';
    return r.confirmou ? 'paga e reserva confirmada' : 'paga';
  }
  if (situacao.status === 'cancelada' || situacao.status === 'expirada') {
    await pool.query(`UPDATE cobrancas_pix SET status = $2 WHERE id = $1 AND status = 'pendente'`, [c.id, situacao.status]);
  }
  return situacao.status;
}

/** Situação para a página pública (o hóspede acompanha sem login). */
export async function cobrancaPublica(token: string) {
  if (!/^[0-9a-f]{36}$/.test(token)) return null;
  const { rows: [c] } = await pool.query(
    `SELECT c.status, c.valor_centavos, c.estorno_pendente, r.status AS reserva FROM cobrancas_pix c JOIN reservas r ON r.id = c.reserva_id WHERE c.token_publico = $1`,
    [token],
  );
  return c ? { status: c.status as string, valorCentavos: c.valor_centavos as number, reserva: c.reserva as string, estorno: c.estorno_pendente as boolean } : null;
}

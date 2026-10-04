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
import { gatewayPara, GatewayRecusou } from '../lib/gatewayPix.js';
import { normalizarChavePix, payloadPix, qrCodeDataUrl, type TipoChavePix } from '../lib/pix.js';
import { cifrarSegredo, decifrarSegredo } from '../utils/crypto.js';
import { sanitizarString } from '../utils/validation.js';
import { recalcularPago } from './ContaReserva.js';
import { configMotor } from './Motor.js';

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
}

async function paraApi(c: Record<string, any>): Promise<CobrancaApi> {
  return {
    id: c.id, provedor: c.provedor, valorCentavos: c.valor_centavos, copiaECola: c.copia_e_cola, qrCode: await qrCodeDataUrl(c.copia_e_cola),
    status: c.status, tokenPublico: c.token_publico, expiraEm: c.expira_em, pagaEm: c.paga_em,
  };
}

/** Valor sugerido: o sinal da pré-reserva, ou o saldo da conta. */
export async function valorSugerido(reservaId: number, pousadaId: number): Promise<number> {
  const { rows: [r] } = await pool.query(
    `SELECT r.status, p.configuracoes,
            COALESCE(round(r.valor * 100), 0)::int
              + COALESCE((SELECT sum(c.quantidade * c.valor_unitario_centavos) FROM consumos c WHERE c.reserva_id = r.id), 0)::int AS total,
            COALESCE((SELECT sum(pg.valor_centavos) FROM pagamentos pg WHERE pg.reserva_id = r.id), 0)::int AS pago
       FROM reservas r JOIN pousadas p ON p.id = r.pousada_id WHERE r.id = $1 AND r.pousada_id = $2`,
    [reservaId, pousadaId],
  );
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

/**
 * Baixa a cobrança: lança o pagamento (sinal, se a reserva ainda é
 * pré-reserva), recalcula a conta e confirma a pré-reserva. Idempotente.
 */
async function baixar(cliente: PoolClient, cobrancaId: number, valorCentavos: number, origem: string, userId: string | null) {
  const { rows: [c] } = await cliente.query(`SELECT * FROM cobrancas_pix WHERE id = $1 FOR UPDATE`, [cobrancaId]);
  if (!c || c.status === 'paga') return { jaPaga: true, confirmou: false };
  const { rows: [r] } = await cliente.query(`SELECT status FROM reservas WHERE id = $1 FOR UPDATE`, [c.reserva_id]);
  const { rows: [pg] } = await cliente.query(
    `INSERT INTO pagamentos (pousada_id, reserva_id, valor_centavos, forma, tipo, recebido_em, observacao, criado_por)
     VALUES ($1, $2, $3, 'pix', $4, current_date, $5, $6) RETURNING id`,
    [c.pousada_id, c.reserva_id, valorCentavos, r?.status === 'pre_reserva' ? 'sinal' : 'pagamento', origem, userId],
  );
  await cliente.query(`UPDATE cobrancas_pix SET status = 'paga', paga_em = now(), pagamento_id = $2 WHERE id = $1`, [cobrancaId, pg.id]);
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
    `INSERT INTO auditoria (user_id, action, entity, entity_id, details) VALUES ($1, 'pix_recebido', 'reserva', $2, $3)`,
    [userId, c.reserva_id, JSON.stringify({ cobranca: cobrancaId, valorCentavos, origem, confirmou })],
  );
  return { jaPaga: false, confirmou };
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
  return emTransacao((cl) => baixar(cl, c.id, c.valor_centavos, 'Pix recebido (conferido pela pousada)', userId));
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
  const situacao = await gatewayPara('asaas', decifrarSegredo(cred.token_cifrado)).consultar(idPagamento);
  if (situacao.status === 'paga') {
    const r = await emTransacao((cl) => baixar(cl, c.id, situacao.valorCentavos || c.valor_centavos, `Pix confirmado pelo Asaas (${idPagamento})`, null));
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
    `SELECT c.status, c.valor_centavos, r.status AS reserva FROM cobrancas_pix c JOIN reservas r ON r.id = c.reserva_id WHERE c.token_publico = $1`,
    [token],
  );
  return c ? { status: c.status as string, valorCentavos: c.valor_centavos as number, reserva: c.reserva as string } : null;
}

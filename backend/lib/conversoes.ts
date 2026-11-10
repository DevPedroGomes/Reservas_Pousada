/**
 * Conversões enviadas pelo SERVIDOR para as plataformas de anúncio.
 *
 * O Pixel no navegador perde parte dos eventos (bloqueador, iOS, aba que
 * navega antes de o envio sair). O servidor manda os três eventos do funil:
 *
 *   cadastro            → CompleteRegistration  event_id cadastro:<user id>
 *   pousada criada      → StartTrial            event_id trial:<pousada id>
 *   1ª fatura paga      → Subscribe             event_id assinatura:<sub id>
 *
 * Os dois primeiros também saem do Pixel com o MESMO event_id, e a Meta
 * descarta a duplicata. Renovação não é conversão de anúncio e não é enviada.
 *
 * Destinos: Meta Conversions API (META_PIXEL_ID + META_CAPI_TOKEN) e, só para a
 * assinatura, GA4 Measurement Protocol (GA_MEASUREMENT_ID + GA_API_SECRET).
 *
 * Consentimento (LGPD): só envia de quem aceitou cookies de anúncio
 * (origem.consentimento_anuncios), lido no momento do evento. Quem revoga
 * depois para de ser enviado. E-mail e id vão em SHA-256, nunca em claro.
 *
 * Tudo que o envio precisa é resolvido na hora do evento e vai no job, então o
 * trabalhador não depende de ler um registro que ainda não foi gravado. Roda
 * pela fila, com retentativa. Sem as variáveis, nada é enviado.
 */
import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { pool } from '../db/index.js';
import { enfileirar, FILAS, registrarTrabalhador } from './fila.js';
import { urlDoApp } from '../utils/origens.js';
import type { Origem } from '../utils/origem.js';

/** Versão da Graph API. A v21.0 sai do ar em 21/01/2027. */
export const VERSAO_GRAPH = 'v26.0';

export type EventoMeta = 'CompleteRegistration' | 'StartTrial' | 'Subscribe';

/** Dados do navegador no momento do evento. A Meta exige o user agent em evento de site. */
export interface ContextoWeb {
  ip?: string;
  ua?: string;
}

/** O job: tudo já resolvido, nada de e-mail em claro. */
export interface JobDeConversao {
  evento: EventoMeta;
  eventId: string;
  eventTime: number;
  url: string;
  emHash: string;
  externalIdHash: string;
  fbc?: string;
  fbp?: string;
  ip?: string;
  ua?: string;
  gaClientId?: string;
  valor?: number;
  moeda?: string;
}

const sha256 = (v: string) => createHash('sha256').update(v.trim().toLowerCase()).digest('hex');

export function metaConfigurada(): boolean {
  return Boolean(process.env.META_PIXEL_ID?.trim() && process.env.META_CAPI_TOKEN?.trim());
}

function gaConfigurado(): boolean {
  return Boolean(process.env.GA_MEASUREMENT_ID?.trim() && process.env.GA_API_SECRET?.trim());
}

export function conversoesConfiguradas(): boolean {
  return metaConfigurada() || gaConfigurado();
}

/** IP e user agent da requisição. `trust proxy` já resolve o IP real atrás do Traefik. */
export function contextoDaRequisicao(req: Pick<Request, 'ip' | 'get'>): ContextoWeb {
  return { ip: req.ip || undefined, ua: req.get('user-agent')?.slice(0, 400) || undefined };
}

/**
 * Mesmo contexto a partir de cabeçalhos crus (hooks do better-auth, que não
 * passam pelo Express). Com um proxy confiável, o IP real é o ÚLTIMO item do
 * X-Forwarded-For: o Traefik acrescenta o endereço de quem conectou nele.
 */
export function contextoDosCabecalhos(h: Headers | undefined | null): ContextoWeb {
  if (!h) return {};
  const ip = h.get('x-forwarded-for')?.split(',').map((s) => s.trim()).filter(Boolean).pop();
  return { ip: ip || undefined, ua: h.get('user-agent')?.slice(0, 400) || undefined };
}

/**
 * `_fbc` a partir do fbclid guardado no primeiro toque. O carimbo é o da
 * primeira visita, quando o clique aconteceu.
 */
export function fbcDaOrigem(origem: Origem, criado: Date): string | undefined {
  if (!origem.fbclid) return undefined;
  const quando = new Date(origem.primeira_visita ?? criado).getTime();
  return `fb.1.${Number.isFinite(quando) ? quando : criado.getTime()}.${origem.fbclid}`;
}

interface Pessoa { id: string; email: string; origem: Origem | null; criado: Date }

/** Monta o job, ou null quando não há consentimento. */
export function montarJob(
  pessoa: Pessoa,
  dados: { evento: EventoMeta; eventId: string; caminho: string; contexto?: ContextoWeb; valorCentavos?: number; moeda?: string },
): JobDeConversao | null {
  const origem = pessoa.origem;
  if (!origem?.consentimento_anuncios) return null;
  return {
    evento: dados.evento,
    eventId: dados.eventId,
    eventTime: Math.floor(Date.now() / 1000),
    url: `${urlDoApp()}${dados.caminho}`,
    emHash: sha256(pessoa.email),
    externalIdHash: sha256(pessoa.id),
    fbc: fbcDaOrigem(origem, pessoa.criado),
    fbp: origem.fbp,
    ip: dados.contexto?.ip,
    ua: dados.contexto?.ua,
    gaClientId: origem.ga_client_id,
    ...(dados.valorCentavos !== undefined ? { valor: dados.valorCentavos / 100, moeda: (dados.moeda ?? 'brl').toUpperCase() } : {}),
  };
}

async function enviarJob(job: JobDeConversao | null): Promise<void> {
  if (!job || !conversoesConfiguradas()) return;
  await enfileirar(FILAS.conversao, job as unknown as Record<string, unknown>);
}

/** Cadastro (e-mail ou Google). Chamado do hook de criação de usuário. */
export async function registrarCadastro(
  usuario: { id: string; email: string; origem?: unknown; createdAt?: Date },
  contexto: ContextoWeb,
): Promise<void> {
  if (!conversoesConfiguradas()) return;
  const origem = (usuario.origem && typeof usuario.origem === 'object' ? usuario.origem : null) as Origem | null;
  await enviarJob(montarJob(
    { id: usuario.id, email: usuario.email, origem, criado: usuario.createdAt ?? new Date() },
    { evento: 'CompleteRegistration', eventId: `cadastro:${usuario.id}`, caminho: '/cadastro', contexto },
  ));
}

async function pessoa(userId: string): Promise<Pessoa | null> {
  const { rows } = await pool.query<Pessoa>(
    `SELECT id, email, origem, created_at AS criado FROM "user" WHERE id = $1`, [userId],
  );
  return rows[0] ?? null;
}

async function donoDaPousada(pousadaId: number): Promise<Pessoa | null> {
  const { rows } = await pool.query<Pessoa>(
    `SELECT u.id, u.email, u.origem, u.created_at AS criado
       FROM user_pousadas up JOIN "user" u ON u.id = up.user_id
      WHERE up.pousada_id = $1 AND up.is_owner = true
      ORDER BY up.joined_at LIMIT 1`,
    [pousadaId],
  );
  return rows[0] ?? null;
}

/**
 * Início do trial: a primeira pousada do dono. Pousadas seguintes (plano Rede)
 * não são um novo trial.
 */
export async function registrarInicioDoTrial(userId: string, pousadaId: number, contexto: ContextoWeb): Promise<void> {
  if (!conversoesConfiguradas()) return;
  const { rows } = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM user_pousadas WHERE user_id = $1 AND is_owner = true`, [userId],
  );
  if ((rows[0]?.n ?? 0) !== 1) return;
  const p = await pessoa(userId);
  if (!p) return;
  await enviarJob(montarJob(p, { evento: 'StartTrial', eventId: `trial:${pousadaId}`, caminho: '/onboarding', contexto }));
}

/**
 * Assinatura: a primeira fatura paga de uma assinatura. O contexto do navegador
 * foi guardado quando o dono abriu o checkout (assinaturas.contexto_conversao).
 */
export async function registrarAssinatura(c: {
  pousadaId: number;
  subscriptionId: string;
  valorCentavos: number;
  moeda: string;
}): Promise<void> {
  if (!conversoesConfiguradas()) return;
  const p = await donoDaPousada(c.pousadaId);
  if (!p) return;
  const { rows } = await pool.query<{ ctx: ContextoWeb | null }>(
    `SELECT contexto_conversao AS ctx FROM assinaturas WHERE pousada_id = $1`, [c.pousadaId],
  );
  await enviarJob(montarJob(p, {
    evento: 'Subscribe',
    eventId: `assinatura:${c.subscriptionId}`,
    caminho: '/assinatura',
    contexto: rows[0]?.ctx ?? undefined,
    valorCentavos: c.valorCentavos,
    moeda: c.moeda,
  }));
}

/** Guarda IP e user agent de quem abriu o checkout, para o evento de assinatura. */
export async function guardarContextoDoCheckout(pousadaId: number, contexto: ContextoWeb): Promise<void> {
  if (!conversoesConfiguradas()) return;
  await pool.query(
    `UPDATE assinaturas SET contexto_conversao = $2 WHERE pousada_id = $1`,
    [pousadaId, JSON.stringify({ ...contexto, em: new Date().toISOString() })],
  );
}

/** Corpo do evento para a Conversions API. Exportado para os testes. */
export function corpoMeta(job: JobDeConversao): Record<string, unknown> {
  // Sem user agent, a Meta não aceita o evento como "website".
  const site = Boolean(job.ua);
  const evento: Record<string, unknown> = {
    event_name: job.evento,
    event_time: job.eventTime,
    event_id: job.eventId,
    action_source: site ? 'website' : 'system_generated',
    ...(site ? { event_source_url: job.url } : {}),
    user_data: {
      em: [job.emHash],
      external_id: [job.externalIdHash],
      ...(job.fbc ? { fbc: job.fbc } : {}),
      ...(job.fbp ? { fbp: job.fbp } : {}),
      ...(job.ip ? { client_ip_address: job.ip } : {}),
      ...(job.ua ? { client_user_agent: job.ua } : {}),
    },
    ...(job.valor !== undefined ? { custom_data: { value: job.valor, currency: job.moeda } } : {}),
  };
  const teste = process.env.META_TEST_EVENT_CODE?.trim();
  return {
    data: [evento],
    access_token: process.env.META_CAPI_TOKEN!.trim(),
    ...(teste ? { test_event_code: teste } : {}),
  };
}

async function enviar(job: JobDeConversao): Promise<void> {
  if (metaConfigurada()) {
    // Token no corpo, não na URL: URL vai parar em log de proxy.
    const r = await fetch(`https://graph.facebook.com/${VERSAO_GRAPH}/${process.env.META_PIXEL_ID!.trim()}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpoMeta(job)),
    });
    if (!r.ok) throw new Error(`Meta CAPI respondeu ${r.status}: ${(await r.text()).slice(0, 300)}`);
  }

  // GA4 só recebe a compra: cadastro e trial já saem do gtag no navegador, e o
  // Measurement Protocol não deduplica esses eventos.
  if (job.evento === 'Subscribe' && gaConfigurado() && job.gaClientId) {
    const r = await fetch(
      `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(process.env.GA_MEASUREMENT_ID!)}&api_secret=${encodeURIComponent(process.env.GA_API_SECRET!)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: job.gaClientId,
          events: [{ name: 'purchase', params: { transaction_id: job.eventId, value: job.valor, currency: job.moeda } }],
        }),
      },
    );
    if (!r.ok) throw new Error(`GA4 respondeu ${r.status}`);
  }
}

registrarTrabalhador(FILAS.conversao, (dados) => enviar(dados as unknown as JobDeConversao));

/**
 * GA4 e Meta Pixel — carregados SÓ depois do consentimento do visitante.
 *
 * Eventos de funil do produto (nomes próprios, mapeados para os padrões de
 * cada plataforma): cadastro, pousada_criada, reserva_criada,
 * inicio_checkout, assinatura. A conversão de pagamento também sai pelo
 * servidor (backend/lib/conversoes.ts), que não depende do navegador.
 */
import { lerConsentimento, type Consentimento } from "./consentimento"

const GA_ID = process.env.NEXT_PUBLIC_GA_ID
const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID

type Janela = Window & {
  dataLayer?: unknown[]
  gtag?: (...args: unknown[]) => void
  fbq?: ((...args: unknown[]) => void) & { callMethod?: unknown; queue?: unknown[]; loaded?: boolean; version?: string; push?: unknown }
  _fbq?: unknown
}

let gaCarregado = false
let pixelCarregado = false

function script(src: string) {
  const s = document.createElement("script")
  s.async = true
  s.src = src
  document.head.appendChild(s)
}

export function carregarRastreadores(c: Consentimento | null = lerConsentimento()): void {
  if (typeof window === "undefined" || !c) return
  const w = window as Janela

  if (c.medicao && GA_ID && !gaCarregado) {
    gaCarregado = true
    w.dataLayer = w.dataLayer || []
    w.gtag = function gtag() { w.dataLayer!.push(arguments) } // eslint-disable-line prefer-rest-params
    w.gtag("js", new Date())
    w.gtag("config", GA_ID, { anonymize_ip: true })
    script(`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`)
  }

  if (c.anuncios && PIXEL_ID && !pixelCarregado) {
    pixelCarregado = true
    const fbq = function (...args: unknown[]) {
      const f = fbq as unknown as { callMethod?: (...a: unknown[]) => void; queue: unknown[] }
      if (f.callMethod) f.callMethod(...args)
      else f.queue.push(args)
    } as Janela["fbq"] & { queue: unknown[] }
    fbq!.queue = []
    fbq!.loaded = true
    fbq!.version = "2.0"
    fbq!.push = fbq
    w.fbq = fbq
    w._fbq = fbq
    script("https://connect.facebook.net/en_US/fbevents.js")
    w.fbq!("init", PIXEL_ID)
    w.fbq!("track", "PageView")
  }
}

const PARA_GA: Record<string, string> = {
  cadastro: "sign_up",
  pousada_criada: "pousada_criada",
  reserva_criada: "reserva_criada",
  inicio_checkout: "begin_checkout",
  assinatura: "purchase",
}
const PARA_META: Record<string, [string, boolean]> = {
  cadastro: ["CompleteRegistration", false],
  pousada_criada: ["StartTrial", false],
  reserva_criada: ["ReservaCriada", true],
  inicio_checkout: ["InitiateCheckout", false],
  assinatura: ["Subscribe", false],
}

export type EventoDeFunil = keyof typeof PARA_GA

/** Registra um evento de funil nos rastreadores carregados. Sem consentimento, não faz nada. */
export function rastrear(evento: EventoDeFunil, params: Record<string, unknown> = {}): void {
  if (typeof window === "undefined") return
  const w = window as Janela
  try {
    w.gtag?.("event", PARA_GA[evento], params)
    const [nome, custom] = PARA_META[evento]
    w.fbq?.(custom ? "trackCustom" : "track", nome, params)
  } catch {
    /* medição nunca quebra a tela */
  }
}

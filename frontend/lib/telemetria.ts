import { API_URL } from "./api"

/**
 * Manda um erro do navegador para o backend (que loga e repassa ao Sentry,
 * se configurado). Silencioso de propósito: reportar erro nunca pode gerar
 * outro erro na tela.
 */
export function reportarErroDoNavegador(erro: unknown, extra?: string): void {
  try {
    const e = erro instanceof Error ? erro : new Error(String(erro))
    const corpo = JSON.stringify({
      mensagem: e.message,
      stack: [e.stack, extra].filter(Boolean).join("\n").slice(0, 4000),
      pagina: window.location.pathname,
    })
    // keepalive: o envio sobrevive ao "Recarregar página" logo em seguida.
    void fetch(`${API_URL}/telemetria/erro`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: corpo,
      keepalive: true,
    }).catch(() => {})
  } catch {
    /* nada */
  }
}

/** Erros fora do React (promessas soltas, handlers de evento). */
export function instalarCapturaGlobal(): void {
  if (typeof window === "undefined" || (window as { __capturaInstalada?: boolean }).__capturaInstalada) return
  ;(window as { __capturaInstalada?: boolean }).__capturaInstalada = true
  window.addEventListener("error", (ev) => reportarErroDoNavegador(ev.error ?? ev.message))
  window.addEventListener("unhandledrejection", (ev) => reportarErroDoNavegador(ev.reason))
}

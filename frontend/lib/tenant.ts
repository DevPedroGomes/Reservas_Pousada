/**
 * Pousada ativa DESTA aba.
 *
 * Fica no sessionStorage (escopo da aba), não no localStorage nem só no
 * servidor: duas abas abertas em pousadas diferentes precisam continuar cada
 * uma na sua. Toda chamada à API leva o id no header `X-Pousada-Id`, e o
 * backend confere o vínculo a cada requisição.
 */
const CHAVE = "diaria:pousada-ativa"

export function pousadaDaAba(): number | null {
  if (typeof window === "undefined") return null
  try {
    const v = Number(window.sessionStorage.getItem(CHAVE))
    return Number.isInteger(v) && v > 0 ? v : null
  } catch {
    return null
  }
}

export function fixarPousadaDaAba(id: number | null): void {
  if (typeof window === "undefined") return
  try {
    if (id) window.sessionStorage.setItem(CHAVE, String(id))
    else window.sessionStorage.removeItem(CHAVE)
  } catch {
    /* modo privado sem storage: segue com a pousada padrão do servidor */
  }
}

/** Header para anexar às chamadas. Vazio quando a aba ainda não escolheu. */
export function cabecalhoDaPousada(): Record<string, string> {
  const id = pousadaDaAba()
  return id ? { "X-Pousada-Id": String(id) } : {}
}

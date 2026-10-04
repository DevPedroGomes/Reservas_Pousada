"use client"

import { useEffect, useRef } from "react"

/**
 * Recarrega os dados da tela sozinho: ao voltar para a aba e a cada
 * `intervaloMs` enquanto ela estiver visível.
 *
 * Duas recepcionistas trabalhando ao mesmo tempo não viam as reservas uma da
 * outra até recarregar a página — e reservavam em cima de um quadro velho.
 * Aba em segundo plano não consulta nada (não gasta API nem bateria).
 */
export function useAtualizacaoAutomatica(recarregar: () => void, intervaloMs = 60_000) {
  const fn = useRef(recarregar)
  fn.current = recarregar
  const ultima = useRef(Date.now())

  useEffect(() => {
    const talvez = () => {
      if (document.visibilityState !== "visible") return
      // focus e visibilitychange costumam disparar juntos: um só recarregamento.
      if (Date.now() - ultima.current < 5_000) return
      ultima.current = Date.now()
      fn.current()
    }
    const id = window.setInterval(talvez, intervaloMs)
    document.addEventListener("visibilitychange", talvez)
    window.addEventListener("focus", talvez)
    return () => {
      window.clearInterval(id)
      document.removeEventListener("visibilitychange", talvez)
      window.removeEventListener("focus", talvez)
    }
  }, [intervaloMs])
}

"use client"

import { useEffect, useState } from "react"
import { API_URL, authenticatedFetch } from "../lib/api"

export interface Cotacao {
  quarto: string
  noites: { data: string; valorCentavos: number | null; regra: string | null }[]
  totalCentavos: number | null
  minimoNoites: number | null
  atendeMinimo: boolean
  semPreco: boolean
}

/** Valor sugerido pelo tarifário para quarto + datas (recalcula ao mudar). */
export function useCotacao(quarto: number | string, entrada: string, saida: string) {
  const [cotacao, setCotacao] = useState<Cotacao | null>(null)

  useEffect(() => {
    const n = Number(quarto)
    if (!n || !entrada || !saida || entrada >= saida) { setCotacao(null); return }
    let cancelado = false
    const t = setTimeout(async () => {
      try {
        const r = await authenticatedFetch(`${API_URL}/tarifas/cotacao?quarto=${n}&entrada=${entrada}&saida=${saida}`)
        const d = await r.json()
        if (!cancelado) setCotacao(d.sucesso ? d.cotacao : null)
      } catch {
        if (!cancelado) setCotacao(null)
      }
    }, 250)
    return () => { cancelado = true; clearTimeout(t) }
  }, [quarto, entrada, saida])

  return cotacao
}

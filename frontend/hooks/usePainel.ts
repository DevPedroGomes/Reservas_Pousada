"use client"

import { useCallback, useState } from "react"
import { API_URL, authenticatedFetch } from "../lib/api"
import { agendaDaApi } from "../lib/adaptadores"
import type { Agenda } from "../lib/types"

export interface EstatisticasPainel {
  quartos_ocupados: number
  quartos_disponiveis: number
  taxa_ocupacao: number
  receita_pendente: number
  reservas_ativas: number
}

/** Números e agenda do painel. */
export function usePainel(pousadaId: number | undefined) {
  const [estatisticas, setEstatisticas] = useState<EstatisticasPainel | null>(null)
  const [agenda, setAgenda] = useState<Agenda | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    if (!pousadaId) return
    try {
      const [r1, r2] = await Promise.all([
        authenticatedFetch(`${API_URL}/pousadas/${pousadaId}/dashboard`),
        authenticatedFetch(`${API_URL}/reservas/agenda?dias=7`),
      ])
      const [d1, d2] = await Promise.all([r1.json(), r2.json()])
      if (d1.sucesso) setEstatisticas(d1.estatisticas)
      if (d2.sucesso) setAgenda(agendaDaApi(d2))
      setErro(d1.sucesso && d2.sucesso ? null : d1.mensagem || d2.mensagem || "Não foi possível carregar o painel.")
    } catch {
      setErro("Não foi possível conectar ao servidor. Verifique sua conexão.")
    }
  }, [pousadaId])

  return { estatisticas, agenda, erro, carregar }
}

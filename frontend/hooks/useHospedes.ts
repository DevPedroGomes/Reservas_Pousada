"use client"

import { useCallback, useState } from "react"
import { API_URL, authenticatedFetch } from "../lib/api"
import { estadiaDaApi, hospedeDaApi } from "../lib/adaptadores"
import type { EstadiaDoHospede, Hospede } from "../lib/types"

/** Busca na base de hóspedes da pousada (nome, telefone ou documento exato). */
export async function buscarHospedes(busca: string, limite = 50, pagina = 1) {
  const params = new URLSearchParams({ limite: String(limite), pagina: String(pagina) })
  if (busca.trim()) params.set("busca", busca.trim())
  const r = await authenticatedFetch(`${API_URL}/hospedes?${params}`)
  const d = await r.json()
  if (!d.sucesso) throw new Error(d.mensagem || "Não foi possível buscar hóspedes.")
  return {
    hospedes: (d.hospedes as Record<string, unknown>[]).map(hospedeDaApi),
    total: d.total as number,
    paginas: d.paginas as number,
  }
}

/** Ficha de um hóspede: cadastro + histórico de estadias. */
export function useHospede(id: number) {
  const [hospede, setHospede] = useState<Hospede | null>(null)
  const [historico, setHistorico] = useState<EstadiaDoHospede[]>([])
  const [naoEncontrado, setNaoEncontrado] = useState(false)

  const carregar = useCallback(async () => {
    const r = await authenticatedFetch(`${API_URL}/hospedes/${id}`)
    const d = await r.json()
    if (!d.sucesso) { setNaoEncontrado(true); return }
    setHospede(hospedeDaApi(d.hospede))
    setHistorico((d.historico as Record<string, unknown>[]).map(estadiaDaApi))
  }, [id])

  const salvar = useCallback(async (dados: Partial<Hospede>): Promise<{ sucesso: boolean; mensagem: string }> => {
    try {
      const r = await authenticatedFetch(`${API_URL}/hospedes/${id}`, { method: "PUT", body: JSON.stringify(dados) })
      const d = await r.json()
      if (d.sucesso) {
        setHospede(hospedeDaApi(d.hospede))
        return { sucesso: true, mensagem: "Cadastro atualizado." }
      }
      return { sucesso: false, mensagem: [d.mensagem, ...(d.erros ?? [])].filter(Boolean).join(" ") }
    } catch {
      return { sucesso: false, mensagem: "Não foi possível conectar ao servidor." }
    }
  }, [id])

  return { hospede, historico, naoEncontrado, carregar, salvar }
}

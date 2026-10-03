"use client"

import { useCallback, useState } from "react"
import { API_URL, authenticatedFetch } from "../lib/api"
import { membroDaApi } from "../lib/adaptadores"
import type { MembroEquipe, Message } from "../lib/types"

/** Membros da pousada: listar, trocar papel, remover. */
export function useEquipe(pousadaId: number | undefined) {
  const [membros, setMembros] = useState<MembroEquipe[]>([])
  const [carregando, setCarregando] = useState(false)
  const [mensagem, setMensagem] = useState<Message | null>(null)

  const carregar = useCallback(async () => {
    if (!pousadaId) return
    setCarregando(true)
    try {
      const r = await authenticatedFetch(`${API_URL}/pousadas/${pousadaId}/usuarios`)
      const d = await r.json()
      if (d.sucesso) setMembros((d.usuarios || []).map(membroDaApi))
    } finally {
      setCarregando(false)
    }
  }, [pousadaId])

  const trocarPapel = useCallback(async (userId: string, role: string) => {
    if (!pousadaId) return
    const r = await authenticatedFetch(`${API_URL}/pousadas/${pousadaId}/usuarios/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    })
    const d = await r.json()
    setMensagem({ type: d.sucesso ? "success" : "error", text: d.mensagem || (d.sucesso ? "Papel atualizado." : "Não foi possível alterar o papel.") })
    await carregar()
  }, [pousadaId, carregar])

  const remover = useCallback(async (userId: string) => {
    if (!pousadaId) return
    const r = await authenticatedFetch(`${API_URL}/pousadas/${pousadaId}/usuarios/${userId}`, { method: "DELETE" })
    const d = await r.json()
    setMensagem({ type: d.sucesso ? "success" : "error", text: d.mensagem || "Não foi possível remover." })
    await carregar()
  }, [pousadaId, carregar])

  return { membros, carregando, mensagem, setMensagem, carregar, trocarPapel, remover }
}

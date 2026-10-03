"use client"

import { useCallback, useState } from "react"
import { API_URL, authenticatedFetch } from "../lib/api"
import type { Message, Quarto } from "../lib/types"

/** Cadastro de quartos da pousada da aba. */
export function useQuartos() {
  const [quartos, setQuartos] = useState<Quarto[]>([])
  const [carregando, setCarregando] = useState(false)
  const [mensagem, setMensagem] = useState<Message | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const r = await authenticatedFetch(`${API_URL}/quartos`)
      const d = await r.json()
      if (d.sucesso) setQuartos(d.quartos)
    } finally {
      setCarregando(false)
    }
  }, [])

  const salvar = useCallback(async (dados: Partial<Quarto>, id?: number) => {
    setMensagem(null)
    const r = await authenticatedFetch(`${API_URL}/quartos${id ? `/${id}` : ""}`, {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(dados),
    })
    const d = await r.json()
    setMensagem({
      type: d.sucesso ? "success" : "error",
      text: d.sucesso ? (id ? "Quarto atualizado." : "Quarto criado.") : [d.mensagem, ...(d.erros ?? [])].filter(Boolean).join(" "),
    })
    if (d.sucesso) await carregar()
    return Boolean(d.sucesso)
  }, [carregar])

  const remover = useCallback(async (id: number) => {
    setMensagem(null)
    const r = await authenticatedFetch(`${API_URL}/quartos/${id}`, { method: "DELETE" })
    const d = await r.json()
    setMensagem({ type: d.sucesso ? "success" : "error", text: d.mensagem || "Não foi possível remover." })
    if (d.sucesso) await carregar()
  }, [carregar])

  return { quartos, carregando, mensagem, setMensagem, carregar, salvar, remover }
}

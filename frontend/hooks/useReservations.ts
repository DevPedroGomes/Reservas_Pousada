"use client"

import { useState, useCallback, useMemo } from "react"
import { API_URL, authenticatedFetch } from "../lib/api"
import { normalizarCpf, isDataNoPassado, formatarData } from "../lib/formatters"
import type { Reserva, Auditoria, PaginationMeta, FiltersState, Message } from "../lib/types"

const initialFilters: FiltersState = {
  status: "",
  data_inicio: "",
  data_fim: "",
  pago: "",
  search: "",
}

const initialMeta: PaginationMeta = {
  pagina: 1,
  paginas: 1,
  total: 0,
  limite: 50,
}

interface UseReservationsReturn {
  // State
  reservas: Reserva[]
  dashReservas: Reserva[]
  filters: FiltersState
  meta: PaginationMeta
  loading: boolean
  exporting: boolean
  auditLogs: Auditoria[]

  // Computed
  reservasAtivas: number
  reservasHoje: number

  // Actions
  setFilters: (filters: FiltersState) => void
  clearFilters: () => void
  carregarReservas: (pageNum?: number) => Promise<void>
  carregarDashboard: () => Promise<void>
  exportarCsv: () => Promise<void>
  editarReserva: (id: number) => Promise<Reserva | null>
  salvarReserva: (form: Reserva, formId: number | null) => Promise<{ sucesso: boolean; mensagem: string }>
  excluirReserva: (id: number) => Promise<boolean>
  carregarAuditoria: (reservaId: number) => Promise<void>
  setPage: (page: number) => void
}

export function useReservations(token: string | null): UseReservationsReturn {
  const [reservas, setReservas] = useState<Reserva[]>([])
  const [dashReservas, setDashReservas] = useState<Reserva[]>([])
  const [filters, setFilters] = useState<FiltersState>(initialFilters)
  const [meta, setMeta] = useState<PaginationMeta>(initialMeta)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [auditLogs, setAuditLogs] = useState<Auditoria[]>([])

  // Computed values
  const reservasAtivas = useMemo(
    () => dashReservas.filter((r) => r.status === "ativa").length,
    [dashReservas]
  )

  const reservasHoje = useMemo(() => {
    const hoje = new Date().toISOString().split("T")[0]
    return dashReservas.filter(
      (r) => r.data_entrada === hoje || r.data_saida === hoje
    ).length
  }, [dashReservas])

  const clearFilters = useCallback(() => {
    setFilters(initialFilters)
  }, [])

  const setPage = useCallback((page: number) => {
    setMeta((prev) => ({ ...prev, pagina: page }))
  }, [])

  // Carregar dashboard
  const carregarDashboard = useCallback(async () => {
    if (!token) return
    try {
      const response = await authenticatedFetch(`${API_URL}/reservas`, {}, token)
      const data = await response.json()
      if (data.sucesso) {
        setDashReservas(data.reservas || [])
      }
    } catch (error) {
      console.error("Erro ao carregar dashboard", error)
    }
  }, [token])

  // Carregar reservas com filtros
  const carregarReservas = useCallback(async (pageNum?: number) => {
    if (!token) return
    setLoading(true)

    try {
      const params = new URLSearchParams()
      if (filters.status) params.append("status", filters.status)
      if (filters.data_inicio && filters.data_fim) {
        params.append("data_inicio", filters.data_inicio)
        params.append("data_fim", filters.data_fim)
      }
      if (filters.pago) params.append("pago", filters.pago)
      if (filters.search) params.append("search", filters.search)
      params.append("page", String(pageNum || meta.pagina))
      params.append("limit", String(meta.limite || 50))

      const url = `${API_URL}/reservas${params.toString() ? `?${params.toString()}` : ""}`
      const response = await authenticatedFetch(url, {}, token)
      const data = await response.json()

      if (data.sucesso) {
        setReservas(data.reservas || [])
        if (data.meta) setMeta(data.meta)
      }
    } catch (error) {
      console.error("Erro ao carregar reservas", error)
    } finally {
      setLoading(false)
    }
  }, [token, filters, meta.pagina, meta.limite])

  // Exportar CSV
  const exportarCsv = useCallback(async () => {
    if (!token) return
    setExporting(true)

    try {
      const params = new URLSearchParams()
      if (filters.status) params.append("status", filters.status)
      if (filters.data_inicio && filters.data_fim) {
        params.append("data_inicio", filters.data_inicio)
        params.append("data_fim", filters.data_fim)
      }
      if (filters.pago) params.append("pago", filters.pago)
      if (filters.search) params.append("search", filters.search)

      const url = `${API_URL}/reservas/export${params.toString() ? `?${params.toString()}` : ""}`
      const response = await authenticatedFetch(url, {}, token)
      const text = await response.text()
      const blob = new Blob([text], { type: "text/csv;charset=utf-8;" })
      const link = document.createElement("a")
      link.href = URL.createObjectURL(blob)
      link.download = "reservas.csv"
      link.click()
      URL.revokeObjectURL(link.href)
    } catch (error) {
      console.error("Erro ao exportar CSV", error)
    } finally {
      setExporting(false)
    }
  }, [token, filters])

  // Editar reserva (carregar dados)
  const editarReserva = useCallback(async (id: number): Promise<Reserva | null> => {
    if (!token) return null

    try {
      const response = await authenticatedFetch(`${API_URL}/reservas/${id}`, {}, token)
      const data = await response.json()

      if (data.sucesso) {
        return data.reserva as Reserva
      }
      return null
    } catch (error) {
      console.error("Erro ao carregar reserva", error)
      return null
    }
  }, [token])

  // Salvar reserva (criar ou atualizar)
  const salvarReserva = useCallback(async (
    form: Reserva,
    formId: number | null
  ): Promise<{ sucesso: boolean; mensagem: string }> => {
    if (!token) return { sucesso: false, mensagem: "Nao autenticado" }

    const erros: string[] = []
    const cpfNormalizado = normalizarCpf(form.cpf)

    if (cpfNormalizado.length !== 11) {
      erros.push("CPF deve ter 11 digitos.")
    }

    if (!form.data_entrada || !form.data_saida) {
      erros.push("Datas de entrada e saida sao obrigatorias.")
    } else {
      if (isDataNoPassado(form.data_entrada)) {
        erros.push("Data de entrada nao pode estar no passado.")
      }
      if (isDataNoPassado(form.data_saida)) {
        erros.push("Data de saida nao pode estar no passado.")
      }
      const entrada = new Date(`${form.data_entrada}T00:00:00`)
      const saida = new Date(`${form.data_saida}T00:00:00`)
      if (entrada >= saida) {
        erros.push("Data de entrada deve ser anterior a data de saida.")
      }
    }

    if (erros.length > 0) {
      return { sucesso: false, mensagem: erros.join(" ") }
    }

    const payload = {
      ...form,
      cpf: cpfNormalizado,
      valor: form.valor ? Number(form.valor) : null,
      pago: Boolean(form.pago),
    }

    try {
      const url = formId ? `${API_URL}/reservas/${formId}` : `${API_URL}/reservas`
      const response = await authenticatedFetch(url, {
        method: formId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }, token)

      const data = await response.json()

      if (data.sucesso) {
        return {
          sucesso: true,
          mensagem: formId ? "Reserva atualizada com sucesso." : "Reserva criada com sucesso.",
        }
      } else {
        const detalhesConflito = data.conflitos?.length
          ? ` Conflitos: ${data.conflitos
              .map((c: Reserva) =>
                `Quarto ${c.quarto} entre ${formatarData(c.data_entrada)} e ${formatarData(c.data_saida)}`
              )
              .join("; ")}`
          : ""
        return {
          sucesso: false,
          mensagem: `${data.mensagem || "Erro ao salvar reserva."}${detalhesConflito}`,
        }
      }
    } catch (error) {
      console.error("Erro ao salvar reserva", error)
      return { sucesso: false, mensagem: "Erro ao salvar reserva." }
    }
  }, [token])

  // Excluir reserva
  const excluirReserva = useCallback(async (id: number): Promise<boolean> => {
    if (!token) return false

    try {
      const response = await authenticatedFetch(`${API_URL}/reservas/${id}`, {
        method: "DELETE",
      }, token)

      const data = await response.json()
      return data.sucesso
    } catch (error) {
      console.error("Erro ao excluir reserva", error)
      return false
    }
  }, [token])

  // Carregar auditoria
  const carregarAuditoria = useCallback(async (reservaId: number) => {
    if (!token) return

    try {
      const response = await authenticatedFetch(
        `${API_URL}/reservas/${reservaId}/auditoria`,
        {},
        token
      )
      const data = await response.json()

      if (data.sucesso) {
        setAuditLogs(data.auditoria || [])
      }
    } catch (error) {
      console.error("Erro ao carregar auditoria", error)
    }
  }, [token])

  return {
    reservas,
    dashReservas,
    filters,
    meta,
    loading,
    exporting,
    auditLogs,
    reservasAtivas,
    reservasHoje,
    setFilters,
    clearFilters,
    carregarReservas,
    carregarDashboard,
    exportarCsv,
    editarReserva,
    salvarReserva,
    excluirReserva,
    carregarAuditoria,
    setPage,
  }
}

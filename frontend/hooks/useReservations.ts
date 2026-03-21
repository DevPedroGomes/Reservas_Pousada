"use client"

import { useState, useCallback, useMemo } from "react"
import { API_URL, authenticatedFetch, NetworkError } from "../lib/api"
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
  dashboardStats: DashboardStats | null
  filters: FiltersState
  meta: PaginationMeta
  loading: boolean
  exporting: boolean
  auditLogs: Auditoria[]
  error: string | null

  // Computed
  reservasAtivas: number
  reservasHoje: number

  // Actions
  setFilters: (filters: FiltersState) => void
  clearFilters: () => void
  clearError: () => void
  carregarReservas: (pageNum?: number) => Promise<void>
  carregarDashboard: () => Promise<void>
  exportarCsv: () => Promise<void>
  editarReserva: (id: number) => Promise<Reserva | null>
  salvarReserva: (form: Reserva, formId: number | null) => Promise<{ sucesso: boolean; mensagem: string }>
  excluirReserva: (id: number) => Promise<boolean>
  carregarAuditoria: (reservaId: number) => Promise<void>
  setPage: (page: number) => void
}

interface DashboardStats {
  reservas_ativas: number
  reservas_hoje: number
  quartos_ocupados: number
  quartos_disponiveis: number
  taxa_ocupacao: number
  receita_total: number
  receita_pendente: number
  total_reservas: number
}

export function useReservations(isAuthenticated: boolean = false, pousadaId?: number | null): UseReservationsReturn {
  const [reservas, setReservas] = useState<Reserva[]>([])
  const [dashReservas, setDashReservas] = useState<Reserva[]>([])
  const [filters, setFilters] = useState<FiltersState>(initialFilters)
  const [meta, setMeta] = useState<PaginationMeta>(initialMeta)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [auditLogs, setAuditLogs] = useState<Auditoria[]>([])
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null)
  const [error, setError] = useState<string | null>(null)

  const clearError = useCallback(() => setError(null), [])

  // Computed values — prefer SQL stats when available
  const reservasAtivas = useMemo(
    () => dashboardStats?.reservas_ativas ?? dashReservas.filter((r) => r.status === "ativa").length,
    [dashboardStats, dashReservas]
  )

  const reservasHoje = useMemo(() => {
    if (dashboardStats) return dashboardStats.reservas_hoje
    const hoje = new Date().toISOString().split("T")[0]
    return dashReservas.filter(
      (r) => r.data_entrada === hoje || r.data_saida === hoje
    ).length
  }, [dashboardStats, dashReservas])

  const clearFilters = useCallback(() => {
    setFilters(initialFilters)
  }, [])

  const setPage = useCallback((page: number) => {
    setMeta((prev) => ({ ...prev, pagina: page }))
  }, [])

  // Carregar dashboard
  const carregarDashboard = useCallback(async () => {
    if (!isAuthenticated) return
    try {
      setError(null)
      const fetches: Promise<Response>[] = [
        authenticatedFetch(`${API_URL}/reservas`),
      ]
      if (pousadaId) {
        fetches.push(authenticatedFetch(`${API_URL}/pousadas/${pousadaId}/dashboard`))
      }
      const responses = await Promise.all(fetches)
      const reservasData = await responses[0].json()
      if (reservasData.sucesso) {
        setDashReservas(reservasData.reservas || [])
      }
      if (pousadaId && responses[1]) {
        const statsData = await responses[1].json()
        if (statsData.sucesso) {
          setDashboardStats(statsData.estatisticas)
        }
      }
    } catch (err) {
      if (err instanceof NetworkError) {
        setError("Nao foi possivel conectar ao servidor. Verifique sua conexao.")
      } else {
        console.error("Erro ao carregar dashboard", err)
      }
    }
  }, [isAuthenticated, pousadaId])

  // Carregar reservas com filtros
  const carregarReservas = useCallback(async (pageNum?: number) => {
    if (!isAuthenticated) return
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
      const response = await authenticatedFetch(url)
      const data = await response.json()

      if (data.sucesso) {
        setReservas(data.reservas || [])
        if (data.meta) setMeta(data.meta)
      }
    } catch (err) {
      if (err instanceof NetworkError) {
        setError("Nao foi possivel conectar ao servidor. Verifique sua conexao.")
      } else {
        console.error("Erro ao carregar reservas", err)
      }
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated, filters, meta.pagina, meta.limite])

  // Exportar CSV
  const exportarCsv = useCallback(async () => {
    if (!isAuthenticated) return
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
      const response = await authenticatedFetch(url)
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
  }, [isAuthenticated, filters])

  // Editar reserva (carregar dados)
  const editarReserva = useCallback(async (id: number): Promise<Reserva | null> => {
    if (!isAuthenticated) return null

    try {
      const response = await authenticatedFetch(`${API_URL}/reservas/${id}`)
      const data = await response.json()

      if (data.sucesso) {
        return data.reserva as Reserva
      }
      return null
    } catch (error) {
      console.error("Erro ao carregar reserva", error)
      return null
    }
  }, [isAuthenticated])

  // Salvar reserva (criar ou atualizar)
  const salvarReserva = useCallback(async (
    form: Reserva,
    formId: number | null
  ): Promise<{ sucesso: boolean; mensagem: string }> => {
    if (!isAuthenticated) return { sucesso: false, mensagem: "Nao autenticado" }

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

    const payload: Record<string, unknown> = {
      ...form,
      cpf: cpfNormalizado,
      valor: form.valor ? Number(form.valor) : null,
      pago: Boolean(form.pago),
    }

    // Include version for optimistic locking on updates
    if (formId && form.version !== undefined) {
      payload.version = form.version
    }

    try {
      const url = formId ? `${API_URL}/reservas/${formId}` : `${API_URL}/reservas`
      const response = await authenticatedFetch(url, {
        method: formId ? "PUT" : "POST",
        body: JSON.stringify(payload),
      })

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
  }, [isAuthenticated])

  // Excluir reserva
  const excluirReserva = useCallback(async (id: number): Promise<boolean> => {
    if (!isAuthenticated) return false

    try {
      const response = await authenticatedFetch(`${API_URL}/reservas/${id}`, {
        method: "DELETE",
      })

      const data = await response.json()
      return data.sucesso
    } catch (error) {
      console.error("Erro ao excluir reserva", error)
      return false
    }
  }, [isAuthenticated])

  // Carregar auditoria
  const carregarAuditoria = useCallback(async (reservaId: number) => {
    if (!isAuthenticated) return

    try {
      const response = await authenticatedFetch(
        `${API_URL}/reservas/${reservaId}/auditoria`
      )
      const data = await response.json()

      if (data.sucesso) {
        setAuditLogs(data.auditoria || [])
      }
    } catch (error) {
      console.error("Erro ao carregar auditoria", error)
    }
  }, [isAuthenticated])

  return {
    reservas,
    dashReservas,
    dashboardStats,
    filters,
    meta,
    loading,
    exporting,
    auditLogs,
    error,
    reservasAtivas,
    reservasHoje,
    setFilters,
    clearFilters,
    clearError,
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

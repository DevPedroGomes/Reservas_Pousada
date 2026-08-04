/**
 * Funcoes de formatacao para exibicao de dados
 */

import type { Auditoria } from "./types"

/**
 * Formata uma data ISO para o formato brasileiro DD/MM/YYYY.
 *
 * `new Date("2026-08-03")` é interpretado como MEIA-NOITE UTC. Num navegador em
 * UTC-3 isso vira 20:00 do dia 02, e `toLocaleDateString` imprimia 02/08/2026
 * para uma reserva que o banco diz ser do dia 03 — um dia a menos em TODA data
 * exibida no sistema.
 *
 * Acrescentar `T00:00:00` (sem `Z`) faz o JS interpretar no fuso local, que é o
 * significado correto de uma data sem hora.
 */
export function formatarData(data: string): string {
  if (!data) return "-"
  const somenteData = /^\d{4}-\d{2}-\d{2}$/.test(data)
  return new Date(somenteData ? `${data}T00:00:00` : data).toLocaleDateString("pt-BR")
}

/**
 * Formata um valor numerico como moeda brasileira
 */
export function formatarValor(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return "-"
  return Number(valor).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/**
 * Formata um valor como moeda com simbolo R$
 */
export function formatarMoeda(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return "-"
  return Number(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
}

/**
 * Remove caracteres nao numericos do CPF
 */
export function normalizarCpf(cpf: string): string {
  return (cpf || "").replace(/\D/g, "")
}

/**
 * Formata CPF com mascara XXX.XXX.XXX-XX
 */
export function formatarCpf(cpf: string): string {
  const numeros = normalizarCpf(cpf)
  if (numeros.length !== 11) return cpf
  return numeros.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")
}

/**
 * Verifica se uma data esta no passado
 */
export function isDataNoPassado(data: string): boolean {
  if (!data) return true
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const dataVerificada = new Date(`${data}T00:00:00`)
  return dataVerificada < hoje
}

/**
 * Data de hoje no fuso do navegador, como YYYY-MM-DD.
 * `toISOString()` daria a data em UTC — depois das 21h em Brasília, amanhã.
 */
export function hojeISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

/**
 * Verifica se uma data e hoje
 */
export function isDataHoje(data: string): boolean {
  if (!data) return false
  return data === hojeISO()
}

/**
 * Formata uma data/hora ISO para formato brasileiro
 */
export function formatarDataHora(data: string): string {
  if (!data) return "-"
  const d = new Date(data)
  return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`
}

/**
 * Gera um resumo textual de um log de auditoria
 */
export function renderResumoAuditoria(log: Auditoria): string {
  const antesStatus = log.details?.antes?.status
  const depoisStatus = log.details?.depois?.status

  if (antesStatus && depoisStatus && antesStatus !== depoisStatus) {
    return `Status: ${antesStatus} -> ${depoisStatus}`
  }

  if (log.details?.antes && log.details?.depois) {
    return "Alteracao de dados da reserva."
  }

  if (log.action === "criar") return "Reserva criada."
  if (log.action === "excluir") return "Reserva removida."

  return "Atualizacao registrada."
}

/**
 * Retorna a variante do badge baseado no status
 */
export function getStatusBadgeVariant(
  status: string
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "ativa":
      return "default"
    case "finalizada":
      return "secondary"
    case "cancelada":
      return "destructive"
    default:
      return "outline"
  }
}

/**
 * Retorna o label traduzido do status
 */
export function getStatusLabel(status: string): string {
  switch (status) {
    case "ativa":
      return "Ativa"
    case "finalizada":
      return "Finalizada"
    case "cancelada":
      return "Cancelada"
    default:
      return status
  }
}

/**
 * Trunca texto com reticencias
 */
export function truncateText(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) return text || ""
  return `${text.slice(0, maxLength)}...`
}

"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Button } from "../ui/button"
import { Badge } from "../ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { Select } from "../ui/select"
import { Textarea } from "../ui/textarea"
import { formatarDataHora, renderResumoAuditoria } from "../../lib/formatters"
import type { Reserva, Auditoria } from "../../lib/types"

interface ReservationFormProps {
  initialData?: Reserva | null
  isEditing: boolean
  totalQuartos: number
  auditLogs: Auditoria[]
  onSubmit: (data: Reserva) => Promise<void>
  onCancel: () => void
  loading?: boolean
}

const emptyForm: Reserva = {
  nome: "",
  cpf: "",
  quarto: 1,
  data_entrada: "",
  data_saida: "",
  status: "ativa",
  valor: null,
  pago: false,
  observacoes: "",
}

export function ReservationForm({
  initialData,
  isEditing,
  totalQuartos,
  auditLogs,
  onSubmit,
  onCancel,
  loading = false,
}: ReservationFormProps) {
  const [form, setForm] = useState<Reserva>(emptyForm)

  useEffect(() => {
    if (initialData) {
      setForm({
        ...initialData,
        valor: initialData.valor ?? null,
        pago: Boolean(initialData.pago),
        observacoes: initialData.observacoes || "",
      })
    } else {
      setForm(emptyForm)
    }
  }, [initialData])

  const handleChange = (field: keyof Reserva) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const value = e.target.type === "checkbox"
      ? (e.target as HTMLInputElement).checked
      : e.target.value

    setForm((prev) => ({
      ...prev,
      [field]: field === "quarto" ? Number(value) : value,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await onSubmit(form)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <Badge
            variant="outline"
            className="mb-2 border-primary/20 bg-primary/5 text-primary px-3 py-1 text-xs font-bold uppercase tracking-wider"
          >
            Cadastro
          </Badge>
          <h2 className="text-4xl font-bold tracking-tight">
            {isEditing ? "Editar Reserva" : "Nova Reserva"}
          </h2>
        </div>
        <Badge variant="outline" className="w-fit font-medium">
          * Campos obrigatorios
        </Badge>
      </div>

      <Card className="border-2 shadow-xl">
        <CardContent className="pt-6">
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="nome" className="text-sm font-semibold">
                  Nome do Hospede *
                </Label>
                <Input
                  id="nome"
                  value={form.nome}
                  onChange={handleChange("nome")}
                  required
                  className="border-2 h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cpf" className="text-sm font-semibold">
                  CPF *
                </Label>
                <Input
                  id="cpf"
                  value={form.cpf}
                  onChange={handleChange("cpf")}
                  required
                  className="border-2 h-11"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="quarto" className="text-sm font-semibold">
                  Quarto *
                </Label>
                <Select
                  id="quarto"
                  value={form.quarto}
                  onChange={handleChange("quarto")}
                  required
                  className="border-2 h-11"
                >
                  {Array.from({ length: totalQuartos }, (_, idx) => idx + 1).map((num) => (
                    <option key={num} value={num}>
                      Quarto {num}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="data-entrada" className="text-sm font-semibold">
                  Data de Entrada *
                </Label>
                <Input
                  id="data-entrada"
                  type="date"
                  value={form.data_entrada}
                  onChange={handleChange("data_entrada")}
                  required
                  className="border-2 h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="data-saida" className="text-sm font-semibold">
                  Data de Saida *
                </Label>
                <Input
                  id="data-saida"
                  type="date"
                  value={form.data_saida}
                  onChange={handleChange("data_saida")}
                  required
                  className="border-2 h-11"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="valor" className="text-sm font-semibold">
                  Valor (R$)
                </Label>
                <Input
                  id="valor"
                  type="number"
                  step="0.01"
                  value={form.valor ?? ""}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      valor: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                  className="border-2 h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status" className="text-sm font-semibold">
                  Status *
                </Label>
                <Select
                  id="status"
                  value={form.status}
                  onChange={handleChange("status")}
                  required
                  className="border-2 h-11"
                >
                  <option value="ativa">Ativa</option>
                  <option value="finalizada">Finalizada</option>
                  <option value="cancelada">Cancelada</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pago" className="text-sm font-semibold">
                  Pago
                </Label>
                <label
                  htmlFor="pago"
                  className="flex cursor-pointer items-center gap-3 h-11 rounded-xl border-2 border-border bg-white px-4"
                >
                  <input
                    id="pago"
                    type="checkbox"
                    checked={form.pago}
                    onChange={(e) => setForm((prev) => ({ ...prev, pago: e.target.checked }))}
                    className="h-5 w-5 rounded border-2 border-border"
                  />
                  <span className="text-sm font-medium">Pagamento recebido</span>
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="observacoes" className="text-sm font-semibold">
                Observacoes
              </Label>
              <Textarea
                id="observacoes"
                value={form.observacoes || ""}
                onChange={handleChange("observacoes")}
                rows={4}
                className="border-2"
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="submit"
                className="font-semibold h-11 px-8 shadow-lg shadow-primary/25"
                disabled={loading}
              >
                {loading ? "Salvando..." : isEditing ? "Atualizar Reserva" : "Criar Reserva"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                className="font-semibold h-11 px-8 border-2"
                disabled={loading}
              >
                Cancelar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {isEditing && auditLogs.length > 0 && (
        <AuditHistory logs={auditLogs} />
      )}
    </div>
  )
}

interface AuditHistoryProps {
  logs: Auditoria[]
}

export function AuditHistory({ logs }: AuditHistoryProps) {
  return (
    <Card className="border-2 shadow-xl">
      <CardHeader>
        <CardTitle className="text-xl font-bold">Historico de Alteracoes</CardTitle>
        <CardDescription>Registro de todas as modificacoes desta reserva</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {logs.map((log) => (
            <div
              key={log.id}
              className="border-2 border-border rounded-xl p-4 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-foreground">{renderResumoAuditoria(log)}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Por:{" "}
                    <span className="font-medium">{log.user?.nome || log.user?.email || "Sistema"}</span>
                  </p>
                </div>
                <Badge variant="outline" className="text-xs">
                  {formatarDataHora(log.created_at)}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

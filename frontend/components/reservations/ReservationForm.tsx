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
      <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
        <h2 className="text-2xl font-semibold tracking-tight">
          {isEditing ? "Editar Reserva" : "Nova Reserva"}
        </h2>
        <span className="text-xs text-muted-foreground">* Campos obrigatorios</span>
      </div>

      <Card>
        <CardContent className="pt-5">
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="nome" className="text-xs">
                  Nome do Hospede *
                </Label>
                <Input
                  id="nome"
                  value={form.nome}
                  onChange={(e) => {
                    const filtered = e.target.value.replace(/[^a-zA-ZÀ-ÿ\s]/g, '').slice(0, 100);
                    setForm((prev) => ({ ...prev, nome: filtered }));
                  }}
                  required
                  className=""
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cpf" className="text-xs">
                  CPF *
                </Label>
                <Input
                  id="cpf"
                  value={form.cpf}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '').slice(0, 11);
                    let formatted = digits;
                    if (digits.length > 9) {
                      formatted = `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
                    } else if (digits.length > 6) {
                      formatted = `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
                    } else if (digits.length > 3) {
                      formatted = `${digits.slice(0, 3)}.${digits.slice(3)}`;
                    }
                    setForm((prev) => ({ ...prev, cpf: formatted }));
                  }}
                  placeholder="000.000.000-00"
                  required
                  className=""
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="quarto" className="text-xs">
                  Quarto *
                </Label>
                <Select
                  id="quarto"
                  value={form.quarto}
                  onChange={handleChange("quarto")}
                  required
                  className=""
                >
                  {Array.from({ length: totalQuartos }, (_, idx) => idx + 1).map((num) => (
                    <option key={num} value={num}>
                      Quarto {num}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="data-entrada" className="text-xs">
                  Data de Entrada *
                </Label>
                <Input
                  id="data-entrada"
                  type="date"
                  value={form.data_entrada}
                  onChange={handleChange("data_entrada")}
                  required
                  className=""
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="data-saida" className="text-xs">
                  Data de Saida *
                </Label>
                <Input
                  id="data-saida"
                  type="date"
                  value={form.data_saida}
                  onChange={handleChange("data_saida")}
                  required
                  className=""
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="valor" className="text-xs">
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
                  className=""
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status" className="text-xs">
                  Status *
                </Label>
                <Select
                  id="status"
                  value={form.status}
                  onChange={handleChange("status")}
                  required
                  className=""
                >
                  <option value="ativa">Ativa</option>
                  <option value="finalizada">Finalizada</option>
                  <option value="cancelada">Cancelada</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pago" className="text-xs">
                  Pago
                </Label>
                <label
                  htmlFor="pago"
                  className="flex cursor-pointer items-center gap-3 h-10 rounded-lg border border-border bg-white px-3"
                >
                  <input
                    id="pago"
                    type="checkbox"
                    checked={form.pago}
                    onChange={(e) => setForm((prev) => ({ ...prev, pago: e.target.checked }))}
                    className="h-4 w-4 rounded border border-border accent-primary"
                  />
                  <span className="text-sm font-medium">Pagamento recebido</span>
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="observacoes" className="text-xs">
                Observacoes
              </Label>
              <Textarea
                id="observacoes"
                value={form.observacoes || ""}
                onChange={handleChange("observacoes")}
                rows={4}
                className=""
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="submit"
                disabled={loading}
              >
                {loading ? "Salvando..." : isEditing ? "Atualizar Reserva" : "Criar Reserva"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
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
    <Card>
      <CardHeader>
        <CardTitle>Historico de Alteracoes</CardTitle>
        <CardDescription>Registro de modificacoes desta reserva</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {logs.map((log) => (
            <div
              key={log.id}
              className="border border-border rounded-lg p-3 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{renderResumoAuditoria(log)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Por: {log.user?.nome || log.user?.email || "Sistema"}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatarDataHora(log.created_at)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

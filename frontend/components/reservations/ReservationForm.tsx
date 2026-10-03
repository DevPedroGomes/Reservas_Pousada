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
import type { Reserva, Auditoria, Quarto } from "../../lib/types"
import { SecaoHospede } from "./SecaoHospede"
import { useCotacao } from "../../hooks/useCotacao"
import { reais } from "../../lib/conta"
import { CANAIS, formatarTelefone, mascaraCpf } from "../../lib/hospedes"
import { proximosStatus, hojeNaPousada, ROTULO_STATUS, STATUS_INICIAIS, type StatusReserva } from "../../lib/status"

/** Como cada status aparece na criação, onde o significado precisa ficar claro. */
const ROTULO_NA_CRIACAO: Partial<Record<StatusReserva, string>> = {
  confirmada: "Confirmada",
  pre_reserva: "Pré-reserva (aguardando sinal)",
  hospedada: "Hospedada (check-in agora)",
}

interface ReservationFormProps {
  initialData?: Reserva | null
  isEditing: boolean
  /** Quartos ativos da pousada (cadastro). A reserva em edição pode estar num quarto hoje inativo. */
  quartos: Quarto[]
  auditLogs: Auditoria[]
  onSubmit: (data: Reserva) => Promise<void>
  onCancel: () => void
  loading?: boolean
  /** Com pagamentos lançados, "pago" é calculado pela conta (a caixinha some). */
  pagoPelaConta?: boolean
  /** Painel da conta (pagamentos e consumos), entre o formulário e o histórico. */
  conta?: React.ReactNode
}

const emptyForm: Reserva = {
  nome: "",
  hospede_id: null,
  tipo_documento: "cpf",
  documento: "",
  telefone: "",
  email: "",
  nacionalidade: "",
  adultos: 1,
  criancas: 0,
  canal: "direto",
  quarto: 1,
  data_entrada: "",
  data_saida: "",
  status: "confirmada",
  valor: null,
  pago: false,
  observacoes: "",
}

export function ReservationForm({
  initialData,
  isEditing,
  quartos,
  auditLogs,
  onSubmit,
  onCancel,
  loading = false,
  pagoPelaConta = false,
  conta,
}: ReservationFormProps) {
  const [form, setForm] = useState<Reserva>(emptyForm)

  // Reserva nova começa no primeiro quarto ativo (o quarto 1 pode não existir).
  useEffect(() => {
    if (!isEditing && quartos.length > 0) {
      setForm((f) => (quartos.some((q) => q.numero === Number(f.quarto)) ? f : { ...f, quarto: quartos[0].numero }))
    }
  }, [isEditing, quartos])

  useEffect(() => {
    if (initialData) {
      setForm({
        ...initialData,
        valor: initialData.valor ?? null,
        pago: Boolean(initialData.pago),
        observacoes: initialData.observacoes || "",
        telefone: formatarTelefone(initialData.telefone),
        documento: initialData.tipo_documento === "passaporte" || initialData.tipo_documento === "outro"
          ? initialData.documento ?? ""
          : mascaraCpf(initialData.documento ?? ""),
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

  // Na edição, só as transições válidas a partir do status salvo.
  const statusSalvo = isEditing ? initialData?.status : undefined
  const opcoesStatus: StatusReserva[] = statusSalvo
    ? [statusSalvo, ...proximosStatus(statusSalvo, initialData?.data_entrada ?? "", hojeNaPousada())]
    : [...STATUS_INICIAIS]
  const mudouStatus = form.status !== statusSalvo
  const quartoEscolhido = quartos.find((q) => q.numero === Number(form.quarto))
  const cotacao = useCotacao(form.quarto, form.data_entrada, form.data_saida)
  // Valor que veio do tarifário (não digitado) acompanha mudança de quarto/datas.
  const [valorSugerido, setValorSugerido] = useState(false)
  useEffect(() => {
    if (isEditing || !cotacao || cotacao.totalCentavos === null) return
    setForm((prev) => {
      if (prev.valor !== null && prev.valor !== undefined && prev.valor !== "" && !valorSugerido) return prev
      return { ...prev, valor: cotacao.totalCentavos! / 100 }
    })
    setValorSugerido(true)
  }, [cotacao]) // eslint-disable-line react-hooks/exhaustive-deps
  const pessoas = (form.adultos ?? 1) + (form.criancas ?? 0)

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
            {isEditing && initialData?.ical_importacao_id && (
              <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
                Reserva importada do calendário da OTA: datas e cancelamento seguem o que vier de lá.
                Complete o hóspede (nome e WhatsApp) quando receber os dados.
              </p>
            )}
            <SecaoHospede
              form={form}
              isEditing={isEditing}
              onChange={(mudanca) => setForm((prev) => ({ ...prev, ...mudanca }))}
            />

            <div className="border-t border-border pt-4 text-sm font-semibold">Estadia</div>

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
                  {quartos.map((q) => (
                    <option key={q.numero} value={q.numero}>
                      {q.nome === `Quarto ${q.numero}` ? q.nome : `${q.numero} · ${q.nome}`}
                      {q.capacidade ? ` (até ${q.capacidade})` : ""}
                      {q.ativo ? "" : " — inativo"}
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
                <Label htmlFor="adultos" className="text-xs">Adultos</Label>
                <Input
                  id="adultos"
                  type="number"
                  min={1}
                  max={50}
                  value={form.adultos ?? 1}
                  onChange={(e) => setForm((prev) => ({ ...prev, adultos: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="criancas" className="text-xs">Crianças</Label>
                <Input
                  id="criancas"
                  type="number"
                  min={0}
                  max={50}
                  value={form.criancas ?? 0}
                  onChange={(e) => setForm((prev) => ({ ...prev, criancas: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="canal" className="text-xs">Canal</Label>
                <Select id="canal" value={form.canal ?? "direto"} onChange={handleChange("canal")}>
                  {CANAIS.map((c) => <option key={c.valor} value={c.valor}>{c.rotulo}</option>)}
                </Select>
              </div>
            </div>
            {quartoEscolhido && pessoas > quartoEscolhido.capacidade && (
              <p className="-mt-2 text-xs text-amber-700">
                {quartoEscolhido.nome} comporta até {quartoEscolhido.capacidade} pessoa{quartoEscolhido.capacidade > 1 ? "s" : ""}; esta reserva tem {pessoas}.
              </p>
            )}

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
                  onChange={(e) => {
                    setValorSugerido(false)
                    setForm((prev) => ({
                      ...prev,
                      valor: e.target.value ? Number(e.target.value) : null,
                    }))
                  }}
                  className=""
                />
                {cotacao && <SugestaoDeValor cotacao={cotacao} valorAtual={form.valor} onUsar={(v) => { setValorSugerido(true); setForm((prev) => ({ ...prev, valor: v })) }} />}
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
                  {opcoesStatus.map((s) => (
                    <option key={s} value={s}>
                      {(!statusSalvo && ROTULO_NA_CRIACAO[s]) || ROTULO_STATUS[s]}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pago" className="text-xs">
                  Pago
                </Label>
                {pagoPelaConta ? (
                  <p className="flex h-10 items-center text-sm text-muted-foreground">Calculado pela conta abaixo.</p>
                ) : (
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
                )}
              </div>
            </div>

            {form.status === "pre_reserva" && mudouStatus && (
              <div className="space-y-2 md:w-1/3">
                <Label htmlFor="prazo_horas" className="text-xs">
                  Prazo para confirmar (horas)
                </Label>
                <Input
                  id="prazo_horas"
                  type="number"
                  min={1}
                  max={720}
                  value={form.prazo_horas ?? 48}
                  onChange={(e) => setForm((prev) => ({ ...prev, prazo_horas: Number(e.target.value) }))}
                />
                <p className="text-xs text-muted-foreground">
                  Sem confirmação até lá, a pré-reserva é cancelada e o quarto volta a ficar livre.
                </p>
              </div>
            )}

            {form.status === "cancelada" && mudouStatus && (
              <div className="space-y-2">
                <Label htmlFor="motivo" className="text-xs">
                  Motivo do cancelamento
                </Label>
                <Input
                  id="motivo"
                  maxLength={300}
                  value={form.motivo ?? ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, motivo: e.target.value }))}
                  placeholder="Ex.: hóspede desistiu, sinal não pago"
                />
              </div>
            )}

            {isEditing && initialData && <LinhaDoTempo reserva={initialData} />}

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

      {conta}

      {isEditing && auditLogs.length > 0 && (
        <AuditHistory logs={auditLogs} />
      )}
    </div>
  )
}

/** Valor do tarifário: total, como foi composto e o mínimo de noites. */
function SugestaoDeValor({ cotacao, valorAtual, onUsar }: {
  cotacao: NonNullable<ReturnType<typeof useCotacao>>
  valorAtual: Reserva["valor"]
  onUsar: (valor: number) => void
}) {
  const noites = cotacao.noites.length
  const porValor = new Map<string, number>()
  for (const n of cotacao.noites) {
    const chave = `${reais(n.valorCentavos ?? 0)}${n.regra ? ` (${n.regra})` : ""}`
    porValor.set(chave, (porValor.get(chave) ?? 0) + 1)
  }
  const composicao = [...porValor].map(([k, qtd]) => `${qtd} × ${k}`).join(" + ")
  const igual = cotacao.totalCentavos !== null && Math.round(Number(valorAtual || 0) * 100) === cotacao.totalCentavos
  return (
    <div className="space-y-1 text-xs">
      {cotacao.semPreco ? (
        <p className="text-muted-foreground">Sem preço base no quarto: cadastre em Quartos para ter o valor sugerido.</p>
      ) : (
        <p className="text-muted-foreground" title={composicao}>
          Tarifário: <span className="font-medium text-foreground">{reais(cotacao.totalCentavos ?? 0)}</span> por {noites} noite{noites > 1 ? "s" : ""}
          {porValor.size > 1 || [...porValor.keys()][0]?.includes("(") ? ` — ${composicao}` : ""}
          {!igual && cotacao.totalCentavos !== null && (
            <button type="button" className="ml-1 underline hover:text-foreground" onClick={() => onUsar(cotacao.totalCentavos! / 100)}>usar</button>
          )}
        </p>
      )}
      {!cotacao.atendeMinimo && (
        <p className="text-amber-700">Mínimo de {cotacao.minimoNoites} noites neste período.</p>
      )}
    </div>
  )
}

/** Datas do ciclo da reserva, quando houver. */
function LinhaDoTempo({ reserva }: { reserva: Reserva }) {
  const itens = [
    reserva.status === "pre_reserva" && reserva.expira_em ? `Segura o quarto até ${formatarDataHora(reserva.expira_em)}` : null,
    reserva.check_in_em ? `Check-in em ${formatarDataHora(reserva.check_in_em)}` : null,
    reserva.check_out_em ? `Check-out em ${formatarDataHora(reserva.check_out_em)}` : null,
    reserva.status === "cancelada" && reserva.cancelada_em
      ? `Cancelada em ${formatarDataHora(reserva.cancelada_em)}${reserva.motivo_cancelamento ? ` — ${reserva.motivo_cancelamento}` : ""}`
      : null,
  ].filter(Boolean)
  if (itens.length === 0) return null
  return (
    <ul className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground space-y-0.5">
      {itens.map((t) => <li key={t as string}>{t}</li>)}
    </ul>
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

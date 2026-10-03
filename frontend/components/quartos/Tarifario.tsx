"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "../ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { Select } from "../ui/select"
import { API_URL, authenticatedFetch } from "../../lib/api"
import { formatarData } from "../../lib/formatters"
import { cn } from "../../lib/utils"
import type { Message, Quarto } from "../../lib/types"

interface Tarifa {
  id: number
  nome: string
  quarto: number | null
  dataInicio: string | null
  dataFim: string | null
  diasSemana: number[] | null
  preco: number | null
  ajustePercentual: number | null
  minimoNoites: number | null
  ativa: boolean
}

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]
type Rascunho = {
  nome: string; quarto: string; data_inicio: string; data_fim: string; dias_semana: number[]
  modo: "percentual" | "fixo" | "nenhum"; valor: string; minimo_noites: string
}
const vazio: Rascunho = { nome: "", quarto: "", data_inicio: "", data_fim: "", dias_semana: [], modo: "percentual", valor: "", minimo_noites: "" }

/** Frase curta do que a regra faz: "+20% · sex, sáb · todos os quartos". */
function resumo(t: Tarifa, quartos: Quarto[]): string {
  const partes: string[] = []
  if (t.preco !== null) partes.push(`${t.preco.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} por noite`)
  if (t.ajustePercentual !== null) partes.push(`${t.ajustePercentual > 0 ? "+" : ""}${t.ajustePercentual}% sobre o preço base`)
  if (t.minimoNoites) partes.push(`mínimo de ${t.minimoNoites} noite${t.minimoNoites > 1 ? "s" : ""}`)
  partes.push(t.dataInicio ? `de ${formatarData(t.dataInicio)} a ${formatarData(t.dataFim ?? t.dataInicio)}` : "o ano todo")
  if (t.diasSemana?.length) partes.push(`noites de ${t.diasSemana.map((d) => DIAS[d].toLowerCase()).join(", ")}`)
  partes.push(t.quarto ? quartos.find((q) => q.numero === t.quarto)?.nome ?? `quarto ${t.quarto}` : "todos os quartos")
  return partes.join(" · ")
}

/**
 * Regras de preço: temporada, fim de semana, pacote com mínimo de noites.
 * A reserva nova recebe o valor sugerido noite a noite.
 */
export function Tarifario({ quartos, podeEditar }: { quartos: Quarto[]; podeEditar: boolean }) {
  const [tarifas, setTarifas] = useState<Tarifa[]>([])
  const [editando, setEditando] = useState<number | "nova" | null>(null)
  const [r, setR] = useState<Rascunho>(vazio)
  const [mensagem, setMensagem] = useState<Message | null>(null)

  const carregar = useCallback(async () => {
    const res = await authenticatedFetch(`${API_URL}/tarifas`)
    const d = await res.json()
    if (d.sucesso) setTarifas(d.tarifas)
  }, [])
  useEffect(() => { void carregar() }, [carregar])

  function abrir(t?: Tarifa) {
    setMensagem(null)
    setEditando(t ? t.id : "nova")
    setR(t ? {
      nome: t.nome, quarto: t.quarto ? String(t.quarto) : "", data_inicio: t.dataInicio ?? "", data_fim: t.dataFim ?? "",
      dias_semana: t.diasSemana ?? [], modo: t.preco !== null ? "fixo" : t.ajustePercentual !== null ? "percentual" : "nenhum",
      valor: t.preco !== null ? String(t.preco) : t.ajustePercentual !== null ? String(t.ajustePercentual) : "",
      minimo_noites: t.minimoNoites ? String(t.minimoNoites) : "",
    } : vazio)
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    const corpo = {
      nome: r.nome, quarto: r.quarto || null, data_inicio: r.data_inicio || null, data_fim: r.data_fim || null,
      dias_semana: r.dias_semana, minimo_noites: r.minimo_noites || null,
      preco: r.modo === "fixo" ? r.valor.replace(",", ".") : null,
      ajuste_percentual: r.modo === "percentual" ? r.valor : null,
    }
    const res = await authenticatedFetch(`${API_URL}/tarifas${editando === "nova" ? "" : `/${editando}`}`, {
      method: editando === "nova" ? "POST" : "PUT",
      body: JSON.stringify(corpo),
    })
    const d = await res.json()
    if (d.sucesso) {
      setEditando(null)
      setMensagem({ type: "success", text: "Regra salva." })
      await carregar()
    } else {
      setMensagem({ type: "error", text: [d.mensagem, ...(d.erros ?? [])].filter(Boolean).join(" ") })
    }
  }

  async function remover(t: Tarifa) {
    if (!window.confirm(`Remover a regra "${t.nome}"?`)) return
    await authenticatedFetch(`${API_URL}/tarifas/${t.id}`, { method: "DELETE" })
    await carregar()
  }

  const campo = (k: keyof Rascunho) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setR((x) => ({ ...x, [k]: e.target.value }))

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="text-base">Tarifário</CardTitle>
          <CardDescription>
            Ajustes sobre o preço base: temporada, fim de semana, feriado, pacote. Quando duas regras valem na mesma
            noite, vale a mais específica (um quarto &gt; todos; com datas &gt; o ano todo; com dias da semana &gt; todos os dias).
          </CardDescription>
        </div>
        {podeEditar && editando === null && <Button variant="outline" onClick={() => abrir()}>Nova regra</Button>}
      </CardHeader>
      <CardContent className="space-y-4">
        {mensagem && (
          <div className={cn("rounded-lg border px-3 py-2 text-sm", mensagem.type === "success" ? "border-emerald-200/80 bg-emerald-50/80 text-emerald-800" : "border-rose-200/80 bg-rose-50/80 text-rose-800")}>
            {mensagem.text}
          </div>
        )}

        {editando !== null && (
          <form onSubmit={salvar} className="space-y-4 rounded-lg border border-border p-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="t-nome">Nome</Label><Input id="t-nome" value={r.nome} onChange={campo("nome")} placeholder="Alta temporada, Fim de semana, Réveillon..." required /></div>
              <div className="space-y-1.5">
                <Label htmlFor="t-quarto">Quarto</Label>
                <Select id="t-quarto" value={r.quarto} onChange={campo("quarto")}>
                  <option value="">Todos os quartos</option>
                  {quartos.map((q) => <option key={q.numero} value={q.numero}>{q.nome}</option>)}
                </Select>
              </div>
              <div className="space-y-1.5"><Label htmlFor="t-ini">De (opcional)</Label><Input id="t-ini" type="date" value={r.data_inicio} onChange={campo("data_inicio")} /></div>
              <div className="space-y-1.5"><Label htmlFor="t-fim">Até</Label><Input id="t-fim" type="date" value={r.data_fim} onChange={campo("data_fim")} /></div>
              <div className="space-y-1.5">
                <Label>Noites de</Label>
                <div className="flex flex-wrap gap-1">
                  {DIAS.map((dia, i) => {
                    const marcado = r.dias_semana.includes(i)
                    return (
                      <button
                        key={dia}
                        type="button"
                        aria-pressed={marcado}
                        onClick={() => setR((x) => ({ ...x, dias_semana: marcado ? x.dias_semana.filter((d) => d !== i) : [...x.dias_semana, i] }))}
                        className={cn("h-8 rounded-md border px-2 text-xs", marcado ? "border-primary bg-primary/10 text-primary" : "border-border")}
                      >
                        {dia}
                      </button>
                    )
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground">Nenhum marcado = todos. Noite de sex = sexta para sábado.</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="t-modo">Preço</Label>
                <Select id="t-modo" value={r.modo} onChange={(e) => setR((x) => ({ ...x, modo: e.target.value as Rascunho["modo"], valor: "" }))}>
                  <option value="percentual">Percentual sobre o preço base</option>
                  <option value="fixo">Preço fixo por noite</option>
                  <option value="nenhum">Não muda o preço</option>
                </Select>
              </div>
              {r.modo !== "nenhum" && (
                <div className="space-y-1.5">
                  <Label htmlFor="t-valor">{r.modo === "fixo" ? "Valor da noite (R$)" : "Ajuste (%)"}</Label>
                  <Input id="t-valor" inputMode="decimal" value={r.valor} onChange={campo("valor")} placeholder={r.modo === "fixo" ? "Ex.: 450" : "Ex.: 30 ou -15"} required />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="t-min">Mínimo de noites (opcional)</Label>
                <Input id="t-min" type="number" min={1} max={60} value={r.minimo_noites} onChange={campo("minimo_noites")} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit">Salvar regra</Button>
              <Button type="button" variant="ghost" onClick={() => setEditando(null)}>Cancelar</Button>
            </div>
          </form>
        )}

        {tarifas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem regras: toda noite sai pelo preço base do quarto.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {tarifas.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="font-medium">{t.nome}</span>
                  <span className="block text-xs text-muted-foreground">{resumo(t, quartos)}</span>
                </span>
                {podeEditar && (
                  <span className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="sm" onClick={() => abrir(t)}>Editar</Button>
                    <Button variant="ghost" size="sm" className="text-rose-600 hover:text-rose-700" onClick={() => void remover(t)}>Remover</Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

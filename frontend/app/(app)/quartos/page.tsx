"use client"

import { useEffect, useState } from "react"
import { useApp } from "../../../components/app/ContextoApp"
import { Button } from "../../../components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card"
import { Input } from "../../../components/ui/input"
import { Label } from "../../../components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table"
import { cn } from "../../../lib/utils"
import { useQuartos } from "../../../hooks/useQuartos"
import { Tarifario } from "../../../components/quartos/Tarifario"
import { Calendarios } from "../../../components/quartos/Calendarios"
import type { Quarto } from "../../../lib/types"

type Rascunho = { numero: string; nome: string; tipo: string; capacidade: string; preco_base: string }
const vazio: Rascunho = { numero: "", nome: "", tipo: "", capacidade: "2", preco_base: "" }

/**
 * Cadastro de quartos: nome ("Suíte Mar"), tipo, capacidade e preço base.
 * Antes o quarto era só um número de 1 a N, sem como desativar um quarto em
 * reforma ou dar nome ao chalé.
 */
export default function Quartos() {
  const { auth } = useApp()
  const podeEditar = Boolean(auth.user?.is_owner) || auth.user?.role === "admin"
  const q = useQuartos()
  const [editando, setEditando] = useState<number | "novo" | null>(null)
  const [r, setR] = useState<Rascunho>(vazio)

  useEffect(() => { void q.carregar() }, [auth.pousada?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  function abrir(quarto?: Quarto) {
    setEditando(quarto ? quarto.id : "novo")
    setR(quarto
      ? { numero: String(quarto.numero), nome: quarto.nome, tipo: quarto.tipo ?? "", capacidade: String(quarto.capacidade), preco_base: quarto.preco_base === null ? "" : String(quarto.preco_base) }
      : vazio)
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    const corpo: Record<string, unknown> = {
      nome: r.nome, tipo: r.tipo, capacidade: Number(r.capacidade), preco_base: r.preco_base === "" ? null : Number(r.preco_base.replace(",", ".")),
    }
    if (r.numero) corpo.numero = Number(r.numero)
    const ok = await q.salvar(corpo as Partial<Quarto>, editando === "novo" ? undefined : (editando as number))
    if (ok) { setEditando(null); await auth.refreshPousadas({ silencioso: true }) }
  }

  async function alternar(quarto: Quarto) {
    await q.salvar({ ativo: !quarto.ativo } as Partial<Quarto>, quarto.id)
    await auth.refreshPousadas({ silencioso: true })
  }

  const campo = (k: keyof Rascunho) => (e: React.ChangeEvent<HTMLInputElement>) => setR((x) => ({ ...x, [k]: e.target.value }))
  const ativos = q.quartos.filter((x) => x.ativo).length

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Quartos</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{ativos} {ativos === 1 ? "quarto ativo" : "quartos ativos"}</p>
        </div>
        {podeEditar && editando === null && <Button onClick={() => abrir()}>Novo quarto</Button>}
      </div>

      {q.mensagem && (
        <div className={cn("rounded-lg border px-3 py-2 text-sm", q.mensagem.type === "success" ? "border-emerald-200/80 bg-emerald-50/80 text-emerald-800" : "border-rose-200/80 bg-rose-50/80 text-rose-800")}>
          {q.mensagem.text}
        </div>
      )}

      {editando !== null && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{editando === "novo" ? "Novo quarto" : "Editar quarto"}</CardTitle>
            <CardDescription>O preço base é sugerido ao lançar reservas (pode ser ajustado por reserva).</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={salvar} className="grid gap-4 sm:grid-cols-6">
              <div className="space-y-1.5 sm:col-span-1"><Label htmlFor="q-num">Número</Label><Input id="q-num" type="number" min={1} value={r.numero} onChange={campo("numero")} placeholder="auto" /></div>
              <div className="space-y-1.5 sm:col-span-3"><Label htmlFor="q-nome">Nome</Label><Input id="q-nome" value={r.nome} onChange={campo("nome")} placeholder="Ex.: Suíte Mar" /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="q-tipo">Tipo</Label><Input id="q-tipo" value={r.tipo} onChange={campo("tipo")} placeholder="Standard, Suíte, Chalé..." /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="q-cap">Capacidade (pessoas)</Label><Input id="q-cap" type="number" min={1} max={50} value={r.capacidade} onChange={campo("capacidade")} required /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="q-preco">Preço base da diária (R$)</Label><Input id="q-preco" inputMode="decimal" value={r.preco_base} onChange={campo("preco_base")} placeholder="Ex.: 280" /></div>
              <div className="flex items-end gap-2 sm:col-span-2">
                <Button type="submit">Salvar</Button>
                <Button type="button" variant="ghost" onClick={() => setEditando(null)}>Cancelar</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead>Nº</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Capacidade</TableHead>
                <TableHead className="text-right">Preço base</TableHead>
                <TableHead>Situação</TableHead>
                {podeEditar && <TableHead className="text-right">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.quartos.map((x) => (
                <TableRow key={x.id} className={cn(!x.ativo && "opacity-60")}>
                  <TableCell className="font-medium">{x.numero}</TableCell>
                  <TableCell>{x.nome}</TableCell>
                  <TableCell className="text-muted-foreground">{x.tipo || "—"}</TableCell>
                  <TableCell className="text-right">{x.capacidade}</TableCell>
                  <TableCell className="text-right">{x.preco_base === null ? "—" : x.preco_base.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</TableCell>
                  <TableCell>{x.ativo ? "Ativo" : "Desativado"}</TableCell>
                  {podeEditar && (
                    <TableCell className="text-right whitespace-nowrap">
                      <Button variant="ghost" size="sm" onClick={() => abrir(x)}>Editar</Button>
                      <Button variant="ghost" size="sm" onClick={() => void alternar(x)}>{x.ativo ? "Desativar" : "Reativar"}</Button>
                      <Button
                        variant="ghost" size="sm" className="text-rose-600 hover:text-rose-700"
                        onClick={() => { if (window.confirm(`Remover o quarto ${x.numero}? Com histórico de reservas ele será apenas desativado.`)) void q.remover(x.id).then(() => auth.refreshPousadas({ silencioso: true })) }}
                      >
                        Remover
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Tarifario quartos={q.quartos} podeEditar={podeEditar} />

      {podeEditar && <Calendarios />}
    </div>
  )
}

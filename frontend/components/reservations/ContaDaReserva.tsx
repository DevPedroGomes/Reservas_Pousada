"use client"

import { useEffect, useState } from "react"
import { Button } from "../ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { Select } from "../ui/select"
import { cn } from "../../lib/utils"
import { formatarData } from "../../lib/formatters"
import { hojeNaPousada } from "../../lib/status"
import { FORMAS_PAGAMENTO, reais, rotuloForma, rotuloTipo, TIPOS_PAGAMENTO } from "../../lib/conta"
import { useConta } from "../../hooks/useConta"
import { PixDaReserva } from "./PixDaReserva"
import type { Message } from "../../lib/types"

interface Props {
  reservaId: number
  /** Recepção e admin lançam; auditoria só vê. */
  podeLancar: boolean
  /** Apagar pagamento é do dono/admin; a recepção corrige com estorno. */
  podeApagarPagamento: boolean
  onMensagem: (m: Message) => void
  /** Avisa a página que a conta mudou (o "pago" da reserva passa a ser da conta). */
  onMudou?: (temPagamentos: boolean) => void
  /** Pix baixado: a reserva pode ter sido confirmada (a página recarrega). */
  onReservaMudou?: () => void
  hospede?: { nome: string; telefone?: string }
  pousada?: string
}

const vazioPagamento = { valor: "", forma: "pix", tipo: "pagamento", recebido_em: "", observacao: "" }
const vazioConsumo = { descricao: "", quantidade: "1", valor_unitario: "" }

/**
 * Conta da reserva: sinal, pagamentos parciais, estornos e consumos, com o
 * saldo sempre à vista. Substitui o "pago: sim/não", que não dizia quanto
 * faltava receber.
 */
export function ContaDaReserva({ reservaId, podeLancar, podeApagarPagamento, onMensagem, onMudou, onReservaMudou, hospede, pousada }: Props) {
  const c = useConta(reservaId)
  const [pag, setPag] = useState(vazioPagamento)
  const [con, setCon] = useState(vazioConsumo)

  useEffect(() => { void c.carregar() }, [c.carregar]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (c.conta) onMudou?.(c.conta.pagamentos.length > 0)
  }, [c.conta]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!c.conta) return null
  const conta = c.conta
  const saldo = conta.saldo_centavos

  async function lancarPagamento(e: React.FormEvent) {
    e.preventDefault()
    const valor = pag.valor.trim() || (saldo > 0 ? (saldo / 100).toFixed(2) : "")
    const r = await c.lancarPagamento({ ...pag, valor, recebido_em: pag.recebido_em || hojeNaPousada() })
    onMensagem({ type: r.sucesso ? "success" : "error", text: r.mensagem })
    if (r.sucesso) setPag({ ...vazioPagamento, forma: pag.forma })
  }

  async function lancarConsumo(e: React.FormEvent) {
    e.preventDefault()
    const r = await c.lancarConsumo({ ...con, quantidade: Number(con.quantidade) })
    onMensagem({ type: r.sucesso ? "success" : "error", text: r.mensagem })
    if (r.sucesso) setCon(vazioConsumo)
  }

  async function remover(tipo: "pagamento" | "consumo", id: number, descricao: string) {
    if (!window.confirm(`Remover ${descricao}?`)) return
    const r = tipo === "pagamento" ? await c.removerPagamento(id) : await c.removerConsumo(id)
    onMensagem({ type: r.sucesso ? "success" : "error", text: r.mensagem })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Conta</CardTitle>
        <CardDescription>Diárias e consumos, menos o que já foi pago.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
          {[
            ["Diárias", conta.diarias_centavos],
            ["Consumos", conta.consumos_centavos],
            ["Total", conta.total_centavos],
            ["Pago", conta.pago_centavos],
          ].map(([rotulo, v]) => (
            <div key={rotulo as string} className="rounded-lg bg-muted/40 px-3 py-2">
              <dt className="text-xs text-muted-foreground">{rotulo}</dt>
              <dd className="font-semibold tabular-nums">{reais(v as number)}</dd>
            </div>
          ))}
          <div
            data-testid="saldo"
            className={cn(
              "rounded-lg px-3 py-2",
              saldo > 0 ? "bg-amber-50 text-amber-800" : saldo < 0 ? "bg-sky-50 text-sky-800" : "bg-emerald-50 text-emerald-800",
            )}
          >
            <dt className="text-xs">{saldo < 0 ? "Crédito do hóspede" : "Saldo"}</dt>
            <dd className="font-semibold tabular-nums">{saldo === 0 ? "Quitado" : reais(Math.abs(saldo))}</dd>
          </div>
        </dl>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Pagamentos</h3>
          {conta.pagamentos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum pagamento lançado.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {conta.pagamentos.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="font-medium">{rotuloTipo(p.tipo)}</span>
                    <span className="text-muted-foreground"> · {rotuloForma(p.forma)} · {formatarData(p.recebido_em)}</span>
                    {p.observacao && <span className="block truncate text-xs text-muted-foreground">{p.observacao}</span>}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={cn("tabular-nums font-medium", p.valor_centavos < 0 && "text-rose-700")}>{reais(p.valor_centavos)}</span>
                    {podeApagarPagamento && (
                      <button type="button" onClick={() => void remover("pagamento", p.id, `o pagamento de ${reais(p.valor_centavos)}`)} className="text-xs text-muted-foreground hover:text-destructive">
                        remover
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {podeLancar && (
            <form onSubmit={lancarPagamento} className="grid gap-3 md:grid-cols-[1fr_1.4fr_1fr_1fr_auto] items-end">
              <div className="space-y-1">
                <Label htmlFor="pg-valor" className="text-xs">Valor (R$)</Label>
                <Input
                  id="pg-valor"
                  inputMode="decimal"
                  value={pag.valor}
                  onChange={(e) => setPag((x) => ({ ...x, valor: e.target.value.replace(/[^\d.,]/g, "") }))}
                  placeholder={saldo > 0 ? (saldo / 100).toFixed(2).replace(".", ",") : "0,00"}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pg-forma" className="text-xs">Forma</Label>
                <Select id="pg-forma" value={pag.forma} onChange={(e) => setPag((x) => ({ ...x, forma: e.target.value }))}>
                  {FORMAS_PAGAMENTO.map((f) => <option key={f.valor} value={f.valor}>{f.rotulo}</option>)}
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="pg-tipo" className="text-xs">Tipo</Label>
                <Select id="pg-tipo" value={pag.tipo} onChange={(e) => setPag((x) => ({ ...x, tipo: e.target.value }))}>
                  {TIPOS_PAGAMENTO.map((t) => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="pg-data" className="text-xs">Data</Label>
                <Input id="pg-data" type="date" value={pag.recebido_em || hojeNaPousada()} onChange={(e) => setPag((x) => ({ ...x, recebido_em: e.target.value }))} />
              </div>
              <Button type="submit" disabled={c.enviando}>Lançar</Button>
            </form>
          )}
        </section>

        <PixDaReserva
          reservaId={reservaId}
          telefone={hospede?.telefone}
          hospede={hospede?.nome ?? ""}
          pousada={pousada ?? ""}
          podeCobrar={podeLancar}
          onMensagem={onMensagem}
          onMudou={() => { void c.carregar(); onReservaMudou?.() }}
        />

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Consumos</h3>
          {conta.consumos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum consumo lançado.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {conta.consumos.map((x) => (
                <li key={x.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span>
                    <span className="font-medium">{x.descricao}</span>
                    <span className="text-muted-foreground"> · {x.quantidade} × {reais(x.valor_unitario_centavos)} · {formatarData(x.lancado_em)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="tabular-nums font-medium">{reais(x.quantidade * x.valor_unitario_centavos)}</span>
                    {podeLancar && (
                      <button type="button" onClick={() => void remover("consumo", x.id, `"${x.descricao}"`)} className="text-xs text-muted-foreground hover:text-destructive">
                        remover
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {podeLancar && (
            <form onSubmit={lancarConsumo} className="grid gap-3 md:grid-cols-[2fr_0.6fr_1fr_auto] items-end">
              <div className="space-y-1">
                <Label htmlFor="cs-desc" className="text-xs">Descrição</Label>
                <Input id="cs-desc" value={con.descricao} onChange={(e) => setCon((x) => ({ ...x, descricao: e.target.value.slice(0, 120) }))} placeholder="Frigobar, passeio, lavanderia..." />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cs-qtd" className="text-xs">Qtd.</Label>
                <Input id="cs-qtd" type="number" min={1} max={999} value={con.quantidade} onChange={(e) => setCon((x) => ({ ...x, quantidade: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cs-valor" className="text-xs">Valor unitário (R$)</Label>
                <Input id="cs-valor" inputMode="decimal" value={con.valor_unitario} onChange={(e) => setCon((x) => ({ ...x, valor_unitario: e.target.value.replace(/[^\d.,]/g, "") }))} placeholder="0,00" />
              </div>
              <Button type="submit" variant="outline" disabled={c.enviando}>Adicionar</Button>
            </form>
          )}
        </section>
      </CardContent>
    </Card>
  )
}

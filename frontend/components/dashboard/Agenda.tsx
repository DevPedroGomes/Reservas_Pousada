"use client"

import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card"
import { Button } from "../ui/button"
import { formatarData } from "../../lib/formatters"
import { acaoPrincipal, hojeNaPousada, ROTULO_ACAO, type StatusReserva } from "../../lib/status"
import type { ItemAgenda } from "../../lib/types"
import { MenuWhatsApp } from "../whatsapp/MenuWhatsApp"
import type { Modelo, PousadaMensagem } from "../../lib/mensagens"

type MudarStatus = (id: number, status: StatusReserva) => void

/** Aviso ao lado do nome quando o status pede atenção da recepção. */
function avisoDeStatus(r: ItemAgenda, hoje: string): { texto: string; cor: string } | null {
  if (r.status === "pre_reserva") return { texto: "pré-reserva", cor: "text-amber-700 bg-amber-50" }
  if (r.status === "confirmada" && r.data_entrada <= hoje) return { texto: "aguardando check-in", cor: "text-sky-700 bg-sky-50" }
  return null
}

function Lista({ titulo, itens, vazio, mostrarData, onMudarStatus, mudando, pousada, nomesDosQuartos, mensagem }: {
  titulo: string
  itens: ItemAgenda[]
  vazio: string
  mostrarData?: "entrada" | "saida"
  onMudarStatus?: MudarStatus
  mudando?: number | null
  pousada?: PousadaMensagem
  nomesDosQuartos?: Record<number, string>
  /** Mensagem de WhatsApp mais provável nesta lista. */
  mensagem?: Modelo
}) {
  const hoje = hojeNaPousada()
  return (
    <Card className="min-w-0">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center justify-between">
          {titulo}
          <span className="text-xs font-medium text-muted-foreground">{itens.length}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {itens.length === 0 && <p className="text-sm text-muted-foreground py-2">{vazio}</p>}
        {itens.map((r) => {
          const proximo = onMudarStatus ? acaoPrincipal(r.status, r.data_entrada, hoje) : null
          const aviso = avisoDeStatus(r, hoje)
          return (
            <div key={`${titulo}-${r.id}`} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50">
              <Link href={`/reservas/${r.id}`} className="flex min-w-0 flex-1 basis-40 items-center gap-2">
                <span className="inline-flex h-6 min-w-6 items-center justify-center rounded bg-primary/10 px-1.5 text-xs font-semibold text-primary">
                  {r.quarto}
                </span>
                <span className="truncate">{r.nome}</span>
                {aviso && <span className={`rounded px-1.5 py-0.5 text-[11px] whitespace-nowrap ${aviso.cor}`}>{aviso.texto}</span>}
                {r.precheckin_em && r.status !== "hospedada" && (
                  <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] whitespace-nowrap text-emerald-700" title="Pré-check-in feito">ficha ✓</span>
                )}
              </Link>
              <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground whitespace-nowrap">
                {mostrarData === "entrada" && formatarData(r.data_entrada)}
                {mostrarData === "saida" && `até ${formatarData(r.data_saida)}`}
                {!r.pago && <span className="text-amber-600">a pagar</span>}
                {pousada && r.telefone && (
                  <MenuWhatsApp
                    compacto
                    pousada={pousada}
                    sugerido={r.status === "pre_reserva" ? "sinal" : mensagem}
                    dados={{ nome: r.nome, telefone: r.telefone, quarto: nomesDosQuartos?.[r.quarto] ?? `Quarto ${r.quarto}`, data_entrada: r.data_entrada, data_saida: r.data_saida, valor: r.valor, pago_centavos: r.pago_centavos, consumos_centavos: r.consumos_centavos }}
                  />
                )}
                {proximo && onMudarStatus && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    disabled={mudando === r.id}
                    onClick={() => {
                      if (proximo === "finalizada" && !r.pago && !window.confirm(`A conta de ${r.nome} ainda não está quitada. Fazer o check-out mesmo assim?`)) return
                      onMudarStatus(r.id, proximo)
                    }}
                  >
                    {ROTULO_ACAO[proximo]}
                  </Button>
                )}
              </span>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

export function AgendaDoDia({ chegadas, saidas, hospedados, proximas, onMudarStatus, mudando, pousada, nomesDosQuartos }: {
  chegadas: ItemAgenda[]
  saidas: ItemAgenda[]
  hospedados: ItemAgenda[]
  proximas: ItemAgenda[]
  /** Sem esta função (perfil só leitura), a agenda não mostra botões. */
  onMudarStatus?: MudarStatus
  mudando?: number | null
  pousada?: PousadaMensagem
  nomesDosQuartos?: Record<number, string>
}) {
  const acoes = { onMudarStatus, mudando, pousada, nomesDosQuartos }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Lista titulo="Chegadas hoje" itens={chegadas} vazio="Nenhuma chegada prevista hoje." mensagem="chegada" {...acoes} />
      <Lista titulo="Saídas hoje" itens={saidas} vazio="Nenhuma saída prevista hoje." mensagem="agradecimento" {...acoes} />
      <Lista titulo="Hospedados agora" itens={hospedados} vazio="Nenhum hóspede no momento." mostrarData="saida" mensagem="chegada" {...acoes} />
      <Lista titulo="Próximas chegadas (7 dias)" itens={proximas} vazio="Nenhuma chegada nos próximos 7 dias." mostrarData="entrada" mensagem="chegada" {...acoes} />
    </div>
  )
}

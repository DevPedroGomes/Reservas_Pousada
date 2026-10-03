"use client"

import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card"
import { formatarData } from "../../lib/formatters"
import type { ItemAgenda } from "../../lib/types"

function Lista({ titulo, itens, vazio, mostrarData }: {
  titulo: string
  itens: ItemAgenda[]
  vazio: string
  mostrarData?: "entrada" | "saida"
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center justify-between">
          {titulo}
          <span className="text-xs font-medium text-muted-foreground">{itens.length}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {itens.length === 0 && <p className="text-sm text-muted-foreground py-2">{vazio}</p>}
        {itens.map((r) => (
          <Link
            key={`${titulo}-${r.id}`}
            href={`/reservas/${r.id}`}
            className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
          >
            <span className="flex items-center gap-2 min-w-0">
              <span className="inline-flex h-6 min-w-6 items-center justify-center rounded bg-primary/10 px-1.5 text-xs font-semibold text-primary">
                {r.quarto}
              </span>
              <span className="truncate">{r.nome}</span>
            </span>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {mostrarData === "entrada" && formatarData(r.data_entrada)}
              {mostrarData === "saida" && `até ${formatarData(r.data_saida)}`}
              {!r.pago && <span className="ml-2 text-amber-600">a pagar</span>}
            </span>
          </Link>
        ))}
      </CardContent>
    </Card>
  )
}

export function AgendaDoDia({ chegadas, saidas, hospedados, proximas }: {
  chegadas: ItemAgenda[]
  saidas: ItemAgenda[]
  hospedados: ItemAgenda[]
  proximas: ItemAgenda[]
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Lista titulo="Chegadas hoje" itens={chegadas} vazio="Nenhuma chegada prevista hoje." />
      <Lista titulo="Saídas hoje" itens={saidas} vazio="Nenhuma saída prevista hoje." />
      <Lista titulo="Hospedados agora" itens={hospedados} vazio="Nenhum hóspede no momento." mostrarData="saida" />
      <Lista titulo="Próximas chegadas (7 dias)" itens={proximas} vazio="Nenhuma chegada nos próximos 7 dias." mostrarData="entrada" />
    </div>
  )
}

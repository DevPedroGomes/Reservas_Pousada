"use client"

import { Button } from "../ui/button"
import { Badge } from "../ui/badge"
import { Card } from "../ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table"
import { Pagination } from "../pagination"
import { formatarData, formatarValor, getStatusBadgeVariant, getStatusLabel } from "../../lib/formatters"
import { acaoPrincipal, hojeNaPousada, ROTULO_ACAO, type StatusReserva } from "../../lib/status"
import { formatarTelefone } from "../../lib/hospedes"
import { reais, saldoDaReserva } from "../../lib/conta"
import type { Reserva, PaginationMeta } from "../../lib/types"

interface ReservationTableProps {
  reservas: Reserva[]
  meta: PaginationMeta
  onPageChange: (page: number) => void
  onEdit: (id: number) => void
  onDelete: (id: number) => void
  /** Ação de um clique (confirmar, check-in, check-out). */
  onMudarStatus?: (id: number, status: StatusReserva) => void
  /** Reserva com mudança de status em andamento. */
  mudando?: number | null
  loading?: boolean
  userRole?: string
}

export function ReservationTable({
  reservas,
  meta,
  onPageChange,
  onEdit,
  onDelete,
  onMudarStatus,
  mudando = null,
  loading = false,
  userRole,
}: ReservationTableProps) {
  const hoje = hojeNaPousada()
  return (
    <Card className="p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead>ID</TableHead>
              <TableHead>Hospede</TableHead>
              <TableHead>Documento</TableHead>
              <TableHead>Quarto</TableHead>
              <TableHead>Entrada</TableHead>
              <TableHead>Saida</TableHead>
              <TableHead>Valor (R$)</TableHead>
              <TableHead>Pago</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Acoes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8">
                  <div className="flex items-center justify-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    <span className="text-muted-foreground text-sm">Carregando...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : reservas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                  Nenhuma reserva encontrada.
                </TableCell>
              </TableRow>
            ) : (
              reservas.map((reserva) => (
                <TableRow key={reserva.id}>
                  <TableCell className="font-medium text-muted-foreground">#{reserva.id}</TableCell>
                  <TableCell>
                    <div className="font-medium">{reserva.nome}</div>
                    {reserva.telefone && <div className="text-xs text-muted-foreground">{formatarTelefone(reserva.telefone)}</div>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{reserva.documento || <span className="text-amber-700 text-xs">pendente</span>}</TableCell>
                  <TableCell>{reserva.quarto}</TableCell>
                  <TableCell>{formatarData(reserva.data_entrada)}</TableCell>
                  <TableCell>{formatarData(reserva.data_saida)}</TableCell>
                  <TableCell>{reserva.valor ? formatarValor(Number(reserva.valor)) : "-"}</TableCell>
                  <TableCell>
                    {reserva.pago ? (
                      <Badge variant="success">Sim</Badge>
                    ) : (reserva.pago_centavos ?? 0) > 0 ? (
                      <Badge variant="warning" title={`Falta ${reais(saldoDaReserva(reserva))}`}>Parcial</Badge>
                    ) : (
                      <Badge variant="destructive">Não</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={getStatusBadgeVariant(reserva.status)}>
                      {getStatusLabel(reserva.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {(() => {
                        const proximo = onMudarStatus && acaoPrincipal(reserva.status, reserva.data_entrada, hoje)
                        return proximo ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={mudando === reserva.id}
                            onClick={() => {
                              const saldo = saldoDaReserva(reserva)
                              if (proximo === "finalizada" && saldo > 0 && !window.confirm(`Saldo em aberto de ${reais(saldo)}. Fazer o check-out mesmo assim?`)) return
                              onMudarStatus(Number(reserva.id), proximo)
                            }}
                          >
                            {ROTULO_ACAO[proximo]}
                          </Button>
                        ) : null
                      })()}
                      <Button variant="ghost" size="sm" onClick={() => onEdit(Number(reserva.id))}>
                        Editar
                      </Button>
                      {(userRole === 'admin' || userRole === 'owner') && (
                        <Button variant="ghost" size="sm" onClick={() => onDelete(Number(reserva.id))} className="text-destructive hover:text-destructive">
                          Excluir
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {meta.paginas > 1 && (
        <div className="p-4 border-t">
          <Pagination
            page={meta.pagina || 1}
            totalPages={meta.paginas || 1}
            onPageChange={onPageChange}
          />
        </div>
      )}
    </Card>
  )
}

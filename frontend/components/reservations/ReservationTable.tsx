"use client"

import { Button } from "../ui/button"
import { Badge } from "../ui/badge"
import { Card } from "../ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table"
import { Pagination } from "../pagination"
import { formatarData, formatarValor, getStatusBadgeVariant } from "../../lib/formatters"
import type { Reserva, PaginationMeta } from "../../lib/types"

interface ReservationTableProps {
  reservas: Reserva[]
  meta: PaginationMeta
  onPageChange: (page: number) => void
  onEdit: (id: number) => void
  onDelete: (id: number) => void
  loading?: boolean
}

export function ReservationTable({
  reservas,
  meta,
  onPageChange,
  onEdit,
  onDelete,
  loading = false,
}: ReservationTableProps) {
  return (
    <Card className="p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead>ID</TableHead>
              <TableHead>Hospede</TableHead>
              <TableHead>CPF</TableHead>
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
                  <TableCell className="font-medium">{reserva.nome}</TableCell>
                  <TableCell className="text-muted-foreground">{reserva.cpf}</TableCell>
                  <TableCell>{reserva.quarto}</TableCell>
                  <TableCell>{formatarData(reserva.data_entrada)}</TableCell>
                  <TableCell>{formatarData(reserva.data_saida)}</TableCell>
                  <TableCell>{reserva.valor ? formatarValor(Number(reserva.valor)) : "-"}</TableCell>
                  <TableCell>
                    <Badge variant={reserva.pago ? "success" : "destructive"}>
                      {reserva.pago ? "Sim" : "Nao"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getStatusBadgeVariant(reserva.status)}>
                      {reserva.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => onEdit(Number(reserva.id))}>
                        Editar
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => onDelete(Number(reserva.id))} className="text-destructive hover:text-destructive">
                        Excluir
                      </Button>
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

interface ProximasReservasTableProps {
  reservas: Reserva[]
  onViewAll: () => void
}

export function ProximasReservasTable({ reservas, onViewAll }: ProximasReservasTableProps) {
  return (
    <Card className="dashboard-table p-0 overflow-hidden">
      <div className="flex items-center justify-between p-5 pb-4">
        <div>
          <h3 className="text-lg font-semibold">Proximas Reservas</h3>
          <p className="text-sm text-muted-foreground">Check-ins e check-outs em breve</p>
        </div>
        <Button variant="outline" size="sm" onClick={onViewAll}>
          Ver todas
        </Button>
      </div>
      <div className="border-t">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead>Hospede</TableHead>
              <TableHead>Quarto</TableHead>
              <TableHead>Entrada</TableHead>
              <TableHead>Saida</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reservas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  Nenhuma reserva proxima.
                </TableCell>
              </TableRow>
            ) : (
              reservas.map((reserva) => (
                <TableRow key={reserva.id}>
                  <TableCell className="font-medium">{reserva.nome}</TableCell>
                  <TableCell>{reserva.quarto}</TableCell>
                  <TableCell>{formatarData(reserva.data_entrada)}</TableCell>
                  <TableCell>{formatarData(reserva.data_saida)}</TableCell>
                  <TableCell>
                    <Badge variant={getStatusBadgeVariant(reserva.status)}>
                      {reserva.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  )
}

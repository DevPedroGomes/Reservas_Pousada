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
    <Card className="border-2 shadow-xl">
      <div className="overflow-hidden rounded-xl border-2 border-border m-4">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="font-bold">ID</TableHead>
              <TableHead className="font-bold">Hospede</TableHead>
              <TableHead className="font-bold">CPF</TableHead>
              <TableHead className="font-bold">Quarto</TableHead>
              <TableHead className="font-bold">Entrada</TableHead>
              <TableHead className="font-bold">Saida</TableHead>
              <TableHead className="font-bold">Valor (R$)</TableHead>
              <TableHead className="font-bold">Pago</TableHead>
              <TableHead className="font-bold">Status</TableHead>
              <TableHead className="font-bold">Acoes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8">
                  <div className="flex items-center justify-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    <span className="text-muted-foreground">Carregando...</span>
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
                <TableRow key={reserva.id} className="hover:bg-muted/30 transition-colors">
                  <TableCell className="font-medium">#{reserva.id}</TableCell>
                  <TableCell className="font-medium">{reserva.nome}</TableCell>
                  <TableCell>{reserva.cpf}</TableCell>
                  <TableCell>Quarto {reserva.quarto}</TableCell>
                  <TableCell>{formatarData(reserva.data_entrada)}</TableCell>
                  <TableCell>{formatarData(reserva.data_saida)}</TableCell>
                  <TableCell>{reserva.valor ? formatarValor(reserva.valor) : "-"}</TableCell>
                  <TableCell>
                    <Badge variant={reserva.pago ? "default" : "destructive"} className="font-semibold">
                      {reserva.pago ? "Sim" : "Nao"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getStatusBadgeVariant(reserva.status)} className="font-semibold">
                      {reserva.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onEdit(Number(reserva.id))}
                        className="font-medium"
                      >
                        Editar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onDelete(Number(reserva.id))}
                        className="font-medium border-2"
                      >
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
        <div className="p-4">
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

// Compact version for dashboard
interface ProximasReservasTableProps {
  reservas: Reserva[]
  onViewAll: () => void
}

export function ProximasReservasTable({ reservas, onViewAll }: ProximasReservasTableProps) {
  return (
    <Card className="dashboard-table border-2 shadow-xl">
      <div className="flex items-center justify-between p-6 pb-4">
        <div>
          <Badge
            variant="outline"
            className="mb-2 border-primary/20 bg-primary/5 text-primary px-3 py-1 text-xs font-bold uppercase tracking-wider"
          >
            Pipeline
          </Badge>
          <h3 className="text-2xl font-bold">Proximas Reservas</h3>
          <p className="text-base text-muted-foreground mt-1">Check-ins e check-outs em breve</p>
        </div>
        <Button onClick={onViewAll} className="font-semibold">
          Ver todas
        </Button>
      </div>
      <div className="px-6 pb-6">
        <div className="overflow-hidden rounded-xl border-2 border-border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="font-bold">Hospede</TableHead>
                <TableHead className="font-bold">Quarto</TableHead>
                <TableHead className="font-bold">Entrada</TableHead>
                <TableHead className="font-bold">Saida</TableHead>
                <TableHead className="font-bold">Status</TableHead>
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
                  <TableRow key={reserva.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="font-medium">{reserva.nome}</TableCell>
                    <TableCell>Quarto {reserva.quarto}</TableCell>
                    <TableCell>{formatarData(reserva.data_entrada)}</TableCell>
                    <TableCell>{formatarData(reserva.data_saida)}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(reserva.status)} className="font-semibold">
                        {reserva.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </Card>
  )
}

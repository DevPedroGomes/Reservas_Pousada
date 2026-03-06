"use client"

import type React from "react"
import { Button } from "../ui/button"
import { Card, CardContent } from "../ui/card"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { Select } from "../ui/select"

export interface FiltersState {
  status: string
  data_inicio: string
  data_fim: string
  pago: string
  search: string
}

interface ReservationFiltersProps {
  filters: FiltersState
  onFiltersChange: (filters: FiltersState) => void
  onApply: () => void
  onExport: () => void
  onClear: () => void
  total: number
  loading: boolean
  exporting: boolean
}

export function ReservationFilters({
  filters,
  onFiltersChange,
  onApply,
  onExport,
  onClear,
  total,
  loading,
  exporting,
}: ReservationFiltersProps) {
  const handleChange = (field: keyof FiltersState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    onFiltersChange({ ...filters, [field]: e.target.value })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onApply()
  }

  return (
    <Card>
      <CardContent className="pt-5">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5 lg:col-span-2">
              <Label htmlFor="search" className="text-xs">Buscar</Label>
              <Input
                id="search"
                type="text"
                placeholder="Nome ou CPF do hospede"
                value={filters.search}
                onChange={handleChange("search")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="status" className="text-xs">Status</Label>
              <Select id="status" value={filters.status} onChange={handleChange("status")}>
                <option value="">Todos</option>
                <option value="ativa">Ativa</option>
                <option value="finalizada">Finalizada</option>
                <option value="cancelada">Cancelada</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pago" className="text-xs">Pagamento</Label>
              <Select id="pago" value={filters.pago} onChange={handleChange("pago")}>
                <option value="">Todos</option>
                <option value="true">Pago</option>
                <option value="false">Pendente</option>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="data_inicio" className="text-xs">Data Inicio</Label>
              <Input id="data_inicio" type="date" value={filters.data_inicio} onChange={handleChange("data_inicio")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="data_fim" className="text-xs">Data Fim</Label>
              <Input id="data_fim" type="date" value={filters.data_fim} onChange={handleChange("data_fim")} />
            </div>
            <div className="flex items-end gap-2 lg:col-span-2">
              <Button type="submit" className="flex-1" disabled={loading}>
                {loading ? "Buscando..." : "Filtrar"}
              </Button>
              <Button type="button" variant="outline" onClick={onClear}>
                Limpar
              </Button>
              <Button type="button" variant="ghost" onClick={onExport} disabled={exporting || total === 0}>
                {exporting ? "..." : "CSV"}
              </Button>
            </div>
          </div>

          <div className="flex items-center pt-2 border-t">
            <p className="text-xs text-muted-foreground">
              {total} reserva{total !== 1 ? "s" : ""} encontrada{total !== 1 ? "s" : ""}
            </p>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

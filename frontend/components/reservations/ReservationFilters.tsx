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
    <Card className="border-2 shadow-xl mb-6">
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            {/* Busca */}
            <div className="space-y-2 lg:col-span-2">
              <Label htmlFor="search" className="text-sm font-semibold">
                Buscar
              </Label>
              <Input
                id="search"
                type="text"
                placeholder="Nome ou CPF do hospede"
                value={filters.search}
                onChange={handleChange("search")}
                className="h-11 border-2"
              />
            </div>

            {/* Status */}
            <div className="space-y-2">
              <Label htmlFor="status" className="text-sm font-semibold">
                Status
              </Label>
              <Select
                id="status"
                value={filters.status}
                onChange={handleChange("status")}
                className="h-11 border-2"
              >
                <option value="">Todos</option>
                <option value="ativa">Ativa</option>
                <option value="finalizada">Finalizada</option>
                <option value="cancelada">Cancelada</option>
              </Select>
            </div>

            {/* Pagamento */}
            <div className="space-y-2">
              <Label htmlFor="pago" className="text-sm font-semibold">
                Pagamento
              </Label>
              <Select
                id="pago"
                value={filters.pago}
                onChange={handleChange("pago")}
                className="h-11 border-2"
              >
                <option value="">Todos</option>
                <option value="true">Pago</option>
                <option value="false">Pendente</option>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* Data Inicio */}
            <div className="space-y-2">
              <Label htmlFor="data_inicio" className="text-sm font-semibold">
                Data Inicio
              </Label>
              <Input
                id="data_inicio"
                type="date"
                value={filters.data_inicio}
                onChange={handleChange("data_inicio")}
                className="h-11 border-2"
              />
            </div>

            {/* Data Fim */}
            <div className="space-y-2">
              <Label htmlFor="data_fim" className="text-sm font-semibold">
                Data Fim
              </Label>
              <Input
                id="data_fim"
                type="date"
                value={filters.data_fim}
                onChange={handleChange("data_fim")}
                className="h-11 border-2"
              />
            </div>

            {/* Botoes */}
            <div className="flex items-end gap-2 lg:col-span-2">
              <Button
                type="submit"
                className="flex-1 h-11 font-semibold"
                disabled={loading}
              >
                {loading ? "Buscando..." : "Filtrar"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 font-semibold border-2"
                onClick={onClear}
              >
                Limpar
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-11 font-semibold"
                onClick={onExport}
                disabled={exporting || total === 0}
              >
                {exporting ? "Exportando..." : "CSV"}
              </Button>
            </div>
          </div>

          {/* Total de resultados */}
          <div className="flex items-center justify-between pt-2 border-t">
            <p className="text-sm text-muted-foreground font-medium">
              {total} reserva{total !== 1 ? "s" : ""} encontrada{total !== 1 ? "s" : ""}
            </p>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

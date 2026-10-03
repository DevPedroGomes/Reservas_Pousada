"use client"

import { Card, CardContent } from "../ui/card"
import { cn } from "../../lib/utils"

interface StatCardProps {
  title: string
  value: string | number
  description?: string
  icon?: React.ReactNode
  variant?: "default" | "success" | "warning" | "info"
  className?: string
}

function StatCard({ title, value, description, icon, variant = "default", className }: StatCardProps) {
  const accentColors = {
    default: "text-primary",
    success: "text-emerald-600",
    warning: "text-amber-600",
    info: "text-sky-600",
  }

  return (
    <Card className={cn("stat-card", className)}>
      <CardContent className="space-y-0">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</span>
          {icon && <span className={cn("opacity-50", accentColors[variant])}>{icon}</span>}
        </div>
        <div className={cn("text-2xl font-bold tracking-tight", accentColors[variant])}>{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  )
}

interface StatsGridProps {
  quartosOcupados: number
  totalQuartos: number
  taxaOcupacao: number
  chegadasHoje: number
  saidasHoje: number
  aReceber: number
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })

/**
 * Números do topo do painel, todos vindos do backend.
 *
 * A ocupação era calculada aqui como "reservas ativas ÷ quartos" — o que
 * contava reservas FUTURAS como ocupação de hoje (uma pousada vazia com 10
 * reservas para o Réveillon aparecia 100% ocupada).
 */
export function StatsGrid({ quartosOcupados, totalQuartos, taxaOcupacao, chegadasHoje, saidasHoje, aReceber }: StatsGridProps) {
  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
      <StatCard
        title="Ocupação hoje"
        value={`${taxaOcupacao}%`}
        description={`${quartosOcupados} de ${totalQuartos} quartos`}
        variant={taxaOcupacao >= 80 ? "warning" : "success"}
      />
      <StatCard
        title="Livres hoje"
        value={Math.max(totalQuartos - quartosOcupados, 0)}
        description="Quartos disponíveis"
        variant="info"
      />
      <StatCard
        title="Movimento hoje"
        value={`${chegadasHoje} / ${saidasHoje}`}
        description="Chegadas / saídas"
      />
      <StatCard
        title="A receber"
        value={brl(aReceber)}
        description="Saldo das reservas em aberto"
        variant={aReceber > 0 ? "warning" : "default"}
      />
    </div>
  )
}

export { StatCard }

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
  reservasAtivas: number
  quartosDisponiveis: number
  totalQuartos: number
  reservasHoje: number
}

export function StatsGrid({
  reservasAtivas,
  quartosDisponiveis,
  totalQuartos,
  reservasHoje,
}: StatsGridProps) {
  const taxaOcupacao = totalQuartos > 0
    ? Math.round((reservasAtivas / totalQuartos) * 100)
    : 0

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title="Reservas Ativas"
        value={reservasAtivas}
        description="Hospedes atualmente"
        variant="success"
        icon={
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        }
      />
      <StatCard
        title="Quartos Disponiveis"
        value={quartosDisponiveis}
        description={`De ${totalQuartos} quartos`}
        variant="info"
        icon={
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        }
      />
      <StatCard
        title="Ocupacao"
        value={`${taxaOcupacao}%`}
        description="Neste momento"
        variant={taxaOcupacao > 80 ? "warning" : "default"}
        icon={
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        }
      />
      <StatCard
        title="Hoje"
        value={reservasHoje}
        description="Check-ins e check-outs"
        variant="default"
        icon={
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        }
      />
    </div>
  )
}

export { StatCard }

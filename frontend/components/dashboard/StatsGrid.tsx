"use client"

import { Card, CardContent, CardHeader, CardTitle } from "../ui/card"
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
  const variantStyles = {
    default: "bg-card",
    success: "bg-green-500/5 border-green-500/20",
    warning: "bg-yellow-500/5 border-yellow-500/20",
    info: "bg-blue-500/5 border-blue-500/20",
  }

  const iconStyles = {
    default: "bg-primary/10 text-primary",
    success: "bg-green-500/10 text-green-600",
    warning: "bg-yellow-500/10 text-yellow-600",
    info: "bg-blue-500/10 text-blue-600",
  }

  return (
    <Card className={cn("stat-card border-2 shadow-xl transition-all hover:shadow-2xl", variantStyles[variant], className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-bold tracking-tight text-muted-foreground uppercase">
          {title}
        </CardTitle>
        {icon && (
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", iconStyles[variant])}>
            {icon}
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-black tracking-tight">{value}</div>
        {description && (
          <p className="text-sm text-muted-foreground mt-1 font-medium">{description}</p>
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
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title="Reservas Ativas"
        value={reservasAtivas}
        description="Hospedes atualmente"
        variant="success"
        icon={
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
        }
      />

      <StatCard
        title="Quartos Disponiveis"
        value={quartosDisponiveis}
        description={`De ${totalQuartos} quartos`}
        variant="info"
        icon={
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
            />
          </svg>
        }
      />

      <StatCard
        title="Taxa de Ocupacao"
        value={`${taxaOcupacao}%`}
        description="Neste momento"
        variant={taxaOcupacao > 80 ? "warning" : "default"}
        icon={
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
        }
      />

      <StatCard
        title="Movimentacao Hoje"
        value={reservasHoje}
        description="Check-ins e check-outs"
        variant="default"
        icon={
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        }
      />
    </div>
  )
}

export { StatCard }

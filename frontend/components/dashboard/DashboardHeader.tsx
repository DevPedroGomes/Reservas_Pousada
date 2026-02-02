"use client"

import { Button } from "../ui/button"
import { Badge } from "../ui/badge"
import { cn } from "../../lib/utils"
import type { Usuario, Pousada } from "../../lib/types"

type PageType = "dashboard" | "reservas" | "nova-reserva" | "configuracoes"

interface DashboardHeaderProps {
  user: Usuario | null
  pousada: Pousada | null
  currentPage: PageType
  onPageChange: (page: PageType) => void
  onLogout: () => void
}

const NAV_ITEMS = [
  { id: "dashboard" as const, label: "Dashboard", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
  { id: "reservas" as const, label: "Reservas", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" },
  { id: "nova-reserva" as const, label: "Nova Reserva", icon: "M12 6v6m0 0v6m0-6h6m-6 0H6" },
]

export function DashboardHeader({
  user,
  pousada,
  currentPage,
  onPageChange,
  onLogout,
}: DashboardHeaderProps) {
  const navItems = user?.is_owner
    ? [...NAV_ITEMS, { id: "configuracoes" as const, label: "Configuracoes", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" }]
    : NAV_ITEMS

  return (
    <header className="sticky top-0 z-40 border-b border-border/40 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
            <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-base font-bold text-primary-foreground shadow-lg">
              {pousada?.nome ? pousada.nome.substring(0, 2).toUpperCase() : "RP"}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sistema</p>
            <p className="text-lg font-bold tracking-tight">{pousada?.nome || "Reservas Pousada"}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="font-medium">
            {user?.nome}
          </Badge>
          {user?.is_owner && <Badge className="text-xs font-bold">Owner</Badge>}
          <Button variant="ghost" onClick={onLogout} className="font-medium">
            Sair
          </Button>
        </div>
      </div>
      <div className="border-t border-border/40">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-6 py-3">
          {navItems.map((item) => (
            <Button
              key={item.id}
              variant={currentPage === item.id ? "default" : "ghost"}
              className={cn(
                "rounded-xl font-semibold transition-all",
                currentPage === item.id ? "shadow-lg shadow-primary/25" : "",
              )}
              onClick={() => onPageChange(item.id)}
            >
              <svg
                className="mr-2 h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
              </svg>
              {item.label}
            </Button>
          ))}
        </div>
      </div>
    </header>
  )
}

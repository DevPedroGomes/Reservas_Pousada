"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "../ui/button"
import { cn } from "../../lib/utils"
import type { Usuario, Pousada, UserPousada } from "../../lib/types"

type PageType = "dashboard" | "reservas" | "nova-reserva" | "configuracoes"

interface DashboardHeaderProps {
  user: Usuario | null
  pousada: Pousada | null
  pousadas: UserPousada[]
  currentPage: PageType
  onPageChange: (page: PageType) => void
  onLogout: () => void
  onTrocarPousada: (pousadaId: number) => Promise<boolean>
}

const NAV_ITEMS = [
  { id: "dashboard" as const, label: "Dashboard", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
  { id: "reservas" as const, label: "Reservas", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" },
  { id: "nova-reserva" as const, label: "Nova Reserva", icon: "M12 6v6m0 0v6m0-6h6m-6 0H6" },
]

export function DashboardHeader({
  user,
  pousada,
  pousadas,
  currentPage,
  onPageChange,
  onLogout,
  onTrocarPousada,
}: DashboardHeaderProps) {
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [switching, setSwitching] = useState(false)
  const switcherRef = useRef<HTMLDivElement>(null)

  const navItems = user?.is_owner
    ? [...NAV_ITEMS, { id: "configuracoes" as const, label: "Config", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" }]
    : NAV_ITEMS

  // Close switcher on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
        setSwitcherOpen(false)
      }
    }
    if (switcherOpen) document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [switcherOpen])

  const hasMultiple = pousadas.length > 1

  async function handleSwitch(id: number) {
    if (switching) return
    setSwitching(true)
    try {
      setSwitcherOpen(false)
      const success = await onTrocarPousada(id)
      if (success) {
        onPageChange("dashboard")
      }
    } finally {
      setSwitching(false)
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/50 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 h-14">
        <div className="relative flex items-center gap-3" ref={switcherRef}>
          <button
            onClick={() => hasMultiple && setSwitcherOpen(!switcherOpen)}
            className={cn(
              "flex items-center gap-2.5",
              hasMultiple && "cursor-pointer hover:opacity-80 transition-opacity"
            )}
          >
            <img src="/logo.png" alt="Logo" className="h-8 w-8 rounded-lg object-cover" />
            <span className="text-sm font-semibold hidden sm:block">{pousada?.nome || "Minha Pousada"}</span>
            {hasMultiple && (
              <svg className={cn("h-4 w-4 text-muted-foreground transition-transform", switcherOpen && "rotate-180")} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            )}
          </button>

          {/* Pousada Switcher Dropdown */}
          {switcherOpen && (
            <div className="absolute left-0 top-full mt-2 w-72 rounded-lg border border-border bg-white shadow-lg z-50">
              <div className="p-2">
                <div className="flex items-center justify-between px-2 py-1.5">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Suas Pousadas</p>
                  {switching && (
                    <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  )}
                </div>
                {pousadas.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleSwitch(p.id)}
                    disabled={switching}
                    className={cn(
                      "w-full flex items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors",
                      p.id === pousada?.id
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-muted/50 text-foreground",
                      switching && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold">
                      {p.nome.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{p.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.isOwner ? "Proprietario" : p.role === "admin" ? "Admin" : p.role === "recepcao" ? "Recepcao" : p.role}
                        {p.cidade && ` · ${p.cidade}`}
                      </p>
                    </div>
                    {p.id === pousada?.id && (
                      <svg className="h-4 w-4 shrink-0 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <nav className="flex items-center gap-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onPageChange(item.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors",
                currentPage === item.id
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
              )}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
              </svg>
              <span className="hidden sm:inline">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground hidden sm:block">{user?.nome}</span>
          <Button variant="ghost" size="sm" onClick={onLogout}>
            Sair
          </Button>
        </div>
      </div>
    </header>
  )
}

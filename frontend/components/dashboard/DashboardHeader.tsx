"use client"

import { useState, useRef, useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Button } from "../ui/button"
import { cn } from "../../lib/utils"
import type { Usuario, Pousada, UserPousada } from "../../lib/types"
import { BotaoInstalar } from "../pwa/Pwa"

interface DashboardHeaderProps {
  user: Usuario | null
  pousada: Pousada | null
  pousadas: UserPousada[]
  onLogout: () => void
  onTrocarPousada: (pousadaId: number) => Promise<boolean>
}

const ICONES = {
  painel: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  reservas: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
  mapa: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  relatorios: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
  hospedes: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
  quartos: "M3 7v11m0-4h18m0 4V8a2 2 0 00-2-2h-8v8M7 11a2 2 0 100-4 2 2 0 000 4z",
  whatsapp: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z",
  config: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
}

/**
 * Cabeçalho da área logada. Navegação por URL: cada tela tem endereço próprio,
 * o "voltar" do navegador funciona e recarregar não joga a pessoa de volta
 * para o painel (antes a tela atual era só um estado em memória).
 */
export function DashboardHeader({ user, pousada, pousadas, onLogout, onTrocarPousada }: DashboardHeaderProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [switching, setSwitching] = useState(false)
  const switcherRef = useRef<HTMLDivElement>(null)

  // Admin também gerencia equipe e convites (o backend autoriza).
  const podeVerConfiguracoes = Boolean(user?.is_owner) || user?.role === "admin"
  // Faturamento: dono/admin e auditoria (contador).
  const podeVerRelatorios = Boolean(user?.is_owner) || user?.role === "admin" || user?.role === "auditoria"
  // Conversas com hóspedes: quem atende (auditoria não).
  const podeAtender = Boolean(user?.is_owner) || user?.role === "admin" || user?.role === "recepcao"

  const navItems = [
    { href: "/painel", label: "Painel", icon: ICONES.painel },
    { href: "/mapa", label: "Mapa", icon: ICONES.mapa },
    { href: "/reservas", label: "Reservas", icon: ICONES.reservas },
    { href: "/hospedes", label: "Hóspedes", icon: ICONES.hospedes },
    { href: "/quartos", label: "Quartos", icon: ICONES.quartos },
    ...(podeAtender ? [{ href: "/whatsapp", label: "WhatsApp", icon: ICONES.whatsapp }] : []),
    ...(podeVerRelatorios ? [{ href: "/relatorios", label: "Relatórios", icon: ICONES.relatorios }] : []),
    ...(podeVerConfiguracoes ? [{ href: "/configuracoes", label: "Configurações", icon: ICONES.config }] : []),
  ]

  const ativo = (href: string) =>
    href === "/reservas" ? pathname === "/reservas" || /^\/reservas\/\d+/.test(pathname)
      : href === "/hospedes" ? pathname.startsWith("/hospedes")
      : pathname === href

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
      if (success) router.push("/painel")
    } finally {
      setSwitching(false)
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/50 bg-white/80 backdrop-blur-md">
      {/* Celular: duas linhas (marca + ações; menu embaixo). Do md em diante, uma. */}
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2 sm:px-6 md:h-14 md:flex-nowrap md:py-0">
        <div className="relative flex items-center gap-3" ref={switcherRef}>
          <button
            onClick={() => setSwitcherOpen(!switcherOpen)}
            className="flex items-center gap-2.5 cursor-pointer hover:opacity-80 transition-opacity"
            aria-label="Trocar de pousada"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Diária" className="h-8 w-8 rounded-lg object-cover" />
            <span className="text-sm font-semibold hidden sm:block max-w-[14rem] truncate">{pousada?.nome || "Diária"}</span>
            {(hasMultiple || user?.is_owner) && (
              <svg className={cn("h-4 w-4 text-muted-foreground transition-transform", switcherOpen && "rotate-180")} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            )}
          </button>

          {switcherOpen && (
            <div className="absolute left-0 top-full mt-2 w-72 rounded-lg border border-border bg-white shadow-lg z-50">
              <div className="p-2">
                <div className="flex items-center justify-between px-2 py-1.5">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Suas pousadas</p>
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
                      p.id === pousada?.id ? "bg-primary/10 text-primary" : "hover:bg-muted/50 text-foreground",
                      switching && "opacity-50 cursor-not-allowed",
                    )}
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold">
                      {p.nome.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{p.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.isOwner ? "Proprietário" : p.role === "admin" ? "Administração" : p.role === "recepcao" ? "Recepção" : "Auditoria"}
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
                {/* O backend decide se o plano permite (Rede cobre até 3). */}
                <Link
                  href="/onboarding?nova=1"
                  className="mt-1 flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-dashed border-border text-base">+</div>
                  Nova pousada
                </Link>
              </div>
            </div>
          )}
        </div>

        <nav className="order-last -mx-1 flex w-full items-center gap-1 overflow-x-auto md:order-none md:mx-0 md:w-auto">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={ativo(item.href) ? "page" : undefined}
              title={item.label}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm transition-colors",
                ativo(item.href)
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
              )}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
              </svg>
              {/* Abaixo de xl, só os ícones (title mostra o nome): cabe sem quebrar linha. */}
              <span className="sr-only xl:not-sr-only">{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <BotaoInstalar />
          <span className="text-xs text-muted-foreground hidden 2xl:block whitespace-nowrap">{user?.nome}</span>
          {user?.is_owner && (
            <Link href="/assinatura">
              <Button variant="ghost" size="sm">Assinatura</Button>
            </Link>
          )}
          <Button variant="ghost" size="sm" onClick={onLogout}>
            Sair
          </Button>
        </div>
      </div>
    </header>
  )
}

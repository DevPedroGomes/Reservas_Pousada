"use client"

import React, { useEffect, useMemo, useState, useRef, useCallback } from "react"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card"
import { Button } from "../components/ui/button"
import { Badge } from "../components/ui/badge"
import { ConfirmDialog } from "../components/confirm-dialog"
import { cn } from "../lib/utils"

// Auth and Reservations
import { useAuth } from "../hooks/useAuth"
import { useReservations } from "../hooks/useReservations"
import { useStaffInvites } from "../hooks/useStaffInvites"
import { sendEmailVerification, changePassword } from "../lib/auth-client"

// Components
import { AuthCard } from "../components/auth/AuthCard"
import { DashboardHeader } from "../components/dashboard/DashboardHeader"
import { StatsGrid } from "../components/dashboard/StatsGrid"
import { ReservationFilters } from "../components/reservations/ReservationFilters"
import { ReservationTable, ProximasReservasTable } from "../components/reservations/ReservationTable"
import { ReservationForm } from "../components/reservations/ReservationForm"

// Types
import type { Reserva } from "../lib/types"

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger)
}

type PageType = "dashboard" | "reservas" | "nova-reserva" | "configuracoes"

export default function Home() {
  const {
    isAuthenticated,
    user,
    pousada,
    pousadas: userPousadas,
    loading: loginLoading,
    authLoading,
    signupLoading,
    googleLoading,
    pousadaLoading,
    message,
    login,
    signup,
    logout,
    googleLogin,
    trocarPousada,
    refreshPousadas,
    setMessage,
  } = useAuth()

  const {
    reservas,
    dashReservas,
    dashboardStats,
    filters,
    meta,
    loading: reservasLoading,
    exporting,
    auditLogs,
    error: apiError,
    reservasAtivas,
    reservasHoje,
    setFilters,
    clearFilters,
    clearError,
    carregarReservas,
    carregarDashboard,
    exportarCsv,
    editarReserva,
    salvarReserva,
    excluirReserva,
    carregarAuditoria,
    setPage: setReservasPage,
  } = useReservations(isAuthenticated, pousada?.id)

  const {
    convites,
    loading: convitesLoading,
    message: convitesMessage,
    carregarConvites,
    enviarConvite,
    revogarConvite,
    setMessage: setConvitesMessage,
  } = useStaffInvites()

  const [page, setPage] = useState<PageType>("dashboard")
  const [isSignup, setIsSignup] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [reservaToDelete, setReservaToDelete] = useState<number | null>(null)
  const [formData, setFormData] = useState<Reserva | null>(null)
  const [formId, setFormId] = useState<number | null>(null)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState("recepcao")
  const [verificationSent, setVerificationSent] = useState(false)
  const [pwCurrent, setPwCurrent] = useState("")
  const [pwNew, setPwNew] = useState("")
  const [pwConfirm, setPwConfirm] = useState("")
  const [pwLoading, setPwLoading] = useState(false)
  const [pwMessage, setPwMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [formLoading, setFormLoading] = useState(false)

  const heroRef = useRef<HTMLDivElement>(null)
  const statsRef = useRef<HTMLDivElement>(null)
  const authFormRef = useRef<HTMLDivElement>(null)

  const TOTAL_QUARTOS = pousada?.num_quartos || 25
  const quartosDisponiveis = dashboardStats?.quartos_disponiveis ?? (TOTAL_QUARTOS - reservasAtivas)

  const proximasReservas = useMemo(
    () =>
      dashReservas
        .filter((r) => r.status === "ativa")
        .sort((a, b) => new Date(a.data_entrada).getTime() - new Date(b.data_entrada).getTime())
        .slice(0, 5),
    [dashReservas]
  )

  // Load data when authenticated and pousada is ready
  useEffect(() => {
    if (isAuthenticated && pousada?.id && !pousadaLoading) {
      carregarDashboard()
      carregarReservas()
    }
  }, [isAuthenticated, pousada?.id, pousadaLoading, carregarDashboard, carregarReservas])

  // Auto-dismiss messages after 4 seconds
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 4000)
      return () => clearTimeout(timer)
    }
  }, [message, setMessage])

  useEffect(() => {
    if (!isAuthenticated && heroRef.current) {
      const ctx = gsap.context(() => {
        gsap.from(".hero-badge", { opacity: 0, y: -20, duration: 0.6, ease: "power3.out" })
        gsap.from(".hero-title", { opacity: 0, y: 30, duration: 0.8, delay: 0.2, ease: "power3.out" })
        gsap.from(".hero-description", { opacity: 0, y: 20, duration: 0.8, delay: 0.4, ease: "power3.out" })
        gsap.from(".hero-buttons", { opacity: 0, y: 20, duration: 0.8, delay: 0.6, ease: "power3.out" })
        gsap.from(".feature-card", { opacity: 0, y: 40, duration: 0.8, stagger: 0.15, delay: 0.8, ease: "power3.out" })
      }, heroRef)
      return () => ctx.revert()
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (!isAuthenticated && authFormRef.current) {
      gsap.fromTo(
        authFormRef.current,
        { opacity: 0, scale: 0.97, y: 15 },
        { opacity: 1, scale: 1, y: 0, duration: 0.4, ease: "power3.out" }
      )
    }
  }, [isSignup, isAuthenticated])

  useEffect(() => {
    if (isAuthenticated && page === "dashboard" && statsRef.current) {
      const ctx = gsap.context(() => {
        gsap.from(".stat-card", { opacity: 0, y: 20, duration: 0.5, stagger: 0.08, ease: "power3.out" })
        gsap.from(".dashboard-table", { opacity: 0, y: 20, duration: 0.6, delay: 0.25, ease: "power3.out" })
      }, statsRef)
      return () => ctx.revert()
    }
  }, [isAuthenticated, page, reservasAtivas])

  const handlePageChange = useCallback((newPage: PageType) => {
    setPage(newPage)
    if (newPage === "dashboard") carregarDashboard()
    if (newPage === "reservas") carregarReservas()
    if (newPage === "nova-reserva") {
      setFormData(null)
      setFormId(null)
    }
    if (newPage === "configuracoes" && pousada) {
      carregarConvites(pousada.id)
    }
  }, [carregarDashboard, carregarReservas, carregarConvites, pousada])

  const handleEditReserva = useCallback(async (id: number) => {
    const reserva = await editarReserva(id)
    if (reserva) {
      setFormData(reserva)
      setFormId(reserva.id ?? null)
      await carregarAuditoria(id)
      setPage("nova-reserva")
    }
  }, [editarReserva, carregarAuditoria])

  const handleSaveReserva = useCallback(async (data: Reserva) => {
    setFormLoading(true)
    const result = await salvarReserva(data, formId)
    setFormLoading(false)

    if (result.sucesso) {
      setMessage({ type: "success", text: result.mensagem })
      setPage("reservas")
      setFormData(null)
      setFormId(null)
      carregarReservas()
      carregarDashboard()
    } else {
      setMessage({ type: "error", text: result.mensagem })
    }
  }, [formId, salvarReserva, setMessage, carregarReservas, carregarDashboard])

  const handleConfirmDelete = useCallback((id: number) => {
    setReservaToDelete(id)
    setConfirmOpen(true)
  }, [])

  const handleDeleteReserva = useCallback(async () => {
    if (!reservaToDelete) return
    const success = await excluirReserva(reservaToDelete)
    if (success) {
      setMessage({ type: "success", text: "Reserva excluida com sucesso." })
      carregarReservas()
      carregarDashboard()
    } else {
      setMessage({ type: "error", text: "Erro ao excluir reserva." })
    }
    setConfirmOpen(false)
    setReservaToDelete(null)
  }, [reservaToDelete, excluirReserva, setMessage, carregarReservas, carregarDashboard])

  const handleLogin = useCallback(async (username: string, password: string) => {
    await login(username, password)
  }, [login])

  const handleSignup = useCallback(async (nome: string, username: string, password: string) => {
    await signup(nome, username, password)
  }, [signup])

  const handleLogout = useCallback(() => {
    logout()
  }, [logout])

  // Loading state (session or pousada loading)
  if (authLoading || (isAuthenticated && pousadaLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </div>
      </div>
    )
  }

  // ========================================
  // Landing Page
  // ========================================
  if (!isAuthenticated) {
    const features = [
      {
        title: "Reservas em segundos",
        desc: "Crie, edite e cancele reservas com check-in, check-out e disponibilidade em tempo real. CSV export para contador.",
        icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
      },
      {
        title: "Cadastro de hóspedes",
        desc: "Histórico completo por hóspede com CPF criptografado. Encontre quem ficou onde e quando em segundos.",
        icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
      },
      {
        title: "Equipe com permissões",
        desc: "Convide recepção, administradores e auditoria por email. Cada um vê só o que precisa, com trilha de auditoria de tudo.",
        icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
      },
      {
        title: "Múltiplas pousadas",
        desc: "Gerencia mais de uma pousada? Troque entre elas sem fazer logout. Cada uma com sua equipe e seus dados isolados.",
        icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4",
      },
      {
        title: "Dashboard com números",
        desc: "Ocupação, receita, taxa de cancelamento e próximos check-ins na primeira tela. Decisões em segundos, não relatórios.",
        icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
      },
      {
        title: "Seguro por padrão",
        desc: "Cookies HTTPOnly, RBAC, rate limiting, validação de CPF, sanitização de inputs. Os dados dos seus hóspedes ficam protegidos.",
        icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
      },
    ]

    const steps = [
      { n: 1, title: "Crie sua conta", desc: "Cadastre-se com email ou Google em menos de um minuto." },
      { n: 2, title: "Configure sua pousada", desc: "Nome, número de quartos, endereço. 4 etapas guiadas." },
      { n: 3, title: "Convide sua equipe", desc: "Recepção, admin, auditoria — cada um com seu papel." },
      { n: 4, title: "Comece a usar", desc: "Lance reservas, registre hóspedes, acompanhe pelo dashboard." },
    ]

    const faqs = [
      { q: "Funciona para quantos quartos?", a: "Não há limite. Pousadas com 5 ou 50 quartos rodam igual no sistema. O dashboard escala junto." },
      { q: "Posso convidar minha recepcionista?", a: "Sim. Convites por email com papéis definidos: owner, admin, recepção e auditoria. Cada papel vê e faz só o que precisa." },
      { q: "Os dados dos hóspedes são seguros?", a: "CPF é criptografado, cookies são HTTPOnly, todas as ações ficam em trilha de auditoria. Os dados da sua pousada ficam isolados dos demais." },
      { q: "Tem versão mobile?", a: "A interface é totalmente responsiva. Recepção pode usar pelo celular sem instalar nada." },
      { q: "E se eu tiver mais de uma pousada?", a: "O sistema é multi-tenant: você troca de pousada ativa em um clique, sem precisar de logins separados." },
    ]

    return (
      <main ref={heroRef} className="min-h-screen bg-background">
        {/* Nav */}
        <header className="fixed top-0 left-0 right-0 z-50 border-b border-border/40 bg-white/80 backdrop-blur-md">
          <div className="mx-auto max-w-6xl px-6 h-14 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <img src="/logo.png" alt="Logo" className="h-8 w-8 rounded-lg object-cover" />
              <span className="text-sm font-semibold">Minha Pousada</span>
            </div>
            <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
              <a href="#recursos" className="hover:text-foreground transition-colors">Recursos</a>
              <a href="#como-funciona" className="hover:text-foreground transition-colors">Como funciona</a>
              <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
            </nav>
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setIsSignup(false)}>
                Entrar
              </Button>
              <Button type="button" size="sm" onClick={() => setIsSignup(true)}>
                Começar grátis
              </Button>
            </div>
          </div>
        </header>

        {/* Hero */}
        <section className="relative overflow-hidden pt-24 pb-16 md:pt-32 md:pb-20 px-6">
          {/* Soft warm gradient */}
          <div
            className="absolute inset-0 -z-10 pointer-events-none"
            aria-hidden
            style={{
              background:
                "radial-gradient(ellipse 70% 50% at 50% 0%, hsl(25 80% 55% / 0.12), transparent 60%), radial-gradient(ellipse 60% 40% at 90% 30%, hsl(35 70% 60% / 0.10), transparent 70%)",
            }}
          />
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-12 lg:grid-cols-2 lg:gap-16 items-center">
              <div className="space-y-8">
                <div className="space-y-4">
                  <Badge className="hero-badge">Para donos de pousadas no Brasil</Badge>
                  <h1 className="hero-title text-4xl md:text-5xl lg:text-6xl font-bold leading-[1.05] tracking-tight">
                    Gerencie sua pousada{" "}
                    <span className="text-primary">sem planilha</span>,{" "}
                    <span className="text-primary">sem caderno</span>,
                    sem confusão.
                  </h1>
                  <p className="hero-description text-lg text-muted-foreground leading-relaxed max-w-lg">
                    Reservas, hóspedes, equipe e relatórios em um só lugar.
                    Multi-tenant, seguro, com trilha de auditoria de tudo que acontece.
                  </p>
                </div>
                <div className="hero-buttons flex flex-col sm:flex-row gap-3">
                  <Button type="button" size="lg" onClick={() => setIsSignup(true)}>
                    Criar conta gratuita
                  </Button>
                  <Button type="button" size="lg" variant="outline" onClick={() => setIsSignup(false)}>
                    Já tenho conta
                  </Button>
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground pt-2">
                  <span className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Sem cartão de crédito
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Setup em 4 etapas
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Login com Google
                  </span>
                </div>
              </div>

              <div ref={authFormRef} className="flex justify-center lg:justify-end">
                <AuthCard
                  isSignup={isSignup}
                  onToggleMode={() => setIsSignup(!isSignup)}
                  onLogin={handleLogin}
                  onSignup={handleSignup}
                  onGoogleLogin={googleLogin}
                  loading={{ signup: signupLoading, google: googleLoading, login: loginLoading }}
                  message={message}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="recursos" className="py-16 md:py-20 px-6 border-t border-border/40 bg-white">
          <div className="mx-auto max-w-6xl">
            <div className="text-center mb-12">
              <span className="text-xs uppercase tracking-widest text-muted-foreground font-mono">Recursos</span>
              <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mt-2">
                Tudo que sua pousada precisa
              </h2>
              <p className="text-muted-foreground mt-3 max-w-xl mx-auto">
                Construído com a operação real de uma pousada em mente — não é uma planilha bonita, é um sistema completo.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => (
                <Card key={feature.title} className="feature-card hover:shadow-md transition-shadow">
                  <CardHeader>
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                      <svg className="h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={feature.icon} />
                      </svg>
                    </div>
                    <CardTitle className="text-base">{feature.title}</CardTitle>
                    <CardDescription className="pt-1.5 text-sm leading-relaxed">{feature.desc}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="como-funciona" className="py-16 md:py-20 px-6 border-t border-border/40">
          <div className="mx-auto max-w-5xl">
            <div className="text-center mb-12">
              <span className="text-xs uppercase tracking-widest text-muted-foreground font-mono">Como funciona</span>
              <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mt-2">
                Em 4 etapas você está rodando
              </h2>
            </div>
            <div className="grid gap-4 md:grid-cols-4">
              {steps.map((s) => (
                <div key={s.n} className="relative bg-white border border-border/40 rounded-2xl p-6 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary text-primary-foreground font-semibold text-sm mb-3">
                    {s.n}
                  </div>
                  <h3 className="font-semibold text-base mb-1.5">{s.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Stack note */}
        <section className="py-12 px-6 border-t border-border/40 bg-white">
          <div className="mx-auto max-w-4xl text-center">
            <span className="text-xs uppercase tracking-widest text-muted-foreground font-mono">Construído com</span>
            <div className="flex flex-wrap justify-center gap-2 mt-4">
              {["Next.js 14", "Express + TypeScript", "PostgreSQL 16", "Drizzle ORM", "Better Auth", "Docker", "Traefik v3", "Resend"].map((tech) => (
                <span key={tech} className="inline-flex items-center px-3 py-1 rounded-full bg-muted text-xs text-muted-foreground border border-border/40">
                  {tech}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="py-16 md:py-20 px-6 border-t border-border/40">
          <div className="mx-auto max-w-3xl">
            <div className="text-center mb-10">
              <span className="text-xs uppercase tracking-widest text-muted-foreground font-mono">FAQ</span>
              <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mt-2">
                Perguntas frequentes
              </h2>
            </div>
            <div className="space-y-3">
              {faqs.map((f, i) => (
                <details key={i} className="group bg-white border border-border/40 rounded-xl p-5 hover:shadow-sm transition-shadow [&_svg]:open:rotate-180">
                  <summary className="flex items-center justify-between cursor-pointer list-none">
                    <span className="font-medium text-base">{f.q}</span>
                    <svg className="h-4 w-4 text-muted-foreground transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </summary>
                  <p className="text-sm text-muted-foreground leading-relaxed mt-3">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-20 px-6 border-t border-border/40 bg-gradient-to-b from-white to-background">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">
              Pronto para parar de gerenciar a pousada na planilha?
            </h2>
            <p className="text-muted-foreground mt-3 max-w-xl mx-auto">
              Crie sua conta agora. Em 5 minutos sua pousada está cadastrada e a primeira reserva entra no sistema.
            </p>
            <Button type="button" size="lg" className="mt-8" onClick={() => setIsSignup(true)}>
              Começar agora — é grátis
            </Button>
          </div>
        </section>

        <footer className="py-8 px-6 border-t border-border/40 bg-white">
          <div className="mx-auto max-w-6xl flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
            <p>Minha Pousada — Sistema de gestão hoteleira</p>
            <p className="text-xs">Construído por Pedro Gomes</p>
          </div>
        </footer>
      </main>
    )
  }

  // ========================================
  // Dashboard (authenticated)
  // ========================================
  return (
    <main className="min-h-screen">
      <DashboardHeader
        user={user}
        pousada={pousada}
        pousadas={userPousadas}
        currentPage={page}
        onPageChange={handlePageChange}
        onLogout={handleLogout}
        onTrocarPousada={trocarPousada}
      />

      <div ref={statsRef} className="mx-auto max-w-7xl px-6 py-6 space-y-6">
        {apiError && (
          <div className="rounded-lg border border-rose-200/80 bg-rose-50/80 px-4 py-3 flex items-center justify-between gap-4">
            <p className="text-sm text-rose-800">{apiError}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { clearError(); carregarDashboard(); carregarReservas(); }}
              className="shrink-0 text-rose-700 border-rose-300 hover:bg-rose-100"
            >
              Tentar novamente
            </Button>
          </div>
        )}

        {message && (
          <div className={cn(
            "rounded-lg border px-4 py-3 text-sm",
            message.type === "success" ? "border-emerald-200/80 bg-emerald-50/80 text-emerald-800" : "border-rose-200/80 bg-rose-50/80 text-rose-800"
          )}>
            {message.text}
          </div>
        )}

        {user && user.email_verified === false && (
          <div className="rounded-lg border border-amber-200/80 bg-amber-50/80 px-4 py-3 flex items-center justify-between gap-4">
            <p className="text-sm text-amber-800">
              Seu email ainda nao foi verificado.
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled={verificationSent}
              className="border-amber-300 text-amber-800 hover:bg-amber-100 shrink-0"
              onClick={async () => {
                if (user.email) {
                  await sendEmailVerification(user.email)
                  setVerificationSent(true)
                  setMessage({ type: "success", text: "Email de verificacao reenviado!" })
                }
              }}
            >
              {verificationSent ? "Enviado!" : "Reenviar"}
            </Button>
          </div>
        )}

        {/* Dashboard */}
        {page === "dashboard" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Dashboard</h2>
              {pousada && (
                <p className="text-sm text-muted-foreground mt-0.5">
                  {pousada.cidade && pousada.estado ? `${pousada.cidade} - ${pousada.estado}` : ""}
                  {pousada.telefone ? ` | ${pousada.telefone}` : ""}
                </p>
              )}
            </div>

            <StatsGrid
              reservasAtivas={reservasAtivas}
              quartosDisponiveis={quartosDisponiveis}
              totalQuartos={TOTAL_QUARTOS}
              reservasHoje={reservasHoje}
            />

            <ProximasReservasTable
              reservas={proximasReservas}
              onViewAll={() => setPage("reservas")}
            />
          </div>
        )}

        {/* Reservas */}
        {page === "reservas" && (
          <div className="space-y-5">
            <h2 className="text-2xl font-semibold tracking-tight">Todas as Reservas</h2>

            <ReservationFilters
              filters={filters}
              onFiltersChange={setFilters}
              onApply={() => carregarReservas(1)}
              onExport={exportarCsv}
              onClear={clearFilters}
              total={meta.total}
              loading={reservasLoading}
              exporting={exporting}
            />

            <ReservationTable
              reservas={reservas}
              meta={meta}
              onPageChange={carregarReservas}
              onEdit={handleEditReserva}
              onDelete={handleConfirmDelete}
              loading={reservasLoading}
              userRole={user?.role}
            />
          </div>
        )}

        {/* Nova Reserva */}
        {page === "nova-reserva" && (
          <ReservationForm
            initialData={formData}
            isEditing={formId !== null}
            totalQuartos={TOTAL_QUARTOS}
            auditLogs={auditLogs}
            onSubmit={handleSaveReserva}
            onCancel={() => {
              setPage("reservas")
              setFormData(null)
              setFormId(null)
            }}
            loading={formLoading}
          />
        )}

        {/* Configuracoes */}
        {page === "configuracoes" && pousada && (
          <div className="space-y-5">
            <h2 className="text-2xl font-semibold tracking-tight">Configuracoes</h2>

            <div className="grid gap-5 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Informacoes Gerais</CardTitle>
                  <CardDescription>Dados da pousada</CardDescription>
                </CardHeader>
                <CardContent>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                    <dt className="text-muted-foreground">Nome</dt>
                    <dd className="font-medium truncate">{pousada.nome}</dd>
                    <dt className="text-muted-foreground">Quartos</dt>
                    <dd className="font-medium">{pousada.num_quartos}</dd>
                    <dt className="text-muted-foreground">Email</dt>
                    <dd className="font-medium truncate">{pousada.email || "-"}</dd>
                    <dt className="text-muted-foreground">Telefone</dt>
                    <dd className="font-medium">{pousada.telefone || "-"}</dd>
                  </dl>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Endereco</CardTitle>
                  <CardDescription>Localizacao</CardDescription>
                </CardHeader>
                <CardContent>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                    <dt className="text-muted-foreground">Endereco</dt>
                    <dd className="font-medium truncate">{pousada.endereco || "-"}</dd>
                    <dt className="text-muted-foreground">Cidade</dt>
                    <dd className="font-medium truncate">{pousada.cidade || "-"}</dd>
                    <dt className="text-muted-foreground">Estado</dt>
                    <dd className="font-medium">{pousada.estado || "-"}</dd>
                  </dl>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Equipe</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border border-border/60">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold">
                    {user?.nome?.charAt(0).toUpperCase() || "U"}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{user?.nome}</p>
                    <p className="text-xs text-muted-foreground">Owner</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Seguranca</CardTitle>
                <CardDescription>Alterar sua senha</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {pwMessage && (
                  <div className={cn(
                    "rounded-lg border px-3 py-2 text-sm",
                    pwMessage.type === "success" ? "border-emerald-200/80 bg-emerald-50/80 text-emerald-800" : "border-rose-200/80 bg-rose-50/80 text-rose-800"
                  )}>
                    {pwMessage.text}
                  </div>
                )}
                <form
                  onSubmit={async (e: React.FormEvent) => {
                    e.preventDefault()
                    setPwMessage(null)
                    if (pwNew.length < 8) {
                      setPwMessage({ type: "error", text: "A nova senha deve ter pelo menos 8 caracteres." })
                      return
                    }
                    if (pwNew !== pwConfirm) {
                      setPwMessage({ type: "error", text: "As senhas nao coincidem." })
                      return
                    }
                    setPwLoading(true)
                    try {
                      const result = await changePassword(pwCurrent, pwNew)
                      if ((result as any)?.error) {
                        setPwMessage({ type: "error", text: (result as any).error.message || "Senha atual incorreta." })
                      } else {
                        setPwMessage({ type: "success", text: "Senha alterada com sucesso!" })
                        setPwCurrent("")
                        setPwNew("")
                        setPwConfirm("")
                      }
                    } catch (err: any) {
                      setPwMessage({ type: "error", text: err.message || "Erro ao alterar senha." })
                    } finally {
                      setPwLoading(false)
                    }
                  }}
                  className="space-y-2 max-w-sm"
                >
                  <input
                    type="password"
                    placeholder="Senha atual"
                    value={pwCurrent}
                    onChange={(e) => setPwCurrent(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                  />
                  <input
                    type="password"
                    placeholder="Nova senha"
                    value={pwNew}
                    onChange={(e) => setPwNew(e.target.value)}
                    required
                    autoComplete="new-password"
                    className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                  />
                  <input
                    type="password"
                    placeholder="Confirmar nova senha"
                    value={pwConfirm}
                    onChange={(e) => setPwConfirm(e.target.value)}
                    required
                    autoComplete="new-password"
                    className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                  />
                  <Button type="submit" disabled={pwLoading} className="w-full">
                    {pwLoading ? "Alterando..." : "Alterar Senha"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {(user?.is_owner || user?.role === "admin") && (
              <Card>
                <CardHeader>
                  <CardTitle>Convidar Equipe</CardTitle>
                  <CardDescription>Envie convites por email</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {convitesMessage && (
                    <div className={cn(
                      "rounded-lg border px-3 py-2 text-sm",
                      convitesMessage.type === "success" ? "border-emerald-200/80 bg-emerald-50/80 text-emerald-800" : "border-rose-200/80 bg-rose-50/80 text-rose-800"
                    )}>
                      {convitesMessage.text}
                    </div>
                  )}

                  <form
                    onSubmit={async (e: React.FormEvent) => {
                      e.preventDefault()
                      if (!pousada) return
                      const success = await enviarConvite(pousada.id, inviteEmail, inviteRole)
                      if (success) {
                        setInviteEmail("")
                        setInviteRole("recepcao")
                      }
                    }}
                    className="flex flex-col sm:flex-row gap-2"
                  >
                    <input
                      type="email"
                      placeholder="email@exemplo.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      required
                      autoComplete="email"
                      className="flex-1 rounded-lg border border-border bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                    />
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
                      className="rounded-lg border border-border bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                    >
                      <option value="recepcao">Recepcionista</option>
                      <option value="admin">Administrador</option>
                      <option value="auditoria">Auditor</option>
                      <option value="operacao">Operacional</option>
                    </select>
                    <Button type="submit" disabled={convitesLoading}>
                      {convitesLoading ? "Enviando..." : "Enviar"}
                    </Button>
                  </form>

                  <div className="space-y-2 pt-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Convites enviados</p>
                    {!convitesLoading && convites.length === 0 && (
                      <p className="text-sm text-muted-foreground py-3">Nenhum convite enviado ainda.</p>
                    )}
                    {convites.map((c) => (
                      <div key={c.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border border-border/50">
                        <div>
                          <p className="text-sm font-medium">{c.email}</p>
                          <p className="text-xs text-muted-foreground">
                            {c.role === "admin" ? "Administrador" : c.role === "recepcao" ? "Recepcionista" : c.role === "auditoria" ? "Auditor" : "Operacional"}
                            {" - "}
                            <span className={cn(
                              "font-medium",
                              c.status === "pending" ? "text-amber-600" : c.status === "accepted" ? "text-emerald-600" : "text-rose-600"
                            )}>
                              {c.status === "pending" ? "Pendente" : c.status === "accepted" ? "Aceito" : c.status === "expired" ? "Expirado" : "Revogado"}
                            </span>
                          </p>
                        </div>
                        {c.status === "pending" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => pousada && revogarConvite(pousada.id, c.id)}
                            className="text-rose-600 hover:text-rose-700 text-xs"
                          >
                            Revogar
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        message="Tem certeza que deseja excluir esta reserva?"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleDeleteReserva}
      />
    </main>
  )
}

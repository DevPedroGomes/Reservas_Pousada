"use client"

import { useEffect, useMemo, useState, useRef, useCallback } from "react"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { Badge } from "../components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import { Button } from "../components/ui/button"
import { ConfirmDialog } from "../components/confirm-dialog"
import { cn } from "../lib/utils"

// Auth and Reservations
import { useAuth } from "../hooks/useAuth"
import { useReservations } from "../hooks/useReservations"

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
  // Auth hook
  const {
    isAuthenticated,
    user,
    pousada,
    loading: loginLoading,
    authLoading,
    signupLoading,
    googleLoading,
    message,
    login,
    signup,
    logout,
    googleLogin,
    setMessage,
  } = useAuth()

  // Reservations hook
  const {
    reservas,
    dashReservas,
    filters,
    meta,
    loading: reservasLoading,
    exporting,
    auditLogs,
    reservasAtivas,
    reservasHoje,
    setFilters,
    clearFilters,
    carregarReservas,
    carregarDashboard,
    exportarCsv,
    editarReserva,
    salvarReserva,
    excluirReserva,
    carregarAuditoria,
    setPage: setReservasPage,
  } = useReservations(isAuthenticated)

  // Local state
  const [page, setPage] = useState<PageType>("dashboard")
  const [isSignup, setIsSignup] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [reservaToDelete, setReservaToDelete] = useState<number | null>(null)
  const [formData, setFormData] = useState<Reserva | null>(null)
  const [formId, setFormId] = useState<number | null>(null)
  const [formLoading, setFormLoading] = useState(false)

  // Refs for GSAP animations
  const heroRef = useRef<HTMLDivElement>(null)
  const statsRef = useRef<HTMLDivElement>(null)
  const authFormRef = useRef<HTMLDivElement>(null)

  const TOTAL_QUARTOS = pousada?.num_quartos || 25
  const quartosDisponiveis = TOTAL_QUARTOS - reservasAtivas

  // Computed values
  const proximasReservas = useMemo(
    () =>
      dashReservas
        .filter((r) => r.status === "ativa")
        .sort((a, b) => new Date(a.data_entrada).getTime() - new Date(b.data_entrada).getTime())
        .slice(0, 5),
    [dashReservas]
  )

  // Load data when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      carregarDashboard()
      carregarReservas()
    }
  }, [isAuthenticated, carregarDashboard, carregarReservas])

  // GSAP Animations for Landing Page
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

  // Animation for auth form toggle
  useEffect(() => {
    if (!isAuthenticated && authFormRef.current) {
      gsap.fromTo(
        authFormRef.current,
        { opacity: 0, scale: 0.95, y: 20 },
        { opacity: 1, scale: 1, y: 0, duration: 0.5, ease: "power3.out" }
      )
    }
  }, [isSignup, isAuthenticated])

  // GSAP Animations for Dashboard
  useEffect(() => {
    if (isAuthenticated && page === "dashboard" && statsRef.current) {
      const ctx = gsap.context(() => {
        gsap.from(".stat-card", { opacity: 0, y: 30, duration: 0.6, stagger: 0.1, ease: "power3.out" })
        gsap.from(".dashboard-table", { opacity: 0, y: 30, duration: 0.8, delay: 0.3, ease: "power3.out" })
      }, statsRef)
      return () => ctx.revert()
    }
  }, [isAuthenticated, page, reservasAtivas])

  // Page change handlers
  const handlePageChange = useCallback((newPage: PageType) => {
    setPage(newPage)
    if (newPage === "dashboard") carregarDashboard()
    if (newPage === "reservas") carregarReservas()
    if (newPage === "nova-reserva") {
      setFormData(null)
      setFormId(null)
    }
  }, [carregarDashboard, carregarReservas])

  // Edit reservation
  const handleEditReserva = useCallback(async (id: number) => {
    const reserva = await editarReserva(id)
    if (reserva) {
      setFormData(reserva)
      setFormId(reserva.id ?? null)
      await carregarAuditoria(id)
      setPage("nova-reserva")
    }
  }, [editarReserva, carregarAuditoria])

  // Save reservation
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

  // Delete reservation
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

  // Auth handlers
  const handleLogin = useCallback(async (username: string, password: string) => {
    await login(username, password)
  }, [login])

  const handleSignup = useCallback(async (nome: string, username: string, password: string) => {
    await signup(nome, username, password)
  }, [signup])

  const handleLogout = useCallback(() => {
    logout()
  }, [logout])

  // Loading state
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    )
  }

  // Landing Page (not logged in)
  if (!isAuthenticated) {
    return (
      <main ref={heroRef} className="min-h-screen bg-background">
        {/* Header */}
        <header className="fixed top-0 left-0 right-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-xl">
          <div className="mx-auto max-w-7xl px-6 py-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
                <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-base font-bold text-primary-foreground shadow-lg">
                  RP
                </div>
              </div>
              <span className="text-xl font-bold tracking-tight">Reservas Pousada</span>
            </div>
            <div className="flex items-center gap-3 relative z-10">
              <Button type="button" variant="ghost" className="text-sm font-medium" onClick={() => setIsSignup(false)}>
                Entrar
              </Button>
              <Button type="button" className="text-sm font-semibold shadow-lg shadow-primary/25" onClick={() => setIsSignup(true)}>
                Comecar gratis
              </Button>
            </div>
          </div>
        </header>

        {/* Hero Section */}
        <section className="pt-24 pb-20 px-6">
          <div className="mx-auto max-w-7xl">
            <div className="grid gap-16 lg:grid-cols-2 lg:gap-20 items-center">
              <div className="space-y-10">
                <div className="space-y-6">
                  <Badge variant="outline" className="hero-badge border-primary/20 bg-primary/5 text-primary px-4 py-1.5 text-sm font-medium">
                    Plataforma completa para hospedagem
                  </Badge>
                  <h1 className="hero-title text-5xl md:text-6xl lg:text-7xl font-bold leading-[1.1] tracking-tight">
                    Gerencie sua pousada de forma{" "}
                    <span className="relative inline-block">
                      <span className="relative z-10 text-primary">simples</span>
                      <span className="absolute bottom-2 left-0 right-0 h-3 bg-primary/20 -rotate-1" />
                    </span>
                  </h1>
                  <p className="hero-description text-xl text-muted-foreground leading-relaxed max-w-xl">
                    Sistema completo para gerenciar reservas, hospedes e quartos da sua pousada.
                  </p>
                </div>
                <div className="hero-buttons flex flex-col sm:flex-row gap-4 relative z-10">
                  <Button type="button" size="lg" className="text-base px-8 shadow-xl shadow-primary/25 h-12" onClick={() => setIsSignup(true)}>
                    Criar conta gratuita
                  </Button>
                  <Button type="button" size="lg" variant="outline" className="text-base px-8 h-12 border-2" onClick={() => setIsSignup(false)}>
                    Ja tenho conta
                  </Button>
                </div>
              </div>

              {/* Auth Card */}
              <div ref={authFormRef} className="flex justify-center lg:justify-start lg:pl-12">
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

        {/* Features Section */}
        <section className="py-20 px-6 bg-muted/30">
          <div className="mx-auto max-w-7xl">
            <div className="text-center mb-16">
              <Badge variant="outline" className="mb-4 border-primary/20 bg-primary/5 text-primary px-4 py-1.5 text-sm font-medium">
                Recursos
              </Badge>
              <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">Tudo que voce precisa</h2>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                Ferramentas completas para gerenciar sua pousada com eficiencia
              </p>
            </div>
            <div className="grid gap-8 md:grid-cols-3">
              {[
                { icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2", title: "Gestao de Reservas", desc: "Controle completo sobre check-ins, check-outs e disponibilidade", color: "primary" },
                { icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z", title: "Cadastro de Hospedes", desc: "Historico completo e organizado de todos os seus clientes", color: "teal" },
                { icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z", title: "Relatorios e Analises", desc: "Metricas importantes e exportacao de dados", color: "amber" },
              ].map((feature) => (
                <Card key={feature.title} className="feature-card border-2 hover:shadow-2xl transition-all duration-300 hover:-translate-y-1">
                  <CardHeader>
                    <div className={cn("h-14 w-14 rounded-2xl flex items-center justify-center mb-3", feature.color === "primary" ? "bg-primary/10" : feature.color === "teal" ? "bg-teal-500/10" : "bg-amber-500/10")}>
                      <svg className={cn("h-7 w-7", feature.color === "primary" ? "text-primary" : feature.color === "teal" ? "text-teal-600" : "text-amber-600")} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={feature.icon} />
                      </svg>
                    </div>
                    <CardTitle className="text-xl">{feature.title}</CardTitle>
                    <CardDescription className="text-base pt-2">{feature.desc}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <footer className="py-12 px-6 border-t border-border">
          <div className="mx-auto max-w-7xl text-center">
            <p className="text-sm text-muted-foreground">2025 Reservas Pousada. Sistema completo de gestao hoteleira.</p>
          </div>
        </footer>
      </main>
    )
  }

  // Dashboard (logged in)
  return (
    <main className="min-h-screen bg-background">
      <DashboardHeader
        user={user}
        pousada={pousada}
        currentPage={page}
        onPageChange={handlePageChange}
        onLogout={handleLogout}
      />

      <div ref={statsRef} className="mx-auto max-w-7xl px-6 py-8 space-y-8">
        {message && (
          <div className={cn(
            "rounded-xl border-2 px-5 py-4 text-sm font-medium shadow-lg",
            message.type === "success" ? "border-teal-200 bg-teal-50 text-teal-900" : "border-rose-200 bg-rose-50 text-rose-900"
          )}>
            {message.text}
          </div>
        )}

        {/* Dashboard Page */}
        {page === "dashboard" && (
          <div className="space-y-8">
            <div className="flex flex-col gap-2">
              <Badge variant="outline" className="w-fit border-primary/20 bg-primary/5 text-primary px-3 py-1 text-xs font-bold uppercase tracking-wider">
                Panorama
              </Badge>
              <h2 className="text-4xl font-bold tracking-tight">Dashboard</h2>
              {pousada && (
                <p className="text-base text-muted-foreground">
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

        {/* Reservas Page */}
        {page === "reservas" && (
          <div className="space-y-6">
            <div className="flex flex-col gap-2">
              <Badge variant="outline" className="w-fit border-primary/20 bg-primary/5 text-primary px-3 py-1 text-xs font-bold uppercase tracking-wider">
                Gestao
              </Badge>
              <h2 className="text-4xl font-bold tracking-tight">Todas as Reservas</h2>
            </div>

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
            />
          </div>
        )}

        {/* Nova Reserva Page */}
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

        {/* Configuracoes Page */}
        {page === "configuracoes" && pousada && (
          <div className="space-y-6">
            <div className="flex flex-col gap-2">
              <Badge variant="outline" className="w-fit border-primary/20 bg-primary/5 text-primary px-3 py-1 text-xs font-bold uppercase tracking-wider">
                Configuracoes
              </Badge>
              <h2 className="text-4xl font-bold tracking-tight">Dados da Pousada</h2>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <Card className="border-2 shadow-xl">
                <CardHeader>
                  <CardTitle className="text-xl font-bold">Informacoes Gerais</CardTitle>
                  <CardDescription className="text-base">Dados basicos da sua pousada</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <span className="text-muted-foreground font-medium">Nome:</span>
                    <span className="text-foreground font-bold truncate">{pousada.nome}</span>
                    <span className="text-muted-foreground font-medium">Quartos:</span>
                    <span className="text-foreground font-bold truncate">{pousada.num_quartos}</span>
                    <span className="text-muted-foreground font-medium">Email:</span>
                    <span className="text-foreground font-bold truncate">{pousada.email || "-"}</span>
                    <span className="text-muted-foreground font-medium">Telefone:</span>
                    <span className="text-foreground font-bold truncate">{pousada.telefone || "-"}</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-2 shadow-xl">
                <CardHeader>
                  <CardTitle className="text-xl font-bold">Endereco</CardTitle>
                  <CardDescription className="text-base">Localizacao da pousada</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <span className="text-muted-foreground font-medium">Endereco:</span>
                    <span className="text-foreground font-bold truncate">{pousada.endereco || "-"}</span>
                    <span className="text-muted-foreground font-medium">Cidade:</span>
                    <span className="text-foreground font-bold truncate">{pousada.cidade || "-"}</span>
                    <span className="text-muted-foreground font-medium">Estado:</span>
                    <span className="text-foreground font-bold truncate">{pousada.estado || "-"}</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="border-2 shadow-xl">
              <CardHeader>
                <CardTitle className="text-xl font-bold">Usuarios</CardTitle>
                <CardDescription className="text-base">Equipe com acesso ao sistema</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/50 border-2 border-border">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-lg">
                    {user?.nome?.charAt(0).toUpperCase() || "U"}
                  </div>
                  <div>
                    <p className="font-bold text-foreground text-lg">{user?.nome}</p>
                    <p className="text-sm text-muted-foreground font-medium">Owner (voce)</p>
                  </div>
                </div>
                <p className="mt-4 text-sm text-muted-foreground">
                  Em breve: Adicione membros da equipe para gerenciar reservas.
                </p>
              </CardContent>
            </Card>
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

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
import { sendEmailVerification } from "../lib/auth-client"

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
    message,
    login,
    signup,
    logout,
    googleLogin,
    trocarPousada,
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

  useEffect(() => {
    if (isAuthenticated) {
      carregarDashboard()
      carregarReservas()
    }
  }, [isAuthenticated, carregarDashboard, carregarReservas])

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

  // Loading state
  if (authLoading) {
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
    return (
      <main ref={heroRef} className="min-h-screen">
        <header className="fixed top-0 left-0 right-0 z-50 border-b border-border/40 bg-white/80 backdrop-blur-md">
          <div className="mx-auto max-w-6xl px-6 h-14 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <img src="/logo.png" alt="Logo" className="h-8 w-8 rounded-lg object-cover" />
              <span className="text-sm font-semibold">Minha Pousada</span>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setIsSignup(false)}>
                Entrar
              </Button>
              <Button type="button" size="sm" onClick={() => setIsSignup(true)}>
                Comecar gratis
              </Button>
            </div>
          </div>
        </header>

        <section className="pt-24 pb-16 px-6">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-12 lg:grid-cols-2 lg:gap-16 items-center">
              <div className="space-y-8">
                <div className="space-y-4">
                  <Badge className="hero-badge">Gestao de hospedagem</Badge>
                  <h1 className="hero-title text-4xl md:text-5xl font-bold leading-[1.15] tracking-tight">
                    Gerencie sua pousada de forma{" "}
                    <span className="text-primary">simples</span>
                  </h1>
                  <p className="hero-description text-lg text-muted-foreground leading-relaxed max-w-md">
                    Sistema completo para gerenciar reservas, hospedes e quartos da sua pousada.
                  </p>
                </div>
                <div className="hero-buttons flex gap-3">
                  <Button type="button" size="lg" onClick={() => setIsSignup(true)}>
                    Criar conta gratuita
                  </Button>
                  <Button type="button" size="lg" variant="outline" onClick={() => setIsSignup(false)}>
                    Ja tenho conta
                  </Button>
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

        <section className="py-16 px-6 border-t border-border/40">
          <div className="mx-auto max-w-6xl">
            <div className="text-center mb-12">
              <h2 className="text-2xl font-semibold tracking-tight mb-2">Tudo que voce precisa</h2>
              <p className="text-muted-foreground">Ferramentas completas para gerenciar sua pousada</p>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              {[
                { icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2", title: "Gestao de Reservas", desc: "Check-ins, check-outs e disponibilidade" },
                { icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z", title: "Cadastro de Hospedes", desc: "Historico organizado de todos os clientes" },
                { icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z", title: "Relatorios", desc: "Metricas e exportacao de dados" },
              ].map((feature) => (
                <Card key={feature.title} className="feature-card hover:shadow-md transition-shadow">
                  <CardHeader>
                    <div className="h-10 w-10 rounded-lg bg-primary/8 flex items-center justify-center mb-2">
                      <svg className="h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={feature.icon} />
                      </svg>
                    </div>
                    <CardTitle>{feature.title}</CardTitle>
                    <CardDescription className="pt-1">{feature.desc}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <footer className="py-8 px-6 border-t border-border/40">
          <div className="mx-auto max-w-6xl text-center">
            <p className="text-xs text-muted-foreground">Minha Pousada - Sistema de gestao hoteleira</p>
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

                  {convites.length > 0 && (
                    <div className="space-y-2 pt-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Convites enviados</p>
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
                  )}
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

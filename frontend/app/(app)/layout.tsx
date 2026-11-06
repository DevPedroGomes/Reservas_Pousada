"use client"

import { useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { ProvedorApp, useApp } from "../../components/app/ContextoApp"
import { DashboardHeader } from "../../components/dashboard/DashboardHeader"
import { AvisoAssinatura } from "../../components/billing/AvisoAssinatura"
import { Button } from "../../components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card"
import { cn } from "../../lib/utils"

function Carregando() {
  return (
    <div className="mx-auto max-w-[88rem] space-y-6 px-4 pt-6 sm:px-6" role="status" aria-label="Carregando">
      <div className="h-14 animate-pulse rounded-full bg-muted" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse rounded-nucleo bg-muted" />)}
      </div>
      <div className="h-72 animate-pulse rounded-nucleo bg-muted" />
    </div>
  )
}

function Moldura({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { auth, assinatura } = useApp()
  const { isAuthenticated, authLoading, pousada, pousadaLoading, user, pousadas, logout, trocarPousada, message, setMessage } = auth

  // Guardas da área logada: sem sessão vai para o login (e volta para onde
  // estava); com sessão e sem pousada, para o onboarding.
  useEffect(() => {
    if (authLoading) return
    if (!isAuthenticated) {
      router.replace(`/entrar?proximo=${encodeURIComponent(pathname)}`)
    } else if (!pousadaLoading && !pousada) {
      router.replace("/onboarding")
    }
  }, [authLoading, isAuthenticated, pousadaLoading, pousada, pathname, router])

  useEffect(() => {
    if (!message) return
    const t = setTimeout(() => setMessage(null), 5000)
    return () => clearTimeout(t)
  }, [message, setMessage])

  if (authLoading || !isAuthenticated || pousadaLoading || !pousada) return <Carregando />

  // Bloqueio por assinatura vale para a OPERAÇÃO. Configurações continuam
  // abertas: quem está bloqueado precisa conseguir ver e ajustar a conta.
  const bloqueado = assinatura.billingHabilitado && assinatura.situacao?.liberado === false
  const telaLivre = pathname.startsWith("/configuracoes")

  return (
    <main className="min-h-screen">
      <DashboardHeader
        user={user}
        pousada={pousada}
        pousadas={pousadas}
        onLogout={logout}
        onTrocarPousada={trocarPousada}
      />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 space-y-6">
        <AvisoAssinatura situacao={assinatura.situacao} billingHabilitado={assinatura.billingHabilitado} />

        {message && (
          <div className={cn(
            "rounded-lg border px-4 py-3 text-sm",
            message.type === "success" ? "border-success/30 bg-success/10 text-success" : "border-destructive/30 bg-destructive/10 text-destructive",
          )}>
            {message.text}
          </div>
        )}

        {bloqueado && !telaLivre ? (
          <Card>
            <CardHeader>
              <CardTitle>Acesso pausado</CardTitle>
              <CardDescription>
                Seus dados continuam salvos e intactos. Assim que a assinatura estiver em dia,
                tudo volta exatamente como estava.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/assinatura"><Button>Ver planos</Button></Link>
            </CardContent>
          </Card>
        ) : (
          children
        )}
      </div>
    </main>
  )
}

export default function LayoutApp({ children }: { children: React.ReactNode }) {
  return (
    <ProvedorApp>
      <Moldura>{children}</Moldura>
    </ProvedorApp>
  )
}

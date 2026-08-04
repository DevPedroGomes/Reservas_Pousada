"use client"

import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "../../components/ui/button"
import { Badge } from "../../components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card"
import { cn } from "../../lib/utils"
import { useAuth } from "../../hooks/useAuth"
import { formatarPreco, useAssinatura } from "../../hooks/useAssinatura"
import { formatarData } from "../../lib/formatters"
import type { SituacaoAssinatura } from "../../lib/types"

/**
 * `useSearchParams` obriga a ter Suspense no App Router — sem ele o
 * `next build` falha na prerenderizacao. O tsc nao pega isso; so o build.
 */
export default function AssinaturaPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      }
    >
      <ConteudoAssinatura />
    </Suspense>
  )
}

function ConteudoAssinatura() {
  const router = useRouter()
  const params = useSearchParams()
  const { isAuthenticated, authLoading, user, pousada } = useAuth()
  const a = useAssinatura(isAuthenticated, pousada?.id)

  const voltandoDoStripe = params.get("status") === "sucesso"
  const [confirmando, setConfirmando] = useState(voltandoDoStripe)

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push("/")
  }, [authLoading, isAuthenticated, router])

  /**
   * O Stripe devolve o usuário na hora, mas quem grava o estado é o webhook —
   * que pode chegar um instante depois. Sem esta espera, quem acabou de pagar
   * veria "escolha um plano" e pagaria de novo.
   */
  useEffect(() => {
    if (!confirmando || !isAuthenticated) return
    let tentativas = 0
    const t = setInterval(async () => {
      tentativas += 1
      await a.recarregar()
      if (tentativas >= 8) {
        setConfirmando(false)
        clearInterval(t)
      }
    }, 1500)
    return () => clearInterval(t)
  }, [confirmando, isAuthenticated, a])

  useEffect(() => {
    if (confirmando && a.situacao?.status === "ativa") setConfirmando(false)
  }, [confirmando, a.situacao?.status])

  if (authLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  const ehDono = Boolean(user?.is_owner)
  const temAssinatura = Boolean(a.situacao && a.situacao.status !== "trial")

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border/50 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 h-14">
          <Link href="/" className="flex items-center gap-2.5">
            <img src="/logo.png" alt="" className="h-8 w-8 rounded-lg object-cover" />
            <span className="text-sm font-semibold">Diária</span>
          </Link>
          <Link href="/">
            <Button variant="ghost" size="sm">Voltar ao painel</Button>
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-8 space-y-6">
        {confirmando && (
          <div className="rounded-lg border border-sky-200/80 bg-sky-50/80 px-4 py-3 flex items-center gap-3">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-sky-600 border-t-transparent" />
            <p className="text-sm text-sky-800">Confirmando seu pagamento com o Stripe...</p>
          </div>
        )}

        {params.get("status") === "cancelado" && (
          <div className="rounded-lg border border-border bg-muted/40 px-4 py-3">
            <p className="text-sm text-muted-foreground">
              Pagamento não concluído. Nada foi cobrado — você pode escolher um plano quando quiser.
            </p>
          </div>
        )}

        {a.erro && (
          <div className="rounded-lg border border-rose-200/80 bg-rose-50/80 px-4 py-3">
            <p className="text-sm text-rose-800">{a.erro}</p>
          </div>
        )}

        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Assinatura</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {pousada?.nome ? `Plano da ${pousada.nome}` : "Plano da sua pousada"}
          </p>
        </div>

        {!a.billingHabilitado ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cobrança ainda não está ativa</CardTitle>
              <CardDescription>
                O sistema está liberado sem limites enquanto a cobrança não é ligada.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <>
            <CartaoSituacao situacao={a.situacao} />

            {temAssinatura && ehDono && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Gerenciar assinatura</CardTitle>
                  <CardDescription>
                    Trocar cartão, ver faturas ou cancelar — no ambiente seguro do Stripe.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" onClick={a.abrirPortal} disabled={a.redirecionando}>
                    {a.redirecionando ? "Abrindo..." : "Abrir portal de assinatura"}
                  </Button>
                </CardContent>
              </Card>
            )}

            {a.planos.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <h2 className="text-lg font-semibold">
                    {temAssinatura ? "Trocar de plano" : "Escolha seu plano"}
                  </h2>
                  <div className="inline-flex rounded-lg border border-border bg-white p-0.5">
                    {(["mensal", "anual"] as const).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => a.setCiclo(c)}
                        className={cn(
                          "rounded-md px-3 py-1.5 text-sm transition-colors",
                          a.ciclo === c ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {c === "mensal" ? "Mensal" : "Anual"}
                        {c === "anual" && <span className="ml-1.5 text-xs opacity-90">2 meses grátis</span>}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  {a.planos.map((p) => {
                    const atual = a.situacao?.plano === p.codigo
                    return (
                      <Card key={p.codigo} className={cn(atual && "border-primary ring-1 ring-primary/20")}>
                        <CardHeader>
                          <div className="flex items-center justify-between gap-2">
                            <CardTitle className="text-base">{p.nome}</CardTitle>
                            {atual && <Badge>Plano atual</Badge>}
                          </div>
                          <div className="pt-1">
                            <span className="text-2xl font-semibold">{formatarPreco(p.precoCentavos)}</span>
                            <span className="text-sm text-muted-foreground">
                              {a.ciclo === "anual" ? "/ano" : "/mês"}
                            </span>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <ul className="space-y-1.5">
                            {p.destaques.map((d: string) => (
                              <li key={d} className="flex items-start gap-2 text-sm text-muted-foreground">
                                <svg className="h-4 w-4 mt-0.5 shrink-0 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                {d}
                              </li>
                            ))}
                          </ul>
                          {ehDono ? (
                            <Button
                              className="w-full"
                              variant={atual ? "outline" : "default"}
                              disabled={atual || a.redirecionando}
                              onClick={() => a.assinar(p.codigo)}
                            >
                              {atual ? "Plano atual" : a.redirecionando ? "Aguarde..." : "Assinar"}
                            </Button>
                          ) : (
                            <p className="text-xs text-muted-foreground text-center">
                              Somente o proprietário pode contratar.
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              </div>
            )}

            {a.billingHabilitado && a.planos.length === 0 && !a.carregando && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Nenhum plano disponível no momento</CardTitle>
                  <CardDescription>Tente novamente em instantes ou fale com o suporte.</CardDescription>
                </CardHeader>
              </Card>
            )}
          </>
        )}
      </div>
    </main>
  )
}

function CartaoSituacao({ situacao }: { situacao: SituacaoAssinatura | null }) {
  if (!situacao) return null

  const rotulo: Record<string, string> = {
    trial: "Teste grátis",
    ativa: "Ativa",
    inadimplente: "Pagamento pendente",
    suspensa: "Suspensa",
    cancelada: "Cancelada",
    cortesia: "Cortesia",
  }

  const dias = situacao.diasRestantes ?? 0

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2.5">
          <CardTitle className="text-base">{situacao.planoNome ?? rotulo[situacao.status]}</CardTitle>
          <Badge variant={situacao.liberado ? "default" : "destructive"}>
            {rotulo[situacao.status] ?? situacao.status}
          </Badge>
        </div>
        <CardDescription>
          {situacao.status === "trial" && situacao.liberado &&
            `Restam ${dias} ${dias === 1 ? "dia" : "dias"} de teste${situacao.trialTerminaEm ? ` — até ${formatarData(situacao.trialTerminaEm)}` : ""}.`}
          {situacao.status === "ativa" && situacao.periodoTerminaEm &&
            `Próxima renovação em ${formatarData(situacao.periodoTerminaEm)}.`}
          {situacao.status === "inadimplente" &&
            `Não conseguimos confirmar o pagamento. Você tem ${dias} ${dias === 1 ? "dia" : "dias"} para regularizar antes do bloqueio.`}
          {situacao.status === "cancelada" && situacao.liberado &&
            `Cancelada, mas seu acesso continua até ${situacao.periodoTerminaEm ? formatarData(situacao.periodoTerminaEm) : "o fim do período pago"}.`}
          {!situacao.liberado && situacao.status !== "inadimplente" &&
            "O acesso está bloqueado. Escolha um plano abaixo para voltar a usar."}
          {situacao.status === "cortesia" && "Conta cortesia — sem cobrança e sem limites."}
        </CardDescription>
      </CardHeader>
    </Card>
  )
}

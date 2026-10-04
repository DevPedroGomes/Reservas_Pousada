"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { AuthCard } from "./AuthCard"
import { useAuth } from "../../hooks/useAuth"
import { API_URL } from "../../lib/api"

/** Destino depois do login: convite pendente, a página que pediu login, ou o painel. */
function destino(params: URLSearchParams): string {
  const convite = params.get("convite")
  if (convite) return `/convite/${encodeURIComponent(convite)}`
  const proximo = params.get("proximo")
  // Só caminho interno: "//dominio" ou URL absoluta viraria redirecionamento aberto.
  if (proximo && proximo.startsWith("/") && !proximo.startsWith("//")) return proximo
  return "/painel"
}

/** Código de erro que o retorno do Google traz em ?error= (better-auth) → texto para a pessoa. */
function erroDoGoogle(codigo: string | null): string | null {
  if (!codigo) return null
  if (codigo === "access_denied") return "Login com o Google cancelado."
  if (codigo === "email_not_verified" || codigo === "email_not_found") return "O Google não confirmou o e-mail desta conta. Use outra conta ou entre com e-mail e senha."
  if (codigo === "unable_to_link_account" || codigo === "account_already_linked_to_different_user") {
    return "Este e-mail já tem uma conta. Entre com e-mail e senha."
  }
  return "Não foi possível concluir o login. Tente de novo."
}

export function TelaDeAcesso({ modo }: { modo: "entrar" | "cadastro" }) {
  const router = useRouter()
  const params = useSearchParams()
  const { isAuthenticated, authLoading, login, signup, googleLogin, message, loading, signupLoading, googleLoading } = useAuth()
  // O botão só aparece se o servidor tem o Google configurado (antes aparecia
  // sempre e falhava no meio do caminho).
  const [googleDisponivel, setGoogleDisponivel] = useState(false)

  useEffect(() => {
    if (!authLoading && isAuthenticated) router.replace(destino(new URLSearchParams(params.toString())))
  }, [authLoading, isAuthenticated, params, router])

  useEffect(() => {
    fetch(`${API_URL}/config`).then((r) => r.json()).then((d) => setGoogleDisponivel(Boolean(d?.google))).catch(() => {})
  }, [])

  // Sem o ?error= ao trocar de tela ou tentar de novo.
  const limpos = new URLSearchParams(params.toString())
  limpos.delete("error")
  limpos.delete("error_description")
  const query = limpos.toString() ? `?${limpos.toString()}` : ""
  const erroGoogle = erroDoGoogle(params.get("error"))

  function entrarComGoogle() {
    const ir = destino(limpos)
    return googleLogin({
      destino: ir,
      // Convidado que se cadastra pelo Google vai direto aceitar o convite, não criar pousada.
      destinoNovo: limpos.get("convite") ? ir : "/onboarding",
      retornoErro: `/${modo}${query}`,
    })
  }

  return (
    <main className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-10">
      <Link href="/" className="mb-6 flex items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="" className="h-9 w-9 rounded-lg object-cover" />
        <span className="text-lg font-semibold">Diária</span>
      </Link>

      {params.get("convite") && (
        <p className="mb-4 max-w-md text-center text-sm text-muted-foreground">
          {modo === "cadastro"
            ? "Crie sua conta com o e-mail que recebeu o convite para entrar na equipe."
            : "Entre com o e-mail que recebeu o convite para entrar na equipe."}
        </p>
      )}

      <AuthCard
        isSignup={modo === "cadastro"}
        onToggleMode={() => router.push(`${modo === "cadastro" ? "/entrar" : "/cadastro"}${query}`)}
        onLogin={async (email, senha) => { await login(email, senha) }}
        onSignup={async (nome, email, senha) => { await signup(nome, email, senha) }}
        onGoogleLogin={entrarComGoogle}
        loading={{ signup: signupLoading, google: googleLoading, login: loading }}
        message={message ?? (erroGoogle ? { type: "error", text: erroGoogle } : null)}
        mostrarGoogle={googleDisponivel}
      />

      <div className="mt-6 flex flex-col items-center gap-2 text-sm text-muted-foreground">
        {modo === "entrar" && <Link href="/forgot-password" className="hover:text-primary">Esqueci minha senha</Link>}
        <p className="text-xs">
          Ao continuar você concorda com os <Link href="/termos" className="underline">Termos de uso</Link> e a{" "}
          <Link href="/privacidade" className="underline">Política de privacidade</Link>.
        </p>
      </div>
    </main>
  )
}

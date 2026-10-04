"use client"

import { useEffect } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { AuthCard } from "./AuthCard"
import { useAuth } from "../../hooks/useAuth"

/** Destino depois do login: convite pendente, a página que pediu login, ou o painel. */
function destino(params: URLSearchParams): string {
  const convite = params.get("convite")
  if (convite) return `/convite/${encodeURIComponent(convite)}`
  const proximo = params.get("proximo")
  // Só caminho interno: "//dominio" ou URL absoluta viraria redirecionamento aberto.
  if (proximo && proximo.startsWith("/") && !proximo.startsWith("//")) return proximo
  return "/painel"
}

export function TelaDeAcesso({ modo }: { modo: "entrar" | "cadastro" }) {
  const router = useRouter()
  const params = useSearchParams()
  const { isAuthenticated, authLoading, login, signup, googleLogin, message, loading, signupLoading, googleLoading } = useAuth()

  useEffect(() => {
    if (!authLoading && isAuthenticated) router.replace(destino(new URLSearchParams(params.toString())))
  }, [authLoading, isAuthenticated, params, router])

  const query = params.toString() ? `?${params.toString()}` : ""

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
        onGoogleLogin={googleLogin}
        loading={{ signup: signupLoading, google: googleLoading, login: loading }}
        message={message}
        mostrarGoogle={process.env.NEXT_PUBLIC_GOOGLE_LOGIN !== "false"}
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

"use client"

import type React from "react"
import { useState } from "react"
import { Button } from "../ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card"
import { Input } from "../ui/input"
import { Label } from "../ui/label"

interface AuthCardProps {
  isSignup: boolean
  onToggleMode: () => void
  onLogin: (username: string, password: string) => Promise<void>
  onSignup: (nome: string, username: string, password: string) => Promise<void>
  onGoogleLogin: () => Promise<void>
  loading: {
    signup: boolean
    google: boolean
    login: boolean
  }
  message: { type: "success" | "error"; text: string } | null
}

export function AuthCard({
  isSignup,
  onToggleMode,
  onLogin,
  onSignup,
  onGoogleLogin,
  loading,
  message,
}: AuthCardProps) {
  const [loginUsername, setLoginUsername] = useState("")
  const [loginPassword, setLoginPassword] = useState("")
  const [signupNome, setSignupNome] = useState("")
  const [signupUsername, setSignupUsername] = useState("")
  const [signupPassword, setSignupPassword] = useState("")

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await onLogin(loginUsername, loginPassword)
  }

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await onSignup(signupNome, signupUsername, signupPassword)
  }

  return (
    <Card className="w-full max-w-md border-2 shadow-xl">
      <CardHeader className="space-y-1 pb-4">
        <CardTitle className="text-2xl font-bold tracking-tight">
          {isSignup ? "Criar Conta" : "Entrar"}
        </CardTitle>
        <CardDescription className="text-base">
          {isSignup
            ? "Crie sua conta para comecar a gerenciar reservas"
            : "Entre com suas credenciais para acessar o sistema"}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {message && (
          <div
            className={`p-3 rounded-lg text-sm font-medium ${
              message.type === "error"
                ? "bg-destructive/10 text-destructive border border-destructive/20"
                : "bg-green-500/10 text-green-600 border border-green-500/20"
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Google Login */}
        <Button
          type="button"
          variant="outline"
          className="w-full h-11 font-semibold border-2 hover:bg-muted/50 transition-colors"
          onClick={onGoogleLogin}
          disabled={loading.google}
        >
          {loading.google ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Conectando...
            </span>
          ) : (
            <span className="flex items-center gap-3">
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Continuar com Google
            </span>
          )}
        </Button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground font-medium">
              ou
            </span>
          </div>
        </div>

        {/* Login Form */}
        {!isSignup && (
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-sm font-semibold">
                Usuario
              </Label>
              <Input
                id="username"
                type="text"
                name="username"
                autoComplete="username"
                placeholder="Digite seu usuario"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                required
                className="h-11 border-2 focus:ring-4 focus:ring-indigo-500/15"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-semibold">
                Senha
              </Label>
              <Input
                id="password"
                type="password"
                name="password"
                autoComplete="current-password"
                placeholder="Digite sua senha"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                required
                className="h-11 border-2 focus:ring-4 focus:ring-indigo-500/15"
              />
            </div>
            <Button
              type="submit"
              className="w-full h-11 font-semibold"
              disabled={loading.login}
            >
              {loading.login ? "Entrando..." : "Entrar"}
            </Button>
          </form>
        )}

        {/* Signup Form */}
        {isSignup && (
          <form onSubmit={handleSignupSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="signup-nome" className="text-sm font-semibold">
                Nome Completo
              </Label>
              <Input
                id="signup-nome"
                type="text"
                name="name"
                autoComplete="name"
                placeholder="Seu nome"
                value={signupNome}
                onChange={(e) => setSignupNome(e.target.value)}
                required
                className="h-11 border-2 focus:ring-4 focus:ring-indigo-500/15"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="signup-username" className="text-sm font-semibold">
                Usuario
              </Label>
              <Input
                id="signup-username"
                type="text"
                name="username"
                autoComplete="username"
                placeholder="Escolha um usuario"
                value={signupUsername}
                onChange={(e) => setSignupUsername(e.target.value)}
                required
                className="h-11 border-2 focus:ring-4 focus:ring-indigo-500/15"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="signup-password" className="text-sm font-semibold">
                Senha
              </Label>
              <Input
                id="signup-password"
                type="password"
                name="new-password"
                autoComplete="new-password"
                placeholder="Crie uma senha"
                value={signupPassword}
                onChange={(e) => setSignupPassword(e.target.value)}
                required
                minLength={6}
                className="h-11 border-2 focus:ring-4 focus:ring-indigo-500/15"
              />
            </div>
            <Button
              type="submit"
              className="w-full h-11 font-semibold"
              disabled={loading.signup}
            >
              {loading.signup ? "Criando conta..." : "Criar Conta"}
            </Button>
          </form>
        )}

        <div className="text-center pt-2">
          <button
            type="button"
            onClick={onToggleMode}
            className="text-sm text-muted-foreground hover:text-primary transition-colors font-medium"
          >
            {isSignup ? "Ja tem uma conta? Entre aqui" : "Nao tem conta? Crie agora"}
          </button>
        </div>
      </CardContent>
    </Card>
  )
}

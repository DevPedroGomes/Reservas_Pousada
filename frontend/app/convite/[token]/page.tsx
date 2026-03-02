"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "../../../lib/auth-client";
import type { InviteInfo } from "../../../lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function ConvitePage() {
  const params = useParams();
  const router = useRouter();
  const { data: session, isPending: sessionLoading } = useSession();
  const token = params.token as string;

  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const roleLabels: Record<string, string> = {
    admin: "Administrador",
    recepcao: "Recepcionista",
    auditoria: "Auditor",
    operacao: "Operacional",
  };

  // Load invite info
  useEffect(() => {
    async function loadInvite() {
      try {
        const response = await fetch(`${API_URL}/api/convites/${token}`);
        const data = await response.json();

        if (data.sucesso) {
          setInviteInfo(data.convite);
        } else {
          setError(data.mensagem || "Convite invalido");
        }
      } catch {
        setError("Erro ao carregar convite");
      } finally {
        setLoading(false);
      }
    }

    if (token) {
      loadInvite();
    }
  }, [token]);

  const handleAccept = async () => {
    try {
      setAccepting(true);
      setError(null);

      const response = await fetch(`${API_URL}/api/convites/${token}/aceitar`, {
        method: "POST",
        credentials: "include",
      });

      const data = await response.json();

      if (data.sucesso) {
        setSuccess(true);
        setTimeout(() => {
          window.location.href = "/";
        }, 2000);
      } else {
        setError(data.mensagem || "Erro ao aceitar convite");
      }
    } catch {
      setError("Erro ao aceitar convite");
    } finally {
      setAccepting(false);
    }
  };

  if (loading || sessionLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground">Carregando convite...</p>
        </div>
      </div>
    );
  }

  if (error && !inviteInfo) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md rounded-2xl border-2 bg-card p-8 text-center shadow-xl">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">Convite invalido</h1>
          <p className="text-muted-foreground mb-6">{error}</p>
          <a href="/" className="inline-block rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors">
            Ir para pagina inicial
          </a>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md rounded-2xl border-2 bg-card p-8 text-center shadow-xl">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">Convite aceito!</h1>
          <p className="text-muted-foreground">Voce agora faz parte da equipe. Redirecionando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border-2 bg-card p-8 shadow-xl">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-lg font-bold text-primary-foreground shadow-lg">
            RP
          </div>
          <h1 className="text-2xl font-bold text-foreground">Convite para equipe</h1>
        </div>

        {/* Invite details */}
        {inviteInfo && (
          <div className="rounded-xl bg-muted/50 border-2 border-border p-5 mb-6 space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground font-medium">Pousada:</span>
              <span className="text-sm font-bold text-foreground">{inviteInfo.pousadaNome}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground font-medium">Funcao:</span>
              <span className="text-sm font-bold text-foreground">
                {roleLabels[inviteInfo.role] || inviteInfo.role}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground font-medium">Email:</span>
              <span className="text-sm font-bold text-foreground">{inviteInfo.email}</span>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl border-2 border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-900 mb-4">
            {error}
          </div>
        )}

        {/* Actions */}
        {session?.user ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground text-center">
              Logado como <strong>{session.user.email}</strong>
            </p>
            <button
              onClick={handleAccept}
              disabled={accepting}
              className="w-full rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {accepting ? "Aceitando..." : "Aceitar Convite"}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground text-center mb-4">
              Para aceitar o convite, voce precisa ter uma conta.
            </p>
            <a
              href={`/?returnTo=/convite/${token}&signup=true`}
              className="block w-full rounded-xl bg-primary px-6 py-3 text-center text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Criar Conta
            </a>
            <a
              href={`/?returnTo=/convite/${token}`}
              className="block w-full rounded-xl border-2 border-border px-6 py-3 text-center text-sm font-semibold text-foreground hover:bg-muted transition-colors"
            >
              Ja tenho conta
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

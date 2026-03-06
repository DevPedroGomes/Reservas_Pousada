'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../../components/ui/card';
import { useSession } from '../../../lib/auth-client';
import type { InviteInfo } from '../../../lib/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

type InviteState = 'loading' | 'valid' | 'expired' | 'used' | 'not_found' | 'error' | 'accepting' | 'accepted';

export default function ConvitePage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const { data: session, isPending: sessionLoading } = useSession();

  const [state, setState] = useState<InviteState>('loading');
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Validate invite token
  useEffect(() => {
    if (!token) return;

    async function validate() {
      try {
        const res = await fetch(`${API_URL}/api/convites/${token}`);
        const data = await res.json();

        if (data.sucesso) {
          setInvite(data.convite);
          setState('valid');
        } else if (res.status === 410) {
          setState(data.mensagem?.includes('expirou') ? 'expired' : 'used');
          setErrorMsg(data.mensagem);
        } else if (res.status === 404) {
          setState('not_found');
        } else {
          setState('error');
          setErrorMsg(data.mensagem || 'Erro ao validar convite');
        }
      } catch {
        setState('error');
        setErrorMsg('Erro de conexao. Tente novamente.');
      }
    }

    validate();
  }, [token]);

  async function handleAccept() {
    if (!session?.user) return;

    setState('accepting');
    setErrorMsg('');
    try {
      const res = await fetch(`${API_URL}/api/convites/${token}/aceitar`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await res.json();

      if (data.sucesso) {
        setState('accepted');
        setTimeout(() => {
          window.location.href = '/';
        }, 1500);
      } else {
        setState('valid');
        setErrorMsg(data.mensagem || 'Erro ao aceitar convite');
      }
    } catch {
      setState('valid');
      setErrorMsg('Erro de conexao. Tente novamente.');
    }
  }

  const roleLabel = (role: string) => {
    const map: Record<string, string> = {
      admin: 'Administrador',
      recepcao: 'Recepcao',
      auditoria: 'Auditoria',
      operacao: 'Operacao',
    };
    return map[role] || role;
  };

  if (sessionLoading || state === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  // Invalid states
  if (state === 'not_found' || state === 'expired' || state === 'used' || state === 'error') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <svg className="h-6 w-6 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <CardTitle>
              {state === 'expired' && 'Convite Expirado'}
              {state === 'used' && 'Convite Utilizado'}
              {state === 'not_found' && 'Convite Nao Encontrado'}
              {state === 'error' && 'Erro'}
            </CardTitle>
            <CardDescription>
              {state === 'expired' && 'Este convite expirou. Peca ao administrador para enviar um novo.'}
              {state === 'used' && 'Este convite ja foi utilizado ou revogado.'}
              {state === 'not_found' && 'O link do convite e invalido ou nao existe.'}
              {state === 'error' && (errorMsg || 'Ocorreu um erro inesperado.')}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button onClick={() => router.push('/')}>Ir para o inicio</Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  // Accepted state
  if (state === 'accepted') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
              <svg className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <CardTitle>Convite Aceito!</CardTitle>
            <CardDescription>
              Voce agora faz parte da equipe de <strong>{invite?.pousadaNome}</strong>. Redirecionando...
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  // Valid invite - show details and action
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-lg font-bold text-primary-foreground">
            {invite?.pousadaNome?.substring(0, 2).toUpperCase()}
          </div>
          <CardTitle>Convite para Equipe</CardTitle>
          <CardDescription>
            Voce foi convidado para fazer parte da equipe da pousada.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-lg bg-muted/50 p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Pousada</span>
              <span className="font-medium">{invite?.pousadaNome}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Funcao</span>
              <span className="font-medium">{roleLabel(invite?.role || '')}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Email</span>
              <span className="font-medium">{invite?.email}</span>
            </div>
            {invite?.expiresAt && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Expira em</span>
                <span className="font-medium">{new Date(invite.expiresAt).toLocaleDateString('pt-BR')}</span>
              </div>
            )}
          </div>

          {errorMsg && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {errorMsg}
            </div>
          )}

          {!session?.user ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground text-center">
                Voce precisa estar autenticado para aceitar o convite.
              </p>
              <Button className="w-full" onClick={() => router.push(`/?convite=${token}`)}>
                Entrar ou Criar Conta
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground text-center">
                Logado como <strong>{session.user.name}</strong> ({session.user.email})
              </p>
              <Button
                className="w-full"
                onClick={handleAccept}
                disabled={state === 'accepting'}
              >
                {state === 'accepting' ? 'Aceitando...' : 'Aceitar Convite'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

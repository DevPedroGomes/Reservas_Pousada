'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { cn } from '../../lib/utils';
import { SimboloPorta } from '../../components/landing/MarcaDiaria';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const callbackURL = searchParams.get('callbackURL');

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Link de verificação inválido.');
      return;
    }

    // Better Auth handles verification server-side via the GET /api/auth/verify-email endpoint
    // This page is shown after the redirect, so we just show success
    setStatus('success');
    setMessage('E-mail verificado com sucesso!');
  }, [token]);

  return (
    <Card className="shadow-lg border-border">
      <CardHeader>
        <CardTitle className="text-2xl font-bold">
          {status === 'loading' && 'Verificando...'}
          {status === 'success' && 'E-mail verificado!'}
          {status === 'error' && 'Erro na verificação'}
        </CardTitle>
        <CardDescription className="text-base">
          {status === 'success' && 'Seu e-mail foi verificado. Você já pode usar todas as funcionalidades.'}
          {status === 'error' && 'Para receber um novo link, entre com seu e-mail e senha.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status === 'success' && (
          <div className={cn('rounded-xl border px-4 py-3 text-sm border-success/30 bg-success/10 text-success')}>
            {message}
          </div>
        )}

        {status === 'error' && (
          <div className={cn('rounded-xl border px-4 py-3 text-sm border-destructive/30 bg-destructive/10 text-destructive')}>
            {message}
          </div>
        )}

        <Link href="/painel">
          <Button className="w-full h-11 font-semibold">
            {status === 'success' ? 'Ir para o painel' : 'Voltar ao início'}
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

export default function VerifyEmailPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-16 flex items-center justify-center">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-4">
          <Link href="/" className="flex items-center justify-center gap-2.5">
            <SimboloPorta className="h-9 w-9" />
            <span className="text-lg font-semibold">Diária</span>
          </Link>
          <Badge variant="outline" className="text-xs">
            Verificação de e-mail
          </Badge>
        </div>

        <Suspense fallback={
          <Card className="shadow-lg border-border">
            <CardContent className="py-12 text-center text-muted-foreground">
              Verificando...
            </CardContent>
          </Card>
        }>
          <VerifyEmailContent />
        </Suspense>
      </div>
    </main>
  );
}

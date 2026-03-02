'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { cn } from '../../lib/utils';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const callbackURL = searchParams.get('callbackURL');

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Link de verificacao invalido.');
      return;
    }

    // Better Auth handles verification server-side via the GET /api/auth/verify-email endpoint
    // This page is shown after the redirect, so we just show success
    setStatus('success');
    setMessage('Email verificado com sucesso!');
  }, [token]);

  return (
    <Card className="shadow-lg border-slate-200/80">
      <CardHeader>
        <CardTitle className="text-2xl font-bold">
          {status === 'loading' && 'Verificando...'}
          {status === 'success' && 'Email verificado!'}
          {status === 'error' && 'Erro na verificacao'}
        </CardTitle>
        <CardDescription className="text-base">
          {status === 'success' && 'Seu email foi verificado com sucesso. Voce ja pode acessar todas as funcionalidades.'}
          {status === 'error' && message}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status === 'success' && (
          <div className={cn('rounded-xl border px-4 py-3 text-sm border-emerald-200 bg-emerald-50 text-emerald-800')}>
            {message}
          </div>
        )}

        {status === 'error' && (
          <div className={cn('rounded-xl border px-4 py-3 text-sm border-rose-200 bg-rose-50 text-rose-700')}>
            {message}
          </div>
        )}

        <a href="/">
          <Button className="w-full h-11 font-semibold">
            {status === 'success' ? 'Ir para o Dashboard' : 'Voltar ao inicio'}
          </Button>
        </a>
      </CardContent>
    </Card>
  );
}

export default function VerifyEmailPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-16 flex items-center justify-center">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-500 text-2xl font-semibold text-white shadow-lg shadow-indigo-500/30">
              RP
            </div>
          </div>
          <Badge variant="outline" className="uppercase tracking-[0.14em] text-[10px]">
            Verificacao de email
          </Badge>
        </div>

        <Suspense fallback={
          <Card className="shadow-lg border-slate-200/80">
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

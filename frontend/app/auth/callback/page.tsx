'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '../../../lib/auth-client';

/**
 * OAuth Callback Page
 * Better Auth handles the OAuth callback automatically.
 * This page just shows a loading state while the auth completes.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [status, setStatus] = useState('Processando autenticacao...');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // If already authenticated, redirect appropriately
    if (!isPending && session?.user) {
      const user = session.user as any;

      setStatus('Login realizado com sucesso! Redirecionando...');

      // Check if user needs onboarding (no pousada associated)
      if (!user.pousadaId) {
        setTimeout(() => router.push('/onboarding'), 1000);
      } else {
        setTimeout(() => router.push('/'), 1000);
      }
    }

    // If session check failed
    if (!isPending && !session) {
      // Give it a moment - Better Auth might still be processing
      const timeout = setTimeout(() => {
        setError('Sessao nao encontrada. Tente fazer login novamente.');
        setTimeout(() => router.push('/'), 3000);
      }, 2000);

      return () => clearTimeout(timeout);
    }
  }, [session, isPending, router]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-indigo-50/50">
      <div className="text-center space-y-4">
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-500 text-2xl font-semibold text-white shadow-lg shadow-indigo-500/30 animate-pulse">
            RP
          </div>
        </div>

        {error ? (
          <div className="space-y-2">
            <p className="text-rose-600 font-medium">{error}</p>
            <p className="text-sm text-slate-500">Redirecionando...</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-slate-900 font-medium">{status}</p>
            <div className="flex justify-center">
              <div className="h-1 w-24 bg-slate-200 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-600 rounded-full animate-[loading_1s_ease-in-out_infinite]" style={{ width: '50%' }} />
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

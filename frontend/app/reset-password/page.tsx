'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { cn } from '../../lib/utils';
import { resetPassword } from '../../lib/auth-client';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (newPassword.length < 8) {
      setMessage({ type: 'error', text: 'A senha deve ter pelo menos 8 caracteres.' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'As senhas nao coincidem.' });
      return;
    }

    if (!token) {
      setMessage({ type: 'error', text: 'Token invalido.' });
      return;
    }

    setLoading(true);

    try {
      const result = await resetPassword(newPassword, token);

      if (result.error) {
        setMessage({ type: 'error', text: result.error.message || 'Erro ao redefinir senha.' });
      } else {
        setSuccess(true);
        setMessage({ type: 'success', text: 'Senha redefinida com sucesso!' });
        setTimeout(() => router.push('/'), 2000);
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Erro ao redefinir senha. Tente novamente.' });
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <Card className="shadow-lg border-slate-200/80">
        <CardHeader>
          <CardTitle className="text-2xl font-bold">Link invalido</CardTitle>
          <CardDescription className="text-base">
            Este link de recuperacao e invalido ou expirou.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <a href="/forgot-password">
            <Button className="w-full h-11 font-semibold">
              Solicitar novo link
            </Button>
          </a>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-lg border-slate-200/80">
      <CardHeader>
        <CardTitle className="text-2xl font-bold">
          {success ? 'Senha redefinida!' : 'Nova senha'}
        </CardTitle>
        <CardDescription className="text-base">
          {success
            ? 'Voce sera redirecionado para o login...'
            : 'Crie uma nova senha para sua conta.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {message && (
          <div className={cn(
            'rounded-xl border px-4 py-3 text-sm',
            message.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-700'
          )}>
            {message.text}
          </div>
        )}

        {!success && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password" className="text-sm font-semibold">Nova senha</Label>
              <Input
                id="new-password"
                type="password"
                name="new-password"
                autoComplete="new-password"
                placeholder="Minimo 8 caracteres"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                className="h-11 border-2 focus:ring-4 focus:ring-indigo-500/15"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password" className="text-sm font-semibold">Confirmar senha</Label>
              <Input
                id="confirm-password"
                type="password"
                name="confirm-password"
                autoComplete="new-password"
                placeholder="Repita a senha"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                className="h-11 border-2 focus:ring-4 focus:ring-indigo-500/15"
              />
            </div>
            <Button type="submit" className="w-full h-11 font-semibold" disabled={loading}>
              {loading ? 'Redefinindo...' : 'Redefinir senha'}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export default function ResetPasswordPage() {
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
            Redefinir senha
          </Badge>
        </div>

        <Suspense fallback={
          <Card className="shadow-lg border-slate-200/80">
            <CardContent className="py-12 text-center text-muted-foreground">
              Carregando...
            </CardContent>
          </Card>
        }>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </main>
  );
}

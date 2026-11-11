'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { cn } from '../../lib/utils';
import Link from 'next/link';
import { SimboloPorta } from '../../components/landing/MarcaDiaria';
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
      setMessage({ type: 'error', text: 'As senhas não coincidem.' });
      return;
    }

    if (!token) {
      setMessage({ type: 'error', text: 'Link inválido. Peça um novo.' });
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
        setTimeout(() => router.push('/entrar'), 2000);
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Erro ao redefinir senha. Tente novamente.' });
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <Card className="shadow-lg border-border">
        <CardHeader>
          <CardTitle className="text-2xl font-bold">Link inválido</CardTitle>
          <CardDescription className="text-base">
            Este link de recuperação é inválido ou expirou.
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
    <Card className="shadow-lg border-border">
      <CardHeader>
        <CardTitle className="text-2xl font-bold">
          {success ? 'Senha redefinida!' : 'Nova senha'}
        </CardTitle>
        <CardDescription className="text-base">
          {success
            ? 'Você será levado para o login...'
            : 'Crie uma nova senha para sua conta.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {message && (
          <div className={cn(
            'rounded-xl border px-4 py-3 text-sm',
            message.type === 'success'
              ? 'border-success/30 bg-success/10 text-success'
              : 'border-destructive/30 bg-destructive/10 text-destructive'
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
                placeholder="Mínimo de 8 caracteres"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                className="h-11 border-2 focus:ring-4 focus:ring-primary/15"
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
                className="h-11 border-2 focus:ring-4 focus:ring-primary/15"
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
          <Link href="/" className="flex items-center justify-center gap-2.5">
            <SimboloPorta className="h-9 w-9" />
            <span className="text-lg font-semibold">Diária</span>
          </Link>
          <Badge variant="outline" className="text-xs">
            Redefinir senha
          </Badge>
        </div>

        <Suspense fallback={
          <Card className="shadow-lg border-border">
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

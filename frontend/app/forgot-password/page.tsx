'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { cn } from '../../lib/utils';
import { SimboloPorta } from '../../components/landing/MarcaDiaria';
import { requestPasswordReset } from '../../lib/auth-client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      setMessage({ type: 'error', text: 'Digite seu e-mail.' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const result = await requestPasswordReset(email);

      if (result.error) {
        setMessage({ type: 'error', text: result.error.message || 'Erro ao enviar o e-mail.' });
      } else {
        setSent(true);
        setMessage({ type: 'success', text: 'E-mail enviado! Verifique sua caixa de entrada.' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Erro ao enviar o e-mail. Tente novamente.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-16 flex items-center justify-center">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-4">
          <Link href="/" className="flex items-center justify-center gap-2.5">
            <SimboloPorta className="h-9 w-9" />
            <span className="text-lg font-semibold">Diária</span>
          </Link>
          <Badge variant="outline" className="text-xs">
            Recuperar acesso
          </Badge>
        </div>

        <Card className="shadow-lg border-border">
          <CardHeader>
            <CardTitle className="text-2xl font-bold">
              {sent ? 'E-mail enviado' : 'Esqueceu a senha?'}
            </CardTitle>
            <CardDescription className="text-base">
              {sent
                ? 'Verifique sua caixa de entrada e siga as instruções para redefinir sua senha.'
                : 'Digite seu e-mail e enviaremos um link para redefinir sua senha.'}
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

            {!sent && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-semibold">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    name="email"
                    autoComplete="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-11 border-2 focus:ring-4 focus:ring-primary/15"
                  />
                </div>
                <Button type="submit" className="w-full h-11 font-semibold" disabled={loading}>
                  {loading ? 'Enviando...' : 'Enviar link de recuperação'}
                </Button>
              </form>
            )}

            {sent && (
              <Button
                type="button"
                variant="outline"
                className="w-full h-11 font-semibold"
                onClick={() => { setSent(false); setMessage(null); setEmail(''); }}
              >
                Enviar novamente
              </Button>
            )}

            <div className="text-center pt-2">
              <Link href="/entrar" className="text-sm text-muted-foreground hover:text-primary transition-colors font-medium">
                Voltar ao login
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

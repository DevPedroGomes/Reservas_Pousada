'use client';

import { useState } from 'react';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { cn } from '../../lib/utils';
import { requestPasswordReset } from '../../lib/auth-client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      setMessage({ type: 'error', text: 'Digite seu email.' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const result = await requestPasswordReset(email);

      if (result.error) {
        setMessage({ type: 'error', text: result.error.message || 'Erro ao enviar email.' });
      } else {
        setSent(true);
        setMessage({ type: 'success', text: 'Email enviado! Verifique sua caixa de entrada.' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Erro ao enviar email. Tente novamente.' });
    } finally {
      setLoading(false);
    }
  }

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
            Recuperar acesso
          </Badge>
        </div>

        <Card className="shadow-lg border-slate-200/80">
          <CardHeader>
            <CardTitle className="text-2xl font-bold">
              {sent ? 'Email enviado' : 'Esqueceu a senha?'}
            </CardTitle>
            <CardDescription className="text-base">
              {sent
                ? 'Verifique sua caixa de entrada e siga as instrucoes para redefinir sua senha.'
                : 'Digite seu email e enviaremos um link para redefinir sua senha.'}
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

            {!sent && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-semibold">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    name="email"
                    autoComplete="email"
                    placeholder="Digite seu email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-11 border-2 focus:ring-4 focus:ring-indigo-500/15"
                  />
                </div>
                <Button type="submit" className="w-full h-11 font-semibold" disabled={loading}>
                  {loading ? 'Enviando...' : 'Enviar link de recuperacao'}
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
              <a href="/" className="text-sm text-muted-foreground hover:text-primary transition-colors font-medium">
                Voltar ao login
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

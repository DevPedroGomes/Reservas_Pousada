'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Badge } from '../../components/ui/badge';
import { cn } from '../../lib/utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

interface PousadaForm {
  nome: string;
  num_quartos: number;
  endereco: string;
  cidade: string;
  estado: string;
  cep: string;
  telefone: string;
  email: string;
  descricao: string;
}

const initialForm: PousadaForm = {
  nome: '',
  num_quartos: 10,
  endereco: '',
  cidade: '',
  estado: '',
  cep: '',
  telefone: '',
  email: '',
  descricao: ''
};

const estados = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<PousadaForm>(initialForm);
  const [loading, setLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const savedToken = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!savedToken) {
      router.push('/');
      return;
    }
    setToken(savedToken);
    verificarOnboarding(savedToken);
  }, [router]);

  async function verificarOnboarding(existingToken: string) {
    try {
      const response = await fetch(`${API_URL}/auth/verificar`, {
        headers: { Authorization: `Bearer ${existingToken}` }
      });
      const data = await response.json();

      if (!data.sucesso) {
        localStorage.removeItem('token');
        router.push('/');
        return;
      }

      // Se usuário já tem pousada, redirecionar para dashboard
      if (!data.needsOnboarding) {
        router.push('/');
        return;
      }
    } catch (error) {
      console.error('Erro ao verificar onboarding:', error);
      router.push('/');
    } finally {
      setAuthLoading(false);
    }
  }

  function validateStep1(): boolean {
    if (!form.nome.trim()) {
      setMessage({ type: 'error', text: 'Nome da pousada é obrigatório.' });
      return false;
    }
    if (form.nome.trim().length < 3) {
      setMessage({ type: 'error', text: 'Nome da pousada deve ter pelo menos 3 caracteres.' });
      return false;
    }
    if (form.num_quartos < 1 || form.num_quartos > 100) {
      setMessage({ type: 'error', text: 'Número de quartos deve ser entre 1 e 100.' });
      return false;
    }
    return true;
  }

  function validateStep2(): boolean {
    if (!form.endereco.trim()) {
      setMessage({ type: 'error', text: 'Endereço é obrigatório.' });
      return false;
    }
    if (!form.cidade.trim()) {
      setMessage({ type: 'error', text: 'Cidade é obrigatória.' });
      return false;
    }
    if (!form.estado) {
      setMessage({ type: 'error', text: 'Estado é obrigatório.' });
      return false;
    }
    if (!form.telefone.trim()) {
      setMessage({ type: 'error', text: 'Telefone é obrigatório.' });
      return false;
    }
    if (!form.email.trim()) {
      setMessage({ type: 'error', text: 'Email é obrigatório.' });
      return false;
    }
    // Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(form.email)) {
      setMessage({ type: 'error', text: 'Email inválido.' });
      return false;
    }
    return true;
  }

  function nextStep() {
    setMessage(null);
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;
    setStep(step + 1);
  }

  function prevStep() {
    setMessage(null);
    setStep(step - 1);
  }

  async function handleSubmit() {
    if (!token) return;
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch(`${API_URL}/pousadas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(form)
      });

      const data = await response.json();

      if (data.sucesso) {
        // Atualizar token se um novo foi retornado
        if (data.token) {
          localStorage.setItem('token', data.token);
        }
        setMessage({ type: 'success', text: 'Pousada configurada com sucesso!' });

        // Aguardar um pouco para mostrar a mensagem e redirecionar
        setTimeout(() => {
          router.push('/');
        }, 1500);
      } else {
        setMessage({ type: 'error', text: data.mensagem || 'Erro ao configurar pousada.' });
      }
    } catch (error) {
      console.error('Erro ao criar pousada:', error);
      setMessage({ type: 'error', text: 'Erro ao configurar pousada. Tente novamente.' });
    } finally {
      setLoading(false);
    }
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-600">
        Carregando...
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50/50 px-4 py-16">
      <div className="mx-auto max-w-2xl space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-500 text-2xl font-semibold text-white shadow-lg shadow-indigo-500/30">
              RP
            </div>
          </div>
          <div>
            <Badge variant="outline" className="uppercase tracking-[0.14em] text-[10px] mb-2">
              Configuracao inicial
            </Badge>
            <h1 className="text-3xl font-semibold text-slate-900">
              Configure sua Pousada
            </h1>
            <p className="text-slate-600 mt-2">
              Preencha as informacoes da sua pousada para comecar a usar o sistema.
            </p>
          </div>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-2">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center">
              <div
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium transition-colors',
                  step === s
                    ? 'bg-indigo-600 text-white'
                    : step > s
                    ? 'bg-emerald-500 text-white'
                    : 'bg-slate-200 text-slate-500'
                )}
              >
                {step > s ? '✓' : s}
              </div>
              {s < 3 && (
                <div
                  className={cn(
                    'h-1 w-16 mx-2 rounded-full transition-colors',
                    step > s ? 'bg-emerald-500' : 'bg-slate-200'
                  )}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step Labels */}
        <div className="flex justify-between px-4 text-sm text-slate-600">
          <span className={step >= 1 ? 'text-indigo-600 font-medium' : ''}>Dados Basicos</span>
          <span className={step >= 2 ? 'text-indigo-600 font-medium' : ''}>Contato</span>
          <span className={step >= 3 ? 'text-indigo-600 font-medium' : ''}>Finalizar</span>
        </div>

        {/* Form Card */}
        <Card className="shadow-lg border-slate-200/80">
          <CardHeader>
            <CardTitle>
              {step === 1 && 'Informacoes Basicas'}
              {step === 2 && 'Endereco e Contato'}
              {step === 3 && 'Revisao e Finalizacao'}
            </CardTitle>
            <CardDescription>
              {step === 1 && 'Informe o nome da pousada e quantidade de quartos.'}
              {step === 2 && 'Dados de localizacao e contato da pousada.'}
              {step === 3 && 'Revise as informacoes e finalize a configuracao.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Step 1: Basic Info */}
            {step === 1 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="nome">Nome da Pousada *</Label>
                  <Input
                    id="nome"
                    value={form.nome}
                    onChange={(e) => setForm((prev) => ({ ...prev, nome: e.target.value }))}
                    placeholder="Ex: Pousada Mar Azul"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="num_quartos">Numero de Quartos *</Label>
                  <Input
                    id="num_quartos"
                    type="number"
                    min="1"
                    max="100"
                    value={form.num_quartos}
                    onChange={(e) => setForm((prev) => ({ ...prev, num_quartos: parseInt(e.target.value) || 1 }))}
                    required
                  />
                  <p className="text-xs text-slate-500">De 1 a 100 quartos</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="descricao">Descricao (opcional)</Label>
                  <Textarea
                    id="descricao"
                    rows={3}
                    value={form.descricao}
                    onChange={(e) => setForm((prev) => ({ ...prev, descricao: e.target.value }))}
                    placeholder="Breve descricao da pousada..."
                  />
                </div>
              </div>
            )}

            {/* Step 2: Contact Info */}
            {step === 2 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="endereco">Endereco *</Label>
                  <Input
                    id="endereco"
                    value={form.endereco}
                    onChange={(e) => setForm((prev) => ({ ...prev, endereco: e.target.value }))}
                    placeholder="Rua, numero, complemento"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="cidade">Cidade *</Label>
                    <Input
                      id="cidade"
                      value={form.cidade}
                      onChange={(e) => setForm((prev) => ({ ...prev, cidade: e.target.value }))}
                      placeholder="Nome da cidade"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="estado">Estado *</Label>
                    <select
                      id="estado"
                      className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2"
                      value={form.estado}
                      onChange={(e) => setForm((prev) => ({ ...prev, estado: e.target.value }))}
                      required
                    >
                      <option value="">Selecione</option>
                      {estados.map((uf) => (
                        <option key={uf} value={uf}>{uf}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cep">CEP</Label>
                  <Input
                    id="cep"
                    value={form.cep}
                    onChange={(e) => setForm((prev) => ({ ...prev, cep: e.target.value.replace(/\D/g, '').slice(0, 8) }))}
                    placeholder="00000000"
                    maxLength={8}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="telefone">Telefone *</Label>
                    <Input
                      id="telefone"
                      value={form.telefone}
                      onChange={(e) => setForm((prev) => ({ ...prev, telefone: e.target.value }))}
                      placeholder="(00) 00000-0000"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                      placeholder="contato@pousada.com"
                      required
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Review */}
            {step === 3 && (
              <div className="space-y-6">
                <div className="rounded-xl bg-slate-50 p-4 space-y-3">
                  <h4 className="font-medium text-slate-900">Dados Basicos</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <span className="text-slate-500">Nome:</span>
                    <span className="text-slate-900">{form.nome}</span>
                    <span className="text-slate-500">Quartos:</span>
                    <span className="text-slate-900">{form.num_quartos}</span>
                    {form.descricao && (
                      <>
                        <span className="text-slate-500">Descricao:</span>
                        <span className="text-slate-900">{form.descricao}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 p-4 space-y-3">
                  <h4 className="font-medium text-slate-900">Endereco e Contato</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <span className="text-slate-500">Endereco:</span>
                    <span className="text-slate-900">{form.endereco}</span>
                    <span className="text-slate-500">Cidade/UF:</span>
                    <span className="text-slate-900">{form.cidade} - {form.estado}</span>
                    {form.cep && (
                      <>
                        <span className="text-slate-500">CEP:</span>
                        <span className="text-slate-900">{form.cep}</span>
                      </>
                    )}
                    <span className="text-slate-500">Telefone:</span>
                    <span className="text-slate-900">{form.telefone}</span>
                    <span className="text-slate-500">Email:</span>
                    <span className="text-slate-900">{form.email}</span>
                  </div>
                </div>

                <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
                  <p className="text-sm text-indigo-800">
                    Ao finalizar, sua pousada estara configurada e voce podera comecar a gerenciar reservas imediatamente.
                  </p>
                </div>
              </div>
            )}

            {/* Message */}
            {message && (
              <div
                className={cn(
                  'rounded-xl border px-4 py-3 text-sm',
                  message.type === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-rose-200 bg-rose-50 text-rose-700'
                )}
              >
                {message.text}
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="flex justify-between pt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={step === 1 ? () => router.push('/') : prevStep}
              >
                {step === 1 ? 'Cancelar' : 'Voltar'}
              </Button>

              {step < 3 ? (
                <Button type="button" onClick={nextStep}>
                  Continuar
                </Button>
              ) : (
                <Button type="button" onClick={handleSubmit} disabled={loading}>
                  {loading ? 'Configurando...' : 'Finalizar Configuracao'}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Help text */}
        <p className="text-center text-sm text-slate-500">
          Precisa de ajuda? Entre em contato com o suporte.
        </p>
      </div>
    </main>
  );
}

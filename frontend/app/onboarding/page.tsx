'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select } from '../../components/ui/select';
import { Textarea } from '../../components/ui/textarea';
import { Badge } from '../../components/ui/badge';
import { cn } from '../../lib/utils';
import { useSession } from '../../lib/auth-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

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
  const { data: session, isPending: sessionLoading } = useSession();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<PousadaForm>(initialForm);
  const [loading, setLoading] = useState(false);
  const [checkingPousada, setCheckingPousada] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (!sessionLoading && !session?.user) {
      router.push('/');
    }
  }, [session, sessionLoading, router]);

  // Check if user already has a pousada
  useEffect(() => {
    if (!session?.user) return;

    async function checkPousada() {
      try {
        const response = await fetch(`${API_URL}/api/pousadas/minha`, {
          credentials: 'include',
        });
        const data = await response.json();

        if (data.sucesso && data.pousada) {
          // User already has a pousada, redirect to dashboard
          router.push('/');
          return;
        }
      } catch (error) {
        console.error('Erro ao verificar pousada:', error);
      } finally {
        setCheckingPousada(false);
      }
    }

    checkPousada();
  }, [session, router]);

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
    const phoneDigits = form.telefone.replace(/\D/g, '');
    if (phoneDigits.length < 10 || phoneDigits.length > 11) {
      setMessage({ type: 'error', text: 'Telefone deve ter 10 ou 11 dígitos.' });
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
    if (!session?.user) return;
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch(`${API_URL}/api/pousadas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(form)
      });

      const data = await response.json();

      if (data.sucesso) {
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

  if (sessionLoading || checkingPousada) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-600">
        Carregando...
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-background px-4 py-16">
      <div className="mx-auto max-w-2xl space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <img src="/logo.png" alt="Logo" className="h-12 w-12 rounded-lg object-cover" />
          </div>
          <div>
            <Badge className="mb-2">Configuracao inicial</Badge>
            <h1 className="text-2xl font-semibold">
              Configure sua Pousada
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Preencha as informacoes para comecar a usar o sistema.
            </p>
          </div>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center justify-center">
          {[
            { num: 1, label: 'Dados Basicos' },
            { num: 2, label: 'Contato' },
            { num: 3, label: 'Finalizar' },
          ].map((s, idx) => (
            <div key={s.num} className="flex items-center">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium transition-colors',
                    step === s.num
                      ? 'bg-primary text-primary-foreground'
                      : step > s.num
                      ? 'bg-emerald-500 text-white'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {step > s.num ? '✓' : s.num}
                </div>
                <span
                  className={cn(
                    'text-xs',
                    step >= s.num ? 'text-primary font-medium' : 'text-muted-foreground'
                  )}
                >
                  {s.label}
                </span>
              </div>
              {idx < 2 && (
                <div
                  className={cn(
                    'h-1 w-16 mx-3 mb-6 rounded-full transition-colors',
                    step > s.num ? 'bg-emerald-500' : 'bg-muted'
                  )}
                />
              )}
            </div>
          ))}
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
                    <Select
                      id="estado"
                      value={form.estado}
                      onChange={(e) => setForm((prev) => ({ ...prev, estado: e.target.value }))}
                      required
                    >
                      <option value="">Selecione</option>
                      {estados.map((uf) => (
                        <option key={uf} value={uf}>{uf}</option>
                      ))}
                    </Select>
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
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, '').slice(0, 11);
                        let formatted = digits;
                        if (digits.length > 6) {
                          formatted = `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
                        } else if (digits.length > 2) {
                          formatted = `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
                        } else if (digits.length > 0) {
                          formatted = `(${digits}`;
                        }
                        setForm((prev) => ({ ...prev, telefone: formatted }));
                      }}
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

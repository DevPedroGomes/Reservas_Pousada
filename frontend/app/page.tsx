'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { ConfirmDialog } from '../components/confirm-dialog';
import { Pagination } from '../components/pagination';
import { cn } from '../lib/utils';

// Use o backend em porta diferente do Next.js (ex: 4000) para evitar conflito.
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
const TOTAL_QUARTOS = 25;

interface Usuario {
  id: number;
  nome: string;
  username?: string;
}

interface Reserva {
  id?: number;
  nome: string;
  cpf: string;
  quarto: number | string;
  data_entrada: string;
  data_saida: string;
  status: 'ativa' | 'finalizada' | 'cancelada';
  valor?: number | null;
  pago: boolean;
  observacoes?: string;
}

interface Auditoria {
  id: number;
  action: string;
  created_at: string;
  user?: { nome?: string; username?: string } | null;
  details?: {
    antes?: Partial<Reserva>;
    depois?: Partial<Reserva>;
  };
}

const initialForm: Reserva = {
  nome: '',
  cpf: '',
  quarto: 1,
  data_entrada: '',
  data_saida: '',
  status: 'ativa',
  valor: null,
  pago: false,
  observacoes: ''
};

export default function Home() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<Usuario | null>(null);
  const [page, setPage] = useState<'dashboard' | 'reservas' | 'nova-reserva'>('dashboard');
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [meta, setMeta] = useState<{ pagina: number; paginas: number; total: number; limite: number }>({
    pagina: 1,
    paginas: 1,
    total: 0,
    limite: 50
  });
  const [dashReservas, setDashReservas] = useState<Reserva[]>([]);
  const [filters, setFilters] = useState({ status: '', data_inicio: '', data_fim: '', pago: '', search: '' });
  const [form, setForm] = useState<Reserva>(initialForm);
  const [formId, setFormId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reservaToDelete, setReservaToDelete] = useState<number | null>(null);
  const [auditLogs, setAuditLogs] = useState<Auditoria[]>([]);
  const [isSignup, setIsSignup] = useState(false);
  const [signupLoading, setSignupLoading] = useState(false);

  // Checar token salvo
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const savedRefresh = typeof window !== 'undefined' ? localStorage.getItem('refresh_token') : null;
    if (saved) {
      verificarToken(saved, savedRefresh || undefined);
    } else {
      setAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) {
      carregarDashboard();
      carregarReservas();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const reservasAtivas = useMemo(
    () => dashReservas.filter((r) => r.status === 'ativa').length,
    [dashReservas]
  );
  const reservasHoje = useMemo(() => {
    const hoje = new Date().toISOString().split('T')[0];
    return dashReservas.filter((r) => r.data_entrada === hoje || r.data_saida === hoje).length;
  }, [dashReservas]);
  const quartosDisponiveis = TOTAL_QUARTOS - reservasAtivas;

  async function refreshToken() {
    const storedRefresh = typeof window !== 'undefined' ? localStorage.getItem('refresh_token') : null;
    if (!storedRefresh) return false;
    try {
      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: storedRefresh })
      });
      const data = await response.json();
      if (data.sucesso && data.token) {
        localStorage.setItem('token', data.token);
        if (data.refresh_token) localStorage.setItem('refresh_token', data.refresh_token);
        setToken(data.token);
        setUser(data.usuario);
        return true;
      }
    } catch (error) {
      console.error('Erro ao renovar token', error);
    }
    handleLogout(true);
    return false;
  }

  const authenticatedFetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const headers = { ...(init.headers || {}), Authorization: token ? `Bearer ${token}` : '' };
    let response = await fetch(input, { ...init, headers });
    if (response.status === 401) {
      const renewed = await refreshToken();
      if (renewed) {
        const retryHeaders = { ...(init.headers || {}), Authorization: `Bearer ${localStorage.getItem('token') || ''}` };
        response = await fetch(input, { ...init, headers: retryHeaders });
      }
    }
    return response;
  };

  async function verificarToken(existingToken: string, refresh?: string) {
    try {
      const response = await fetch(`${API_URL}/auth/verificar`, {
        headers: { Authorization: `Bearer ${existingToken}` }
      });
      const data = await response.json();
      if (data.sucesso) {
        setToken(existingToken);
        setUser(data.usuario);
      } else {
        localStorage.removeItem('token');
        if (refresh) {
          const renewed = await refreshToken();
          if (renewed) {
            carregarDashboard();
            return;
          }
        }
      }
    } catch (error) {
      console.error('Erro ao verificar token', error);
      localStorage.removeItem('token');
      if (refresh) {
        const renewed = await refreshToken();
        if (renewed) {
          carregarDashboard();
          return;
        }
      }
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const username = String(formData.get('username'));
    const password = String(formData.get('password'));

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await response.json();
      if (data.sucesso) {
        localStorage.setItem('token', data.token);
        if (data.refresh_token) localStorage.setItem('refresh_token', data.refresh_token);
        setToken(data.token);
        setUser(data.usuario);
        setMessage({ type: 'success', text: 'Login realizado com sucesso.' });
      } else {
        setMessage({ type: 'error', text: data.mensagem || 'Falha ao autenticar.' });
      }
    } catch (error) {
      console.error('Erro ao fazer login', error);
      setMessage({ type: 'error', text: 'Erro ao fazer login. Tente novamente.' });
    }
  }

  async function handleSignup(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSignupLoading(true);
    setMessage(null);

    const formData = new FormData(e.currentTarget);
    const username = String(formData.get('username'));
    const nome = String(formData.get('nome'));
    const password = String(formData.get('password'));
    const confirmPassword = String(formData.get('confirmPassword'));

    // Validação client-side
    if (password !== confirmPassword) {
      setMessage({ type: 'error', text: 'As senhas não coincidem.' });
      setSignupLoading(false);
      return;
    }

    if (password.length < 6) {
      setMessage({ type: 'error', text: 'A senha deve ter pelo menos 6 caracteres.' });
      setSignupLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, nome, password })
      });
      const data = await response.json();

      if (data.sucesso) {
        localStorage.setItem('token', data.token);
        if (data.refresh_token) localStorage.setItem('refresh_token', data.refresh_token);
        setToken(data.token);
        setUser(data.usuario);
        setMessage({ type: 'success', text: 'Conta criada com sucesso!' });
      } else {
        setMessage({ type: 'error', text: data.mensagem || 'Erro ao criar conta.' });
      }
    } catch (error) {
      console.error('Erro ao criar conta', error);
      setMessage({ type: 'error', text: 'Erro ao criar conta. Tente novamente.' });
    } finally {
      setSignupLoading(false);
    }
  }

  async function handleLogout(silent = false) {
    const storedRefresh = typeof window !== 'undefined' ? localStorage.getItem('refresh_token') : null;
    if (!silent && storedRefresh) {
      try {
        await fetch(`${API_URL}/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: storedRefresh })
        });
      } catch (error) {
        console.error('Erro ao fazer logout', error);
      }
    }
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('refresh_token');
  }

  async function carregarDashboard() {
    if (!token) return;
    try {
      const response = await authenticatedFetch(`${API_URL}/reservas`);
      const data = await response.json();
      if (data.sucesso) {
        setDashReservas(data.reservas || []);
      }
    } catch (error) {
      console.error('Erro ao carregar dashboard', error);
    }
  }

  async function carregarReservas(page = meta.pagina) {
    if (!token) return;
    setLoading(true);
    setMessage(null);
    try {
      const params = new URLSearchParams();
      if (filters.status) params.append('status', filters.status);
      if (filters.data_inicio && filters.data_fim) {
        params.append('data_inicio', filters.data_inicio);
        params.append('data_fim', filters.data_fim);
      }
      if (filters.pago) params.append('pago', filters.pago);
      if (filters.search) params.append('search', filters.search);
      params.append('page', String(page));
      params.append('limit', String(meta.limite || 50));

      const url = `${API_URL}/reservas${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await authenticatedFetch(url);
      const data = await response.json();
      if (data.sucesso) {
        setReservas(data.reservas || []);
        if (data.meta) setMeta(data.meta);
      } else {
        setMessage({ type: 'error', text: data.mensagem || 'Erro ao carregar reservas.' });
      }
    } catch (error) {
      console.error('Erro ao carregar reservas', error);
      setMessage({ type: 'error', text: 'Erro ao carregar reservas.' });
    } finally {
      setLoading(false);
    }
  }

  async function exportarCsv() {
    if (!token) return;
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (filters.status) params.append('status', filters.status);
      if (filters.data_inicio && filters.data_fim) {
        params.append('data_inicio', filters.data_inicio);
        params.append('data_fim', filters.data_fim);
      }
      if (filters.pago) params.append('pago', filters.pago);
      if (filters.search) params.append('search', filters.search);

      const url = `${API_URL}/reservas/export${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await authenticatedFetch(url);
      const text = await response.text();
      const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'reservas.csv';
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (error) {
      console.error('Erro ao exportar CSV', error);
      setMessage({ type: 'error', text: 'Erro ao exportar CSV.' });
    } finally {
      setExporting(false);
    }
  }

  async function editarReserva(id: number) {
    if (!token) return;
    try {
      const response = await authenticatedFetch(`${API_URL}/reservas/${id}`);
      const data = await response.json();
      if (data.sucesso) {
        const r = data.reserva as Reserva;
        setForm({
          nome: r.nome,
          cpf: r.cpf,
          quarto: r.quarto,
          data_entrada: r.data_entrada,
          data_saida: r.data_saida,
          status: r.status,
          valor: r.valor ?? null,
          pago: Boolean(r.pago),
          observacoes: r.observacoes || ''
        });
        setFormId(r.id ?? null);
        carregarAuditoria(id);
        setPage('nova-reserva');
      }
    } catch (error) {
      console.error('Erro ao carregar reserva', error);
      setMessage({ type: 'error', text: 'Erro ao carregar reserva.' });
    }
  }

  function limparFormulario() {
    setForm(initialForm);
    setFormId(null);
    setAuditLogs([]);
  }

  async function salvarReserva(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token) return;

    const erros: string[] = [];
    const cpfNormalizado = normalizarCpf(form.cpf);
    if (cpfNormalizado.length !== 11) {
      erros.push('CPF deve ter 11 dígitos.');
    }

    if (!form.data_entrada || !form.data_saida) {
      erros.push('Datas de entrada e saída são obrigatórias.');
    } else {
      if (isDataNoPassado(form.data_entrada)) erros.push('Data de entrada não pode estar no passado.');
      if (isDataNoPassado(form.data_saida)) erros.push('Data de saída não pode estar no passado.');
      const entrada = new Date(`${form.data_entrada}T00:00:00`);
      const saida = new Date(`${form.data_saida}T00:00:00`);
      if (entrada >= saida) erros.push('Data de entrada deve ser anterior à data de saída.');
    }

    if (erros.length > 0) {
      setMessage({ type: 'error', text: erros.join(' ') });
      return;
    }

    const payload = {
      ...form,
      cpf: cpfNormalizado,
      valor: form.valor ? Number(form.valor) : null,
      pago: Boolean(form.pago)
    };

    try {
      const url = formId ? `${API_URL}/reservas/${formId}` : `${API_URL}/reservas`;
      const response = await authenticatedFetch(url, {
        method: formId ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (data.sucesso) {
        setMessage({ type: 'success', text: formId ? 'Reserva atualizada com sucesso.' : 'Reserva criada com sucesso.' });
        setPage('reservas');
        limparFormulario();
        carregarReservas();
        carregarDashboard();
      } else {
        const detalhesConflito = data.conflitos?.length ? ` Conflitos: ${data.conflitos
          .map((c: Reserva) => `Quarto ${c.quarto} entre ${formatarData(c.data_entrada)} e ${formatarData(c.data_saida)}`)
          .join('; ')}` : '';
        setMessage({ type: 'error', text: `${data.mensagem || 'Erro ao salvar reserva.'}${detalhesConflito}` });
      }
    } catch (error) {
      console.error('Erro ao salvar reserva', error);
      setMessage({ type: 'error', text: 'Erro ao salvar reserva.' });
    }
  }

  async function carregarAuditoria(reservaId: number) {
    if (!token) return;
    try {
      const response = await authenticatedFetch(`${API_URL}/reservas/${reservaId}/auditoria`);
      const data = await response.json();
      if (data.sucesso) {
        setAuditLogs(data.auditoria || []);
      }
    } catch (error) {
      console.error('Erro ao carregar auditoria', error);
    }
  }

  function confirmarExclusao(id: number) {
    setReservaToDelete(id);
    setConfirmOpen(true);
  }

  async function excluirReserva() {
    if (!token || !reservaToDelete) return;
    try {
      const response = await authenticatedFetch(`${API_URL}/reservas/${reservaToDelete}`, {
        method: 'DELETE'
      });
      const data = await response.json();
      if (data.sucesso) {
        setMessage({ type: 'success', text: 'Reserva excluída com sucesso.' });
        carregarReservas();
        carregarDashboard();
      } else {
        setMessage({ type: 'error', text: data.mensagem || 'Erro ao excluir.' });
      }
    } catch (error) {
      console.error('Erro ao excluir reserva', error);
      setMessage({ type: 'error', text: 'Erro ao excluir reserva.' });
    } finally {
      setConfirmOpen(false);
      setReservaToDelete(null);
    }
  }

  const proximasReservas = useMemo(
    () =>
      dashReservas
        .filter((r) => r.status === 'ativa')
        .sort((a, b) => new Date(a.data_entrada).getTime() - new Date(b.data_entrada).getTime())
        .slice(0, 5),
    [dashReservas]
  );

  const statusBadgeVariant = (status: Reserva['status']) => {
    if (status === 'ativa') return 'success';
    if (status === 'finalizada') return 'warning';
    return 'destructive';
  };

  const logged = Boolean(token);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-600">Carregando...</div>
    );
  }

  if (!logged) {
    return (
      <main className="min-h-screen px-4 py-16">
        <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2">
          <div className="space-y-6">
            <Badge variant="outline" className="uppercase tracking-[0.14em] text-[11px]">Novo frontend</Badge>
            <h1 className="text-4xl font-semibold leading-tight text-slate-900">
              Sistema de Reservas com experiência Next.js + shadcn.
            </h1>
            <p className="text-lg text-slate-600">
              Painel moderno, tokens JWT e conexão direta com a API existente para operar reservas em tempo real.
            </p>
            <div className="grid grid-cols-3 gap-4">
              <Card className="glass-card">
                <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Tempo médio</p>
                <p className="text-2xl font-semibold text-slate-900">2 min</p>
                <p className="text-xs text-slate-500">para lançar uma reserva</p>
              </Card>
              <Card className="glass-card">
                <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Quartos</p>
                <p className="text-2xl font-semibold text-slate-900">25</p>
                <p className="text-xs text-slate-500">monitorados</p>
              </Card>
              <Card className="glass-card">
                <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Uptime</p>
                <p className="text-2xl font-semibold text-slate-900">99.9%</p>
                <p className="text-xs text-slate-500">preparado</p>
              </Card>
            </div>
          </div>

          <Card className="glass-card">
            <CardHeader className="space-y-2">
              <Badge variant="outline" className="uppercase tracking-[0.14em] text-[10px]">Acesso seguro</Badge>
              <CardTitle className="text-2xl">{isSignup ? 'Criar Conta' : 'Login'}</CardTitle>
              <CardDescription>
                {isSignup
                  ? 'Preencha os dados para criar sua conta.'
                  : 'Use suas credenciais para acessar o sistema.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isSignup ? (
                <form className="space-y-4" onSubmit={handleSignup}>
                  <div className="space-y-2">
                    <Label htmlFor="username">Usuário</Label>
                    <Input id="username" name="username" placeholder="Digite um nome de usuário" required />
                    <p className="text-xs text-slate-500">Apenas letras, números e underscore</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nome">Nome completo</Label>
                    <Input id="nome" name="nome" placeholder="Digite seu nome" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Senha</Label>
                    <Input id="password" name="password" type="password" placeholder="Mínimo 6 caracteres" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirmar senha</Label>
                    <Input id="confirmPassword" name="confirmPassword" type="password" placeholder="Repita a senha" required />
                  </div>
                  <Button className="w-full" type="submit" disabled={signupLoading}>
                    {signupLoading ? 'Criando conta...' : 'Criar conta'}
                  </Button>
                  <p className="text-center text-sm text-slate-600">
                    Já tem uma conta?{' '}
                    <button
                      type="button"
                      className="text-indigo-600 hover:underline font-medium"
                      onClick={() => { setIsSignup(false); setMessage(null); }}
                    >
                      Fazer login
                    </button>
                  </p>
                </form>
              ) : (
                <form className="space-y-4" onSubmit={handleLogin}>
                  <div className="space-y-2">
                    <Label htmlFor="username">Usuário</Label>
                    <Input id="username" name="username" placeholder="Digite seu usuário" required />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">Senha</Label>
                      <span className="text-xs text-slate-500">Protegido por JWT</span>
                    </div>
                    <Input id="password" name="password" type="password" placeholder="********" required />
                  </div>
                  <Button className="w-full" type="submit">
                    Entrar e continuar
                  </Button>
                  <p className="text-center text-sm text-slate-600">
                    Não tem uma conta?{' '}
                    <button
                      type="button"
                      className="text-indigo-600 hover:underline font-medium"
                      onClick={() => { setIsSignup(true); setMessage(null); }}
                    >
                      Criar conta
                    </button>
                  </p>
                </form>
              )}
              {message && (
                <p className={cn('mt-4 text-sm', message.type === 'error' ? 'text-rose-600' : 'text-emerald-600')}>
                  {message.text}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b border-slate-200/70">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-500 text-lg font-semibold text-white shadow-lg shadow-indigo-500/30">
              RP
            </div>
            <div>
              <p className="section-kicker">Operação</p>
              <p className="text-lg font-semibold text-slate-900">Sistema de Reservas</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline">{user?.nome}</Badge>
            <Button variant="ghost" onClick={() => handleLogout(false)} aria-label="Sair">Sair</Button>
          </div>
        </div>
        <div className="border-t border-slate-200/70">
          <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-2">
            {[
              { id: 'dashboard', label: 'Dashboard' },
              { id: 'reservas', label: 'Reservas' },
              { id: 'nova-reserva', label: 'Nova Reserva' }
            ].map((item) => (
              <Button
                key={item.id}
                variant={page === item.id ? 'default' : 'ghost'}
                className={cn('rounded-xl', page === item.id ? '' : 'text-slate-700')}
                onClick={() => {
                  setPage(item.id as typeof page);
                  if (item.id === 'dashboard') carregarDashboard();
                  if (item.id === 'reservas') carregarReservas();
                  if (item.id === 'nova-reserva') limparFormulario();
                }}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 space-y-8">
        {message && (
          <div
            className={cn(
              'rounded-xl border px-4 py-3 text-sm shadow-sm',
              message.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-rose-200 bg-rose-50 text-rose-700'
            )}
          >
            {message.text}
          </div>
        )}

        {page === 'dashboard' && (
          <div className="space-y-6">
            <div className="flex flex-col gap-2">
              <p className="section-kicker">Panorama</p>
              <h2 className="section-title">Dashboard</h2>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <Card className="bg-gradient-to-br from-indigo-50 to-indigo-100 border-indigo-100">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardDescription>Reservas Ativas</CardDescription>
                    <p className="metric" id="reservas-ativas-count">
                      {reservasAtivas}
                    </p>
                  </div>
                  <Badge>Monitorando</Badge>
                </CardHeader>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardDescription>Quartos Disponíveis</CardDescription>
                    <p className="metric" id="quartos-disponiveis-count">
                      {quartosDisponiveis}
                    </p>
                  </div>
                  <Badge variant="outline">Inventário</Badge>
                </CardHeader>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardDescription>Reservas Hoje</CardDescription>
                    <p className="metric" id="reservas-hoje-count">
                      {reservasHoje}
                    </p>
                  </div>
                  <Badge variant="outline">Fluxo</Badge>
                </CardHeader>
              </Card>
            </div>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <p className="section-kicker">pipeline</p>
                  <CardTitle>Próximas Reservas</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-hidden rounded-2xl border border-slate-200/80">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Hóspede</TableHead>
                        <TableHead>Quarto</TableHead>
                        <TableHead>Entrada</TableHead>
                        <TableHead>Saída</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {proximasReservas.map((reserva) => (
                        <TableRow key={reserva.id}>
                          <TableCell>{reserva.nome}</TableCell>
                          <TableCell>Quarto {reserva.quarto}</TableCell>
                          <TableCell>{formatarData(reserva.data_entrada)}</TableCell>
                          <TableCell>{formatarData(reserva.data_saida)}</TableCell>
                          <TableCell>
                            <Badge variant={statusBadgeVariant(reserva.status)}>{reserva.status}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                      {proximasReservas.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-slate-500">
                            Nenhuma reserva ativa.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {page === 'reservas' && (
          <div className="space-y-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="section-kicker">Operação</p>
                <h2 className="section-title">Reservas</h2>
              </div>
              <Button onClick={() => setPage('nova-reserva')}>Nova Reserva</Button>
            </div>

            <Card className="space-y-4">
              <div className="grid gap-4 md:grid-cols-5">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="filtro-search">Busca (nome, CPF, quarto)</Label>
                  <Input
                    id="filtro-search"
                    placeholder="Ex: Ana, 12345678901, 12"
                    value={filters.search}
                    onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="filtro-status">Status</Label>
                  <Select
                    id="filtro-status"
                    value={filters.status}
                    onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
                  >
                    <option value="">Todos</option>
                    <option value="ativa">Ativa</option>
                    <option value="finalizada">Finalizada</option>
                    <option value="cancelada">Cancelada</option>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="filtro-data-inicio">Data Início</Label>
                  <Input
                    id="filtro-data-inicio"
                    type="date"
                    value={filters.data_inicio}
                    onChange={(e) => setFilters((prev) => ({ ...prev, data_inicio: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="filtro-data-fim">Data Fim</Label>
                  <Input
                    id="filtro-data-fim"
                    type="date"
                    value={filters.data_fim}
                    onChange={(e) => setFilters((prev) => ({ ...prev, data_fim: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="filtro-pagamento">Pagamento</Label>
                  <Select
                    id="filtro-pagamento"
                    value={filters.pago}
                    onChange={(e) => setFilters((prev) => ({ ...prev, pago: e.target.value }))}
                  >
                    <option value="">Todos</option>
                    <option value="true">Pago</option>
                    <option value="false">Não Pago</option>
                  </Select>
                </div>
              </div>
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="text-sm text-slate-600">
                  Total: {meta.total} registros
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={exportarCsv} disabled={exporting}>
                    {exporting ? 'Exportando...' : 'Exportar CSV'}
                  </Button>
                  <Button variant="ghost" onClick={() => carregarReservas(1)} disabled={loading}>
                    {loading ? 'Filtrando...' : 'Aplicar filtros'}
                  </Button>
                </div>
              </div>
            </Card>

            <Card>
              <div className="overflow-hidden rounded-2xl border border-slate-200/80">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Hóspede</TableHead>
                      <TableHead>CPF</TableHead>
                      <TableHead>Quarto</TableHead>
                      <TableHead>Entrada</TableHead>
                      <TableHead>Saída</TableHead>
                      <TableHead>Valor (R$)</TableHead>
                      <TableHead>Pago</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reservas.map((reserva) => (
                      <TableRow key={reserva.id}>
                        <TableCell>{reserva.id}</TableCell>
                        <TableCell>{reserva.nome}</TableCell>
                        <TableCell>{reserva.cpf}</TableCell>
                        <TableCell>Quarto {reserva.quarto}</TableCell>
                        <TableCell>{formatarData(reserva.data_entrada)}</TableCell>
                        <TableCell>{formatarData(reserva.data_saida)}</TableCell>
                        <TableCell>{reserva.valor ? formatarValor(reserva.valor) : '-'}</TableCell>
                        <TableCell>
                          <Badge variant={reserva.pago ? 'success' : 'destructive'}>
                            {reserva.pago ? 'Sim' : 'Não'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusBadgeVariant(reserva.status)}>{reserva.status}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button variant="ghost" size="sm" onClick={() => editarReserva(Number(reserva.id))}>
                              Editar
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => confirmarExclusao(Number(reserva.id))}>
                              Excluir
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {reservas.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center text-slate-500">
                          Nenhuma reserva encontrada.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-4">
                <Pagination
                  page={meta.pagina || 1}
                  totalPages={meta.paginas || 1}
                  onPageChange={(p) => carregarReservas(p)}
                />
              </div>
            </Card>
          </div>
        )}

        {page === 'nova-reserva' && (
          <div className="space-y-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="section-kicker">Cadastro</p>
                    <h2 className="section-title" id="form-titulo">
                      {formId ? 'Editar Reserva' : 'Nova Reserva'}
                </h2>
              </div>
              <Badge variant="outline">Campos obrigatórios</Badge>
            </div>

            <Card>
              <form className="space-y-6" onSubmit={salvarReserva}>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="nome">Nome do Hóspede</Label>
                    <Input id="nome" value={form.nome} onChange={(e) => setForm((prev) => ({ ...prev, nome: e.target.value }))} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cpf">CPF</Label>
                    <Input id="cpf" value={form.cpf} onChange={(e) => setForm((prev) => ({ ...prev, cpf: e.target.value }))} required />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="quarto">Quarto</Label>
                    <Select
                      id="quarto"
                      value={form.quarto}
                      onChange={(e) => setForm((prev) => ({ ...prev, quarto: Number(e.target.value) }))}
                      required
                    >
                      {Array.from({ length: TOTAL_QUARTOS }, (_, idx) => idx + 1).map((num) => (
                        <option key={num} value={num}>
                          Quarto {num}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="data-entrada">Data de Entrada</Label>
                    <Input
                      id="data-entrada"
                      type="date"
                      value={form.data_entrada}
                      onChange={(e) => setForm((prev) => ({ ...prev, data_entrada: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="data-saida">Data de Saída</Label>
                    <Input
                      id="data-saida"
                      type="date"
                      value={form.data_saida}
                      onChange={(e) => setForm((prev) => ({ ...prev, data_saida: e.target.value }))}
                      required
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="valor">Valor (R$)</Label>
                    <Input
                      id="valor"
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.valor ?? ''}
                      onChange={(e) => setForm((prev) => ({ ...prev, valor: e.target.value === '' ? null : Number(e.target.value) }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pago">Pagamento</Label>
                    <Select
                      id="pago"
                      value={String(form.pago)}
                      onChange={(e) => setForm((prev) => ({ ...prev, pago: e.target.value === 'true' }))}
                    >
                      <option value="false">Não Pago</option>
                      <option value="true">Pago</option>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="status">Status</Label>
                    <Select
                      id="status"
                      value={form.status}
                      onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value as Reserva['status'] }))}
                      required
                    >
                      <option value="ativa">Ativa</option>
                      <option value="finalizada">Finalizada</option>
                      <option value="cancelada">Cancelada</option>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="observacoes">Observações</Label>
                  <Textarea
                    id="observacoes"
                    rows={3}
                    placeholder="Detalhes de check-in, preferências, observações..."
                    value={form.observacoes}
                    onChange={(e) => setForm((prev) => ({ ...prev, observacoes: e.target.value }))}
                  />
                </div>

                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <Button variant="ghost" type="button" onClick={() => setPage('reservas')}>
                    Cancelar
                  </Button>
                  <div className="flex gap-3">
                    {formId && (
                      <Badge variant="outline" className="self-center">
                        Editando #{formId}
                      </Badge>
                    )}
                    <Button type="submit">Salvar</Button>
                  </div>
                </div>
              </form>
            </Card>

            {formId && (
              <Card>
                <CardHeader className="space-y-1">
                  <p className="section-kicker">Auditoria</p>
                  <CardTitle>Histórico de alterações</CardTitle>
                  <CardDescription>Quem mudou, o quê e quando.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {auditLogs.length === 0 && <p className="text-sm text-slate-500">Sem registros ainda.</p>}
                  {auditLogs.map((log) => (
                    <div key={log.id} className="rounded-xl border border-slate-200/80 bg-slate-50/70 px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                          <span className="uppercase tracking-[0.14em] text-[10px] text-slate-500">{log.action}</span>
                          <span>{log.user?.nome || log.user?.username || 'Usuário'}</span>
                        </div>
                        <span className="text-xs text-slate-500">{formatarDataHora(log.created_at)}</span>
                      </div>
                      <div className="mt-2 text-xs text-slate-600">
                        {renderResumoAuditoria(log)}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        message="Tem certeza que deseja excluir esta reserva?"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={excluirReserva}
      />
    </main>
  );
}

function formatarData(data: string) {
  if (!data) return '-';
  return new Date(data).toLocaleDateString('pt-BR');
}

function formatarValor(valor: number) {
  return Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function normalizarCpf(cpf: string) {
  return (cpf || '').replace(/\D/g, '');
}

function isDataNoPassado(data: string) {
  if (!data) return true;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dataVerificada = new Date(`${data}T00:00:00`);
  return dataVerificada < hoje;
}

function formatarDataHora(data: string) {
  const d = new Date(data);
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

function renderResumoAuditoria(log: Auditoria) {
  const antesStatus = log.details?.antes?.status;
  const depoisStatus = log.details?.depois?.status;
  if (antesStatus && depoisStatus && antesStatus !== depoisStatus) {
    return `Status: ${antesStatus} → ${depoisStatus}`;
  }
  if (log.details?.antes && log.details?.depois) {
    return 'Alteração de dados da reserva.';
  }
  if (log.action === 'criar') return 'Reserva criada.';
  if (log.action === 'excluir') return 'Reserva removida.';
  return 'Atualização registrada.';
}

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { cn } from '../../lib/utils';
import { useSession, handleSignOut } from '../../lib/auth-client';
import { authenticatedFetch } from '../../lib/api';
import { fixarPousadaDaAba } from '../../lib/tenant';
import { rastrear } from '../../lib/medicao';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const ESTADOS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

/**
 * Onboarding em UM passo: nome e número de quartos.
 *
 * Antes eram 3 etapas exigindo endereço, telefone e e-mail antes de a pessoa
 * ver o produto — cada campo obrigatório no primeiro minuto é gente que
 * desiste no meio do trial que o anúncio pagou para trazer. Cidade e UF são
 * opcionais; o resto se completa em Configurações quando fizer sentido.
 */
export default function OnboardingPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [nome, setNome] = useState('');
  const [quartos, setQuartos] = useState('8');
  const [cidade, setCidade] = useState('');
  const [estado, setEstado] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [verificando, setVerificando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [criandoOutra, setCriandoOutra] = useState(false);

  useEffect(() => {
    if (!isPending && !session?.user) router.push('/entrar?proximo=/onboarding');
  }, [session, isPending, router]);

  useEffect(() => {
    if (!session?.user) return;
    const outra = new URLSearchParams(window.location.search).has('nova');
    setCriandoOutra(outra);
    // Quem já tem pousada só fica aqui se veio criar OUTRA (?nova=1).
    void (async () => {
      try {
        const r = await authenticatedFetch(`${API_URL}/api/pousadas/minha`);
        const d = await r.json();
        if (d.sucesso && d.pousada && !outra) {
          router.push('/painel');
          return;
        }
      } catch {
        /* segue para o formulário */
      }
      setVerificando(false);
    })();
  }, [session, router]);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    const n = Number(quartos);
    if (nome.trim().length < 2) return setErro('Dê um nome à pousada (pelo menos 2 letras).');
    if (!Number.isInteger(n) || n < 1 || n > 100) return setErro('Informe de 1 a 100 quartos.');

    setSalvando(true);
    try {
      const r = await authenticatedFetch(`${API_URL}/api/pousadas`, {
        method: 'POST',
        body: JSON.stringify({
          nome: nome.trim(),
          num_quartos: n,
          ...(cidade.trim() ? { cidade: cidade.trim() } : {}),
          ...(estado ? { estado } : {}),
        }),
      });
      const d = await r.json();
      if (d.sucesso) {
        // A aba passa a operar a pousada recém-criada.
        fixarPousadaDaAba(d.pousada?.id ?? null);
        rastrear('pousada_criada');
        window.location.replace('/painel');
        return;
      }
      setErro(
        r.status === 402
          ? `${d.mensagem} Veja os planos em Assinatura.`
          : [d.mensagem, ...(d.erros ?? [])].filter(Boolean).join(' ') || 'Não foi possível criar a pousada.',
      );
    } catch {
      setErro('Não foi possível conectar ao servidor. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  }

  function cancelar() {
    // Criando a 2ª pousada: volta ao painel. Primeira pousada: não há painel
    // ainda, então "cancelar" é sair da conta.
    if (criandoOutra) router.push('/painel');
    else void handleSignOut().then(() => window.location.assign('/'));
  }

  if (isPending || verificando) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-2 flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" className="h-8 w-8 rounded-lg object-cover" />
            <span className="text-sm font-semibold">Diária</span>
          </div>
          <CardTitle className="text-xl">{criandoOutra ? 'Nova pousada' : 'Vamos cadastrar sua pousada'}</CardTitle>
          <CardDescription>
            Só o essencial para você lançar a primeira reserva. Endereço e contato ficam para depois, em Configurações.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={criar} className="space-y-4">
            {erro && (
              <div className={cn('rounded-lg border px-3 py-2 text-sm border-rose-200 bg-rose-50 text-rose-700')}>{erro}</div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="nome">Nome da pousada</Label>
              <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Pousada Sol e Mar" autoFocus required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="num_quartos">Quantos quartos?</Label>
              <Input id="num_quartos" type="number" min={1} max={100} value={quartos} onChange={(e) => setQuartos(e.target.value)} required />
            </div>
            <div className="grid grid-cols-[1fr_6rem] gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cidade">Cidade <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                <Input id="cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="estado">UF</Label>
                <select
                  id="estado"
                  value={estado}
                  onChange={(e) => setEstado(e.target.value)}
                  className="flex h-10 w-full rounded-lg border border-border bg-white px-2 text-sm"
                >
                  <option value="">—</option>
                  {ESTADOS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
                </select>
              </div>
            </div>
            <Button type="submit" className="w-full h-11" disabled={salvando}>
              {salvando ? 'Criando...' : 'Criar pousada e começar'}
            </Button>
            <button type="button" onClick={cancelar} className="w-full text-center text-sm text-muted-foreground hover:text-foreground">
              {criandoOutra ? 'Voltar ao painel' : 'Sair'}
            </button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

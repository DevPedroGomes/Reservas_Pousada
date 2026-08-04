/**
 * Planos — a fonte da verdade dos LIMITES.
 *
 * O Stripe é a fonte da verdade do PREÇO; aqui ficam os limites que o código
 * precisa consultar a cada requisição. Manter as duas coisas separadas evita a
 * armadilha clássica: descobrir o que o cliente pode fazer chamando a API do
 * Stripe no caminho quente, o que amarra cada requisição à disponibilidade de
 * um serviço externo.
 *
 * Os ids de Price vêm do ambiente porque são diferentes entre modo de teste e
 * produção. Preço aqui é só para exibição na tela de planos — quem cobra é o
 * Price do Stripe, e se os dois divergirem, o Stripe ganha.
 */

export const CODIGOS_PLANO = ['essencial', 'pousada', 'rede'] as const;
export type CodigoPlano = (typeof CODIGOS_PLANO)[number];

export type Ciclo = 'mensal' | 'anual';

export interface Plano {
  codigo: CodigoPlano;
  nome: string;
  /** Só para exibição. A cobrança real é o Price do Stripe. */
  precoMensalCentavos: number;
  precoAnualCentavos: number;
  maxQuartos: number;
  /** null = ilimitado */
  maxUsuarios: number | null;
  maxPousadas: number;
  destaques: string[];
}

export const PLANOS: Record<CodigoPlano, Plano> = {
  essencial: {
    codigo: 'essencial',
    nome: 'Essencial',
    precoMensalCentavos: 8900,
    precoAnualCentavos: 89000, // 10 meses — 2 grátis
    maxQuartos: 10,
    maxUsuarios: 3,
    maxPousadas: 1,
    destaques: ['Até 10 quartos', '3 usuários', 'Reservas e hóspedes', 'Trilha de auditoria'],
  },
  pousada: {
    codigo: 'pousada',
    nome: 'Pousada',
    precoMensalCentavos: 14900,
    precoAnualCentavos: 149000,
    maxQuartos: 25,
    maxUsuarios: null,
    maxPousadas: 1,
    destaques: ['Até 25 quartos', 'Usuários ilimitados', 'Exportação CSV', 'Trilha de auditoria'],
  },
  rede: {
    codigo: 'rede',
    nome: 'Rede',
    precoMensalCentavos: 29900,
    precoAnualCentavos: 299000,
    maxQuartos: 100,
    maxUsuarios: null,
    maxPousadas: 3,
    destaques: ['Até 3 propriedades', 'Até 100 quartos', 'Usuários ilimitados', 'Troca de pousada em um clique'],
  },
};

/** Dias de teste grátis. Sem cartão — o trial é nosso, não do Stripe. */
export const DIAS_DE_TRIAL = 14;

/**
 * Dias de tolerância depois de um pagamento falhar antes de cortar o acesso.
 *
 * Cartão expirado é o motivo mais comum de falha e não significa que o cliente
 * quis sair. Cortar no mesmo dia transforma um problema de cadastro em churn.
 */
export const DIAS_DE_TOLERANCIA = 7;

export function ehCodigoPlano(v: unknown): v is CodigoPlano {
  return typeof v === 'string' && (CODIGOS_PLANO as readonly string[]).includes(v);
}

export function ehCiclo(v: unknown): v is Ciclo {
  return v === 'mensal' || v === 'anual';
}

/**
 * Id do Price no Stripe para um plano e ciclo.
 *
 * Vem do ambiente (`STRIPE_PRICE_POUSADA_MENSAL` e afins) porque os ids diferem
 * entre teste e produção. Ausente = plano não vendável ainda; a rota de
 * checkout devolve erro claro em vez de mandar um id vazio para o Stripe.
 */
export function stripePriceId(plano: CodigoPlano, ciclo: Ciclo): string | undefined {
  const chave = `STRIPE_PRICE_${plano.toUpperCase()}_${ciclo.toUpperCase()}`;
  return process.env[chave]?.trim() || undefined;
}

/** Planos que têm Price configurado — os que dá para vender agora. */
export function planosVendaveis(ciclo: Ciclo): Plano[] {
  return CODIGOS_PLANO.map((c) => PLANOS[c]).filter((p) => stripePriceId(p.codigo, ciclo));
}

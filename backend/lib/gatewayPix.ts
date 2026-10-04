/**
 * Gateways de Pix com confirmação automática, atrás de uma interface:
 * somar provedor (Pagar.me, Efí...) é implementar `GatewayPix`, sem mexer
 * no resto.
 *
 * Cada pousada liga a PRÓPRIA conta: o sinal é dinheiro dela, cai direto
 * nela. O aviso (webhook) nunca é confiado pelo corpo: só traz o id, e o
 * status é consultado no provedor com a credencial da pousada.
 */

export interface ClienteCobranca {
  nome: string;
  cpfCnpj: string | null;
  email: string | null;
  telefone: string | null;
}

export interface CobrancaCriada {
  id: string;
  copiaECola: string;
  expiraEm: Date | null;
}

export interface SituacaoCobranca {
  status: 'pendente' | 'paga' | 'cancelada' | 'expirada';
  valorCentavos: number;
  referencia: string | null;
}

export class GatewayRecusou extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'GatewayRecusou';
  }
}

export interface GatewayPix {
  /** O provedor precisa do CPF/CNPJ de quem paga? */
  readonly exigeDocumento: boolean;
  criarCobranca(dados: {
    valorCentavos: number;
    descricao: string;
    referencia: string;
    cliente: ClienteCobranca;
    expiraEm: Date;
  }): Promise<CobrancaCriada>;
  consultar(id: string): Promise<SituacaoCobranca>;
  /** Registra na conta da pousada o endereço que recebe os avisos. */
  registrarWebhook(dados: { url: string; tokenAutenticacao: string; email: string }): Promise<void>;
}

type Fetch = typeof fetch;

/** Asaas (API v3). Chave de sandbox ("_hmlg_") usa o ambiente de testes. */
export function asaas(chaveApi: string, fetchImpl: Fetch = fetch): GatewayPix {
  const base = chaveApi.includes('_hmlg_') ? 'https://api-sandbox.asaas.com/v3' : 'https://api.asaas.com/v3';
  const cabecalhos = { access_token: chaveApi, 'Content-Type': 'application/json', 'User-Agent': 'Diaria/1.0' };

  async function chamar(caminho: string, init: RequestInit = {}): Promise<Record<string, any>> {
    const r = await fetchImpl(`${base}${caminho}`, { ...init, headers: cabecalhos, signal: AbortSignal.timeout(15_000) });
    const j = (await r.json().catch(() => ({}))) as Record<string, any>;
    if (!r.ok) {
      const motivo = j.errors?.[0]?.description ?? `HTTP ${r.status}`;
      throw new GatewayRecusou(`Asaas: ${motivo}`);
    }
    return j;
  }

  return {
    exigeDocumento: true,
    async criarCobranca(d) {
      if (!d.cliente.cpfCnpj) throw new GatewayRecusou('O Asaas exige o CPF de quem paga.');
      // Cliente do Asaas pelo CPF: reaproveita se já existe na conta da pousada.
      const achados = await chamar(`/customers?cpfCnpj=${encodeURIComponent(d.cliente.cpfCnpj)}&limit=1`);
      const cliente = achados.data?.[0] ?? (await chamar('/customers', {
        method: 'POST',
        body: JSON.stringify({
          name: d.cliente.nome,
          cpfCnpj: d.cliente.cpfCnpj,
          email: d.cliente.email || undefined,
          mobilePhone: d.cliente.telefone?.replace(/^55/, '') || undefined,
          notificationDisabled: true,
        }),
      }));
      const vencimento = d.expiraEm.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
      const cobranca = await chamar('/payments', {
        method: 'POST',
        body: JSON.stringify({
          customer: cliente.id,
          billingType: 'PIX',
          value: d.valorCentavos / 100,
          dueDate: vencimento,
          description: d.descricao.slice(0, 500),
          externalReference: d.referencia,
        }),
      });
      const qr = await chamar(`/payments/${cobranca.id}/pixQrCode`);
      if (!qr.payload) throw new GatewayRecusou('Asaas não devolveu o código Pix.');
      return { id: String(cobranca.id), copiaECola: qr.payload, expiraEm: qr.expirationDate ? new Date(qr.expirationDate) : null };
    },
    async consultar(id) {
      if (!/^pay_[A-Za-z0-9]{1,60}$/.test(id)) throw new GatewayRecusou('id de cobrança inválido');
      const j = await chamar(`/payments/${id}`);
      const mapa: Record<string, SituacaoCobranca['status']> = {
        RECEIVED: 'paga', CONFIRMED: 'paga', RECEIVED_IN_CASH: 'paga',
        PENDING: 'pendente', AWAITING_RISK_ANALYSIS: 'pendente',
        OVERDUE: 'expirada',
        REFUNDED: 'cancelada', REFUND_REQUESTED: 'cancelada', REFUND_IN_PROGRESS: 'cancelada', CHARGEBACK_REQUESTED: 'cancelada',
      };
      return {
        status: j.deleted ? 'cancelada' : mapa[j.status] ?? 'pendente',
        valorCentavos: Math.round(Number(j.value ?? 0) * 100),
        referencia: j.externalReference ?? null,
      };
    },
    async registrarWebhook({ url, tokenAutenticacao, email }) {
      await chamar('/webhooks', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Diária — Pix das reservas',
          url,
          email,
          enabled: true,
          interrupted: false,
          authToken: tokenAutenticacao,
          sendType: 'SEQUENTIALLY',
          events: ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED', 'PAYMENT_OVERDUE', 'PAYMENT_DELETED', 'PAYMENT_REFUNDED'],
        }),
      });
    },
  };
}

export type Provedor = 'asaas';

// Testes trocam o gateway por um falso (sem rede).
let fabricaParaTestes: ((chave: string) => GatewayPix) | null = null;
export function usarGatewayDeTeste(fabrica: ((chave: string) => GatewayPix) | null): void {
  fabricaParaTestes = fabrica;
}

export function gatewayPara(provedor: Provedor, chave: string): GatewayPix {
  if (fabricaParaTestes) return fabricaParaTestes(chave);
  switch (provedor) {
    case 'asaas': return asaas(chave);
  }
}

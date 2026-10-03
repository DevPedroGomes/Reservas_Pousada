/**
 * Motor de reservas público (/r/<slug>): o hóspede escolhe datas, vê os
 * quartos livres com o preço do tarifário e pede a reserva, que entra como
 * pré-reserva (canal "site") com prazo para a pousada confirmar.
 *
 * Por ser público, o pedido tem freios: só pousada com o motor ligado e
 * assinatura em dia, WhatsApp obrigatório, até 30 noites, até 1 ano à
 * frente, mínimo de noites do tarifário respeitado, e a pré-reserva expira
 * sozinha (job) para robô nenhum segurar quarto para sempre.
 */
import { pool } from '../db/index.js';
import AssinaturaModel from './Assinatura.js';
import HospedeModel, { normalizarTelefone } from './Hospede.js';
import ReservaModel, { ConflitoDeReserva } from './Reserva.js';
import { cotar, type RegraTarifa } from './Tarifa.js';
import { avaliarAcesso } from '../utils/assinatura.js';
import { billingHabilitado } from '../lib/stripe.js';
import { hojeLocal } from '../utils/datas.js';
import { sanitizarNome, sanitizarString, validarCPF, validarData, validarEmail } from '../utils/validation.js';
import { normalizarDocumento } from '../utils/crypto.js';

export interface ConfigMotor {
  ativo: boolean;
  prazoHoras: number;
  sinalPercentual: number;
  politicas: string;
}

export function configMotor(configuracoes: unknown): ConfigMotor {
  const m = ((configuracoes as Record<string, unknown> | null)?.motor ?? {}) as Record<string, unknown>;
  const prazo = Number(m.prazo_horas);
  const sinal = Number(m.sinal_percentual);
  return {
    ativo: m.ativo === true,
    prazoHoras: Number.isInteger(prazo) && prazo >= 1 && prazo <= 168 ? prazo : 24,
    sinalPercentual: Number.isInteger(sinal) && sinal >= 0 && sinal <= 100 ? sinal : 30,
    politicas: typeof m.politicas === 'string' ? m.politicas : '',
  };
}

/** Lê e valida a configuração enviada pelo dono. */
export function lerConfigMotor(corpo: Record<string, unknown>): { config: Record<string, unknown>; erros: string[] } {
  const erros: string[] = [];
  const prazo = Number(corpo.prazo_horas ?? 24);
  const sinal = Number(corpo.sinal_percentual ?? 30);
  if (!Number.isInteger(prazo) || prazo < 1 || prazo > 168) erros.push('Prazo da pré-reserva deve ser de 1 a 168 horas');
  if (!Number.isInteger(sinal) || sinal < 0 || sinal > 100) erros.push('Sinal deve ser de 0% a 100%');
  return {
    config: {
      ativo: corpo.ativo === true,
      prazo_horas: prazo,
      sinal_percentual: sinal,
      politicas: sanitizarString(String(corpo.politicas ?? ''), 1500, true),
    },
    erros,
  };
}

export interface PousadaPublica {
  id: number;
  slug: string;
  nome: string;
  cidade: string | null;
  estado: string | null;
  telefone: string | null;
  email: string | null;
  descricao: string | null;
  logoUrl: string | null;
  motor: ConfigMotor;
}

/** Pousada com o motor ligado (e assinatura em dia), ou null. */
export async function pousadaPublica(slug: string): Promise<PousadaPublica | null> {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  const { rows: [p] } = await pool.query(
    `SELECT id, slug, nome, cidade, estado, telefone, email, descricao, logo_url, configuracoes
       FROM pousadas WHERE slug = $1 AND excluida_em IS NULL AND ativa IS NOT FALSE`,
    [slug],
  );
  if (!p) return null;
  const motor = configMotor(p.configuracoes);
  if (!motor.ativo) return null;
  if (billingHabilitado()) {
    const efetiva = await AssinaturaModel.efetiva(p.id);
    if (efetiva && !avaliarAcesso(AssinaturaModel.paraEstado(efetiva.row)).liberado) return null;
  }
  return {
    id: p.id, slug: p.slug, nome: p.nome, cidade: p.cidade, estado: p.estado, telefone: p.telefone,
    email: p.email, descricao: p.descricao, logoUrl: p.logo_url, motor,
  };
}

/** Quartos ativos para a vitrine (sem dado interno). */
export async function quartosPublicos(pousadaId: number) {
  const { rows } = await pool.query(
    `SELECT numero, nome, tipo, capacidade, descricao, preco_base_centavos
       FROM quartos WHERE pousada_id = $1 AND ativo ORDER BY ordem, numero`,
    [pousadaId],
  );
  return rows.map((q) => ({
    numero: q.numero, nome: q.nome, tipo: q.tipo, capacidade: q.capacidade, descricao: q.descricao,
    aPartirDeCentavos: q.preco_base_centavos as number | null,
  }));
}

/** Datas da busca: válidas, a partir de hoje, até 1 ano à frente, até 30 noites. */
export function validarEstadia(entrada: string, saida: string): string | null {
  if (!validarData(entrada) || !validarData(saida)) return 'Escolha as datas de entrada e saída.';
  if (saida <= entrada) return 'A saída precisa ser depois da entrada.';
  const hoje = hojeLocal();
  if (entrada < hoje) return 'A entrada não pode ser no passado.';
  const noites = Math.round((Date.parse(saida) - Date.parse(entrada)) / 864e5);
  if (noites > 30) return 'Para mais de 30 noites, fale direto com a pousada.';
  if ((Date.parse(entrada) - Date.parse(hoje)) / 864e5 > 366) return 'Reservas abertas até um ano à frente.';
  return null;
}

/** Quartos livres no período, com o total pelo tarifário. */
export async function disponibilidade(pousadaId: number, entrada: string, saida: string, pessoas: number) {
  const [quartos, ocupados, regras] = await Promise.all([
    pool.query(
      `SELECT numero, nome, tipo, capacidade, descricao, preco_base_centavos FROM quartos
        WHERE pousada_id = $1 AND ativo AND capacidade >= $2 ORDER BY ordem, numero`,
      [pousadaId, pessoas],
    ),
    pool.query(
      `SELECT DISTINCT quarto FROM reservas
        WHERE pousada_id = $1 AND deleted_at IS NULL AND status IN ('pre_reserva', 'confirmada', 'hospedada')
          AND data_entrada < $3 AND data_saida > $2`,
      [pousadaId, entrada, saida],
    ),
    pool.query(
      `SELECT id, nome, quarto_numero AS "quartoNumero", data_inicio::text AS "dataInicio", data_fim::text AS "dataFim",
              dias_semana AS "diasSemana", preco_centavos AS "precoCentavos", ajuste_percentual AS "ajustePercentual",
              minimo_noites AS "minimoNoites"
         FROM tarifas WHERE pousada_id = $1 AND ativa`,
      [pousadaId],
    ),
  ]);
  const ocupado = new Set(ocupados.rows.map((r) => r.quarto as number));
  return quartos.rows
    .filter((q) => !ocupado.has(q.numero))
    .map((q) => {
      const c = cotar(q.preco_base_centavos, regras.rows as RegraTarifa[], q.numero, entrada, saida);
      return {
        numero: q.numero as number, nome: q.nome as string, tipo: q.tipo as string | null, capacidade: q.capacidade as number,
        descricao: q.descricao as string | null, totalCentavos: c.totalCentavos, noites: c.noites.length,
        minimoNoites: c.minimoNoites, atendeMinimo: c.atendeMinimo,
      };
    })
    // Quarto sem preço não é vendido no site (a pousada responde direto).
    .filter((q) => q.totalCentavos !== null);
}

export class PedidoRecusado extends Error {
  constructor(mensagem: string, readonly status: 400 | 409 = 400) {
    super(mensagem);
    this.name = 'PedidoRecusado';
  }
}

export interface PedidoPublico {
  quarto: number; entrada: string; saida: string; adultos: number; criancas: number;
  nome: string; telefone: string; email: string | null; documento: string | null; observacoes: string | null;
}

export function lerPedido(corpo: Record<string, unknown>): { pedido: PedidoPublico; erros: string[] } {
  const erros: string[] = [];
  const nome = sanitizarNome(String(corpo.nome ?? ''));
  if (nome.split(' ').filter(Boolean).length < 2) erros.push('Informe nome e sobrenome.');
  const telefone = normalizarTelefone(corpo.telefone) ?? '';
  if (telefone.length < 12 || telefone.length > 15) erros.push('Informe um WhatsApp válido, com DDD.');
  const email = String(corpo.email ?? '').trim().toLowerCase() || null;
  if (email && !validarEmail(email)) erros.push('E-mail inválido.');
  let documento: string | null = String(corpo.documento ?? '').trim() || null;
  if (documento) {
    const digitos = documento.replace(/\D/g, '');
    if (digitos.length === 11 && /^[\d.\-\s]+$/.test(documento)) {
      if (!validarCPF(digitos)) erros.push('CPF inválido.');
      documento = digitos;
    } else {
      documento = normalizarDocumento('outro', documento);
      if (documento.length < 5 || documento.length > 20) erros.push('Documento inválido.');
    }
  }
  const adultos = Number(corpo.adultos ?? 1);
  const criancas = Number(corpo.criancas ?? 0);
  if (!Number.isInteger(adultos) || adultos < 1 || adultos > 20) erros.push('Número de adultos inválido.');
  if (!Number.isInteger(criancas) || criancas < 0 || criancas > 20) erros.push('Número de crianças inválido.');
  if (corpo.aceite !== true) erros.push('É preciso concordar com o uso dos dados para a reserva.');
  return {
    pedido: {
      quarto: Number(corpo.quarto), entrada: String(corpo.entrada ?? ''), saida: String(corpo.saida ?? ''), adultos, criancas,
      nome, telefone, email, documento, observacoes: sanitizarString(String(corpo.observacoes ?? ''), 500, true) || null,
    },
    erros,
  };
}

/** Cria a pré-reserva do pedido público. */
export async function solicitarReserva(p: PousadaPublica, pedido: PedidoPublico) {
  const erroDatas = validarEstadia(pedido.entrada, pedido.saida);
  if (erroDatas) throw new PedidoRecusado(erroDatas);
  const pessoas = pedido.adultos + pedido.criancas;
  const livres = await disponibilidade(p.id, pedido.entrada, pedido.saida, pessoas);
  const quarto = livres.find((q) => q.numero === pedido.quarto);
  if (!quarto) throw new PedidoRecusado('Este quarto não está mais disponível nessas datas. Escolha outro.', 409);
  if (!quarto.atendeMinimo) throw new PedidoRecusado(`Neste período a estadia mínima é de ${quarto.minimoNoites} noites.`);

  // Freio contra robô: o mesmo WhatsApp com 3 pedidos em aberto não abre outro.
  const { rows: [abertas] } = await pool.query(
    `SELECT count(*)::int AS n FROM reservas r JOIN hospedes h ON h.id = r.hospede_id
      WHERE r.pousada_id = $1 AND h.telefone = $2 AND r.status = 'pre_reserva' AND r.canal = 'site' AND r.deleted_at IS NULL`,
    [p.id, pedido.telefone],
  );
  if (abertas.n >= 3) throw new PedidoRecusado('Já há pedidos em aberto com este WhatsApp. A pousada vai responder em breve.', 409);

  const hospede = await HospedeModel.resolver(p.id, {
    nome: pedido.nome,
    telefone: pedido.telefone,
    ...(pedido.email ? { email: pedido.email } : {}),
    ...(pedido.documento
      ? { tipoDocumento: /^\d{11}$/.test(pedido.documento) ? 'cpf' as const : 'passaporte' as const, documento: pedido.documento }
      : { tipoDocumento: 'cpf' as const }),
  });
  const expiraEm = new Date(Date.now() + p.motor.prazoHoras * 3600_000);
  try {
    const reserva = await ReservaModel.criar({
      pousadaId: p.id,
      hospedeId: hospede.id,
      nome: hospede.nome,
      quarto: quarto.numero,
      dataEntrada: pedido.entrada,
      dataSaida: pedido.saida,
      status: 'pre_reserva',
      expiraEm,
      valor: String((quarto.totalCentavos ?? 0) / 100),
      adultos: pedido.adultos,
      criancas: pedido.criancas,
      canal: 'site',
      observacoes: ['Pedido pelo site.', pedido.observacoes].filter(Boolean).join(' '),
    });
    const totalCentavos = quarto.totalCentavos ?? 0;
    return {
      reservaId: reserva.id,
      quarto: quarto.nome,
      expiraEm,
      totalCentavos,
      sinalCentavos: Math.round((totalCentavos * p.motor.sinalPercentual) / 100),
    };
  } catch (err) {
    if (err instanceof ConflitoDeReserva) throw new PedidoRecusado('Este quarto acabou de ser reservado. Escolha outro.', 409);
    throw err;
  }
}

/** E-mails de quem deve ser avisado: o da pousada e os dos donos. */
export async function emailsDaPousada(pousadaId: number): Promise<string[]> {
  const { rows } = await pool.query(
    `SELECT DISTINCT email FROM (
       SELECT email FROM pousadas WHERE id = $1 AND email IS NOT NULL AND email <> ''
       UNION SELECT u.email FROM user_pousadas up JOIN "user" u ON u.id = up.user_id
        WHERE up.pousada_id = $1 AND (up.is_owner OR up.role = 'admin') AND u.email NOT LIKE '%@diaria.invalid'
     ) e`,
    [pousadaId],
  );
  return rows.map((r) => r.email as string);
}

/**
 * Pré-check-in online com os campos da FNRH (Ficha Nacional de Registro de
 * Hóspedes): o hóspede preenche pelo link secreto da reserva antes de
 * chegar. A ficha inteira vai cifrada; documento, nacionalidade, nascimento
 * e contato também completam o cadastro do hóspede (e liberam o check-in).
 */
import { randomBytes } from 'node:crypto';
import { pool } from '../db/index.js';
import HospedeModel, { normalizarTelefone } from './Hospede.js';
import { cifrarSegredo, decifrarSegredo, normalizarDocumento } from '../utils/crypto.js';
import { sanitizarNome, sanitizarString, validarCPF, validarData, validarEmail } from '../utils/validation.js';
import { hojeLocal } from '../utils/datas.js';

export const MOTIVOS_VIAGEM = ['lazer', 'negocios', 'congresso', 'parentes_amigos', 'estudos', 'religiao', 'saude', 'compras', 'outro'] as const;
export const MEIOS_TRANSPORTE = ['automovel', 'aviao', 'onibus', 'moto', 'navio', 'trem', 'outro'] as const;
export const TIPOS_DOC_FNRH = ['cpf', 'rg', 'passaporte', 'cnh', 'outro'] as const;
export const GENEROS = ['feminino', 'masculino', 'outro', 'nao_informar'] as const;

export interface Titular {
  nome: string;
  dataNascimento: string;
  genero: string;
  nacionalidade: string;
  tipoDocumento: string;
  documento: string;
  orgaoEmissor: string;
  email: string;
  telefone: string;
  profissao: string;
  cidadeResidencia: string;
  estadoResidencia: string;
  paisResidencia: string;
  motivoViagem: string;
  meioTransporte: string;
  procedencia: string;
  proximoDestino: string;
}

export interface Acompanhante {
  nome: string;
  dataNascimento: string;
  tipoDocumento: string;
  documento: string;
  parentesco: string;
}

export interface FichaFnrh {
  titular: Titular;
  acompanhantes: Acompanhante[];
}

export class PrecheckinRecusado extends Error {
  constructor(mensagem: string, readonly status: 400 | 404 | 409 = 400) {
    super(mensagem);
    this.name = 'PrecheckinRecusado';
  }
}

const txt = (v: unknown, max = 120) => sanitizarString(String(v ?? ''), max);
const um = <T extends readonly string[]>(lista: T, v: unknown, padrao: T[number]): T[number] =>
  (lista as readonly string[]).includes(String(v)) ? (String(v) as T[number]) : padrao;

function lerDocumento(tipo: string, valor: string, rotulo: string, erros: string[], obrigatorio: boolean): string {
  const bruto = valor.trim();
  if (!bruto) {
    if (obrigatorio) erros.push(`${rotulo}: informe o documento.`);
    return '';
  }
  if (tipo === 'cpf') {
    const d = bruto.replace(/\D/g, '');
    if (!validarCPF(d)) erros.push(`${rotulo}: CPF inválido.`);
    return d;
  }
  const n = normalizarDocumento('outro', bruto);
  if (n.length < 4 || n.length > 20) erros.push(`${rotulo}: documento inválido.`);
  return n;
}

function lerNascimento(v: unknown, rotulo: string, erros: string[], obrigatorio: boolean): string {
  const d = String(v ?? '').trim();
  if (!d) {
    if (obrigatorio) erros.push(`${rotulo}: informe a data de nascimento.`);
    return '';
  }
  if (!validarData(d) || d > hojeLocal() || d < '1900-01-01') erros.push(`${rotulo}: data de nascimento inválida.`);
  return d;
}

/** Lê e valida a ficha enviada pelo hóspede. */
export function lerFicha(corpo: Record<string, unknown>, maxAcompanhantes: number): { ficha: FichaFnrh; erros: string[] } {
  const erros: string[] = [];
  const t = (corpo.titular ?? {}) as Record<string, unknown>;
  const tipo = um(TIPOS_DOC_FNRH, t.tipoDocumento, 'cpf');
  const nome = sanitizarNome(String(t.nome ?? ''));
  if (nome.split(' ').filter(Boolean).length < 2) erros.push('Titular: informe nome e sobrenome.');
  const email = txt(t.email, 255).toLowerCase();
  if (email && !validarEmail(email)) erros.push('Titular: e-mail inválido.');
  const titular: Titular = {
    nome,
    dataNascimento: lerNascimento(t.dataNascimento, 'Titular', erros, true),
    genero: um(GENEROS, t.genero, 'nao_informar'),
    nacionalidade: txt(t.nacionalidade, 60) || 'Brasileira',
    tipoDocumento: tipo,
    documento: lerDocumento(tipo, String(t.documento ?? ''), 'Titular', erros, true),
    orgaoEmissor: txt(t.orgaoEmissor, 40),
    email,
    telefone: txt(t.telefone, 30),
    profissao: txt(t.profissao, 60),
    cidadeResidencia: txt(t.cidadeResidencia, 80),
    estadoResidencia: txt(t.estadoResidencia, 40),
    paisResidencia: txt(t.paisResidencia, 60) || 'Brasil',
    motivoViagem: um(MOTIVOS_VIAGEM, t.motivoViagem, 'lazer'),
    meioTransporte: um(MEIOS_TRANSPORTE, t.meioTransporte, 'automovel'),
    procedencia: txt(t.procedencia, 80),
    proximoDestino: txt(t.proximoDestino, 80),
  };
  if (!titular.cidadeResidencia) erros.push('Titular: informe a cidade onde mora.');

  const lista = Array.isArray(corpo.acompanhantes) ? corpo.acompanhantes.slice(0, 20) : [];
  if (lista.length > maxAcompanhantes) erros.push(`A reserva é para ${maxAcompanhantes + 1} pessoa(s): informe no máximo ${maxAcompanhantes} acompanhante(s).`);
  const acompanhantes: Acompanhante[] = lista
    .map((a) => a as Record<string, unknown>)
    .filter((a) => String(a.nome ?? '').trim())
    .map((a, i) => {
      const rotulo = `Acompanhante ${i + 1}`;
      const tipoA = um(TIPOS_DOC_FNRH, a.tipoDocumento, 'cpf');
      const nomeA = sanitizarNome(String(a.nome ?? ''));
      if (nomeA.length < 2) erros.push(`${rotulo}: informe o nome.`);
      return {
        nome: nomeA,
        dataNascimento: lerNascimento(a.dataNascimento, rotulo, erros, true),
        tipoDocumento: tipoA,
        // Criança pode não ter documento; adulto informa.
        documento: lerDocumento(tipoA, String(a.documento ?? ''), rotulo, erros, false),
        parentesco: txt(a.parentesco, 40),
      };
    });
  if (corpo.aceite !== true) erros.push('É preciso concordar com o envio dos dados à pousada.');
  return { ficha: { titular, acompanhantes }, erros };
}

/** Link do pré-check-in (cria o token na primeira vez). */
export async function linkDaReserva(reservaId: number, pousadaId: number): Promise<string | null> {
  const { rows: [r] } = await pool.query(
    `UPDATE reservas SET precheckin_token = COALESCE(precheckin_token, $3)
      WHERE id = $1 AND pousada_id = $2 AND deleted_at IS NULL RETURNING precheckin_token`,
    [reservaId, pousadaId, randomBytes(24).toString('hex')],
  );
  if (!r) return null;
  const base = (process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
  return `${base}/checkin/${r.precheckin_token}`;
}

async function reservaDoToken(token: string) {
  if (!/^[0-9a-f]{48}$/.test(token)) return null;
  const { rows: [r] } = await pool.query(
    `SELECT r.id, r.pousada_id, r.hospede_id, r.nome, r.quarto, r.data_entrada::text AS entrada, r.data_saida::text AS saida,
            r.status, r.adultos, r.criancas, p.nome AS pousada, p.cidade, p.estado, q.nome AS quarto_nome,
            (SELECT pc.enviado_em FROM precheckins pc WHERE pc.reserva_id = r.id) AS enviado_em
       FROM reservas r JOIN pousadas p ON p.id = r.pousada_id
       LEFT JOIN quartos q ON q.pousada_id = r.pousada_id AND q.numero = r.quarto
      WHERE r.precheckin_token = $1 AND r.deleted_at IS NULL AND p.excluida_em IS NULL`,
    [token],
  );
  return r ?? null;
}

const fechada = (r: { status: string; saida: string }) =>
  ['hospedada', 'finalizada', 'cancelada', 'no_show'].includes(r.status) || r.saida < hojeLocal();

/** O que a página pública mostra (sem dado pessoal além do primeiro nome). */
export async function resumoPublico(token: string) {
  const r = await reservaDoToken(token);
  if (!r) return null;
  return {
    pousada: r.pousada, cidade: r.cidade, estado: r.estado, quarto: r.quarto_nome ?? `Quarto ${r.quarto}`,
    entrada: r.entrada, saida: r.saida, adultos: r.adultos, criancas: r.criancas,
    primeiroNome: String(r.nome).split(' ')[0],
    enviado: Boolean(r.enviado_em), aberto: !fechada(r),
  };
}

export async function enviarFicha(token: string, corpo: Record<string, unknown>, ip: string | null) {
  const r = await reservaDoToken(token);
  if (!r) throw new PrecheckinRecusado('Link de pré-check-in inválido.', 404);
  if (fechada(r)) throw new PrecheckinRecusado('Este pré-check-in já foi encerrado. Fale com a pousada.', 409);
  const { ficha, erros } = lerFicha(corpo, Math.max(r.adultos + r.criancas - 1, 0));
  if (erros.length) throw Object.assign(new PrecheckinRecusado(erros[0]), { erros });

  await pool.query(
    `INSERT INTO precheckins (reserva_id, pousada_id, dados_cifrados, ip) VALUES ($1, $2, $3, $4)
     ON CONFLICT (reserva_id) DO UPDATE SET dados_cifrados = EXCLUDED.dados_cifrados, ip = EXCLUDED.ip, atualizado_em = now()`,
    [r.id, r.pousada_id, cifrarSegredo(JSON.stringify(ficha)), ip],
  );

  // A ficha completa o cadastro do hóspede (documento libera o check-in).
  const t = ficha.titular;
  const docCadastro = t.tipoDocumento === 'cpf' ? { tipoDocumento: 'cpf' as const, documento: t.documento }
    : t.tipoDocumento === 'passaporte' ? { tipoDocumento: 'passaporte' as const, documento: t.documento }
    : { tipoDocumento: 'outro' as const, documento: t.documento };
  const contato = {
    nome: t.nome,
    nacionalidade: t.nacionalidade,
    dataNascimento: t.dataNascimento,
    ...(t.email ? { email: t.email } : {}),
    ...(normalizarTelefone(t.telefone) ? { telefone: normalizarTelefone(t.telefone)! } : {}),
  };
  try {
    const hospede = await HospedeModel.resolver(r.pousada_id, { ...contato, ...docCadastro }, r.hospede_id);
    if (!r.hospede_id) await pool.query(`UPDATE reservas SET hospede_id = $2, nome = $3 WHERE id = $1`, [r.id, hospede.id, hospede.nome]);
  } catch (err) {
    // Documento de outro cadastro (ex.: reservou com o CPF de um familiar):
    // a ficha fica salva; o cadastro a recepção ajusta no balcão.
    console.warn(`[Pré-check-in] reserva ${r.id}: cadastro do hóspede não atualizado —`, (err as Error).message);
  }
  await pool.query(
    `INSERT INTO auditoria (user_id, action, entity, entity_id, details) VALUES (NULL, 'precheckin', 'reserva', $1, $2)`,
    [r.id, JSON.stringify({ acompanhantes: ficha.acompanhantes.length, ip })],
  );
  return { reservaId: r.id };
}

/** Ficha decifrada, para a recepção. */
export async function fichaDaReserva(reservaId: number, pousadaId: number) {
  const { rows: [pc] } = await pool.query(
    `SELECT dados_cifrados, enviado_em, atualizado_em FROM precheckins WHERE reserva_id = $1 AND pousada_id = $2`,
    [reservaId, pousadaId],
  );
  if (!pc) return null;
  return { ficha: JSON.parse(decifrarSegredo(pc.dados_cifrados)) as FichaFnrh, enviadoEm: pc.enviado_em, atualizadoEm: pc.atualizado_em };
}

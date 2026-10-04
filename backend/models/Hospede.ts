/**
 * Hóspede como cadastro (migration 018).
 *
 * Um hóspede por pessoa e pousada. O documento (CPF, passaporte...) é cifrado
 * e tem hash para busca exata e para não duplicar o cadastro. Sem documento
 * (reserva fechada pelo WhatsApp, antes de pedir o CPF), o mesmo nome com o
 * mesmo telefone é reconhecido como a mesma pessoa.
 */
import { and, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { db, hospedes, reservas, type Hospede } from '../db/index.js';
import {
  cifrarDocumento, decryptCpf, hashDocumento, normalizarDocumento, TIPOS_DOCUMENTO, type TipoDocumento,
} from '../utils/crypto.js';
import { mascararDocumento } from '../utils/pii.js';
import { sanitizarNome, sanitizarString, validarCPF, validarData, validarEmail } from '../utils/validation.js';

/** Postgres: unique_violation. */
const PG_UNIQUE_VIOLATION = '23505';

export const NOME_HOSPEDE_ANONIMIZADO = 'Hóspede anonimizado';

export interface DadosHospede {
  nome?: string;
  tipoDocumento?: TipoDocumento;
  /** Em claro; o model cifra. `null` apaga, `undefined` não mexe. */
  documento?: string | null;
  nacionalidade?: string | null;
  telefone?: string | null;
  email?: string | null;
  dataNascimento?: string | null;
  observacoes?: string | null;
}

/** Recusa por regra de negócio (a rota responde 409/404). */
export class HospedeRecusado extends Error {
  constructor(mensagem: string, readonly status: 404 | 409 = 409) {
    super(mensagem);
    this.name = 'HospedeRecusado';
  }
}

/** Hóspede com o documento já decifrado (nunca sai da API sem passar por `paraApi`). */
export type HospedeDecifrado = Omit<Hospede, 'documento' | 'documentoHash'> & { documento: string };

/**
 * Telefone com DDI, só dígitos (formato do wa.me): "+48 600 100 200" vira
 * "48600100200"; número sem "+" com 10–11 dígitos é brasileiro e ganha o 55.
 * Guardar sempre com DDI evita confundir o celular polonês com um DDD 48.
 */
export function normalizarTelefone(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const bruto = String(v).trim();
  let d = bruto.replace(/\D/g, '');
  if (!d) return null;
  if (bruto.startsWith('+')) return d;
  if (d.startsWith('00')) return d.slice(2);
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return d;
}

/**
 * Lê os campos do hóspede de um corpo de requisição. Aceita `cpf` (legado) ou
 * `documento` + `tipo_documento`. Só o que veio no corpo entra no resultado.
 */
export function lerDadosHospede(corpo: Record<string, unknown>): DadosHospede {
  const d: DadosHospede = {};
  if (corpo.nome !== undefined) d.nome = sanitizarNome(String(corpo.nome ?? ''));
  const tipo = String(corpo.tipo_documento ?? corpo.tipoDocumento ?? 'cpf');
  d.tipoDocumento = (TIPOS_DOCUMENTO as readonly string[]).includes(tipo) ? (tipo as TipoDocumento) : ('invalido' as TipoDocumento);
  const doc = corpo.documento ?? corpo.cpf;
  if (doc !== undefined) {
    const limpo = doc === null ? '' : normalizarDocumento(d.tipoDocumento === 'cpf' ? 'cpf' : 'outro', String(doc));
    d.documento = limpo || null;
  }
  if (corpo.telefone !== undefined) d.telefone = normalizarTelefone(corpo.telefone);
  if (corpo.email !== undefined) d.email = sanitizarString(String(corpo.email ?? ''), 255).toLowerCase() || null;
  if (corpo.nacionalidade !== undefined) d.nacionalidade = sanitizarString(String(corpo.nacionalidade ?? ''), 60) || null;
  const nasc = corpo.data_nascimento ?? corpo.dataNascimento;
  if (nasc !== undefined) d.dataNascimento = nasc ? String(nasc) : null;
  if (corpo.observacoes_hospede !== undefined) {
    d.observacoes = sanitizarString(String(corpo.observacoes_hospede ?? ''), 1000, true) || null;
  }
  return d;
}

/**
 * Erros de validação. `novo`: cadastro novo precisa de nome e de um jeito de
 * achar a pessoa depois (documento ou telefone).
 */
export function validarDadosHospede(d: DadosHospede, novo: boolean): string[] {
  const erros: string[] = [];
  if ((novo || d.nome !== undefined) && (!d.nome || d.nome.length < 2)) erros.push('Nome do hóspede deve ter pelo menos 2 letras');
  if (!(TIPOS_DOCUMENTO as readonly string[]).includes(d.tipoDocumento ?? 'cpf')) erros.push('Tipo de documento inválido (use cpf, passaporte ou outro)');
  if (d.documento) {
    if ((d.tipoDocumento ?? 'cpf') === 'cpf') {
      if (!validarCPF(d.documento)) erros.push('CPF inválido');
    } else if (d.documento.length < 5 || d.documento.length > 20) {
      erros.push('Documento deve ter de 5 a 20 letras ou números');
    }
  }
  if (d.telefone && (d.telefone.length < 10 || d.telefone.length > 15)) erros.push('Telefone inválido (DDD + número; estrangeiro com + e o código do país)');
  if (d.email && !validarEmail(d.email)) erros.push('E-mail inválido');
  if (d.dataNascimento && !validarData(d.dataNascimento)) erros.push('Data de nascimento inválida');
  if (novo && !d.documento && !d.telefone) erros.push('Informe o documento ou o telefone do hóspede');
  return erros;
}

function decifrar(h: Hospede): HospedeDecifrado {
  const { documento, documentoHash: _hash, ...resto } = h;
  if (!documento) return { ...resto, documento: '' };
  try {
    return { ...resto, documento: decryptCpf(documento) };
  } catch (err) {
    console.error(`[Hospede] Falha ao decifrar documento (id=${h.id}):`, err instanceof Error ? err.message : err);
    return { ...resto, documento: '[documento ilegível — verifique CPF_ENCRYPTION_KEY]' };
  }
}

/** Colunas a gravar a partir dos dados lidos (cifra o documento). */
function colunas(d: DadosHospede): Partial<typeof hospedes.$inferInsert> {
  const c: Partial<typeof hospedes.$inferInsert> = {};
  if (d.nome !== undefined) c.nome = d.nome;
  if (d.documento !== undefined) {
    const tipo = d.tipoDocumento ?? 'cpf';
    c.tipoDocumento = tipo;
    c.documento = d.documento ? cifrarDocumento(tipo, d.documento) : null;
    c.documentoHash = d.documento ? hashDocumento(tipo, d.documento) : null;
  }
  if (d.telefone !== undefined) c.telefone = d.telefone;
  if (d.email !== undefined) c.email = d.email;
  if (d.nacionalidade !== undefined) c.nacionalidade = d.nacionalidade;
  if (d.dataNascimento !== undefined) c.dataNascimento = d.dataNascimento;
  if (d.observacoes !== undefined) c.observacoes = d.observacoes;
  return c;
}

/** Só os campos de contato que vieram preenchidos (não apaga o que já existe). */
function preenchidos(d: DadosHospede): DadosHospede {
  return Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined && v !== null && v !== '')) as DadosHospede;
}

function ehUnicidade(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === PG_UNIQUE_VIOLATION || e?.cause?.code === PG_UNIQUE_VIOLATION;
}

export class HospedeModel {
  static paraApi(h: HospedeDecifrado, mascarar: boolean) {
    return {
      id: h.id,
      nome: h.nome,
      tipoDocumento: h.tipoDocumento,
      documento: mascarar ? mascararDocumento(h.documento, h.tipoDocumento) : h.documento,
      nacionalidade: h.nacionalidade,
      telefone: h.telefone,
      email: h.email,
      dataNascimento: h.dataNascimento,
      observacoes: h.observacoes,
      anonimizado: Boolean(h.anonimizadoEm),
      createdAt: h.createdAt,
    };
  }

  static async buscar(id: number, pousadaId: number): Promise<HospedeDecifrado | null> {
    const [h] = await db.select().from(hospedes).where(and(eq(hospedes.id, id), eq(hospedes.pousadaId, pousadaId))).limit(1);
    return h ? decifrar(h) : null;
  }

  static async porDocumento(pousadaId: number, tipo: TipoDocumento, documento: string): Promise<Hospede | null> {
    const [h] = await db
      .select()
      .from(hospedes)
      .where(and(eq(hospedes.pousadaId, pousadaId), eq(hospedes.documentoHash, hashDocumento(tipo, documento))))
      .limit(1);
    return h ?? null;
  }

  /**
   * Hóspede da reserva: o indicado por `hospedeId`, o dono do documento, ou o
   * mesmo nome + telefone; senão, um cadastro novo. Contato informado agora
   * completa o cadastro existente (nunca apaga o que já havia).
   */
  static async resolver(pousadaId: number, dados: DadosHospede, hospedeId?: number | null): Promise<HospedeDecifrado> {
    const tipo = dados.tipoDocumento ?? 'cpf';

    if (hospedeId) {
      const atual = await this.buscar(hospedeId, pousadaId);
      if (!atual) throw new HospedeRecusado('Hóspede não encontrado nesta pousada.', 404);
      if (dados.documento) {
        const dono = await this.porDocumento(pousadaId, tipo, dados.documento);
        if (dono && dono.id !== hospedeId) {
          throw new HospedeRecusado(`Este documento já pertence a outro hóspede (${dono.nome}).`);
        }
      }
      const mudar = preenchidos(dados);
      if (mudar.documento) mudar.tipoDocumento = tipo;
      return Object.keys(mudar).length > 0 ? (await this.atualizar(hospedeId, pousadaId, mudar))! : atual;
    }

    if (dados.documento) {
      const existente = await this.porDocumento(pousadaId, tipo, dados.documento);
      if (existente) {
        const { documento: _doc, tipoDocumento: _tipo, ...contato } = preenchidos(dados);
        return Object.keys(contato).length > 0 ? (await this.atualizar(existente.id, pousadaId, contato))! : decifrar(existente);
      }
    } else if (dados.telefone && dados.nome) {
      const [mesmo] = await db
        .select()
        .from(hospedes)
        .where(and(
          eq(hospedes.pousadaId, pousadaId),
          eq(hospedes.telefone, dados.telefone),
          sql`lower(${hospedes.nome}) = lower(${dados.nome})`,
          isNull(hospedes.anonimizadoEm),
        ))
        .limit(1);
      if (mesmo) {
        const { documento: _doc, tipoDocumento: _tipo, ...contato } = preenchidos(dados);
        return (await this.atualizar(mesmo.id, pousadaId, contato))!;
      }
    }

    try {
      const [novo] = await db
        .insert(hospedes)
        .values({ pousadaId, nome: dados.nome ?? '', tipoDocumento: tipo, ...colunas(dados) })
        .returning();
      return decifrar(novo);
    } catch (err) {
      // Duas reservas simultâneas do mesmo documento: quem perde usa o cadastro do outro.
      if (ehUnicidade(err) && dados.documento) {
        const existente = await this.porDocumento(pousadaId, tipo, dados.documento);
        if (existente) return decifrar(existente);
      }
      throw err;
    }
  }

  /** Atualiza o cadastro; o nome novo vale também nas reservas dele. */
  static async atualizar(id: number, pousadaId: number, dados: DadosHospede): Promise<HospedeDecifrado | null> {
    if (dados.documento) {
      const dono = await this.porDocumento(pousadaId, dados.tipoDocumento ?? 'cpf', dados.documento);
      if (dono && dono.id !== id) throw new HospedeRecusado(`Este documento já pertence a outro hóspede (${dono.nome}).`);
    }
    let h: Hospede | undefined;
    try {
      [h] = await db
        .update(hospedes)
        .set({ ...colunas(dados), updatedAt: new Date() })
        .where(and(eq(hospedes.id, id), eq(hospedes.pousadaId, pousadaId)))
        .returning();
    } catch (err) {
      if (ehUnicidade(err)) throw new HospedeRecusado('Este documento já pertence a outro hóspede.');
      throw err;
    }
    if (!h) return null;
    if (dados.nome) {
      await db.update(reservas).set({ nome: dados.nome }).where(and(eq(reservas.hospedeId, id), eq(reservas.pousadaId, pousadaId)));
    }
    return decifrar(h);
  }

  /**
   * Lista com busca por nome, telefone ou documento exato, e o resumo de
   * cada um (estadias, última vinda, quanto já gastou). Documento mascarado.
   */
  static async listar(pousadaId: number, opcoes: { busca?: string; pagina?: number; limite?: number } = {}) {
    const pagina = Math.max(opcoes.pagina ?? 1, 1);
    const limite = Math.min(Math.max(opcoes.limite ?? 50, 1), 200);
    const condicoes = [eq(hospedes.pousadaId, pousadaId)];
    const busca = opcoes.busca?.trim();
    if (busca) {
      const digitos = busca.replace(/\D/g, '');
      const alvos = [ilike(hospedes.nome, `%${busca}%`)];
      if (digitos.length >= 4) alvos.push(sql`${hospedes.telefone} LIKE ${'%' + digitos + '%'}`);
      if (digitos.length === 11) alvos.push(eq(hospedes.documentoHash, hashDocumento('cpf', digitos)));
      const alfanum = normalizarDocumento('outro', busca);
      if (alfanum.length >= 5) {
        alvos.push(eq(hospedes.documentoHash, hashDocumento('passaporte', alfanum)));
        alvos.push(eq(hospedes.documentoHash, hashDocumento('outro', alfanum)));
      }
      condicoes.push(or(...alvos)!);
    }

    // `hospedes.id` escrito por extenso: interpolado, o Drizzle omite a tabela
    // numa consulta de uma tabela só, e dentro da subconsulta "id" viraria r.id.
    const daPessoa = sql.raw(`FROM reservas r WHERE r.hospede_id = hospedes.id AND r.deleted_at IS NULL AND r.status NOT IN ('cancelada','no_show')`);
    const estadias = sql<number>`(SELECT count(*)::int ${daPessoa})`;
    const ultima = sql<string | null>`(SELECT max(r.data_entrada)::text ${daPessoa})`;
    const gasto = sql<string>`(SELECT COALESCE(sum(r.valor), 0)::text ${daPessoa})`;

    const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(hospedes).where(and(...condicoes));
    const linhas = await db
      .select({ h: hospedes, estadias, ultima, gasto })
      .from(hospedes)
      .where(and(...condicoes))
      .orderBy(sql`${ultima} DESC NULLS LAST`, desc(hospedes.createdAt))
      .limit(limite)
      .offset((pagina - 1) * limite);

    return {
      total: Number(total) || 0,
      pagina,
      limite,
      hospedes: linhas.map(({ h, estadias: n, ultima: u, gasto: g }) => ({
        ...this.paraApi(decifrar(h), true),
        estadias: Number(n) || 0,
        ultimaEstadia: u,
        totalGasto: Number(g) || 0,
      })),
    };
  }

  /** Reservas do hóspede, da mais recente para a mais antiga. */
  static async historico(id: number, pousadaId: number) {
    return db
      .select({
        id: reservas.id,
        quarto: reservas.quarto,
        dataEntrada: reservas.dataEntrada,
        dataSaida: reservas.dataSaida,
        status: reservas.status,
        valor: reservas.valor,
        pago: reservas.pago,
        canal: reservas.canal,
        adultos: reservas.adultos,
        criancas: reservas.criancas,
      })
      .from(reservas)
      .where(and(eq(reservas.hospedeId, id), eq(reservas.pousadaId, pousadaId), isNull(reservas.deletedAt)))
      .orderBy(desc(reservas.dataEntrada))
      .limit(200);
  }
}

export default HospedeModel;

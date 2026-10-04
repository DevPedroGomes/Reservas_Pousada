import { eq, and, or, gt, gte, lt, lte, ne, ilike, sql, count, isNull, inArray, SQL } from 'drizzle-orm';
import { db, hospedes, reservas, user } from '../db/index.js';
import type { Reserva, NewReserva } from '../db/schema.js';
import { decryptCpf, hashCpf, hashDocumento, normalizarDocumento } from '../utils/crypto.js';
import { mascararDocumento } from '../utils/pii.js';
import { CPF_ANONIMIZADO } from './Conta.js';
import { STATUS_QUE_OCUPAM } from '../utils/status.js';

/** Postgres: exclusion_violation — a constraint anti-overbooking barrou o write. */
const PG_EXCLUSION_VIOLATION = '23P01';

/**
 * O que se mostra de uma reserva que conflita com outra. Só o necessário para
 * a recepção entender o choque de datas — nunca CPF, valor ou observações de
 * outro hóspede (antes a linha inteira ia na resposta, com CPF cifrado e hash).
 */
export interface ConflitoResumo {
  id: number;
  nome: string;
  quarto: number;
  dataEntrada: string;
  dataSaida: string;
  status: string;
}

export class ConflitoDeReserva extends Error {
  readonly code = 'QUARTO_INDISPONIVEL';
  conflitos: ConflitoResumo[];
  constructor(conflitos: ConflitoResumo[] = []) {
    super('Quarto não disponível para o período selecionado');
    this.name = 'ConflitoDeReserva';
    this.conflitos = conflitos;
  }
}

function ehViolacaoDeExclusao(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === PG_EXCLUSION_VIOLATION;
}

interface ListarOptions {
  /**
   * CPF completo na resposta. Padrão: mascarado — a listagem nunca precisa do
   * número inteiro, e devolvê-lo a todo papel tornava a máscara do CSV inútil
   * (bastava paginar a API). Só a exportação de admin/dono pede completo.
   */
  cpfCompleto?: boolean;
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  pago?: boolean;
  data_inicio?: string;
  data_fim?: string;
  pousada_id: number;
}

/**
 * Reserva como sai do model: com o hóspede (documento decifrado, contato) e o
 * nome de quem criou. `cpf` continua existindo para quem lê a API antiga:
 * é o documento quando ele é CPF, senão vazio.
 */
export interface ReservaComCriador extends Omit<Reserva, 'cpf' | 'cpfHash' | 'icalUid' | 'lembreteEnviadoEm' | 'precheckinToken'> {
  /** Quando o hóspede enviou a ficha de pré-check-in (null se não enviou). */
  precheckinEm?: Date | null;
  criadoPorNome?: string | null;
  documento: string;
  tipoDocumento: string;
  cpf: string;
  telefone: string | null;
  email: string | null;
  nacionalidade: string | null;
}

/**
 * Carimbos de cada transição: quando entrou, saiu, foi cancelada. Voltar um
 * passo (desfazer check-out, reativar) limpa o carimbo correspondente.
 */
export function camposDaTransicao(status: string, extra: { motivo?: string | null; expiraEm?: Date | null } = {}) {
  const agora = new Date();
  switch (status) {
    case 'pre_reserva':
      return { expiraEm: extra.expiraEm ?? null, canceladaEm: null, motivoCancelamento: null };
    case 'confirmada':
      return { expiraEm: null, checkInEm: null, canceladaEm: null, motivoCancelamento: null };
    case 'hospedada':
      return { expiraEm: null, checkInEm: sql`COALESCE(${reservas.checkInEm}, now())`, checkOutEm: null };
    case 'finalizada':
      return { checkOutEm: agora };
    case 'cancelada':
      return { canceladaEm: agora, motivoCancelamento: extra.motivo ?? null, expiraEm: null };
    default:
      return {};
  }
}

/**
 * Colunas devolvidas pelas consultas de reserva (com o nome de quem criou).
 * Uma lista só: antes eram três cópias, e campo novo esquecido numa delas
 * sumia daquela tela.
 */
const CAMPOS_RESERVA = {
  id: reservas.id,
  pousadaId: reservas.pousadaId,
  nome: reservas.nome,
  hospedeId: reservas.hospedeId,
  // Documento do cadastro do hóspede; reserva antiga sem cadastro cai na coluna legada.
  documentoCifrado: sql<string | null>`COALESCE(${hospedes.documento}, ${reservas.cpf})`,
  tipoDocumento: sql<string>`COALESCE(${hospedes.tipoDocumento}, 'cpf')`,
  telefone: hospedes.telefone,
  email: hospedes.email,
  nacionalidade: hospedes.nacionalidade,
  adultos: reservas.adultos,
  criancas: reservas.criancas,
  canal: reservas.canal,
  // Veio do calendário de uma OTA (migration 021): datas mandadas por ela.
  icalImportacaoId: reservas.icalImportacaoId,
  // Conta (migration 019): quanto entrou e quanto foi consumido além das diárias.
  pagoCentavos: sql<number>`(SELECT COALESCE(sum(p.valor_centavos), 0)::int FROM pagamentos p WHERE p.reserva_id = "reservas"."id")`,
  consumosCentavos: sql<number>`(SELECT COALESCE(sum(c.quantidade * c.valor_unitario_centavos), 0)::int FROM consumos c WHERE c.reserva_id = "reservas"."id")`,
  // Pré-check-in (migration 024): quando a ficha chegou.
  precheckinEm: sql<Date | null>`(SELECT pc.enviado_em FROM precheckins pc WHERE pc.reserva_id = "reservas"."id")`,
  quarto: reservas.quarto,
  dataEntrada: reservas.dataEntrada,
  dataSaida: reservas.dataSaida,
  status: reservas.status,
  valor: reservas.valor,
  pago: reservas.pago,
  observacoes: reservas.observacoes,
  criadoPor: reservas.criadoPor,
  version: reservas.version,
  expiraEm: reservas.expiraEm,
  checkInEm: reservas.checkInEm,
  checkOutEm: reservas.checkOutEm,
  canceladaEm: reservas.canceladaEm,
  motivoCancelamento: reservas.motivoCancelamento,
  deletedAt: reservas.deletedAt,
  createdAt: reservas.createdAt,
  updatedAt: reservas.updatedAt,
  criadoPorNome: user.name,
};

/** SELECT padrão: reserva + hóspede + quem criou. */
function selecionarReservas() {
  return db
    .select(CAMPOS_RESERVA)
    .from(reservas)
    .leftJoin(hospedes, eq(reservas.hospedeId, hospedes.id))
    .leftJoin(user, eq(reservas.criadoPor, user.id));
}

type LinhaReserva = Awaited<ReturnType<typeof selecionarReservas>>[number];

export class ReservaModel {
  /**
   * Decifra o documento da linha lida com CAMPOS_RESERVA. Falha de decifra
   * aparece na tela e no log, sem derrubar a listagem por causa de uma linha.
   */
  private static decifrar(linha: LinhaReserva): ReservaComCriador {
    const { documentoCifrado, ...resto } = linha;
    let documento = '';
    // Hóspede anonimizado pela política de retenção: não há documento a decifrar.
    if (documentoCifrado && documentoCifrado !== CPF_ANONIMIZADO) {
      try {
        documento = decryptCpf(documentoCifrado);
      } catch (err) {
        console.error(
          `[Reserva] Falha ao decifrar documento (id=${linha.id}):`,
          err instanceof Error ? err.message : err,
        );
        documento = '[documento ilegível — verifique CPF_ENCRYPTION_KEY]';
      }
    }
    return { ...resto, documento, cpf: resto.tipoDocumento === 'cpf' ? documento : '' };
  }

  /** Forma pública da reserva; com `mascarar`, documento e CPF mascarados. */
  static paraApi(r: ReservaComCriador, mascarar: boolean): ReservaComCriador {
    if (!mascarar) return r;
    const documento = mascararDocumento(r.documento, r.tipoDocumento);
    return { ...r, documento, cpf: r.tipoDocumento === 'cpf' ? documento : '' };
  }

  /**
   * List all reservations with filters and pagination
   */
  static async listarTodas(options: ListarOptions): Promise<{ data: ReservaComCriador[]; count: number }> {
    const { page = 1, limit = 50, search, status, pago, data_inicio, data_fim, pousada_id, cpfCompleto = false } = options;

    if (!pousada_id) {
      throw new Error('pousada_id é obrigatório');
    }

    const offset = (page - 1) * limit;

    // Build where conditions (always exclude soft-deleted)
    const conditions = [eq(reservas.pousadaId, pousada_id), isNull(reservas.deletedAt)];

    if (status) {
      conditions.push(eq(reservas.status, status));
    }

    if (pago !== undefined && pago !== null) {
      conditions.push(eq(reservas.pago, pago));
    }

    if (data_inicio && data_fim) {
      conditions.push(
        or(
          and(gte(reservas.dataEntrada, data_inicio), lte(reservas.dataEntrada, data_fim)),
          and(gte(reservas.dataSaida, data_inicio), lte(reservas.dataSaida, data_fim)),
          and(lte(reservas.dataEntrada, data_inicio), gte(reservas.dataSaida, data_fim))
        )!
      );
    }

    if (search) {
      const searchPattern = `%${search}%`;
      const searchDigits = search.replace(/[^\d]/g, '');

      // Documento só é pesquisável por igualdade exata, via HMAC. Busca parcial
      // é impossível por construção — a coluna guarda ciphertext.
      const alvos = [
        ilike(reservas.nome, searchPattern),
        sql`${reservas.quarto}::text = ${search}`,
      ];
      if (searchDigits.length >= 4) {
        alvos.push(sql`${hospedes.telefone} LIKE ${'%' + searchDigits + '%'}`);
      }
      if (searchDigits.length === 11) {
        alvos.push(eq(hospedes.documentoHash, hashCpf(searchDigits)), eq(reservas.cpfHash, hashCpf(searchDigits)));
      }
      const alfanum = normalizarDocumento('outro', search);
      if (alfanum.length >= 5 && /[A-Z]/.test(alfanum)) {
        alvos.push(eq(hospedes.documentoHash, hashDocumento('passaporte', alfanum)));
      }

      conditions.push(or(...alvos)!);
    }

    // Get total count
    const [countResult] = await db
      .select({ count: count() })
      .from(reservas)
      .leftJoin(hospedes, eq(reservas.hospedeId, hospedes.id))
      .where(and(...conditions));

    const data = await selecionarReservas()
      .where(and(...conditions))
      .orderBy(reservas.dataEntrada)
      .limit(limit)
      .offset(offset);

    return {
      data: data.map((r) => this.paraApi(this.decifrar(r), !cpfCompleto)),
      count: countResult?.count || 0,
    };
  }

  /**
   * Find reservation by ID
   */
  static async buscarPorId(id: number): Promise<ReservaComCriador | null> {
    const [result] = await selecionarReservas()
      .where(and(eq(reservas.id, id), isNull(reservas.deletedAt)))
      .limit(1);

    return result ? this.decifrar(result) : null;
  }

  /**
   * Find reservation by ID and pousada (ensures tenant isolation)
   */
  static async buscarPorIdEPousada(id: number, pousadaId: number): Promise<ReservaComCriador | null> {
    const [result] = await selecionarReservas()
      .where(and(eq(reservas.id, id), eq(reservas.pousadaId, pousadaId), isNull(reservas.deletedAt)))
      .limit(1);

    return result ? this.decifrar(result) : null;
  }

  /**
   * Consulta de disponibilidade (informativa).
   *
   * Intervalo SEMIABERTO `[entrada, saída)`: a diária de saída não é ocupada,
   * então quem sai dia 12 libera o quarto para quem entra dia 12. O predicado
   * anterior era fechado dos dois lados e bloqueava exatamente o caso mais
   * comum de uma pousada em alta temporada (troca de hóspede no mesmo dia).
   *
   * IMPORTANTE: isto NÃO é a garantia contra overbooking — é só a checagem
   * amigável para dar mensagem boa ao usuário. A garantia real é a constraint
   * EXCLUDE no banco (migration 009), que é imune a concorrência.
   */
  static async verificarDisponibilidade(
    quarto: number,
    dataEntrada: string,
    dataSaida: string,
    reservaIdExcluir: number | null = null,
    pousadaId: number
  ): Promise<{ disponivel: boolean; conflitos: ConflitoResumo[] }> {
    const conditions = [
      eq(reservas.quarto, quarto),
      inArray(reservas.status, [...STATUS_QUE_OCUPAM]),
      eq(reservas.pousadaId, pousadaId),
      isNull(reservas.deletedAt),
      // Sobreposição de [a,b) com [c,d)  <=>  a < d AND b > c
      lt(reservas.dataEntrada, dataSaida),
      gt(reservas.dataSaida, dataEntrada),
    ];

    if (reservaIdExcluir) {
      conditions.push(ne(reservas.id, reservaIdExcluir));
    }

    const conflitos = await db
      .select({
        id: reservas.id,
        nome: reservas.nome,
        quarto: reservas.quarto,
        dataEntrada: reservas.dataEntrada,
        dataSaida: reservas.dataSaida,
        status: reservas.status,
      })
      .from(reservas)
      .where(and(...conditions));

    return {
      disponivel: conflitos.length === 0,
      conflitos,
    };
  }

  /**
   * Cria a reserva (o hóspede já resolvido em `hospedeId`).
   */
  static async criar(reserva: NewReserva & { hospedeId: number }): Promise<ReservaComCriador> {
    // Duplo clique: mesmo hóspede, quarto e datas nos últimos 30s devolve a existente.
    const [duplicate] = await db
      .select({ id: reservas.id })
      .from(reservas)
      .where(and(
        eq(reservas.hospedeId, reserva.hospedeId),
        eq(reservas.quarto, reserva.quarto),
        eq(reservas.dataEntrada, reserva.dataEntrada),
        eq(reservas.dataSaida, reserva.dataSaida),
        eq(reservas.pousadaId, reserva.pousadaId),
        isNull(reservas.deletedAt),
        gte(reservas.createdAt, new Date(Date.now() - 30_000)),
      ))
      .limit(1);

    if (duplicate) {
      // Return existing instead of creating duplicate
      return (await this.buscarPorId(duplicate.id))!;
    }

    // Checagem prévia — só para devolver a lista de conflitos numa mensagem útil.
    const disponibilidade = await this.verificarDisponibilidade(
      reserva.quarto,
      reserva.dataEntrada,
      reserva.dataSaida,
      null,
      reserva.pousadaId
    );

    if (!disponibilidade.disponivel) {
      throw new ConflitoDeReserva(disponibilidade.conflitos);
    }

    try {
      const [created] = await db
        .insert(reservas)
        .values({ ...reserva, cpf: null, cpfHash: null })
        .returning({ id: reservas.id });

      return (await this.buscarPorId(created.id))!;
    } catch (err) {
      // Duas requisições simultâneas podem passar as duas pela checagem acima.
      // Quem perde a corrida esbarra na constraint EXCLUDE e cai aqui — que é
      // exatamente o ponto: o banco é a autoridade, não a aplicação.
      if (ehViolacaoDeExclusao(err)) {
        const { conflitos } = await this.verificarDisponibilidade(
          reserva.quarto, reserva.dataEntrada, reserva.dataSaida, null, reserva.pousadaId,
        );
        throw new ConflitoDeReserva(conflitos);
      }
      throw err;
    }
  }

  /**
   * Update a reservation (with optimistic locking)
   */
  static async atualizar(id: number, reserva: Partial<NewReserva>, pousadaId: number, version?: number): Promise<{ changes: number; id: number }> {
    // If updating room or dates, check availability
    if (reserva.quarto || reserva.dataEntrada || reserva.dataSaida) {
      const existing = await this.buscarPorIdEPousada(id, pousadaId);
      if (!existing) {
        throw new Error('Reserva não encontrada');
      }

      const disponibilidade = await this.verificarDisponibilidade(
        reserva.quarto || existing.quarto,
        reserva.dataEntrada || existing.dataEntrada,
        reserva.dataSaida || existing.dataSaida,
        id,
        pousadaId
      );

      if (!disponibilidade.disponivel) {
        throw new ConflitoDeReserva(disponibilidade.conflitos);
      }
    }

    // O documento mora no hóspede: trocar de hóspede limpa a coluna legada.
    const updateData: Record<string, unknown> = { ...reserva };
    if (reserva.hospedeId) {
      updateData.cpf = null;
      updateData.cpfHash = null;
    }

    const conditions: SQL[] = [eq(reservas.id, id), eq(reservas.pousadaId, pousadaId)];
    if (version !== undefined) {
      conditions.push(eq(reservas.version, version));
    }

    let result;
    try {
      result = await db
        .update(reservas)
        .set({
          ...updateData,
          version: sql`${reservas.version} + 1`,
          updatedAt: new Date(),
        })
        .where(and(...conditions));
    } catch (err) {
      if (ehViolacaoDeExclusao(err)) {
        const existente = await this.buscarPorIdEPousada(id, pousadaId);
        const { conflitos } = await this.verificarDisponibilidade(
          reserva.quarto ?? existente?.quarto ?? 0,
          reserva.dataEntrada ?? existente?.dataEntrada ?? '',
          reserva.dataSaida ?? existente?.dataSaida ?? '',
          id,
          pousadaId,
        );
        throw new ConflitoDeReserva(conflitos);
      }
      throw err;
    }

    if (result.rowCount === 0 && version !== undefined) {
      // Check if the record exists to distinguish "not found" from "version conflict"
      const exists = await this.buscarPorIdEPousada(id, pousadaId);
      if (exists) {
        const error = new Error('Conflito de versão: esta reserva foi alterada por outro usuário') as Error & { code?: string };
        error.code = 'VERSION_CONFLICT';
        throw error;
      }
    }

    return {
      changes: result.rowCount || 0,
      id,
    };
  }

  /**
   * Update reservation status (with optimistic locking)
   */
  static async atualizarStatus(
    id: number,
    status: string,
    pousadaId: number,
    version?: number,
    extra: { motivo?: string | null; expiraEm?: Date | null } = {},
  ): Promise<{ changes: number; id: number; status: string }> {
    const conditions: SQL[] = [eq(reservas.id, id), eq(reservas.pousadaId, pousadaId)];
    if (version !== undefined) {
      conditions.push(eq(reservas.version, version));
    }

    let result;
    try {
      result = await db
        .update(reservas)
        .set({
          status,
          ...camposDaTransicao(status, extra),
          version: sql`${reservas.version} + 1`,
          updatedAt: new Date(),
        })
        .where(and(...conditions));
    } catch (err) {
      // Reativar uma reserva cancelada cujo período já foi ocupado por outra
      // esbarra na constraint — é conflito legítimo, não erro interno.
      if (ehViolacaoDeExclusao(err)) {
        const existente = await this.buscarPorIdEPousada(id, pousadaId);
        const { conflitos } = existente
          ? await this.verificarDisponibilidade(
              existente.quarto, existente.dataEntrada, existente.dataSaida, id, pousadaId,
            )
          : { conflitos: [] as ConflitoResumo[] };
        throw new ConflitoDeReserva(conflitos);
      }
      throw err;
    }

    if (result.rowCount === 0 && version !== undefined) {
      const exists = await this.buscarPorIdEPousada(id, pousadaId);
      if (exists) {
        const error = new Error('Conflito de versão: esta reserva foi alterada por outro usuário') as Error & { code?: string };
        error.code = 'VERSION_CONFLICT';
        throw error;
      }
    }

    return {
      changes: result.rowCount || 0,
      id,
      status,
    };
  }

  /**
   * Soft delete a reservation (sets deletedAt instead of removing)
   */
  static async excluir(id: number, pousadaId: number): Promise<{ changes: number }> {
    const result = await db
      .update(reservas)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(reservas.id, id), eq(reservas.pousadaId, pousadaId), isNull(reservas.deletedAt)));

    return { changes: result.rowCount || 0 };
  }

  /**
   * Agenda de um dia: chegadas, saídas, quem está hospedado e as próximas
   * chegadas. É o que a recepção abre de manhã.
   *
   * Substitui o "próximas reservas" antigo, que era calculado no navegador a
   * partir da primeira página da listagem (ordenada da mais antiga): passadas
   * 50 reservas, o painel mostrava estadias do ano anterior.
   */
  static async agenda(pousadaId: number, dia: string, diasAFrente: number) {
    const campos = {
      id: reservas.id,
      nome: reservas.nome,
      quarto: reservas.quarto,
      dataEntrada: reservas.dataEntrada,
      dataSaida: reservas.dataSaida,
      valor: reservas.valor,
      pago: reservas.pago,
      status: reservas.status,
      // WhatsApp do hóspede: a agenda tem o botão de mensagem pronta.
      telefone: hospedes.telefone,
      // Para o {saldo} da mensagem bater com a conta.
      pagoCentavos: CAMPOS_RESERVA.pagoCentavos,
      consumosCentavos: CAMPOS_RESERVA.consumosCentavos,
      precheckinEm: CAMPOS_RESERVA.precheckinEm,
    };
    const base = [eq(reservas.pousadaId, pousadaId), inArray(reservas.status, [...STATUS_QUE_OCUPAM]), isNull(reservas.deletedAt)];
    const lista = () => db.select(campos).from(reservas).leftJoin(hospedes, eq(reservas.hospedeId, hospedes.id));
    const ate = sql`(${dia}::date + ${diasAFrente}::int)`;

    const [chegadas, saidas, hospedados, proximas] = await Promise.all([
      lista().where(and(...base, eq(reservas.dataEntrada, dia))).orderBy(reservas.quarto),
      lista().where(and(...base, eq(reservas.dataSaida, dia))).orderBy(reservas.quarto),
      lista()
        // Pré-reserva segura o quarto, mas ninguém está hospedado nela.
        .where(and(...base, ne(reservas.status, 'pre_reserva'), lte(reservas.dataEntrada, dia), gt(reservas.dataSaida, dia)))
        .orderBy(reservas.quarto),
      lista()
        .where(and(...base, gt(reservas.dataEntrada, dia), sql`${reservas.dataEntrada} <= ${ate}`))
        .orderBy(reservas.dataEntrada, reservas.quarto)
        .limit(50),
    ]);

    return { dia, chegadas, saidas, hospedados, proximas };
  }

  /**
   * Mapa de ocupação: reservas que tocam o período [inicio, fim) — inclusive
   * as já finalizadas, para ver a semana que passou. Cancelada e no-show não
   * ocupam o quarto e ficam de fora.
   */
  static async mapa(pousadaId: number, inicio: string, fim: string) {
    return db
      .select({
        id: reservas.id,
        quarto: reservas.quarto,
        nome: reservas.nome,
        dataEntrada: reservas.dataEntrada,
        dataSaida: reservas.dataSaida,
        status: reservas.status,
        pago: reservas.pago,
        adultos: reservas.adultos,
        criancas: reservas.criancas,
        canal: reservas.canal,
      })
      .from(reservas)
      .where(and(
        eq(reservas.pousadaId, pousadaId),
        isNull(reservas.deletedAt),
        inArray(reservas.status, [...STATUS_QUE_OCUPAM, 'finalizada']),
        lt(reservas.dataEntrada, fim),
        gt(reservas.dataSaida, inicio),
      ))
      .orderBy(reservas.quarto, reservas.dataEntrada);
  }
}

export default ReservaModel;

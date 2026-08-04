import { eq, and, or, gt, gte, lt, lte, ne, ilike, sql, count, isNull, SQL } from 'drizzle-orm';
import { db, reservas, user } from '../db/index.js';
import type { Reserva, NewReserva } from '../db/schema.js';
import { encryptCpf, decryptCpf, hashCpf } from '../utils/crypto.js';

/** Postgres: exclusion_violation — a constraint anti-overbooking barrou o write. */
const PG_EXCLUSION_VIOLATION = '23P01';

export class ConflitoDeReserva extends Error {
  readonly code = 'QUARTO_INDISPONIVEL';
  conflitos: Reserva[];
  constructor(conflitos: Reserva[] = []) {
    super('Quarto não disponível para o período selecionado');
    this.name = 'ConflitoDeReserva';
    this.conflitos = conflitos;
  }
}

function ehViolacaoDeExclusao(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === PG_EXCLUSION_VIOLATION;
}

interface ListarOptions {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  pago?: boolean;
  data_inicio?: string;
  data_fim?: string;
  pousada_id: number;
}

interface ReservaComCriador extends Reserva {
  criadoPorNome?: string | null;
}

export class ReservaModel {
  /**
   * Decrypt CPF in a reservation result (gracefully handles unencrypted CPFs)
   */
  private static decryptResult<T extends { cpf: string }>(result: T): T {
    try {
      return { ...result, cpf: decryptCpf(result.cpf) };
    } catch (err) {
      // Antes isto devolvia o ciphertext como se fosse o CPF e ninguém ficava
      // sabendo. Agora falha de forma visível (na tela e no log) sem derrubar a
      // listagem inteira por causa de uma linha ruim.
      console.error(
        `[Reserva] Falha ao decifrar CPF (id=${(result as { id?: number }).id ?? '?'}):`,
        err instanceof Error ? err.message : err,
      );
      return { ...result, cpf: '[CPF ilegível — verifique CPF_ENCRYPTION_KEY]' };
    }
  }

  private static decryptResults<T extends { cpf: string }>(results: T[]): T[] {
    return results.map(r => this.decryptResult(r));
  }

  /**
   * Cifra o CPF e gera o hash de busca.
   *
   * Deliberadamente sem try/catch: se a chave não estiver configurada, isto
   * LANÇA. Antes, o catch devolvia null e o insert seguia gravando o CPF em
   * TEXTO PURO, em silêncio. O boot também valida a chave (assertCpfCrypto-
   * Configurada), então este caminho só é alcançável se a chave for removida
   * com o processo já no ar.
   */
  private static encryptCpfData(cpf: string): { cpf: string; cpfHash: string } {
    return { cpf: encryptCpf(cpf), cpfHash: hashCpf(cpf) };
  }

  /**
   * List all reservations with filters and pagination
   */
  static async listarTodas(options: ListarOptions): Promise<{ data: ReservaComCriador[]; count: number }> {
    const { page = 1, limit = 50, search, status, pago, data_inicio, data_fim, pousada_id } = options;

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

      // CPF só é pesquisável por igualdade exata, via HMAC. Busca parcial é
      // impossível por construção — a coluna guarda ciphertext, e o `ilike`
      // que existia aqui nunca casava com nada (falhava em silêncio).
      const alvos = [
        ilike(reservas.nome, searchPattern),
        sql`${reservas.quarto}::text = ${search}`,
      ];
      if (searchDigits.length === 11) {
        alvos.push(eq(reservas.cpfHash, hashCpf(searchDigits)));
      }

      conditions.push(or(...alvos)!);
    }

    // Get total count
    const [countResult] = await db
      .select({ count: count() })
      .from(reservas)
      .where(and(...conditions));

    // Get data with creator name
    const data = await db
      .select({
        id: reservas.id,
        pousadaId: reservas.pousadaId,
        nome: reservas.nome,
        cpf: reservas.cpf,
        cpfHash: reservas.cpfHash,
        quarto: reservas.quarto,
        dataEntrada: reservas.dataEntrada,
        dataSaida: reservas.dataSaida,
        status: reservas.status,
        valor: reservas.valor,
        pago: reservas.pago,
        observacoes: reservas.observacoes,
        criadoPor: reservas.criadoPor,
        version: reservas.version,
        deletedAt: reservas.deletedAt,
        createdAt: reservas.createdAt,
        updatedAt: reservas.updatedAt,
        criadoPorNome: user.name,
      })
      .from(reservas)
      .leftJoin(user, eq(reservas.criadoPor, user.id))
      .where(and(...conditions))
      .orderBy(reservas.dataEntrada)
      .limit(limit)
      .offset(offset);

    return {
      data: this.decryptResults(data),
      count: countResult?.count || 0,
    };
  }

  /**
   * Find reservation by ID
   */
  static async buscarPorId(id: number): Promise<ReservaComCriador | null> {
    const [result] = await db
      .select({
        id: reservas.id,
        pousadaId: reservas.pousadaId,
        nome: reservas.nome,
        cpf: reservas.cpf,
        cpfHash: reservas.cpfHash,
        quarto: reservas.quarto,
        dataEntrada: reservas.dataEntrada,
        dataSaida: reservas.dataSaida,
        status: reservas.status,
        valor: reservas.valor,
        pago: reservas.pago,
        observacoes: reservas.observacoes,
        criadoPor: reservas.criadoPor,
        version: reservas.version,
        deletedAt: reservas.deletedAt,
        createdAt: reservas.createdAt,
        updatedAt: reservas.updatedAt,
        criadoPorNome: user.name,
      })
      .from(reservas)
      .leftJoin(user, eq(reservas.criadoPor, user.id))
      .where(and(eq(reservas.id, id), isNull(reservas.deletedAt)))
      .limit(1);

    return result ? this.decryptResult(result) : null;
  }

  /**
   * Find reservation by ID and pousada (ensures tenant isolation)
   */
  static async buscarPorIdEPousada(id: number, pousadaId: number): Promise<ReservaComCriador | null> {
    const [result] = await db
      .select({
        id: reservas.id,
        pousadaId: reservas.pousadaId,
        nome: reservas.nome,
        cpf: reservas.cpf,
        cpfHash: reservas.cpfHash,
        quarto: reservas.quarto,
        dataEntrada: reservas.dataEntrada,
        dataSaida: reservas.dataSaida,
        status: reservas.status,
        valor: reservas.valor,
        pago: reservas.pago,
        observacoes: reservas.observacoes,
        criadoPor: reservas.criadoPor,
        version: reservas.version,
        deletedAt: reservas.deletedAt,
        createdAt: reservas.createdAt,
        updatedAt: reservas.updatedAt,
        criadoPorNome: user.name,
      })
      .from(reservas)
      .leftJoin(user, eq(reservas.criadoPor, user.id))
      .where(and(eq(reservas.id, id), eq(reservas.pousadaId, pousadaId), isNull(reservas.deletedAt)))
      .limit(1);

    return result ? this.decryptResult(result) : null;
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
  ): Promise<{ disponivel: boolean; conflitos: Reserva[] }> {
    const conditions = [
      eq(reservas.quarto, quarto),
      eq(reservas.status, 'ativa'),
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
      .select()
      .from(reservas)
      .where(and(...conditions));

    return {
      disponivel: conflitos.length === 0,
      conflitos,
    };
  }

  /**
   * Create a new reservation (with idempotency guard + CPF encryption)
   */
  static async criar(reserva: NewReserva): Promise<Reserva> {
    const cpfData = this.encryptCpfData(reserva.cpf);

    // Idempotency guard: prevent duplicate from double-clicks (same cpf+quarto+dates within 30s)
    const [duplicate] = await db
      .select({ id: reservas.id })
      .from(reservas)
      .where(and(
        eq(reservas.cpfHash, cpfData.cpfHash),
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
        .values({ ...reserva, cpf: cpfData.cpf, cpfHash: cpfData.cpfHash })
        .returning();

      return this.decryptResult(created);
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

    // Encrypt CPF if it's being updated
    const updateData: Record<string, unknown> = { ...reserva };
    if (reserva.cpf) {
      const cpfData = this.encryptCpfData(reserva.cpf);
      updateData.cpf = cpfData.cpf;
      updateData.cpfHash = cpfData.cpfHash;
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
  static async atualizarStatus(id: number, status: string, pousadaId: number, version?: number): Promise<{ changes: number; id: number; status: string }> {
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
          : { conflitos: [] as Reserva[] };
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
   * Find reservations by period
   */
  static async buscarPorPeriodo(dataInicio: string, dataFim: string, pousadaId: number): Promise<ReservaComCriador[]> {
    const data = await db
      .select({
        id: reservas.id,
        pousadaId: reservas.pousadaId,
        nome: reservas.nome,
        cpf: reservas.cpf,
        cpfHash: reservas.cpfHash,
        quarto: reservas.quarto,
        dataEntrada: reservas.dataEntrada,
        dataSaida: reservas.dataSaida,
        status: reservas.status,
        valor: reservas.valor,
        pago: reservas.pago,
        observacoes: reservas.observacoes,
        criadoPor: reservas.criadoPor,
        version: reservas.version,
        deletedAt: reservas.deletedAt,
        createdAt: reservas.createdAt,
        updatedAt: reservas.updatedAt,
        criadoPorNome: user.name,
      })
      .from(reservas)
      .leftJoin(user, eq(reservas.criadoPor, user.id))
      .where(
        and(
          eq(reservas.pousadaId, pousadaId),
          isNull(reservas.deletedAt),
          or(
            and(gte(reservas.dataEntrada, dataInicio), lte(reservas.dataEntrada, dataFim)),
            and(gte(reservas.dataSaida, dataInicio), lte(reservas.dataSaida, dataFim)),
            and(lte(reservas.dataEntrada, dataInicio), gte(reservas.dataSaida, dataFim))
          )
        )
      )
      .orderBy(reservas.dataEntrada);

    return this.decryptResults(data);
  }

  /**
   * Find reservations by status
   */
  static async buscarPorStatus(status: string, pousadaId: number): Promise<ReservaComCriador[]> {
    const data = await db
      .select({
        id: reservas.id,
        pousadaId: reservas.pousadaId,
        nome: reservas.nome,
        cpf: reservas.cpf,
        cpfHash: reservas.cpfHash,
        quarto: reservas.quarto,
        dataEntrada: reservas.dataEntrada,
        dataSaida: reservas.dataSaida,
        status: reservas.status,
        valor: reservas.valor,
        pago: reservas.pago,
        observacoes: reservas.observacoes,
        criadoPor: reservas.criadoPor,
        version: reservas.version,
        deletedAt: reservas.deletedAt,
        createdAt: reservas.createdAt,
        updatedAt: reservas.updatedAt,
        criadoPorNome: user.name,
      })
      .from(reservas)
      .leftJoin(user, eq(reservas.criadoPor, user.id))
      .where(and(eq(reservas.pousadaId, pousadaId), eq(reservas.status, status), isNull(reservas.deletedAt)))
      .orderBy(reservas.dataEntrada);

    return this.decryptResults(data);
  }
}

export default ReservaModel;

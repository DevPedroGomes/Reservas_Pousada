import { eq, and, or, gte, lte, ne, ilike, sql, count, isNull, SQL } from 'drizzle-orm';
import { db, reservas, user } from '../db/index.js';
import type { Reserva, NewReserva } from '../db/schema.js';
import { encryptCpf, decryptCpf, hashCpf, isEncrypted } from '../utils/crypto.js';

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
    } catch {
      return result; // Return as-is if decryption fails (unencrypted legacy data)
    }
  }

  private static decryptResults<T extends { cpf: string }>(results: T[]): T[] {
    return results.map(r => this.decryptResult(r));
  }

  /**
   * Encrypt CPF and generate hash for storage
   */
  private static encryptCpfData(cpf: string): { cpf: string; cpfHash: string } | null {
    try {
      return { cpf: encryptCpf(cpf), cpfHash: hashCpf(cpf) };
    } catch {
      // If encryption key not configured, store as-is
      return null;
    }
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
      // If search looks like a CPF (digits only, 11 chars), search by hash
      const searchDigits = search.replace(/[^\d]/g, '');
      if (searchDigits.length === 11) {
        const cpfHashValue = hashCpf(searchDigits);
        conditions.push(
          or(
            ilike(reservas.nome, searchPattern),
            eq(reservas.cpfHash, cpfHashValue),
            sql`${reservas.quarto}::text = ${search}`
          )!
        );
      } else {
        conditions.push(
          or(
            ilike(reservas.nome, searchPattern),
            ilike(reservas.cpf, searchPattern), // Fallback for legacy unencrypted data or partial match
            sql`${reservas.quarto}::text = ${search}`
          )!
        );
      }
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
   * Check room availability
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
      or(
        and(lte(reservas.dataEntrada, dataSaida), gte(reservas.dataSaida, dataEntrada)),
        and(gte(reservas.dataEntrada, dataEntrada), lte(reservas.dataEntrada, dataSaida)),
        and(gte(reservas.dataSaida, dataEntrada), lte(reservas.dataSaida, dataSaida))
      )!
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
    // Encrypt CPF for storage
    const cpfData = this.encryptCpfData(reserva.cpf);
    const cpfHashForSearch = cpfData ? cpfData.cpfHash : hashCpf(reserva.cpf);

    // Idempotency guard: prevent duplicate from double-clicks (same cpf+quarto+dates within 30s)
    const [duplicate] = await db
      .select({ id: reservas.id })
      .from(reservas)
      .where(and(
        eq(reservas.cpfHash, cpfHashForSearch),
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

    // Check availability
    const disponibilidade = await this.verificarDisponibilidade(
      reserva.quarto,
      reserva.dataEntrada,
      reserva.dataSaida,
      null,
      reserva.pousadaId
    );

    if (!disponibilidade.disponivel) {
      const error = new Error('Quarto não disponível para o período selecionado') as Error & { conflitos?: Reserva[] };
      error.conflitos = disponibilidade.conflitos;
      throw error;
    }

    const insertData = cpfData
      ? { ...reserva, cpf: cpfData.cpf, cpfHash: cpfData.cpfHash }
      : { ...reserva, cpfHash: cpfHashForSearch };

    const [created] = await db
      .insert(reservas)
      .values(insertData)
      .returning();

    return this.decryptResult(created);
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
        const error = new Error('Quarto não disponível para o período selecionado') as Error & { conflitos?: Reserva[] };
        error.conflitos = disponibilidade.conflitos;
        throw error;
      }
    }

    // Encrypt CPF if it's being updated
    let updateData: Record<string, unknown> = { ...reserva };
    if (reserva.cpf) {
      const cpfData = this.encryptCpfData(reserva.cpf);
      if (cpfData) {
        updateData.cpf = cpfData.cpf;
        updateData.cpfHash = cpfData.cpfHash;
      } else {
        updateData.cpfHash = hashCpf(reserva.cpf);
      }
    }

    const conditions: SQL[] = [eq(reservas.id, id), eq(reservas.pousadaId, pousadaId)];
    if (version !== undefined) {
      conditions.push(eq(reservas.version, version));
    }

    const result = await db
      .update(reservas)
      .set({
        ...updateData,
        version: sql`${reservas.version} + 1`,
        updatedAt: new Date(),
      })
      .where(and(...conditions));

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

    const result = await db
      .update(reservas)
      .set({
        status,
        version: sql`${reservas.version} + 1`,
        updatedAt: new Date(),
      })
      .where(and(...conditions));

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

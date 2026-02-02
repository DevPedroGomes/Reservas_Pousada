import { eq, and, or, gte, lte, ne, ilike, sql, count } from 'drizzle-orm';
import { db, reservas, user } from '../db';
import type { Reserva, NewReserva } from '../db/schema';

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
   * List all reservations with filters and pagination
   */
  static async listarTodas(options: ListarOptions): Promise<{ data: ReservaComCriador[]; count: number }> {
    const { page = 1, limit = 50, search, status, pago, data_inicio, data_fim, pousada_id } = options;

    if (!pousada_id) {
      throw new Error('pousada_id é obrigatório');
    }

    const offset = (page - 1) * limit;

    // Build where conditions
    const conditions = [eq(reservas.pousadaId, pousada_id)];

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
      conditions.push(
        or(
          ilike(reservas.nome, searchPattern),
          ilike(reservas.cpf, searchPattern),
          sql`${reservas.quarto}::text = ${search}`
        )!
      );
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
        quarto: reservas.quarto,
        dataEntrada: reservas.dataEntrada,
        dataSaida: reservas.dataSaida,
        status: reservas.status,
        valor: reservas.valor,
        pago: reservas.pago,
        observacoes: reservas.observacoes,
        criadoPor: reservas.criadoPor,
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
      data,
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
        quarto: reservas.quarto,
        dataEntrada: reservas.dataEntrada,
        dataSaida: reservas.dataSaida,
        status: reservas.status,
        valor: reservas.valor,
        pago: reservas.pago,
        observacoes: reservas.observacoes,
        criadoPor: reservas.criadoPor,
        createdAt: reservas.createdAt,
        updatedAt: reservas.updatedAt,
        criadoPorNome: user.name,
      })
      .from(reservas)
      .leftJoin(user, eq(reservas.criadoPor, user.id))
      .where(eq(reservas.id, id))
      .limit(1);

    return result || null;
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
        quarto: reservas.quarto,
        dataEntrada: reservas.dataEntrada,
        dataSaida: reservas.dataSaida,
        status: reservas.status,
        valor: reservas.valor,
        pago: reservas.pago,
        observacoes: reservas.observacoes,
        criadoPor: reservas.criadoPor,
        createdAt: reservas.createdAt,
        updatedAt: reservas.updatedAt,
        criadoPorNome: user.name,
      })
      .from(reservas)
      .leftJoin(user, eq(reservas.criadoPor, user.id))
      .where(and(eq(reservas.id, id), eq(reservas.pousadaId, pousadaId)))
      .limit(1);

    return result || null;
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
   * Create a new reservation
   */
  static async criar(reserva: NewReserva): Promise<Reserva> {
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

    const [created] = await db
      .insert(reservas)
      .values(reserva)
      .returning();

    return created;
  }

  /**
   * Update a reservation
   */
  static async atualizar(id: number, reserva: Partial<NewReserva>, pousadaId: number): Promise<{ changes: number; id: number }> {
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

    const result = await db
      .update(reservas)
      .set({
        ...reserva,
        updatedAt: new Date(),
      })
      .where(and(eq(reservas.id, id), eq(reservas.pousadaId, pousadaId)));

    return {
      changes: result.rowCount || 0,
      id,
    };
  }

  /**
   * Update reservation status
   */
  static async atualizarStatus(id: number, status: string, pousadaId: number): Promise<{ changes: number; id: number; status: string }> {
    const result = await db
      .update(reservas)
      .set({
        status,
        updatedAt: new Date(),
      })
      .where(and(eq(reservas.id, id), eq(reservas.pousadaId, pousadaId)));

    return {
      changes: result.rowCount || 0,
      id,
      status,
    };
  }

  /**
   * Delete a reservation
   */
  static async excluir(id: number, pousadaId: number): Promise<{ changes: number }> {
    const result = await db
      .delete(reservas)
      .where(and(eq(reservas.id, id), eq(reservas.pousadaId, pousadaId)));

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
        quarto: reservas.quarto,
        dataEntrada: reservas.dataEntrada,
        dataSaida: reservas.dataSaida,
        status: reservas.status,
        valor: reservas.valor,
        pago: reservas.pago,
        observacoes: reservas.observacoes,
        criadoPor: reservas.criadoPor,
        createdAt: reservas.createdAt,
        updatedAt: reservas.updatedAt,
        criadoPorNome: user.name,
      })
      .from(reservas)
      .leftJoin(user, eq(reservas.criadoPor, user.id))
      .where(
        and(
          eq(reservas.pousadaId, pousadaId),
          or(
            and(gte(reservas.dataEntrada, dataInicio), lte(reservas.dataEntrada, dataFim)),
            and(gte(reservas.dataSaida, dataInicio), lte(reservas.dataSaida, dataFim)),
            and(lte(reservas.dataEntrada, dataInicio), gte(reservas.dataSaida, dataFim))
          )
        )
      )
      .orderBy(reservas.dataEntrada);

    return data;
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
        quarto: reservas.quarto,
        dataEntrada: reservas.dataEntrada,
        dataSaida: reservas.dataSaida,
        status: reservas.status,
        valor: reservas.valor,
        pago: reservas.pago,
        observacoes: reservas.observacoes,
        criadoPor: reservas.criadoPor,
        createdAt: reservas.createdAt,
        updatedAt: reservas.updatedAt,
        criadoPorNome: user.name,
      })
      .from(reservas)
      .leftJoin(user, eq(reservas.criadoPor, user.id))
      .where(and(eq(reservas.pousadaId, pousadaId), eq(reservas.status, status)))
      .orderBy(reservas.dataEntrada);

    return data;
  }
}

export default ReservaModel;

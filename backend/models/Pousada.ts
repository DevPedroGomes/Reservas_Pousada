import { eq, and, sql } from 'drizzle-orm';
import { db, pousadas, user, reservas } from '../db/index.js';
import type { Pousada, NewPousada, User } from '../db/schema.js';

export class PousadaModel {
  /**
   * Generate slug from name
   */
  static gerarSlug(nome: string): string {
    return nome
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/[^a-z0-9\s]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Remove duplicate hyphens
      .trim();
  }

  /**
   * Generate unique slug
   */
  static async gerarSlugUnico(nome: string): Promise<string> {
    const baseSlug = this.gerarSlug(nome);
    let slug = baseSlug;
    let counter = 0;

    while (true) {
      const [existing] = await db
        .select({ id: pousadas.id })
        .from(pousadas)
        .where(eq(pousadas.slug, slug))
        .limit(1);

      if (!existing) break;

      counter++;
      slug = `${baseSlug}-${counter}`;
    }

    return slug;
  }

  /**
   * Create a new pousada
   */
  static async criar(pousadaData: Omit<NewPousada, 'slug'>): Promise<Pousada> {
    const slug = await this.gerarSlugUnico(pousadaData.nome);

    const [created] = await db
      .insert(pousadas)
      .values({
        ...pousadaData,
        slug,
      })
      .returning();

    return created;
  }

  /**
   * Create pousada and associate user as owner
   */
  static async criarComOwner(pousadaData: Omit<NewPousada, 'slug'>, userId: string): Promise<Pousada> {
    // Create pousada
    const pousada = await this.criar(pousadaData);

    // Update user as owner
    await db
      .update(user)
      .set({
        pousadaId: pousada.id,
        isOwner: true,
        role: 'admin',
        updatedAt: new Date(),
      })
      .where(eq(user.id, userId));

    return pousada;
  }

  /**
   * Find pousada by ID
   */
  static async buscarPorId(id: number): Promise<Pousada | null> {
    const [result] = await db
      .select()
      .from(pousadas)
      .where(eq(pousadas.id, id))
      .limit(1);

    return result || null;
  }

  /**
   * Find pousada by slug
   */
  static async buscarPorSlug(slug: string): Promise<Pousada | null> {
    const [result] = await db
      .select()
      .from(pousadas)
      .where(eq(pousadas.slug, slug))
      .limit(1);

    return result || null;
  }

  /**
   * Update pousada
   */
  static async atualizar(id: number, pousadaData: Partial<NewPousada>): Promise<Pousada | null> {
    const updateData: Partial<NewPousada> & { updatedAt: Date } = {
      ...pousadaData,
      updatedAt: new Date(),
    };

    // Update slug if name changed
    if (pousadaData.nome) {
      updateData.slug = await this.gerarSlugUnico(pousadaData.nome);
    }

    const [updated] = await db
      .update(pousadas)
      .set(updateData)
      .where(eq(pousadas.id, id))
      .returning();

    return updated || null;
  }

  /**
   * List all rooms (1 to numQuartos)
   */
  static async listarQuartos(pousadaId: number): Promise<number[]> {
    const pousada = await this.buscarPorId(pousadaId);
    if (!pousada) throw new Error('Pousada não encontrada');

    const quartos: number[] = [];
    for (let i = 1; i <= pousada.numQuartos; i++) {
      quartos.push(i);
    }
    return quartos;
  }

  /**
   * Get pousada statistics (SQL-optimized - no full table scan)
   */
  static async obterEstatisticas(pousadaId: number) {
    const pousada = await this.buscarPorId(pousadaId);
    if (!pousada) throw new Error('Pousada não encontrada');

    const hoje = new Date().toISOString().split('T')[0];

    // Single query: all stats via SQL aggregation
    const result = await db.execute(sql`
      SELECT
        COUNT(*)::int AS total_reservas,
        COUNT(*) FILTER (WHERE status = 'ativa')::int AS reservas_ativas,
        COUNT(*) FILTER (WHERE status = 'ativa' AND (data_entrada = ${hoje} OR data_saida = ${hoje}))::int AS reservas_hoje,
        (SELECT COUNT(DISTINCT quarto) FROM reservas WHERE pousada_id = ${pousadaId} AND status = 'ativa' AND data_entrada <= ${hoje} AND data_saida >= ${hoje})::int AS quartos_ocupados,
        COALESCE(SUM(valor::numeric) FILTER (WHERE pago = true), 0)::numeric AS receita_total,
        COALESCE(SUM(valor::numeric) FILTER (WHERE pago = false AND status = 'ativa'), 0)::numeric AS receita_pendente
      FROM reservas
      WHERE pousada_id = ${pousadaId}
    `);

    const stats = result.rows[0] as Record<string, unknown>;
    const totalReservas = Number(stats.total_reservas) || 0;
    const reservasAtivas = Number(stats.reservas_ativas) || 0;
    const reservasHoje = Number(stats.reservas_hoje) || 0;
    const quartosOcupados = Number(stats.quartos_ocupados) || 0;
    const receitaTotal = Number(stats.receita_total) || 0;
    const receitaPendente = Number(stats.receita_pendente) || 0;
    const quartosDisponiveis = pousada.numQuartos - quartosOcupados;
    const taxaOcupacao = pousada.numQuartos > 0
      ? Math.round((quartosOcupados / pousada.numQuartos) * 100)
      : 0;

    return {
      pousada: {
        id: pousada.id,
        nome: pousada.nome,
        num_quartos: pousada.numQuartos,
      },
      estatisticas: {
        total_reservas: totalReservas,
        reservas_ativas: reservasAtivas,
        reservas_hoje: reservasHoje,
        quartos_ocupados: quartosOcupados,
        quartos_disponiveis: quartosDisponiveis,
        taxa_ocupacao: taxaOcupacao,
        receita_total: receitaTotal,
        receita_pendente: receitaPendente,
      },
    };
  }

  /**
   * List pousada users
   */
  static async listarUsuarios(pousadaId: number): Promise<Partial<User>[]> {
    const usuarios = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isOwner: user.isOwner,
        image: user.image,
        createdAt: user.createdAt,
      })
      .from(user)
      .where(eq(user.pousadaId, pousadaId));

    return usuarios;
  }

  /**
   * Add user to pousada
   */
  static async adicionarUsuario(pousadaId: number, userId: string, role: string = 'recepcao'): Promise<{ success: boolean }> {
    await db
      .update(user)
      .set({
        pousadaId,
        role,
        updatedAt: new Date(),
      })
      .where(eq(user.id, userId));

    return { success: true };
  }

  /**
   * Remove user from pousada
   */
  static async removerUsuario(pousadaId: number, userId: string): Promise<{ success: boolean }> {
    // Check if not owner
    const [userData] = await db
      .select({ isOwner: user.isOwner })
      .from(user)
      .where(and(eq(user.id, userId), eq(user.pousadaId, pousadaId)))
      .limit(1);

    if (userData?.isOwner) {
      throw new Error('Não é possível remover o proprietário da pousada');
    }

    await db
      .update(user)
      .set({
        pousadaId: null,
        updatedAt: new Date(),
      })
      .where(and(eq(user.id, userId), eq(user.pousadaId, pousadaId)));

    return { success: true };
  }

  /**
   * Check if user has access to pousada
   */
  static async verificarAcesso(pousadaId: number, userId: string): Promise<{ id: string; role: string | null; isOwner: boolean | null } | null> {
    const [result] = await db
      .select({
        id: user.id,
        role: user.role,
        isOwner: user.isOwner,
      })
      .from(user)
      .where(and(eq(user.id, userId), eq(user.pousadaId, pousadaId)))
      .limit(1);

    return result || null;
  }

  /**
   * Deactivate pousada
   */
  static async desativar(id: number): Promise<{ success: boolean }> {
    await db
      .update(pousadas)
      .set({ ativa: false, updatedAt: new Date() })
      .where(eq(pousadas.id, id));

    return { success: true };
  }

  /**
   * Reactivate pousada
   */
  static async reativar(id: number): Promise<{ success: boolean }> {
    await db
      .update(pousadas)
      .set({ ativa: true, updatedAt: new Date() })
      .where(eq(pousadas.id, id));

    return { success: true };
  }
}

export default PousadaModel;

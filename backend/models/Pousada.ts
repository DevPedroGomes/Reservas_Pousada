import { eq, and, sql } from 'drizzle-orm';
import { db, pousadas, user, reservas, userPousadas } from '../db/index.js';
import type { Pousada, NewPousada, User } from '../db/schema.js';

export class PousadaModel {
  /**
   * Generate slug from name
   */
  static gerarSlug(nome: string): string {
    return nome
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
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
   * Create pousada and associate user as owner (junction table + active)
   */
  static async criarComOwner(pousadaData: Omit<NewPousada, 'slug'>, userId: string): Promise<Pousada> {
    const pousada = await this.criar(pousadaData);

    // Insert into junction table
    await db.insert(userPousadas).values({
      userId,
      pousadaId: pousada.id,
      role: 'admin',
      isOwner: true,
    });

    // Set as active pousada on user record
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
   * Get pousada statistics (SQL-optimized)
   */
  static async obterEstatisticas(pousadaId: number) {
    const pousada = await this.buscarPorId(pousadaId);
    if (!pousada) throw new Error('Pousada não encontrada');

    const hoje = new Date().toISOString().split('T')[0];

    const result = await db.execute(sql`
      SELECT
        COUNT(*)::int AS total_reservas,
        COUNT(*) FILTER (WHERE status = 'ativa')::int AS reservas_ativas,
        COUNT(*) FILTER (WHERE status = 'ativa' AND (data_entrada = ${hoje} OR data_saida = ${hoje}))::int AS reservas_hoje,
        (SELECT COUNT(DISTINCT quarto) FROM reservas WHERE pousada_id = ${pousadaId} AND status = 'ativa' AND deleted_at IS NULL AND data_entrada <= ${hoje} AND data_saida >= ${hoje})::int AS quartos_ocupados,
        COALESCE(SUM(valor::numeric) FILTER (WHERE pago = true), 0)::numeric AS receita_total,
        COALESCE(SUM(valor::numeric) FILTER (WHERE pago = false AND status = 'ativa'), 0)::numeric AS receita_pendente
      FROM reservas
      WHERE pousada_id = ${pousadaId} AND deleted_at IS NULL
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
   * List pousada users (from junction table)
   */
  static async listarUsuarios(pousadaId: number) {
    const rows = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        createdAt: user.createdAt,
        role: userPousadas.role,
        isOwner: userPousadas.isOwner,
      })
      .from(userPousadas)
      .innerJoin(user, eq(userPousadas.userId, user.id))
      .where(eq(userPousadas.pousadaId, pousadaId))
      .limit(200);

    return rows;
  }

  /**
   * Add user to pousada (junction table + set as active)
   */
  static async adicionarUsuario(pousadaId: number, userId: string, role: string = 'recepcao'): Promise<{ success: boolean }> {
    // Check if already a member
    const [existing] = await db
      .select({ id: userPousadas.id })
      .from(userPousadas)
      .where(and(eq(userPousadas.userId, userId), eq(userPousadas.pousadaId, pousadaId)))
      .limit(1);

    if (existing) {
      throw new Error('Usuário já é membro desta pousada');
    }

    await db.insert(userPousadas).values({
      userId,
      pousadaId,
      role,
      isOwner: false,
    });

    // Set as active pousada
    await db
      .update(user)
      .set({
        pousadaId,
        role,
        isOwner: false,
        updatedAt: new Date(),
      })
      .where(eq(user.id, userId));

    return { success: true };
  }

  /**
   * Remove user from pousada (junction table + auto-switch active)
   */
  static async removerUsuario(pousadaId: number, userId: string): Promise<{ success: boolean }> {
    const [membership] = await db
      .select({ isOwner: userPousadas.isOwner })
      .from(userPousadas)
      .where(and(eq(userPousadas.userId, userId), eq(userPousadas.pousadaId, pousadaId)))
      .limit(1);

    if (!membership) {
      throw new Error('Usuário não é membro desta pousada');
    }

    if (membership.isOwner) {
      throw new Error('Não é possível remover o proprietário da pousada');
    }

    // Remove from junction table
    await db
      .delete(userPousadas)
      .where(and(eq(userPousadas.userId, userId), eq(userPousadas.pousadaId, pousadaId)));

    // If this was the active pousada, switch to another or clear
    const [userData] = await db
      .select({ pousadaId: user.pousadaId })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (userData?.pousadaId === pousadaId) {
      const [nextMembership] = await db
        .select({
          pousadaId: userPousadas.pousadaId,
          role: userPousadas.role,
          isOwner: userPousadas.isOwner,
        })
        .from(userPousadas)
        .where(eq(userPousadas.userId, userId))
        .limit(1);

      if (nextMembership) {
        await db
          .update(user)
          .set({
            pousadaId: nextMembership.pousadaId,
            role: nextMembership.role,
            isOwner: nextMembership.isOwner || false,
            updatedAt: new Date(),
          })
          .where(eq(user.id, userId));
      } else {
        await db
          .update(user)
          .set({
            pousadaId: null,
            role: 'recepcao',
            isOwner: false,
            updatedAt: new Date(),
          })
          .where(eq(user.id, userId));
      }
    }

    return { success: true };
  }

  /**
   * List all pousadas a user belongs to
   */
  static async listarPousadasDoUsuario(userId: string) {
    const rows = await db
      .select({
        id: pousadas.id,
        nome: pousadas.nome,
        slug: pousadas.slug,
        numQuartos: pousadas.numQuartos,
        cidade: pousadas.cidade,
        estado: pousadas.estado,
        ativa: pousadas.ativa,
        role: userPousadas.role,
        isOwner: userPousadas.isOwner,
        joinedAt: userPousadas.joinedAt,
      })
      .from(userPousadas)
      .innerJoin(pousadas, eq(userPousadas.pousadaId, pousadas.id))
      .where(eq(userPousadas.userId, userId))
      .limit(50);

    return rows;
  }

  /**
   * Switch active pousada for a user (validates membership)
   */
  static async trocarPousadaAtiva(userId: string, pousadaId: number) {
    const [membership] = await db
      .select({
        role: userPousadas.role,
        isOwner: userPousadas.isOwner,
      })
      .from(userPousadas)
      .where(and(eq(userPousadas.userId, userId), eq(userPousadas.pousadaId, pousadaId)))
      .limit(1);

    if (!membership) {
      throw new Error('Você não é membro desta pousada');
    }

    await db
      .update(user)
      .set({
        pousadaId,
        role: membership.role,
        isOwner: membership.isOwner || false,
        updatedAt: new Date(),
      })
      .where(eq(user.id, userId));

    return { pousadaId, role: membership.role, isOwner: membership.isOwner || false };
  }

  /**
   * Check if user has access to pousada (via junction table)
   */
  static async verificarAcesso(pousadaId: number, userId: string) {
    const [result] = await db
      .select({
        id: userPousadas.userId,
        role: userPousadas.role,
        isOwner: userPousadas.isOwner,
      })
      .from(userPousadas)
      .where(and(eq(userPousadas.userId, userId), eq(userPousadas.pousadaId, pousadaId)))
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

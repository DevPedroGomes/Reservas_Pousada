import { eq, and, sql } from 'drizzle-orm';
import { db, pousadas, user, reservas, userPousadas } from '../db/index.js';
import type { Pousada, NewPousada, User } from '../db/schema.js';
import { hojeLocal } from '../utils/datas.js';
import AssinaturaModel from './Assinatura.js';
import { decidirNovaPousada, limitesVigentes } from '../utils/assinatura.js';

/** Criação recusada pelo plano. A rota responde 402 com a mensagem. */
export class LimiteDoPlano extends Error {
  constructor(mensagem: string, readonly codigo: string) {
    super(mensagem);
    this.name = 'LimiteDoPlano';
  }
}

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
   *
   * Com `aplicarLimites` (billing ligado), decide DENTRO da transação se o dono
   * pode ter mais uma pousada e qual assinatura a cobre (plano Rede). O lock
   * por usuário serializa criações simultâneas do mesmo dono — sem ele, dois
   * cliques contavam "2 de 3" ao mesmo tempo e o limite estourava.
   */
  static async criarComOwner(
    pousadaData: Omit<NewPousada, 'slug'>,
    userId: string,
    opcoes: { aplicarLimites?: boolean } = {},
  ): Promise<Pousada> {
    const slug = await this.gerarSlugUnico(pousadaData.nome);

    // As três escritas são uma coisa só. Sem transação, uma falha no meio
    // deixava pousada órfã sem dono — estado que nenhuma tela sabe consertar.
    return db.transaction(async (tx) => {
      let cobertaPor: number | null = null;
      if (opcoes.aplicarLimites) {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'nova-pousada:' + userId}))`);
        const decisao = decidirNovaPousada(await AssinaturaModel.possuidasPor(userId, tx));
        if (!decisao.permitido) throw new LimiteDoPlano(decisao.motivo, 'BILLING_004');
        cobertaPor = decisao.cobertaPor;

        const efetiva = cobertaPor ? await AssinaturaModel.efetiva(cobertaPor, tx) : null;
        const limites = limitesVigentes(
          efetiva ? AssinaturaModel.paraEstado(efetiva.row) : { status: 'trial', plano: null },
        );
        if ((pousadaData.numQuartos ?? 0) > limites.maxQuartos) {
          throw new LimiteDoPlano(
            `Seu plano permite até ${limites.maxQuartos} quartos. Faça upgrade para cadastrar ${pousadaData.numQuartos}.`,
            'BILLING_002',
          );
        }
      }

      const [pousada] = await tx
        .insert(pousadas)
        .values({ ...pousadaData, slug })
        .returning();

      await tx.insert(userPousadas).values({
        userId,
        pousadaId: pousada.id,
        role: 'admin',
        isOwner: true,
      });

      await tx
        .update(user)
        .set({
          pousadaId: pousada.id,
          isOwner: true,
          role: 'admin',
          updatedAt: new Date(),
        })
        .where(eq(user.id, userId));

      // Mesma transacao: pousada sem assinatura e tenant que o enforcement nao
      // sabe avaliar, e o trial precisa comecar a contar do minuto zero.
      if (cobertaPor) {
        await AssinaturaModel.criarCoberta(pousada.id, cobertaPor, tx);
      } else {
        await AssinaturaModel.criarTrial(pousada.id, tx);
      }

      return pousada;
    });
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

    // Só regera o slug se o nome REALMENTE mudou. Antes, salvar a pousada sem
    // mexer no nome já criava um slug novo: `gerarSlugUnico` encontrava a
    // própria linha ocupando o slug e ia somando sufixo — pousada, pousada-1,
    // pousada-2... a cada clique em Salvar.
    if (pousadaData.nome) {
      const atual = await this.buscarPorId(id);
      if (!atual || atual.nome !== pousadaData.nome) {
        updateData.slug = await this.gerarSlugUnico(pousadaData.nome);
      }
    }

    const [updated] = await db
      .update(pousadas)
      .set(updateData)
      .where(eq(pousadas.id, id))
      .returning();

    return updated || null;
  }

  /**
   * Get pousada statistics (SQL-optimized)
   */
  static async obterEstatisticas(pousadaId: number) {
    const pousada = await this.buscarPorId(pousadaId);
    if (!pousada) throw new Error('Pousada não encontrada');

    // Fuso da operação, não UTC: com `toISOString()` o dashboard virava o dia
    // às 21h de Brasília e mostrava os números de amanhã.
    const hoje = hojeLocal();

    const result = await db.execute(sql`
      SELECT
        COUNT(*)::int AS total_reservas,
        COUNT(*) FILTER (WHERE status IN ('pre_reserva', 'confirmada', 'hospedada'))::int AS reservas_ativas,
        COUNT(*) FILTER (WHERE status IN ('pre_reserva', 'confirmada', 'hospedada') AND (data_entrada = ${hoje} OR data_saida = ${hoje}))::int AS reservas_hoje,
        -- Ocupação usa intervalo semiaberto [entrada, saída): quem faz check-out
        -- hoje já liberou o quarto e não conta como ocupado.
        (SELECT COUNT(DISTINCT quarto) FROM reservas WHERE pousada_id = ${pousadaId} AND status IN ('pre_reserva', 'confirmada', 'hospedada') AND deleted_at IS NULL AND data_entrada <= ${hoje} AND data_saida > ${hoje})::int AS quartos_ocupados,
        -- Receita realizada exclui cancelada: dinheiro de reserva cancelada foi
        -- devolvido ou virou crédito, não é faturamento.
        COALESCE(SUM(valor::numeric) FILTER (WHERE pago = true AND status NOT IN ('cancelada', 'no_show')), 0)::numeric AS receita_total,
        COALESCE(SUM(valor::numeric) FILTER (WHERE pago = false AND status IN ('pre_reserva', 'confirmada', 'hospedada', 'finalizada')), 0)::numeric AS receita_pendente
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

  /** Troca o papel do vínculo (o papel vale por pousada). */
  static async alterarPapel(pousadaId: number, userId: string, role: string): Promise<void> {
    await db
      .update(userPousadas)
      .set({ role })
      .where(and(eq(userPousadas.userId, userId), eq(userPousadas.pousadaId, pousadaId)));
    // Mantém a cópia legada na linha do usuário coerente quando esta é a
    // pousada padrão dele (o authMiddleware já lê do vínculo).
    await db
      .update(user)
      .set({ role, updatedAt: new Date() })
      .where(and(eq(user.id, userId), eq(user.pousadaId, pousadaId)));
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

import { eq, and } from 'drizzle-orm';
import { db, user, pousadas } from '../db/index.js';
import type { User, NewUser } from '../db/schema.js';

/**
 * Usuario model - handles user profile operations
 * Note: Authentication is handled by Better Auth
 */
export class Usuario {
  /**
   * Find user by ID
   */
  static async buscarPorId(id: string): Promise<User | null> {
    const [result] = await db
      .select()
      .from(user)
      .where(eq(user.id, id))
      .limit(1);

    return result || null;
  }

  /**
   * Find user by email
   */
  static async buscarPorEmail(email: string): Promise<User | null> {
    const [result] = await db
      .select()
      .from(user)
      .where(eq(user.email, email))
      .limit(1);

    return result || null;
  }

  /**
   * List all users from a specific pousada
   */
  static async listarTodos(pousadaId: number): Promise<User[]> {
    if (!pousadaId) {
      throw new Error('pousada_id é obrigatório para listar usuários');
    }

    const results = await db
      .select()
      .from(user)
      .where(eq(user.pousadaId, pousadaId));

    return results;
  }

  /**
   * Update user profile (non-auth fields)
   */
  static async atualizar(id: string, dados: Partial<Pick<User, 'name' | 'role' | 'pousadaId' | 'isOwner' | 'image'>>): Promise<User | null> {
    const [updated] = await db
      .update(user)
      .set({
        ...dados,
        updatedAt: new Date(),
      })
      .where(eq(user.id, id))
      .returning();

    return updated || null;
  }

  /**
   * Associate user with a pousada
   */
  static async associarPousada(userId: string, pousadaId: number, isOwner: boolean = false, role: string = 'recepcao'): Promise<User | null> {
    const [updated] = await db
      .update(user)
      .set({
        pousadaId,
        isOwner,
        role: isOwner ? 'admin' : role,
        updatedAt: new Date(),
      })
      .where(eq(user.id, userId))
      .returning();

    return updated || null;
  }

  /**
   * Remove user from pousada
   */
  static async removerDaPousada(userId: string, pousadaId: number): Promise<boolean> {
    // Check if user belongs to this pousada and is not owner
    const [userData] = await db
      .select()
      .from(user)
      .where(and(eq(user.id, userId), eq(user.pousadaId, pousadaId)))
      .limit(1);

    if (!userData) {
      throw new Error('Usuário não encontrado nesta pousada');
    }

    if (userData.isOwner) {
      throw new Error('Não é possível remover o proprietário da pousada');
    }

    await db
      .update(user)
      .set({
        pousadaId: null,
        updatedAt: new Date(),
      })
      .where(eq(user.id, userId));

    return true;
  }

  /**
   * Check if user has access to pousada
   */
  static async verificarAcesso(userId: string, pousadaId: number): Promise<{ id: string; role: string | null; isOwner: boolean | null } | null> {
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
   * Get user with pousada details
   */
  static async buscarComPousada(id: string) {
    const [result] = await db
      .select({
        user: user,
        pousada: pousadas,
      })
      .from(user)
      .leftJoin(pousadas, eq(user.pousadaId, pousadas.id))
      .where(eq(user.id, id))
      .limit(1);

    return result || null;
  }
}

export default Usuario;

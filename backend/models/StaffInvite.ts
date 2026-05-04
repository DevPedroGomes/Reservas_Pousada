import crypto from 'crypto';
import { eq, and, sql } from 'drizzle-orm';
import { db, staffInvites, pousadas, user, userPousadas } from '../db/index.js';

export class StaffInviteModel {
  /**
   * Generate a secure random token
   */
  static generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Create a new invite
   */
  static async criar(data: {
    pousadaId: number;
    email: string;
    role: string;
    invitedBy: string;
  }) {
    const token = this.generateToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    const [invite] = await db
      .insert(staffInvites)
      .values({
        pousadaId: data.pousadaId,
        email: data.email.toLowerCase().trim(),
        role: data.role,
        token,
        invitedBy: data.invitedBy,
        expiresAt,
      })
      .returning();

    return invite;
  }

  /**
   * Find invite by token with pousada and inviter info
   */
  static async buscarPorToken(token: string) {
    const [result] = await db
      .select({
        invite: staffInvites,
        pousadaNome: pousadas.nome,
        inviterName: user.name,
      })
      .from(staffInvites)
      .innerJoin(pousadas, eq(staffInvites.pousadaId, pousadas.id))
      .innerJoin(user, eq(staffInvites.invitedBy, user.id))
      .where(eq(staffInvites.token, token))
      .limit(1);

    return result || null;
  }

  /**
   * List invites for a pousada
   */
  static async listarPorPousada(pousadaId: number) {
    const results = await db
      .select({
        id: staffInvites.id,
        email: staffInvites.email,
        role: staffInvites.role,
        status: staffInvites.status,
        createdAt: staffInvites.createdAt,
        expiresAt: staffInvites.expiresAt,
        inviterName: user.name,
      })
      .from(staffInvites)
      .innerJoin(user, eq(staffInvites.invitedBy, user.id))
      .where(eq(staffInvites.pousadaId, pousadaId))
      .orderBy(sql`${staffInvites.createdAt} DESC`);

    // Mark expired invites
    return results.map((r) => ({
      ...r,
      status: r.status === 'pending' && r.expiresAt && new Date(r.expiresAt) < new Date()
        ? 'expired'
        : r.status,
    }));
  }

  /**
   * Accept an invite - associate user with pousada
   * Requires the authenticated user's email to match the invite recipient
   */
  static async aceitar(token: string, userId: string, userEmail: string) {
    const result = await this.buscarPorToken(token);

    if (!result) {
      throw new Error('Convite não encontrado');
    }

    const { invite } = result;

    if (invite.status !== 'pending') {
      throw new Error('Este convite já foi utilizado ou revogado');
    }

    if (new Date(invite.expiresAt) < new Date()) {
      throw new Error('Este convite expirou');
    }

    // Email must match invite recipient (prevents wrong-account hijack)
    if (!userEmail || invite.email.toLowerCase() !== userEmail.toLowerCase()) {
      throw new Error('Este convite foi enviado para outro email');
    }

    // Update invite status
    await db
      .update(staffInvites)
      .set({
        status: 'accepted',
        acceptedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(staffInvites.id, invite.id));

    // Check if already a member of this pousada
    const [existing] = await db
      .select({ id: userPousadas.id })
      .from(userPousadas)
      .where(and(eq(userPousadas.userId, userId), eq(userPousadas.pousadaId, invite.pousadaId)))
      .limit(1);

    if (!existing) {
      // Insert into junction table
      await db.insert(userPousadas).values({
        userId,
        pousadaId: invite.pousadaId,
        role: invite.role,
        isOwner: false,
      });
    }

    // Set as active pousada
    await db
      .update(user)
      .set({
        pousadaId: invite.pousadaId,
        role: invite.role,
        isOwner: false,
        updatedAt: new Date(),
      })
      .where(eq(user.id, userId));

    return { pousadaId: invite.pousadaId, role: invite.role };
  }

  /**
   * Revoke an invite
   */
  static async revogar(inviteId: number, pousadaId: number) {
    const [updated] = await db
      .update(staffInvites)
      .set({
        status: 'revoked',
        updatedAt: new Date(),
      })
      .where(and(
        eq(staffInvites.id, inviteId),
        eq(staffInvites.pousadaId, pousadaId),
      ))
      .returning();

    if (!updated) {
      throw new Error('Convite não encontrado');
    }

    return updated;
  }

  /**
   * Check if there's already a pending invite for this email+pousada
   */
  static async existeConvitePendente(email: string, pousadaId: number): Promise<boolean> {
    const [result] = await db
      .select({ id: staffInvites.id })
      .from(staffInvites)
      .where(and(
        eq(staffInvites.email, email.toLowerCase().trim()),
        eq(staffInvites.pousadaId, pousadaId),
        eq(staffInvites.status, 'pending'),
      ))
      .limit(1);

    // Also check if not expired
    if (result) {
      const invite = await db
        .select({ expiresAt: staffInvites.expiresAt })
        .from(staffInvites)
        .where(eq(staffInvites.id, result.id))
        .limit(1);

      if (invite[0] && new Date(invite[0].expiresAt) > new Date()) {
        return true;
      }
    }

    return false;
  }
}

export default StaffInviteModel;

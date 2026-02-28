import { eq, and, desc, sql } from 'drizzle-orm';
import { db, auditoria, user } from '../db/index.js';
import type { Auditoria, NewAuditoria } from '../db/schema.js';

interface AuditoriaComUsuario extends Auditoria {
  userName?: string | null;
}

export class AuditoriaModel {
  /**
   * Log an action to the audit trail
   */
  static async registrar(dados: NewAuditoria): Promise<Auditoria> {
    const [created] = await db
      .insert(auditoria)
      .values(dados)
      .returning();

    return created;
  }

  /**
   * List audit logs with filters
   * When entity is 'reserva' and pousadaId is provided, ensures tenant isolation
   * by verifying the referenced reservation belongs to the given pousada.
   */
  static async listar(options: {
    userId?: string;
    entity?: string;
    entityId?: number;
    pousadaId?: number;
    limit?: number;
    offset?: number;
  }): Promise<AuditoriaComUsuario[]> {
    const { userId, entity, entityId, pousadaId, limit = 100, offset = 0 } = options;

    const conditions = [];

    if (userId) {
      conditions.push(eq(auditoria.userId, userId));
    }

    if (entity) {
      conditions.push(eq(auditoria.entity, entity));
    }

    if (entityId) {
      conditions.push(eq(auditoria.entityId, entityId));
    }

    // Tenant isolation: if entity is 'reserva' and pousadaId is provided,
    // only return audit logs for reservations belonging to this pousada
    if (pousadaId && entity === 'reserva') {
      conditions.push(
        sql`${auditoria.entityId} IN (SELECT id FROM reservas WHERE pousada_id = ${pousadaId})`
      );
    }

    const results = await db
      .select({
        id: auditoria.id,
        userId: auditoria.userId,
        action: auditoria.action,
        entity: auditoria.entity,
        entityId: auditoria.entityId,
        details: auditoria.details,
        ip: auditoria.ip,
        createdAt: auditoria.createdAt,
        userName: user.name,
      })
      .from(auditoria)
      .leftJoin(user, eq(auditoria.userId, user.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(auditoria.createdAt))
      .limit(limit)
      .offset(offset);

    return results;
  }

  /**
   * Get audit log by ID
   */
  static async buscarPorId(id: number): Promise<AuditoriaComUsuario | null> {
    const [result] = await db
      .select({
        id: auditoria.id,
        userId: auditoria.userId,
        action: auditoria.action,
        entity: auditoria.entity,
        entityId: auditoria.entityId,
        details: auditoria.details,
        ip: auditoria.ip,
        createdAt: auditoria.createdAt,
        userName: user.name,
      })
      .from(auditoria)
      .leftJoin(user, eq(auditoria.userId, user.id))
      .where(eq(auditoria.id, id))
      .limit(1);

    return result || null;
  }

  /**
   * Helper to create audit log entry
   */
  static async log(
    userId: string | null,
    action: string,
    entity: string,
    entityId: number | null,
    details: Record<string, any> | null,
    ip: string | null
  ): Promise<void> {
    await this.registrar({
      userId,
      action,
      entity,
      entityId,
      details: details ?? null,
      ip,
    });
  }
}

export default AuditoriaModel;

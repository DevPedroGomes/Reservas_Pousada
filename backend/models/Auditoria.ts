import { eq, and, desc, sql } from 'drizzle-orm';
import { db, auditoria, user } from '../db/index.js';
import type { Auditoria, NewAuditoria } from '../db/schema.js';
import { redigirPII } from '../utils/pii.js';

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
    const { userId, entity, entityId, pousadaId, limit: rawLimit = 100, offset = 0 } = options;
    const limit = Math.min(rawLimit, 500);

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

    // Isolamento de tenant.
    //
    // Antes, o escopo por pousada só era aplicado quando `entity === 'reserva'`;
    // para qualquer outra entidade (ou se o chamador esquecesse o pousadaId) a
    // consulta devolvia auditoria de TODOS os tenants — e `details` pode conter
    // dado sensível. Agora o escopo é obrigatório e entidade sem mapeamento
    // conhecido falha alto, em vez de vazar em silêncio.
    if (!pousadaId) {
      throw new Error('AuditoriaModel.listar exige pousadaId (isolamento de tenant)');
    }

    if (entity === 'reserva') {
      conditions.push(
        sql`${auditoria.entityId} IN (SELECT id FROM reservas WHERE pousada_id = ${pousadaId})`
      );
    } else if (entity === 'staff_invite') {
      conditions.push(
        sql`${auditoria.entityId} IN (SELECT id FROM staff_invites WHERE pousada_id = ${pousadaId})`
      );
    } else if (entity === 'pousada' || entity === 'user_pousada') {
      // Nestas duas, o entityId gravado JÁ É o id da pousada.
      conditions.push(eq(auditoria.entityId, pousadaId));
    } else {
      throw new Error(`AuditoriaModel.listar: entidade '${entity}' sem regra de isolamento definida`);
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
      details: details ? (redigirPII(details) as Record<string, unknown>) : null,
      ip,
    });
  }
}

export default AuditoriaModel;

import type { AuditEntry, AuditListQuery, Page } from '@mosaic/contracts';
import type { z } from 'zod';
import type { Queryable } from '../../db/pool.ts';

export interface AuditEvent {
  actorUserId: string;
  /** Dotted verb, e.g. "user.role_changed", "group.member_added". */
  action: string;
  entityType: string;
  entityId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

/**
 * Appends an audit row. Always call with the mutation's own transaction client so the audit row
 * commits or rolls back together with the change it describes (09_ARCHITECTURE.md §4).
 */
export async function recordAudit(tx: Queryable, event: AuditEvent): Promise<void> {
  await tx.query(
    `INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, before_state, after_state)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [event.actorUserId, event.action, event.entityType, event.entityId, event.before ?? null, event.after ?? null],
  );
}

type AuditQuery = z.output<typeof AuditListQuery>;

/** Paged audit read, shared by /admin/audit (admin) and /analytics/audit (auditor). */
export async function listAudit(db: Queryable, query: AuditQuery): Promise<Page<AuditEntry>> {
  const params = [query.entity_type ?? null, query.entity_id ?? null, query.actor_user_id ?? null, query.from ?? null, query.to ?? null, query.entity_ids ?? null];
  const where = `WHERE ($1::text IS NULL OR a.entity_type = $1)
      AND ($2::uuid IS NULL OR a.entity_id = $2)
      AND ($3::uuid IS NULL OR a.actor_user_id = $3)
      AND ($4::timestamptz IS NULL OR a.created_at >= $4)
      AND ($5::timestamptz IS NULL OR a.created_at < $5)
      AND ($6::uuid[] IS NULL OR a.entity_id = ANY($6))`;
  const direction = query.order === 'asc' ? 'ASC' : 'DESC';
  const [items, count] = await Promise.all([
    db.query<AuditEntry>(
      `SELECT a.log_id, a.action, a.entity_type, a.entity_id, a.before_state, a.after_state, a.created_at,
              json_build_object('user_id', u.user_id, 'full_name', u.full_name, 'email', u.email) AS actor
       FROM audit_log a JOIN users u ON u.user_id = a.actor_user_id
       ${where}
       ORDER BY a.seq ${direction}
       LIMIT $7 OFFSET $8`,
      [...params, query.limit, query.offset],
    ),
    db.query<{ total: number }>(`SELECT count(*)::int AS total FROM audit_log a ${where}`, params),
  ]);
  return { items: items.rows, total: count.rows[0]!.total, limit: query.limit, offset: query.offset };
}

import type { Notification } from '@mosaic/contracts';
import type { Queryable } from '../../db/pool.ts';

type NotificationRow = Omit<Notification, 'read_at' | 'created_at'> & { read_at: Date | null; created_at: Date };

const COLUMNS = 'notification_id, type, payload, read_at, created_at';

const toNotification = (row: NotificationRow) =>
  ({ ...row, read_at: row.read_at?.toISOString() ?? null, created_at: row.created_at.toISOString() }) as Notification;

export async function listForUser(
  db: Queryable, userId: string, unreadOnly: boolean, limit: number, offset: number,
): Promise<{ items: Notification[]; total: number }> {
  const where = 'WHERE user_id = $1 AND (NOT $2 OR read_at IS NULL)';
  const [items, count] = await Promise.all([
    db.query<NotificationRow>(
      `SELECT ${COLUMNS} FROM notifications ${where} ORDER BY created_at DESC, notification_id LIMIT $3 OFFSET $4`,
      [userId, unreadOnly, limit, offset],
    ),
    db.query<{ total: number }>(`SELECT count(*)::int AS total FROM notifications ${where}`, [userId, unreadOnly]),
  ]);
  return { items: items.rows.map(toNotification), total: count.rows[0]!.total };
}

/** Sets read_at once; later calls keep the first read time. Undefined when the user does not own it. */
export async function markRead(db: Queryable, userId: string, notificationId: string): Promise<Notification | undefined> {
  const { rows } = await db.query<NotificationRow>(
    `UPDATE notifications SET read_at = COALESCE(read_at, now())
     WHERE notification_id = $1 AND user_id = $2 RETURNING ${COLUMNS}`,
    [notificationId, userId],
  );
  return rows[0] && toNotification(rows[0]);
}

export async function markAllRead(db: Queryable, userId: string): Promise<number> {
  const result = await db.query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [userId]);
  return result.rowCount ?? 0;
}

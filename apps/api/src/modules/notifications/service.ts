import type { Notification, NotificationListQuery, NotificationPayloads, NotificationType, Page } from '@mosaic/contracts';
import type { z } from 'zod';
import type { Queryable } from '../../db/pool.ts';
import type { Actor } from '../../http/access.ts';
import { notFound } from '../../http/params.ts';
import * as repo from './repository.ts';

// ─── Writers: called inside the triggering mutation's transaction ───────────────────────────────

/** Notifies one user. The payload shape is fixed per type (contracts `NotificationPayloads`). */
export async function notify<T extends NotificationType>(tx: Queryable, userId: string, type: T, payload: NotificationPayloads[T]): Promise<void> {
  await tx.query('INSERT INTO notifications (user_id, type, payload) VALUES ($1, $2, $3)', [userId, type, payload]);
}

/**
 * Notifies every active member (with an active account) of a group. Auditors never receive
 * notifications (D19): they could not mark them read, because the auditor role cannot mutate.
 */
export async function notifyGroupMembers<T extends NotificationType>(
  tx: Queryable, groupId: string, type: T, payload: NotificationPayloads[T],
): Promise<void> {
  await tx.query(
    `INSERT INTO notifications (user_id, type, payload)
     SELECT m.user_id, $2, $3 FROM group_memberships m JOIN users u ON u.user_id = m.user_id
     WHERE m.group_id = $1 AND m.is_active AND u.is_active AND u.role <> 'auditor'`,
    [groupId, type, payload],
  );
}

// ─── Reader: the caller's own notifications ─────────────────────────────────────────────────────

export async function listNotifications(db: Queryable, actor: Actor, query: z.output<typeof NotificationListQuery>): Promise<Page<Notification>> {
  const { items, total } = await repo.listForUser(db, actor.userId, query.unread_only ?? false, query.limit, query.offset);
  return { items, total, limit: query.limit, offset: query.offset };
}

/** Owner only: someone else's notification is reported as not found, so ids reveal nothing. */
export async function markRead(db: Queryable, actor: Actor, notificationId: string): Promise<Notification> {
  const notification = await repo.markRead(db, actor.userId, notificationId);
  if (!notification) throw notFound('notification');
  return notification;
}

export async function markAllRead(db: Queryable, actor: Actor): Promise<{ updated: number }> {
  return { updated: await repo.markAllRead(db, actor.userId) };
}

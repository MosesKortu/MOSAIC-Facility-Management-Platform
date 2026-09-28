import { NotificationListQuery } from '@mosaic/contracts';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { RESEARCHERS } from '../../http/access.ts';
import { parseId } from '../../http/params.ts';
import { parseWith } from '../../http/validation.ts';
import * as service from './service.ts';

/** Notifications go to the roles that book and are certified; auditors receive none (D19). */
export function registerNotificationRoutes(app: FastifyInstance, pool: pg.Pool) {
  const recipients = { config: { access: RESEARCHERS } };

  app.get('/api/v1/notifications', recipients, async (request) =>
    service.listNotifications(pool, request.actor!, parseWith(NotificationListQuery, request.query)));
  app.patch('/api/v1/notifications/:notificationId/read', recipients, async (request) =>
    service.markRead(pool, request.actor!, parseId(request.params, 'notificationId', 'notification')));
  app.post('/api/v1/notifications/read-all', recipients, async (request) => service.markAllRead(pool, request.actor!));
}

import { AuditListQuery } from '@mosaic/contracts';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { ADMIN } from '../../http/access.ts';
import { parseWith } from '../../http/validation.ts';
import { listAudit } from './service.ts';

export function registerAuditRoutes(app: FastifyInstance, pool: pg.Pool) {
  app.get('/api/v1/admin/audit', { config: { access: ADMIN } }, async (request) =>
    listAudit(pool, parseWith(AuditListQuery, request.query)),
  );
}

import { UpdateTariffBody } from '@mosaic/contracts';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { ADMIN } from '../../http/access.ts';
import { parseWith } from '../../http/validation.ts';
import * as service from './service.ts';

export function registerTariffRoutes(app: FastifyInstance, pool: pg.Pool) {
  const admin = { config: { access: ADMIN } };
  app.get('/api/v1/admin/tariffs', admin, async () => service.listTariffs(pool));
  app.patch('/api/v1/admin/tariffs/:tier', admin, async (request) =>
    service.updateTariff(pool, request.actor!, (request.params as { tier: string }).tier, parseWith(UpdateTariffBody, request.body)));
}

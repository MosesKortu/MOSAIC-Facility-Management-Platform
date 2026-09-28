import { AllocationListQuery, CreateAllocationBody, CreateGrantBody, GrantListQuery, UpdateAllocationBody, UpdateGrantBody } from '@mosaic/contracts';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import type { Config } from '../../config.ts';
import { ADMIN } from '../../http/access.ts';
import { parseId } from '../../http/params.ts';
import { parseWith } from '../../http/validation.ts';
import * as service from './service.ts';

export function registerGrantRoutes(app: FastifyInstance, pool: pg.Pool, config: Config) {
  const admin = { config: { access: ADMIN } };
  const tz = config.facilityTimezone;
  const grantId = (params: unknown) => parseId(params, 'grantId', 'grant');
  const allocationId = (params: unknown) => parseId(params, 'allocationId', 'allocation');

  app.get('/api/v1/admin/grants', admin, async (request) => service.listGrants(pool, tz, parseWith(GrantListQuery, request.query)));
  app.post('/api/v1/admin/grants', admin, async (request, reply) =>
    reply.status(201).send(await service.createGrant(pool, tz, request.actor!, parseWith(CreateGrantBody, request.body))));
  app.get('/api/v1/admin/grants/:grantId', admin, async (request) => service.getGrant(pool, tz, grantId(request.params)));
  app.patch('/api/v1/admin/grants/:grantId', admin, async (request) =>
    service.updateGrant(pool, tz, request.actor!, grantId(request.params), parseWith(UpdateGrantBody, request.body)));

  app.get('/api/v1/admin/grant-allocations', admin, async (request) =>
    service.listAllocations(pool, parseWith(AllocationListQuery, request.query)));
  app.post('/api/v1/admin/grant-allocations', admin, async (request, reply) =>
    reply.status(201).send(await service.createAllocation(pool, request.actor!, parseWith(CreateAllocationBody, request.body))));
  app.patch('/api/v1/admin/grant-allocations/:allocationId', admin, async (request) =>
    service.updateAllocation(pool, request.actor!, allocationId(request.params), parseWith(UpdateAllocationBody, request.body)));
}

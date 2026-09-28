import {
  AdminEquipmentListQuery, AvailabilityBody, ChangeStatusBody, CreateEquipmentBody, EquipmentListQuery, UpdateEquipmentBody,
} from '@mosaic/contracts';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type pg from 'pg';
import { ADMIN, RESEARCHERS, STAFF } from '../../http/access.ts';
import { pickLocale } from '../../http/locale.ts';
import { parseId } from '../../http/params.ts';
import { parseWith } from '../../http/validation.ts';
import * as service from './service.ts';

export function registerEquipmentRoutes(app: FastifyInstance, pool: pg.Pool) {
  const locale = (request: FastifyRequest) => pickLocale(request.headers['accept-language']);
  const equipmentId = (params: unknown) => parseId(params, 'equipmentId', 'equipment');

  // Researcher discovery (staff also book for their own work).
  app.get('/api/v1/equipment', { config: { access: RESEARCHERS } }, async (request) =>
    service.listEquipment(pool, request.actor!, locale(request), parseWith(EquipmentListQuery, request.query)));
  app.get('/api/v1/equipment/:equipmentId', { config: { access: RESEARCHERS } }, async (request) =>
    service.getEquipment(pool, request.actor!, locale(request), equipmentId(request.params)));
  // Maintenance history is operational transparency, visible to everyone who books.
  app.get('/api/v1/equipment/:equipmentId/status-events', { config: { access: RESEARCHERS } }, async (request) =>
    service.getStatusEvents(pool, equipmentId(request.params)));

  // Operations.
  app.patch('/api/v1/equipment/:equipmentId/status', { config: { access: STAFF } }, async (request) =>
    service.changeStatus(pool, request.actor!, locale(request), equipmentId(request.params), parseWith(ChangeStatusBody, request.body)));

  // Administration.
  const admin = { config: { access: ADMIN } };
  app.get('/api/v1/admin/equipment', admin, async (request) =>
    service.listAdminEquipment(pool, parseWith(AdminEquipmentListQuery, request.query)));
  app.post('/api/v1/admin/equipment', admin, async (request, reply) =>
    reply.status(201).send(await service.createEquipment(pool, request.actor!, parseWith(CreateEquipmentBody, request.body))));
  app.get('/api/v1/admin/equipment/:equipmentId', admin, async (request) => service.getAdminEquipment(pool, equipmentId(request.params)));
  app.patch('/api/v1/admin/equipment/:equipmentId', admin, async (request) =>
    service.updateEquipment(pool, request.actor!, equipmentId(request.params), parseWith(UpdateEquipmentBody, request.body)));
  app.put('/api/v1/admin/equipment/:equipmentId/availability', admin, async (request) =>
    service.replaceAvailability(pool, request.actor!, equipmentId(request.params), parseWith(AvailabilityBody, request.body)));
}

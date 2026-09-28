import { CreateGroupBody, GroupListQuery, UpdateGroupBody } from '@mosaic/contracts';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { ADMIN } from '../../http/access.ts';
import { parseId } from '../../http/params.ts';
import { parseWith } from '../../http/validation.ts';
import * as service from './service.ts';

export function registerGroupRoutes(app: FastifyInstance, pool: pg.Pool) {
  const admin = { config: { access: ADMIN } };
  const groupId = (params: unknown) => parseId(params, 'groupId', 'group');

  app.get('/api/v1/admin/groups', admin, async (request) =>
    service.listGroups(pool, parseWith(GroupListQuery, request.query)),
  );
  app.post('/api/v1/admin/groups', admin, async (request, reply) => {
    const group = await service.createGroup(pool, request.actor!, parseWith(CreateGroupBody, request.body));
    return reply.status(201).send(group);
  });
  app.get('/api/v1/admin/groups/:groupId', admin, async (request) => service.getGroup(pool, groupId(request.params)));
  app.patch('/api/v1/admin/groups/:groupId', admin, async (request) =>
    service.updateGroup(pool, request.actor!, groupId(request.params), parseWith(UpdateGroupBody, request.body)),
  );
  app.put('/api/v1/admin/groups/:groupId/members/:userId', admin, async (request) =>
    service.addMember(pool, request.actor!, groupId(request.params), parseId(request.params, 'userId', 'user')),
  );
  app.delete('/api/v1/admin/groups/:groupId/members/:userId', admin, async (request) =>
    service.removeMember(pool, request.actor!, groupId(request.params), parseId(request.params, 'userId', 'membership')),
  );
}

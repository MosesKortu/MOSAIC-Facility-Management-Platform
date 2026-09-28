import { CreateUserBody, UpdateUserBody, UserListQuery } from '@mosaic/contracts';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { ADMIN } from '../../http/access.ts';
import { parseId } from '../../http/params.ts';
import { parseWith } from '../../http/validation.ts';
import * as service from './service.ts';

export function registerAdminUserRoutes(app: FastifyInstance, pool: pg.Pool) {
  const admin = { config: { access: ADMIN } };

  app.get('/api/v1/admin/users', admin, async (request) =>
    service.listUsers(pool, parseWith(UserListQuery, request.query)),
  );

  app.post('/api/v1/admin/users', admin, async (request, reply) => {
    const user = await service.createUser(pool, request.actor!, parseWith(CreateUserBody, request.body));
    return reply.status(201).send(user);
  });

  app.get('/api/v1/admin/users/:userId', admin, async (request) =>
    service.getUser(pool, parseId(request.params, 'userId', 'user')),
  );

  app.patch('/api/v1/admin/users/:userId', admin, async (request) =>
    service.updateUser(pool, request.actor!, parseId(request.params, 'userId', 'user'), parseWith(UpdateUserBody, request.body)),
  );
}

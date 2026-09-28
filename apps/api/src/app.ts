import { randomUUID } from 'node:crypto';
import fastifyCookie from '@fastify/cookie';
import fastifyJwt from '@fastify/jwt';
import Fastify, { type FastifyInstance } from 'fastify';
import type pg from 'pg';
import type { Config } from './config.ts';
import { SESSION_COOKIE, registerAccessControl, registerAuthentication } from './http/access.ts';
import { registerErrorHandling } from './http/errors.ts';
import { registerAdminUserRoutes } from './modules/admin-users/routes.ts';
import { registerAuditRoutes } from './modules/audit/routes.ts';
import { registerAuthRoutes } from './modules/auth/routes.ts';
import { registerBookingRoutes } from './modules/bookings/routes.ts';
import { registerEquipmentRoutes } from './modules/equipment/routes.ts';
import { registerGrantRoutes } from './modules/grants/routes.ts';
import { registerGroupRoutes } from './modules/groups/routes.ts';
import { registerHealthRoutes } from './modules/health/routes.ts';
import { registerNotificationRoutes } from './modules/notifications/routes.ts';
import { registerTariffRoutes } from './modules/tariffs/routes.ts';
import { registerTrainingRoutes } from './modules/training/routes.ts';

export interface AppDependencies {
  config: Config;
  pool: pg.Pool;
  /** false silences logs in tests; defaults to structured JSON logging. */
  logger?: boolean;
}

/** Builds the application without listening, so tests can exercise it with app.inject(). */
export function buildApp({ config, pool, logger = true }: AppDependencies): FastifyInstance {
  const app = Fastify({
    logger: logger && {
      level: config.nodeEnv === 'production' ? 'info' : 'debug',
      redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
    },
    // Correlation id: honour an upstream x-request-id, otherwise generate one.
    genReqId: (request) => {
      const incoming = request.headers['x-request-id'];
      return typeof incoming === 'string' && incoming.length <= 128 ? incoming : randomUUID();
    },
  });

  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  registerErrorHandling(app);
  registerAccessControl(app);
  app.register(fastifyCookie);
  app.register(fastifyJwt, { secret: config.jwtSecret, cookie: { cookieName: SESSION_COOKIE, signed: false } });
  // Root-level hook (not encapsulated): it must cover routes registered in any plugin scope.
  registerAuthentication(app, pool, config.webOrigin);
  registerAuthRoutes(app, pool, config);
  registerAdminUserRoutes(app, pool);
  registerGroupRoutes(app, pool);
  registerGrantRoutes(app, pool, config);
  registerEquipmentRoutes(app, pool);
  registerTariffRoutes(app, pool);
  registerTrainingRoutes(app, pool);
  registerBookingRoutes(app, pool, config);
  registerAuditRoutes(app, pool);
  registerNotificationRoutes(app, pool);
  registerHealthRoutes(app, pool);
  return app;
}

import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { MIGRATIONS_DIR, pendingMigrations } from '../../db/migrations.ts';

/** Liveness (process up) vs readiness (database reachable and schema current), 08 §67. */
export function registerHealthRoutes(app: FastifyInstance, pool: pg.Pool) {
  app.get('/health', async () => ({ status: 'ok' }));

  app.get('/ready', async (_request, reply) => {
    let database: 'ok' | 'unreachable' = 'ok';
    let migrations: 'current' | 'pending' | 'unknown' = 'unknown';
    try {
      await pool.query('SELECT 1');
      migrations = (await pendingMigrations(pool, MIGRATIONS_DIR)).length === 0 ? 'current' : 'pending';
    } catch {
      database = 'unreachable';
    }
    if (database === 'ok' && migrations === 'current') return { status: 'ready' };
    return reply.status(503).send({ status: 'not_ready', checks: { database, migrations } });
  });
}

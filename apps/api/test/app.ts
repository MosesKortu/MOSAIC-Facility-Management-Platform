import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll } from 'vitest';
import { buildApp } from '../src/app.ts';
import { loadConfig, type Config } from '../src/config.ts';
import { testPool } from './db.ts';

/** An app bound to the shared test database, closed after the file's tests. */
export function createTestApp(overrides: Partial<Config> = {}): FastifyInstance {
  const app = buildApp({ config: { ...loadConfig(), ...overrides }, pool: testPool, logger: false });
  afterAll(() => app.close());
  return app;
}

/** Logs in through the dev-login endpoint and returns the session cookie header value. */
export async function loginAs(app: FastifyInstance, email: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/v1/auth/dev-login', payload: { email } });
  if (res.statusCode !== 200) throw new Error(`login failed for ${email}: ${res.statusCode} ${res.body}`);
  const cookie = res.cookies.find((c) => c.name === 'mosaic_session');
  if (!cookie) throw new Error('no session cookie');
  return `mosaic_session=${cookie.value}`;
}

/** Injects a request with the given session cookie. */
export function as(app: FastifyInstance, cookie: string, options: InjectOptions) {
  return app.inject({ ...options, headers: { ...options.headers, cookie } });
}

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createScratchDatabase } from '../test/scratch-db.ts';
import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { createPool } from './db/pool.ts';
import { DomainError } from './http/errors.ts';
import { parseWith } from './http/validation.ts';

const config = loadConfig();

describe('error envelope', () => {
  const pool = createPool(config.databaseUrl);
  const app = buildApp({ config, pool, logger: false });
  app.get('/test/domain-error', async () => {
    throw new DomainError('INSUFFICIENT_GRANT_BALANCE', 'Not enough funds', { shortfall: '30.00' });
  });
  app.get('/test/crash', async () => {
    throw new Error('secret internal detail');
  });
  app.post('/test/validated', async (request) => parseWith(z.object({ n: z.number().int() }), request.body));

  beforeAll(() => app.ready());
  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('maps a DomainError to its catalog status and envelope', async () => {
    const res = await app.inject({ method: 'GET', url: '/test/domain-error', headers: { 'x-request-id': 'req-123' } });
    expect(res.statusCode).toBe(402);
    expect(res.headers['x-request-id']).toBe('req-123');
    expect(res.json()).toEqual({
      error: { code: 'INSUFFICIENT_GRANT_BALANCE', message: 'Not enough funds', details: { shortfall: '30.00' } },
      request_id: 'req-123',
    });
  });

  it('hides unexpected errors behind INTERNAL_ERROR', async () => {
    const res = await app.inject({ method: 'GET', url: '/test/crash' });
    expect(res.statusCode).toBe(500);
    expect(res.json().error.code).toBe('INTERNAL_ERROR');
    expect(res.body).not.toContain('secret internal detail');
    expect(res.json().request_id).toEqual(expect.any(String));
  });

  it('reports schema violations as VALIDATION_FAILED with field paths', async () => {
    const res = await app.inject({ method: 'POST', url: '/test/validated', payload: { n: 'x' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatchObject({ code: 'VALIDATION_FAILED', details: { issues: [{ path: 'n' }] } });
  });

  it('answers malformed JSON with VALIDATION_FAILED, not a crash', async () => {
    const res = await app.inject({
      method: 'POST', url: '/test/validated', payload: '{bad', headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_FAILED');
  });

  it('answers unknown routes with NOT_FOUND in the envelope', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/does-not-exist' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });
});

describe('health and readiness', () => {
  let scratch: Awaited<ReturnType<typeof createScratchDatabase>>;
  afterEach(async () => scratch?.drop());

  it('reports liveness and readiness against a migrated database', async () => {
    const pool = createPool(config.databaseUrl);
    const app = buildApp({ config, pool, logger: false });
    expect((await app.inject({ method: 'GET', url: '/health' })).json()).toEqual({ status: 'ok' });
    const ready = await app.inject({ method: 'GET', url: '/ready' });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toEqual({ status: 'ready' });
    await app.close();
    await pool.end();
  });

  it('is not ready while migrations are pending', async () => {
    scratch = await createScratchDatabase();
    const pool = createPool(scratch.url);
    const app = buildApp({ config, pool, logger: false });
    const ready = await app.inject({ method: 'GET', url: '/ready' });
    expect(ready.statusCode).toBe(503);
    expect(ready.json()).toEqual({ status: 'not_ready', checks: { database: 'ok', migrations: 'pending' } });
    await app.close();
    await pool.end();
  });

  it('is not ready when the database is unreachable', async () => {
    const pool = createPool('postgres://mosaic:mosaic@localhost:1/none');
    const app = buildApp({ config, pool, logger: false });
    const ready = await app.inject({ method: 'GET', url: '/ready' });
    expect(ready.statusCode).toBe(503);
    expect(ready.json().checks.database).toBe('unreachable');
    await app.close();
    await pool.end();
  });
});

import Fastify from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, as, loginAs } from '../../test/app.ts';
import { resetDatabase, testPool as db } from '../../test/db.ts';
import { insertUser } from '../../test/fixtures.ts';
import { registerAccessControl } from './access.ts';

const app = createTestApp();
app.register(async (scope) => {
  scope.get('/api/v1/test/admin-only', { config: { access: ['admin'] } }, async () => ({ ok: true }));
});
beforeEach(resetDatabase);

describe('role guard', () => {
  it('allows listed roles and forbids the others', async () => {
    await insertUser(db, { email: 'admin@icfo.test', role: 'admin' });
    await insertUser(db, { email: 'auditor@icfo.test', role: 'auditor' });

    const admin = await as(app, await loginAs(app, 'admin@icfo.test'), { method: 'GET', url: '/api/v1/test/admin-only' });
    const auditor = await as(app, await loginAs(app, 'auditor@icfo.test'), { method: 'GET', url: '/api/v1/test/admin-only' });

    expect(admin.statusCode).toBe(200);
    expect(auditor.statusCode).toBe(403);
    expect(auditor.json().error.code).toBe('FORBIDDEN');
  });

  it('answers unauthenticated callers with 401 before checking roles', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/test/admin-only' });
    expect(res.statusCode).toBe(401);
  });
});

describe('default deny', () => {
  it('refuses to start when an API route declares no access level', async () => {
    const bare = Fastify({ logger: false });
    registerAccessControl(bare);
    bare.get('/api/v1/forgotten', async () => ({}));
    await expect(bare.ready()).rejects.toThrow(/access/);
  });
});

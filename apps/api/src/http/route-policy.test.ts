import { beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../../test/app.ts';

// Guards every current and future route (08 §42, §64): the auditor role is strictly read-only.
const app = createTestApp();
beforeAll(() => app.ready());

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
// Session endpoints are the only mutations allowed without a role list.
const SESSION_ENDPOINTS = new Set(['POST /api/v1/auth/dev-login', 'POST /api/v1/auth/logout']);

describe('route access policy', () => {
  it('has routes to check', () => {
    expect(app.routeAccessTable.length).toBeGreaterThan(0);
  });

  it('never lets an auditor reach a mutating endpoint', () => {
    const violations = app.routeAccessTable
      .filter((r) => MUTATING.has(r.method) && !SESSION_ENDPOINTS.has(`${r.method} ${r.url}`))
      .filter((r) => !Array.isArray(r.access) || r.access.includes('auditor'))
      .map((r) => `${r.method} ${r.url} (${JSON.stringify(r.access)})`);
    expect(violations).toEqual([]);
  });
});

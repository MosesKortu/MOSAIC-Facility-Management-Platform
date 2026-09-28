import { beforeEach, describe, expect, it } from 'vitest';
import { as, createTestApp, loginAs } from '../../../test/app.ts';
import { resetDatabase, testPool as db } from '../../../test/db.ts';
import {
  addMember, auditFor, insertAllocation, insertEquipment, insertGrant, insertGroup, insertUser, type UserRow,
} from '../../../test/fixtures.ts';

const app = createTestApp();
let admin: UserRow;
let adminCookie: string;

beforeEach(async () => {
  await resetDatabase();
  admin = await insertUser(db, { email: 'admin@icfo.test', full_name: 'Ada Admin', role: 'admin' });
  adminCookie = await loginAs(app, 'admin@icfo.test');
});

const newInternal = { email: 'new@icfo.test', full_name: 'New Person', sso_identifier: 'sso-new', role: 'standard_user', user_type: 'internal' };

describe('GET /admin/users', () => {
  it('lists people with filters, search, paging and active groups', async () => {
    const anna = await insertUser(db, { email: 'anna@icfo.test', full_name: 'Anna Kowalski' });
    await insertUser(db, { email: 'bjorn@mpq.test', full_name: 'Björn Müller', user_type: 'external' });
    const group = await insertGroup(db, 'Nano Electronics');
    await addMember(db, group, anna.user_id);

    const internal = await as(app, adminCookie, { method: 'GET', url: '/api/v1/admin/users?user_type=internal&q=anna' });
    expect(internal.statusCode).toBe(200);
    expect(internal.json()).toMatchObject({ total: 1, limit: 50, offset: 0 });
    expect(internal.json().items[0]).toMatchObject({
      email: 'anna@icfo.test', user_type: 'internal', is_active: true, groups: [{ group_id: group, name: 'Nano Electronics' }],
    });

    const external = await as(app, adminCookie, { method: 'GET', url: '/api/v1/admin/users?user_type=external' });
    expect(external.json().items.map((u: { full_name: string }) => u.full_name)).toEqual(['Björn Müller']);

    const paged = await as(app, adminCookie, { method: 'GET', url: '/api/v1/admin/users?limit=1&offset=1&sort=email' });
    expect(paged.json()).toMatchObject({ total: 3, items: [{ email: 'anna@icfo.test' }] });
  });

  it('treats search text literally, not as a LIKE pattern', async () => {
    await insertUser(db, { email: 'anna@icfo.test', full_name: 'Anna' });
    const res = await as(app, adminCookie, { method: 'GET', url: '/api/v1/admin/users?q=%25' });
    expect(res.json().total).toBe(0);
  });

  it('is admin-only', async () => {
    await insertUser(db, { email: 'su@icfo.test', role: 'super_user' });
    await insertUser(db, { email: 'aud@icfo.test', role: 'auditor' });
    for (const email of ['su@icfo.test', 'aud@icfo.test']) {
      const res = await as(app, await loginAs(app, email), { method: 'GET', url: '/api/v1/admin/users' });
      expect(res.statusCode).toBe(403);
    }
  });
});

describe('POST /admin/users', () => {
  it('creates an internal user and audits it', async () => {
    const res = await as(app, adminCookie, { method: 'POST', url: '/api/v1/admin/users', payload: { ...newInternal, email: 'New@ICFO.test' } });
    expect(res.statusCode).toBe(201);
    const created = res.json();
    expect(created).toMatchObject({ email: 'new@icfo.test', role: 'standard_user', user_type: 'internal', is_active: true, sponsor: null });

    const audit = await auditFor(db, created.user_id);
    expect(audit).toEqual([
      expect.objectContaining({ action: 'user.created', actor_user_id: admin.user_id, before_state: null,
        after_state: expect.objectContaining({ email: 'new@icfo.test', role: 'standard_user' }) }),
    ]);
  });

  it('creates an external collaborator with an internal sponsor', async () => {
    const sponsor = await insertUser(db, { email: 'host@icfo.test', full_name: 'Host Person' });
    const res = await as(app, adminCookie, {
      method: 'POST', url: '/api/v1/admin/users',
      payload: { ...newInternal, email: 'guest@uni.test', user_type: 'external', sponsor_user_id: sponsor.user_id },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().sponsor).toEqual({ user_id: sponsor.user_id, full_name: 'Host Person', email: 'host@icfo.test' });
  });

  it.each([
    ['an external without a sponsor', { user_type: 'external' }, 'INVALID_SPONSOR'],
    ['an internal with a sponsor', { sponsor_user_id: 'SPONSOR' }, 'INVALID_SPONSOR'],
    ['an external with a staff role', { user_type: 'external', role: 'admin', sponsor_user_id: 'SPONSOR' }, 'ROLE_NOT_ALLOWED_FOR_EXTERNAL'],
  ])('rejects %s', async (_label, overrides, code) => {
    const sponsor = await insertUser(db);
    const payload: Record<string, string> = { ...newInternal, ...overrides };
    if (payload.sponsor_user_id === 'SPONSOR') payload.sponsor_user_id = sponsor.user_id;
    const res = await as(app, adminCookie, { method: 'POST', url: '/api/v1/admin/users', payload });
    expect(res.json().error.code).toBe(code);
    expect((await db.query('SELECT 1 FROM users WHERE email = $1', ['new@icfo.test'])).rowCount).toBe(0);
  });

  it('rejects a sponsor who is external or deactivated', async () => {
    const external = await insertUser(db, { user_type: 'external' });
    const inactive = await insertUser(db, { is_active: false });
    for (const sponsor of [external, inactive]) {
      const res = await as(app, adminCookie, {
        method: 'POST', url: '/api/v1/admin/users',
        payload: { ...newInternal, user_type: 'external', sponsor_user_id: sponsor.user_id },
      });
      expect(res.json().error.code).toBe('INVALID_SPONSOR');
    }
  });

  it('reports which unique field is already taken', async () => {
    await insertUser(db, { email: 'new@icfo.test' });
    const res = await as(app, adminCookie, { method: 'POST', url: '/api/v1/admin/users', payload: newInternal });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatchObject({ code: 'DUPLICATE', details: { field: 'email' } });
  });
});

describe('GET /admin/users/:id', () => {
  it('shows groups, sponsorship, certifications and funding access', async () => {
    const anna = await insertUser(db, { email: 'anna@icfo.test', full_name: 'Anna Kowalski' });
    const guest = await insertUser(db, { email: 'guest@uni.test', full_name: 'Guest', user_type: 'external' });
    await db.query('INSERT INTO external_user_sponsors VALUES ($1, $2)', [guest.user_id, anna.user_id]);
    const group = await insertGroup(db, 'Nano Electronics');
    await addMember(db, group, anna.user_id);
    const grant = await insertGrant(db, anna.user_id);
    await insertAllocation(db, grant, group, '2500.00');
    const equipment = await insertEquipment(db, { code: 'EBL_CRESTEC' });
    await db.query(`INSERT INTO user_certifications (user_id, equipment_id, theoretical_passed, practical_status)
                    VALUES ($1, $2, true, 'pending')`, [anna.user_id, equipment]);

    const res = await as(app, adminCookie, { method: 'GET', url: `/api/v1/admin/users/${anna.user_id}` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      full_name: 'Anna Kowalski', sponsor: null,
      sponsored: [{ user_id: guest.user_id, full_name: 'Guest' }],
      groups: [{ group_id: group }],
      certifications: [{ equipment_code: 'EBL_CRESTEC', theoretical_passed: true, practical_status: 'pending', expires_at: null }],
      funding: [{ group: { group_id: group }, remaining_balance: '2500.00', is_active: true }],
    });
  });

  it('answers unknown and malformed ids with NOT_FOUND', async () => {
    for (const id of ['00000000-0000-4000-8000-000000000000', 'not-a-uuid']) {
      const res = await as(app, adminCookie, { method: 'GET', url: `/api/v1/admin/users/${id}` });
      expect(res.statusCode).toBe(404);
      expect(res.json().error).toMatchObject({ code: 'NOT_FOUND', details: { entity: 'user' } });
    }
  });
});

describe('PATCH /admin/users/:id', () => {
  it('audits each changed field separately and skips unchanged ones', async () => {
    const anna = await insertUser(db, { full_name: 'Anna Kowalski' });
    const res = await as(app, adminCookie, {
      method: 'PATCH', url: `/api/v1/admin/users/${anna.user_id}`,
      payload: { full_name: 'Anna Kowalski', role: 'super_user', is_active: false },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ role: 'super_user', is_active: false });
    expect(await auditFor(db, anna.user_id)).toEqual([
      expect.objectContaining({ action: 'user.role_changed', before_state: { role: 'standard_user' }, after_state: { role: 'super_user' } }),
      expect.objectContaining({ action: 'user.deactivated', before_state: { is_active: true }, after_state: { is_active: false } }),
    ]);
  });

  it('prevents an admin from demoting or deactivating themselves', async () => {
    for (const payload of [{ role: 'standard_user' }, { is_active: false }]) {
      const res = await as(app, adminCookie, { method: 'PATCH', url: `/api/v1/admin/users/${admin.user_id}`, payload });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('SELF_LOCKOUT');
    }
  });

  it('keeps externals as standard users and sponsors internal', async () => {
    const host = await insertUser(db);
    const guest = await insertUser(db, { user_type: 'external' });
    await db.query('INSERT INTO external_user_sponsors VALUES ($1, $2)', [guest.user_id, host.user_id]);
    const anna = await insertUser(db);

    const promote = await as(app, adminCookie, { method: 'PATCH', url: `/api/v1/admin/users/${guest.user_id}`, payload: { role: 'admin' } });
    expect(promote.json().error.code).toBe('ROLE_NOT_ALLOWED_FOR_EXTERNAL');

    const internalSponsor = await as(app, adminCookie, { method: 'PATCH', url: `/api/v1/admin/users/${anna.user_id}`, payload: { sponsor_user_id: host.user_id } });
    expect(internalSponsor.json().error.code).toBe('INVALID_SPONSOR');

    const newHost = await insertUser(db, { full_name: 'New Host' });
    const moved = await as(app, adminCookie, { method: 'PATCH', url: `/api/v1/admin/users/${guest.user_id}`, payload: { sponsor_user_id: newHost.user_id } });
    expect(moved.json().sponsor).toMatchObject({ user_id: newHost.user_id });
    expect((await auditFor(db, guest.user_id)).map((a) => a.action)).toEqual(['user.sponsor_changed']);
  });

  it('rejects an empty update', async () => {
    const anna = await insertUser(db);
    const res = await as(app, adminCookie, { method: 'PATCH', url: `/api/v1/admin/users/${anna.user_id}`, payload: {} });
    expect(res.json().error.code).toBe('VALIDATION_FAILED');
  });
});

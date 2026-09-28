import { beforeEach, describe, expect, it } from 'vitest';
import { as, createTestApp, loginAs } from '../../../test/app.ts';
import { resetDatabase, testPool as db } from '../../../test/db.ts';
import { addMember, auditFor, insertAllocation, insertGrant, insertGroup, insertUser, type UserRow } from '../../../test/fixtures.ts';

const app = createTestApp();
let admin: UserRow;
let cookie: string;

beforeEach(async () => {
  await resetDatabase();
  admin = await insertUser(db, { email: 'admin@icfo.test', role: 'admin' });
  cookie = await loginAs(app, 'admin@icfo.test');
});

const req = (method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: object) =>
  as(app, cookie, { method, url: `/api/v1/admin${url}`, ...(payload && { payload }) });

describe('creating and listing groups', () => {
  it('creates a group and audits it', async () => {
    const res = await req('POST', '/groups', { name: '  Nano Electronics Group ', description: 'Quantum devices' });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ name: 'Nano Electronics Group', is_active: true, members: [], allocations: [] });
    expect((await auditFor(db, res.json().group_id)).map((a) => a.action)).toEqual(['group.created']);
  });

  it('rejects a name already used by an active group, ignoring case', async () => {
    await insertGroup(db, 'Nano Electronics Group');
    const res = await req('POST', '/groups', { name: 'nano electronics group' });
    expect(res.json().error).toMatchObject({ code: 'DUPLICATE', details: { field: 'name' } });
  });

  it('summarises members by type and funding from allocations', async () => {
    const group = await insertGroup(db, 'Nano Electronics Group');
    const pi = await insertUser(db);
    await addMember(db, group, pi.user_id);
    await addMember(db, group, (await insertUser(db, { user_type: 'external' })).user_id);
    const grant = await insertGrant(db, pi.user_id, { allocated_budget: '50000.00' });
    const allocation = await insertAllocation(db, grant, group, '25000.00');
    await db.query('UPDATE grant_group_allocations SET remaining_balance = 10180 WHERE allocation_id = $1', [allocation]);

    const res = await req('GET', '/groups');
    expect(res.json()).toMatchObject({
      total: 1,
      items: [{ name: 'Nano Electronics Group', internal_members: 1, external_members: 1,
        funding: { allocated: '25000.00', remaining: '10180.00', consumed: '14820.00', active_allocations: 1 } }],
    });
  });

  it('shows members and allocations in the detail', async () => {
    const group = await insertGroup(db, 'Nano Electronics Group');
    const anna = await insertUser(db, { full_name: 'Anna Kowalski' });
    await addMember(db, group, anna.user_id);
    const grant = await insertGrant(db, anna.user_id);
    await insertAllocation(db, grant, group, '1000.00');

    const res = await req('GET', `/groups/${group}`);
    expect(res.json()).toMatchObject({
      members: [{ user_id: anna.user_id, full_name: 'Anna Kowalski', user_type: 'internal', is_active: true }],
      allocations: [{ grant_id: grant, allocated_amount: '1000.00', remaining_balance: '1000.00', is_active: true }],
    });
  });

  it('is admin-only', async () => {
    await insertUser(db, { email: 'aud@icfo.test', role: 'auditor' });
    const res = await as(app, await loginAs(app, 'aud@icfo.test'), { method: 'GET', url: '/api/v1/admin/groups' });
    expect(res.statusCode).toBe(403);
  });
});

describe('PATCH /admin/groups/:id', () => {
  it('renames and deactivates with one audit event per change', async () => {
    const group = await insertGroup(db, 'Old Name');
    const res = await req('PATCH', `/groups/${group}`, { name: 'New Name', is_active: false });
    expect(res.json()).toMatchObject({ name: 'New Name', is_active: false });
    expect((await auditFor(db, group)).map((a) => a.action)).toEqual(['group.renamed', 'group.deactivated']);
  });

  it('refuses to reactivate a group whose name is now taken', async () => {
    const old = await insertGroup(db, 'Photonics');
    await req('PATCH', `/groups/${old}`, { is_active: false });
    await insertGroup(db, 'Photonics');
    const res = await req('PATCH', `/groups/${old}`, { is_active: true });
    expect(res.json().error).toMatchObject({ code: 'DUPLICATE', details: { field: 'name' } });
  });
});

describe('group membership', () => {
  it('adds a member idempotently, auditing only the real change', async () => {
    const group = await insertGroup(db);
    const anna = await insertUser(db);
    const first = await req('PUT', `/groups/${group}/members/${anna.user_id}`);
    const again = await req('PUT', `/groups/${group}/members/${anna.user_id}`);
    expect(first.statusCode).toBe(200);
    expect(again.json().members).toHaveLength(1);
    expect(await auditFor(db, group)).toEqual([
      expect.objectContaining({ action: 'group.member_added', actor_user_id: admin.user_id, after_state: { user_id: anna.user_id } }),
    ]);
  });

  it('removes by deactivating the membership, and re-adding reactivates it', async () => {
    const group = await insertGroup(db);
    const anna = await insertUser(db);
    await addMember(db, group, anna.user_id);

    const removed = await req('DELETE', `/groups/${group}/members/${anna.user_id}`);
    expect(removed.json().members).toEqual([]);
    expect((await req('DELETE', `/groups/${group}/members/${anna.user_id}`)).json().error.code).toBe('NOT_FOUND');

    await req('PUT', `/groups/${group}/members/${anna.user_id}`);
    const { rows } = await db.query('SELECT count(*)::int AS n, bool_and(is_active) AS active FROM group_memberships');
    expect(rows[0]).toEqual({ n: 1, active: true });
    expect((await auditFor(db, group)).map((a) => a.action)).toEqual(['group.member_removed', 'group.member_added']);
  });

  it('does not add members to a deactivated group or unknown users', async () => {
    const group = await insertGroup(db);
    await req('PATCH', `/groups/${group}`, { is_active: false });
    const inactive = await req('PUT', `/groups/${group}/members/${(await insertUser(db)).user_id}`);
    expect(inactive.json().error.code).toBe('GROUP_INACTIVE');

    const active = await insertGroup(db);
    const unknown = await req('PUT', `/groups/${active}/members/00000000-0000-4000-8000-000000000000`);
    expect(unknown.json().error).toMatchObject({ code: 'NOT_FOUND', details: { entity: 'user' } });
  });
});

describe('GET /admin/audit', () => {
  it('lists audit events newest first with the actor, filterable by entity', async () => {
    const group = (await req('POST', '/groups', { name: 'Audited' })).json().group_id as string;
    await req('PATCH', `/groups/${group}`, { name: 'Audited Again' });
    await req('POST', '/groups', { name: 'Other' });

    const res = await req('GET', `/audit?entity_id=${group}`);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      total: 2,
      items: [
        { action: 'group.renamed', entity_type: 'group', actor: { user_id: admin.user_id, email: 'admin@icfo.test' },
          before_state: { name: 'Audited' }, after_state: { name: 'Audited Again' } },
        { action: 'group.created' },
      ],
    });
  });
});

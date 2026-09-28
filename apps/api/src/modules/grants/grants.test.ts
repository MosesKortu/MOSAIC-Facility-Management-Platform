import { beforeEach, describe, expect, it } from 'vitest';
import { as, createTestApp, loginAs } from '../../../test/app.ts';
import { resetDatabase, testPool as db } from '../../../test/db.ts';
import { addMember, auditFor, insertAllocation, insertGrant, insertGroup, insertUser, type UserRow } from '../../../test/fixtures.ts';

const app = createTestApp();
let pi: UserRow;
let cookie: string;

beforeEach(async () => {
  await resetDatabase();
  await insertUser(db, { email: 'admin@icfo.test', role: 'admin' });
  pi = await insertUser(db, { email: 'pi@icfo.test', full_name: 'Prof. PI' });
  cookie = await loginAs(app, 'admin@icfo.test');
});

const req = (method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object) =>
  as(app, cookie, { method, url: `/api/v1/admin${url}`, ...(payload && { payload }) });

/** Simulates booking consumption against an allocation (the booking slice does this for real). */
async function consume(allocationId: string, grantId: string, amount: string) {
  await db.query('UPDATE grant_group_allocations SET remaining_balance = remaining_balance - $2 WHERE allocation_id = $1', [allocationId, amount]);
  await db.query('UPDATE grants SET remaining_balance = remaining_balance - $2 WHERE grant_id = $1', [grantId, amount]);
}

describe('grants', () => {
  const body = () => ({ grant_code: 'ICFO-2026', pi_user_id: pi.user_id, allocated_budget: '50000.00', expiration_date: '2027-12-31' });

  it('creates a grant with its full budget remaining and audits it', async () => {
    const res = await req('POST', '/grants', body());
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      grant_code: 'ICFO-2026', pi: { user_id: pi.user_id, full_name: 'Prof. PI' }, expiration_date: '2027-12-31', is_expired: false,
      allocated_budget: '50000.00', allocated_to_groups: '0.00', unallocated: '50000.00', consumed: '0.00', remaining_balance: '50000.00',
      allocations: [],
    });
    expect((await auditFor(db, res.json().grant_id)).map((a) => a.action)).toEqual(['grant.created']);
  });

  it('requires an active internal PI and a unique code', async () => {
    const external = await insertUser(db, { user_type: 'external' });
    expect((await req('POST', '/grants', { ...body(), pi_user_id: external.user_id })).json().error.code).toBe('INVALID_PI');
    await req('POST', '/grants', body());
    expect((await req('POST', '/grants', body())).json().error).toMatchObject({ code: 'DUPLICATE', details: { field: 'grant_code' } });
  });

  it('rejects malformed money and dates', async () => {
    const res = await req('POST', '/grants', { ...body(), allocated_budget: '12.345', expiration_date: '2027-02-30' });
    expect(res.json().error.code).toBe('VALIDATION_FAILED');
    expect(res.json().error.details.issues.map((i: { path: string }) => i.path).sort()).toEqual(['allocated_budget', 'expiration_date']);
  });

  it('keeps consumption when the budget changes, and refuses to go below the allocations', async () => {
    const grant = await insertGrant(db, pi.user_id, { allocated_budget: '10000.00' });
    const allocation = await insertAllocation(db, grant, await insertGroup(db), '6000.00');
    await consume(allocation, grant, '1500.00');

    const raised = await req('PATCH', `/grants/${grant}`, { allocated_budget: '12000.00' });
    expect(raised.json()).toMatchObject({ allocated_budget: '12000.00', consumed: '1500.00', remaining_balance: '10500.00', unallocated: '6000.00' });

    const tooLow = await req('PATCH', `/grants/${grant}`, { allocated_budget: '5999.99' });
    expect(tooLow.json().error).toMatchObject({ code: 'BUDGET_BELOW_ALLOCATED', details: { allocated_to_groups: '6000.00' } });
    expect((await auditFor(db, grant)).map((a) => a.action)).toEqual(['grant.budget_changed']);
  });

  it('lists grants with totals and an expiry filter', async () => {
    await insertGrant(db, pi.user_id, { expiration_date: '2020-01-01' });
    const current = await insertGrant(db, pi.user_id, { expiration_date: '2099-01-01' });
    const res = await req('GET', '/grants?expired=false');
    expect(res.json()).toMatchObject({ total: 1, items: [{ grant_id: current, is_expired: false, allocation_count: 0 }] });
  });

  it('is admin-only', async () => {
    await insertUser(db, { email: 'aud@icfo.test', role: 'auditor' });
    const res = await as(app, await loginAs(app, 'aud@icfo.test'), { method: 'POST', url: '/api/v1/admin/grants', payload: body() });
    expect(res.statusCode).toBe(403);
  });
});

describe('group allocations', () => {
  let grant: string;
  let group: string;
  beforeEach(async () => {
    grant = await insertGrant(db, pi.user_id, { allocated_budget: '10000.00' });
    group = await insertGroup(db, 'Nano Electronics Group');
  });

  it('allocates part of a grant to a group, audits it and notifies active members', async () => {
    const member = await insertUser(db);
    await addMember(db, group, member.user_id);
    const res = await req('POST', '/grant-allocations', { grant_id: grant, group_id: group, allocated_amount: '4000.00' });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ group: { group_id: group }, allocated_amount: '4000.00', remaining_balance: '4000.00', consumed: '0.00', is_active: true });
    expect((await auditFor(db, res.json().allocation_id)).map((a) => a.action)).toEqual(['allocation.created']);
    const { rows } = await db.query('SELECT user_id, type, payload FROM notifications');
    expect(rows).toEqual([{ user_id: member.user_id, type: 'grant_allocation_changed',
      payload: expect.objectContaining({ group_name: 'Nano Electronics Group', allocated_amount: '4000.00' }) }]);
  });

  it('never lets allocations exceed the grant budget', async () => {
    await req('POST', '/grant-allocations', { grant_id: grant, group_id: group, allocated_amount: '7000.00' });
    const res = await req('POST', '/grant-allocations', { grant_id: grant, group_id: await insertGroup(db), allocated_amount: '3000.01' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatchObject({ code: 'OVER_ALLOCATION', details: { unallocated: '3000.00' } });
  });

  it('serialises concurrent allocations so the budget cannot be overspent', async () => {
    const groups = await Promise.all([insertGroup(db), insertGroup(db), insertGroup(db)]);
    const results = await Promise.all(groups.map((g) =>
      req('POST', '/grant-allocations', { grant_id: grant, group_id: g, allocated_amount: '4000.00' })));
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 201, 409]);
    const { rows } = await db.query('SELECT sum(allocated_amount)::text AS total FROM grant_group_allocations');
    expect(rows[0].total).toBe('8000.00');
  });

  it('allows one allocation per grant and group, and none to an inactive group', async () => {
    await req('POST', '/grant-allocations', { grant_id: grant, group_id: group, allocated_amount: '100.00' });
    const again = await req('POST', '/grant-allocations', { grant_id: grant, group_id: group, allocated_amount: '100.00' });
    expect(again.json().error).toMatchObject({ code: 'DUPLICATE', details: { field: 'group_id' } });

    const inactive = await insertGroup(db);
    await db.query('UPDATE groups SET is_active = false WHERE group_id = $1', [inactive]);
    const res = await req('POST', '/grant-allocations', { grant_id: grant, group_id: inactive, allocated_amount: '100.00' });
    expect(res.json().error.code).toBe('GROUP_INACTIVE');
  });

  it('adjusts an allocation while preserving what was consumed', async () => {
    const allocation = await insertAllocation(db, grant, group, '5000.00');
    await consume(allocation, grant, '1200.00');

    const res = await req('PATCH', `/grant-allocations/${allocation}`, { allocated_amount: '3000.00' });
    expect(res.json()).toMatchObject({ allocated_amount: '3000.00', consumed: '1200.00', remaining_balance: '1800.00' });

    const below = await req('PATCH', `/grant-allocations/${allocation}`, { allocated_amount: '1199.99' });
    expect(below.json().error).toMatchObject({ code: 'ALLOCATION_BELOW_CONSUMED', details: { consumed: '1200.00' } });

    const over = await req('PATCH', `/grant-allocations/${allocation}`, { allocated_amount: '10000.01' });
    expect(over.json().error.code).toBe('OVER_ALLOCATION');

    expect((await auditFor(db, allocation)).map((a) => [a.action, a.before_state, a.after_state])).toEqual([
      ['allocation.amount_changed', { allocated_amount: '5000.00' }, { allocated_amount: '3000.00' }],
    ]);
  });

  it('deactivates an allocation without touching balances', async () => {
    const allocation = await insertAllocation(db, grant, group, '5000.00');
    const res = await req('PATCH', `/grant-allocations/${allocation}`, { is_active: false });
    expect(res.json()).toMatchObject({ is_active: false, remaining_balance: '5000.00' });
    expect((await auditFor(db, allocation)).map((a) => a.action)).toEqual(['allocation.deactivated']);
  });

  it('lists allocations with consumption, filterable by grant and group', async () => {
    const other = await insertGroup(db, 'Other');
    const a1 = await insertAllocation(db, grant, group, '5000.00');
    await insertAllocation(db, grant, other, '1000.00');
    await consume(a1, grant, '250.00');

    const res = await req('GET', `/grant-allocations?group_id=${group}`);
    expect(res.json()).toMatchObject({ total: 1, items: [{ allocation_id: a1, consumed: '250.00', group: { name: 'Nano Electronics Group', is_active: true } }] });
    const bySpend = await req('GET', `/grant-allocations?grant_id=${grant}&sort=consumed&order=desc`);
    expect(bySpend.json().items.map((a: { allocation_id: string }) => a.allocation_id)[0]).toBe(a1);
  });

  it("reads a grant's history together with its allocations' history", async () => {
    const created = (await req('POST', '/grant-allocations', { grant_id: grant, group_id: group, allocated_amount: '100.00' })).json();
    await req('PATCH', `/grants/${grant}`, { allocated_budget: '11000.00' });
    const res = await req('GET', `/audit?entity_ids=${grant},${created.allocation_id}`);
    expect(res.json().items.map((e: { action: string }) => e.action)).toEqual(['grant.budget_changed', 'allocation.created']);
    const tooMany = await req('GET', `/audit?entity_ids=${Array.from({ length: 51 }, () => grant).join(',')}`);
    expect(tooMany.json().error.code).toBe('VALIDATION_FAILED');
  });

  it('shows allocations in the grant detail with its totals', async () => {
    const allocation = await insertAllocation(db, grant, group, '4000.00');
    await consume(allocation, grant, '1000.00');
    const res = await req('GET', `/grants/${grant}`);
    expect(res.json()).toMatchObject({
      allocated_to_groups: '4000.00', unallocated: '6000.00', consumed: '1000.00', remaining_balance: '9000.00',
      allocations: [{ allocation_id: allocation, remaining_balance: '3000.00' }],
    });
  });
});

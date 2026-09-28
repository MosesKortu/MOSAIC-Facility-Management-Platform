import { FACILITY_TIMEZONE, localParts, zonedToInstant } from '@mosaic/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { as, createTestApp, loginAs } from '../../../test/app.ts';
import { resetDatabase, testPool as db } from '../../../test/db.ts';
import {
  addMember, auditFor, insertAllocation, insertBookingRow, insertCertification, insertEquipment, insertGrant, insertGroup, insertUser,
  insertWindow, type UserRow,
} from '../../../test/fixtures.ts';

const app = createTestApp();
let anna: UserRow;
let tech: UserRow;
let cookie: string;
let techCookie: string;
let equipment: string;
let group: string;
let grant: string;
let allocation: string;

// A local day ~30 days ahead; windows are open 08:00–20:00 every day.
const day = localParts(new Date(Date.now() + 30 * 24 * 3600_000), FACILITY_TIMEZONE).date;
const at = (hours: number) => zonedToInstant(day, Math.round(hours * 60), FACILITY_TIMEZONE).toISOString();

beforeEach(async () => {
  await resetDatabase();
  anna = await insertUser(db, { email: 'anna@icfo.test', full_name: 'Anna Kowalski' });
  tech = await insertUser(db, { email: 'tech@icfo.test', role: 'super_user', full_name: 'Marc Tech' });
  cookie = await loginAs(app, 'anna@icfo.test');
  techCookie = await loginAs(app, 'tech@icfo.test');
  equipment = await insertEquipment(db, { code: 'EBL', base_rate_hourly: '100.00' }); // buffer 30 min (schema default)
  for (let weekday = 1; weekday <= 7; weekday++) await insertWindow(db, equipment, weekday, '08:00', '20:00');
  await insertCertification(db, anna.user_id, equipment);
  group = await insertGroup(db, 'Nano Group');
  await addMember(db, group, anna.user_id);
  grant = await insertGrant(db, tech.user_id, { allocated_budget: '10000.00' });
  allocation = await insertAllocation(db, grant, group, '1000.00');
});

const body = (overrides: object = {}) => ({
  equipment_id: equipment, allocation_id: allocation, start_time: at(10), end_time: at(13), support_requested: 'technician', ...overrides,
});
const book = (overrides: object = {}, c = cookie) => as(app, c, { method: 'POST', url: '/api/v1/bookings', payload: body(overrides) });
const quote = (overrides: object = {}, c = cookie) => as(app, c, { method: 'POST', url: '/api/v1/bookings/quote', payload: body(overrides) });
const cancel = (id: string, payload: object = {}, c = cookie) => as(app, c, { method: 'PATCH', url: `/api/v1/bookings/${id}/cancel`, payload });
const balances = async () => (await db.query<{ allocation: string; grant: string }>(
  `SELECT a.remaining_balance AS allocation, g.remaining_balance AS grant
   FROM grant_group_allocations a JOIN grants g USING (grant_id) WHERE a.allocation_id = $1`, [allocation])).rows[0];
const errorOf = async (res: Promise<{ json: () => { error: { code: string; details?: unknown } } }>) => (await res).json().error;

describe('POST /bookings', () => {
  it('confirms a booking, prices it and decrements both the allocation and the grant (D7)', async () => {
    const res = await book();
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({
      booking_id: expect.any(String), status: 'confirmed', duration_minutes: 180,
      calculated_base_cost: '300.00', calculated_support_cost: '120.00', total_cost: '420.00', allocation_remaining_after: '580.00',
    });
    expect(await balances()).toEqual({ allocation: '580.00', grant: '9580.00' });
    const { rows } = await db.query('SELECT user_id, booked_by_user_id, grant_id, status, force_override FROM bookings');
    expect(rows).toEqual([{ user_id: anna.user_id, booked_by_user_id: anna.user_id, grant_id: grant, status: 'confirmed', force_override: false }]);
    expect(await auditFor(db, res.json().booking_id)).toEqual([]); // only proxy and override bookings are audited
  });

  it('quotes with the same gates and writes nothing', async () => {
    const res = await quote();
    expect(res.json()).toEqual({
      duration_minutes: 180, calculated_base_cost: '300.00', calculated_support_cost: '120.00', total_cost: '420.00', allocation_remaining_after: '580.00',
    });
    expect(await balances()).toEqual({ allocation: '1000.00', grant: '10000.00' });
    expect((await db.query('SELECT 1 FROM bookings')).rowCount).toBe(0);
    expect((await errorOf(quote({ start_time: at(10.1) }))).code).toBe('INVALID_DURATION');
  });

  it('checks permission, equipment and time before anything else', async () => {
    const other = await insertUser(db);
    expect((await errorOf(book({ on_behalf_of_user_id: other.user_id, start_time: at(10.1) })))).toMatchObject({ code: 'PROXY_NOT_PERMITTED' });
    expect((await errorOf(book({ force_override: true })))).toMatchObject({ code: 'PROXY_NOT_PERMITTED' });

    await db.query('UPDATE equipment SET is_active = false WHERE equipment_id = $1', [equipment]);
    expect(await errorOf(book())).toMatchObject({ code: 'NOT_FOUND', details: { entity: 'equipment' } });
    await db.query('UPDATE equipment SET is_active = true WHERE equipment_id = $1', [equipment]);

    expect((await errorOf(book({ end_time: at(10.25) }))).code).toBe('INVALID_DURATION');
    expect((await errorOf(book({ start_time: at(7.5) }))).code).toBe('OUTSIDE_AVAILABILITY');
  });

  it('blocks non-operational equipment unless staff override it, which is audited', async () => {
    await db.query("UPDATE equipment SET status = 'maintenance' WHERE equipment_id = $1", [equipment]);
    expect(await errorOf(book())).toMatchObject({ code: 'EQUIPMENT_NOT_OPERATIONAL', details: { status: 'maintenance' } });

    await insertCertification(db, tech.user_id, equipment);
    await addMember(db, group, tech.user_id);
    const res = await book({ force_override: true }, techCookie);
    expect(res.statusCode).toBe(201);
    expect(await auditFor(db, res.json().booking_id)).toEqual([expect.objectContaining({
      action: 'booking.created', actor_user_id: tech.user_id, after_state: expect.objectContaining({ force_override: true, on_behalf_of: null }),
    })]);
  });

  it('refuses a disabled support tier', async () => {
    await db.query("UPDATE support_tariffs SET is_available = false WHERE tier = 'technician'");
    expect(await errorOf(book())).toMatchObject({ code: 'SUPPORT_UNAVAILABLE', details: { tier: 'technician' } });
    expect((await book({ support_requested: 'none' })).statusCode).toBe(201);
  });

  it('enforces certification through accessState, valid until the end of the slot', async () => {
    await db.query('DELETE FROM user_certifications');
    expect((await errorOf(book())).code).toBe('CERTIFICATION_REQUIRED');

    await insertCertification(db, anna.user_id, equipment, { practical_status: 'pending' });
    expect(await errorOf(book())).toMatchObject({ code: 'PRACTICAL_CERTIFICATION_PENDING', details: { practical_status: 'pending' } });

    const expiresMidSession = at(11);
    await db.query("UPDATE user_certifications SET practical_status = 'signed_off', practical_signed_off_at = now(), expires_at = $1", [expiresMidSession]);
    expect(await errorOf(book())).toMatchObject({ code: 'CERTIFICATION_EXPIRED', details: { expired_at: new Date(expiresMidSession).toISOString() } });
  });

  it('requires an allocation of an active group the beneficiary belongs to, from an unexpired grant', async () => {
    const otherGroup = await insertGroup(db);
    const foreign = await insertAllocation(db, grant, otherGroup, '100.00');
    expect((await errorOf(book({ allocation_id: foreign }))).code).toBe('ALLOCATION_NOT_AVAILABLE');

    await db.query('UPDATE grant_group_allocations SET is_active = false WHERE allocation_id = $1', [allocation]);
    expect((await errorOf(book())).code).toBe('ALLOCATION_NOT_AVAILABLE');
    await db.query('UPDATE grant_group_allocations SET is_active = true WHERE allocation_id = $1', [allocation]);

    const dayBefore = localParts(new Date(Date.parse(at(10)) - 24 * 3600_000), FACILITY_TIMEZONE).date;
    await db.query('UPDATE grants SET expiration_date = $1 WHERE grant_id = $2', [dayBefore, grant]);
    expect(await errorOf(book())).toMatchObject({ code: 'GRANT_EXPIRED', details: { expired_on: dayBefore } });
    await db.query('UPDATE grants SET expiration_date = $1 WHERE grant_id = $2', [day, grant]);
    expect((await book()).statusCode).toBe(201); // valid through the end of its last day
  });

  it('keeps the buffer between bookings and suggests the next free slot', async () => {
    const other = await insertUser(db);
    await insertBookingRow(db, { equipment_id: equipment, user_id: other.user_id, grant_id: grant, allocation_id: allocation, start: at(10), end: at(12) });

    const clash = await errorOf(book({ start_time: at(12), end_time: at(13) }));
    expect(clash).toMatchObject({ code: 'BOOKING_CONFLICT', details: { next_available: at(12.5) } });
    expect((await book({ start_time: at(12.5), end_time: at(13.5) })).statusCode).toBe(201);
  });

  it('puts eligibility before capacity', async () => {
    const other = await insertUser(db);
    await insertBookingRow(db, { equipment_id: equipment, user_id: other.user_id, grant_id: grant, allocation_id: allocation, start: at(10), end: at(13) });
    await db.query('DELETE FROM user_certifications');
    expect((await errorOf(book())).code).toBe('CERTIFICATION_REQUIRED');
  });

  it('serialises concurrent requests for the same slot', async () => {
    const results = await Promise.all([book(), book(), book()]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409, 409]);
    expect(await balances()).toEqual({ allocation: '580.00', grant: '9580.00' });
  });

  it('refuses a booking the allocation cannot cover', async () => {
    await db.query("UPDATE grant_group_allocations SET allocated_amount = 100, remaining_balance = 100 WHERE allocation_id = $1", [allocation]);
    expect(await errorOf(book())).toMatchObject({ code: 'INSUFFICIENT_GRANT_BALANCE', details: { shortfall: '320.00', available: '100.00' } });
  });

  it('notifies the group once when a booking takes the allocation below 10 %', async () => {
    const lowBalance = async () => (await db.query("SELECT user_id FROM notifications WHERE type = 'allocation_low_balance'")).rows;
    await book({ start_time: at(8), end_time: at(17.5), support_requested: 'none' }); // 950.00 → 50.00 left
    expect(await lowBalance()).toEqual([{ user_id: anna.user_id }]);
    await book({ start_time: at(18), end_time: at(18.5), support_requested: 'none' }); // → 0.00, already low
    expect(await lowBalance()).toHaveLength(1);
  });

  it('lets staff book on behalf of a researcher, gated as that researcher and audited', async () => {
    const res = await book({ on_behalf_of_user_id: anna.user_id }, techCookie);
    expect(res.statusCode).toBe(201);
    const { rows } = await db.query('SELECT user_id, booked_by_user_id FROM bookings');
    expect(rows).toEqual([{ user_id: anna.user_id, booked_by_user_id: tech.user_id }]);
    expect((await auditFor(db, res.json().booking_id)).map((a) => a.after_state)).toEqual([
      expect.objectContaining({ on_behalf_of: anna.user_id, force_override: false }),
    ]);

    await db.query('DELETE FROM user_certifications WHERE user_id = $1', [anna.user_id]);
    await insertCertification(db, tech.user_id, equipment);
    expect((await errorOf(book({ on_behalf_of_user_id: anna.user_id, start_time: at(15), end_time: at(16) }, techCookie))).code)
      .toBe('CERTIFICATION_REQUIRED');

    const auditor = await insertUser(db, { role: 'auditor' });
    expect(await errorOf(book({ on_behalf_of_user_id: auditor.user_id }, techCookie))).toMatchObject({ code: 'NOT_FOUND', details: { entity: 'user' } });
  });
});

describe('PATCH /bookings/:id/cancel', () => {
  it('refunds both balances before the slot starts and frees the slot', async () => {
    const id = (await book()).json().booking_id;
    const res = await cancel(id);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'cancelled', cancellable: false, cancelled_at: expect.any(String) });
    expect(await balances()).toEqual({ allocation: '1000.00', grant: '10000.00' });
    expect((await book()).statusCode).toBe(201);
    expect((await errorOf(cancel(id))).code).toBe('BOOKING_NOT_CANCELLABLE');
  });

  it('refuses once the slot has started (no refund, D5)', async () => {
    const id = await insertBookingRow(db, {
      equipment_id: equipment, user_id: anna.user_id, grant_id: grant, allocation_id: allocation,
      start: new Date(Date.now() - 60_000).toISOString(), end: new Date(Date.now() + 3600_000).toISOString(),
    });
    expect((await errorOf(cancel(id))).code).toBe('SLOT_ALREADY_STARTED');
  });

  it("hides other people's bookings from researchers", async () => {
    const id = (await book()).json().booking_id;
    await insertUser(db, { email: 'other@icfo.test' });
    const res = await cancel(id, {}, await loginAs(app, 'other@icfo.test'));
    expect(res.json().error).toMatchObject({ code: 'NOT_FOUND', details: { entity: 'booking' } });
  });

  it('requires staff to give a reason, audits it and notifies the owner', async () => {
    const id = (await book()).json().booking_id;
    expect((await errorOf(cancel(id, { reason: '  ' }, techCookie))).code).toBe('REASON_REQUIRED');
    const res = await cancel(id, { reason: 'Chamber vented for repair' }, techCookie);
    expect(res.json()).toMatchObject({ status: 'cancelled', cancellation_reason: 'Chamber vented for repair' });
    expect((await auditFor(db, id)).map((a) => a.action)).toEqual(['booking.cancelled']);
    const { rows } = await db.query("SELECT user_id, payload FROM notifications WHERE type = 'booking_cancelled_by_staff'");
    expect(rows).toEqual([{ user_id: anna.user_id, payload: expect.objectContaining({ booking_id: id, reason: 'Chamber vented for repair', refunded: '420.00' }) }]);
  });
});

describe('reading bookings', () => {
  it('lists own bookings; all bookings only for staff; detail for the owner or staff', async () => {
    const id = (await book()).json().booking_id;
    const mine = await as(app, cookie, { method: 'GET', url: '/api/v1/bookings' });
    expect(mine.json()).toMatchObject({ total: 1, items: [{
      booking_id: id, equipment: { code: 'EBL' }, user: { full_name: 'Anna Kowalski' }, start_time: new Date(at(10)).toISOString(),
      status: 'confirmed', total_cost: '420.00', group: { name: 'Nano Group' },
    }] });
    expect((await as(app, cookie, { method: 'GET', url: '/api/v1/bookings?scope=all' })).statusCode).toBe(403);
    expect((await as(app, techCookie, { method: 'GET', url: '/api/v1/bookings?scope=all' })).json().total).toBe(1);
    expect((await as(app, techCookie, { method: 'GET', url: '/api/v1/bookings' })).json().total).toBe(0);

    const detail = await as(app, cookie, { method: 'GET', url: `/api/v1/bookings/${id}` });
    expect(detail.json()).toMatchObject({ booking_id: id, cancellable: true, session_events: [] });
    expect((await as(app, techCookie, { method: 'GET', url: `/api/v1/bookings/${id}` })).statusCode).toBe(200);
    await insertUser(db, { email: 'other@icfo.test' });
    expect((await as(app, await loginAs(app, 'other@icfo.test'), { method: 'GET', url: `/api/v1/bookings/${id}` })).statusCode).toBe(404);
  });
});

describe('GET /equipment/:id/availability', () => {
  it('returns windows and buffered busy ranges without identities', async () => {
    const other = await insertUser(db);
    await insertBookingRow(db, { equipment_id: equipment, user_id: other.user_id, grant_id: grant, allocation_id: allocation, start: at(15), end: at(16) });
    await book();
    const res = await as(app, cookie, { method: 'GET', url: `/api/v1/equipment/${equipment}/availability?from=${at(0)}&to=${at(23)}` });
    expect(res.json()).toMatchObject({ timezone: 'Europe/Madrid', buffer_time_minutes: 30 });
    expect(res.json().windows).toHaveLength(7);
    expect(res.json().busy).toEqual([
      { start: new Date(at(9.5)).toISOString(), end: new Date(at(13.5)).toISOString(), mine: true },
      { start: new Date(at(14.5)).toISOString(), end: new Date(at(16.5)).toISOString(), mine: false },
    ]);
    expect(res.body).not.toContain(other.user_id);

    const tooLong = await as(app, cookie, { method: 'GET', url: `/api/v1/equipment/${equipment}/availability?from=${at(0)}&to=2099-01-01T00:00:00Z` });
    expect(tooLong.json().error.code).toBe('VALIDATION_FAILED');
  });
});

describe('GET /funding/me', () => {
  it("lists the caller's group allocations with whether each can be used", async () => {
    const expired = await insertGrant(db, tech.user_id, { expiration_date: '2020-01-01' });
    await insertAllocation(db, expired, group, '50.00');
    const res = await as(app, cookie, { method: 'GET', url: '/api/v1/funding/me' });
    expect(res.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({ allocation_id: allocation, group: { group_id: group, name: 'Nano Group' }, remaining_balance: '1000.00', usable: true, unusable_reason: null }),
      expect.objectContaining({ usable: false, unusable_reason: 'grant_expired' }),
    ]));
    expect(res.json()).toHaveLength(2);
  });

  it("gives staff a beneficiary's funding for proxy bookings, and nobody else", async () => {
    expect((await as(app, cookie, { method: 'GET', url: `/api/v1/funding/me?user_id=${tech.user_id}` })).json().error.code).toBe('PROXY_NOT_PERMITTED');
    const res = await as(app, techCookie, { method: 'GET', url: `/api/v1/funding/me?user_id=${anna.user_id}` });
    expect(res.json().map((f: { allocation_id: string }) => f.allocation_id)).toEqual([allocation]);
  });
});

describe('GET /bookings/beneficiaries', () => {
  it('lets staff search active people who can be booked for, with contact fields only', async () => {
    await insertUser(db, { full_name: 'Anna Inactive', email: 'anna.old@icfo.test', is_active: false });
    await insertUser(db, { full_name: 'Anna Auditor', role: 'auditor' });
    const res = await as(app, techCookie, { method: 'GET', url: '/api/v1/bookings/beneficiaries?q=anna' });
    expect(res.json()).toEqual([{ user_id: anna.user_id, full_name: 'Anna Kowalski', email: 'anna@icfo.test' }]);
    expect((await as(app, cookie, { method: 'GET', url: '/api/v1/bookings/beneficiaries?q=anna' })).statusCode).toBe(403);
  });
});

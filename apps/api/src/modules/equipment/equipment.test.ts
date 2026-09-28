import { beforeEach, describe, expect, it } from 'vitest';
import { as, createTestApp, loginAs } from '../../../test/app.ts';
import { resetDatabase, testPool as db } from '../../../test/db.ts';
import {
  addMember, auditFor, insertAllocation, insertBookingRow, insertCertification, insertEquipment, insertGrant, insertGroup,
  insertUser, insertWindow, type UserRow,
} from '../../../test/fixtures.ts';

const app = createTestApp();
let researcher: UserRow;
let cookie: string;

beforeEach(async () => {
  await resetDatabase();
  researcher = await insertUser(db, { email: 'anna@icfo.test' });
  cookie = await loginAs(app, 'anna@icfo.test');
});

describe('GET /equipment (discovery)', () => {
  it('lists active equipment in the requested language with my access state', async () => {
    const rie = await insertEquipment(db, { code: 'RIE_OXFORD_100', name: { en: 'RIE Oxford', es: 'RIE Oxford (ES)' }, description: { en: 'Dry etching', es: 'Grabado seco' } });
    await insertEquipment(db, { code: 'RETIRED', is_active: false });
    await insertCertification(db, researcher.user_id, rie, { practical_status: 'pending' });

    const res = await as(app, cookie, { method: 'GET', url: '/api/v1/equipment', headers: { 'accept-language': 'es-ES,es;q=0.9' } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      total: 1,
      items: [{ code: 'RIE_OXFORD_100', name: 'RIE Oxford (ES)', description: 'Grabado seco', status: 'operational', base_rate_hourly: '100.00',
        my_certification: { access: 'assessment_pending', theoretical_passed: true, practical_status: 'pending' } }],
    });
  });

  it('filters by facility, status and search text', async () => {
    await insertEquipment(db, { code: 'EBL_CRESTEC', facility: 'NFL' });
    await insertEquipment(db, { code: 'STED_LEICA', facility: 'SLN', status: 'maintenance' });
    const sln = await as(app, cookie, { method: 'GET', url: '/api/v1/equipment?facility=SLN&status=maintenance' });
    expect(sln.json().items.map((e: { code: string }) => e.code)).toEqual(['STED_LEICA']);
    const search = await as(app, cookie, { method: 'GET', url: '/api/v1/equipment?q=crestec' });
    expect(search.json().items.map((e: { code: string }) => e.code)).toEqual(['EBL_CRESTEC']);
  });

  it('is not available to auditors', async () => {
    await insertUser(db, { email: 'aud@icfo.test', role: 'auditor' });
    const res = await as(app, await loginAs(app, 'aud@icfo.test'), { method: 'GET', url: '/api/v1/equipment' });
    expect(res.statusCode).toBe(403);
  });
});

describe('GET /equipment/:id', () => {
  it('includes windows, tariffs, interlock presence and a certified state', async () => {
    const id = await insertEquipment(db, { code: 'EBL_CRESTEC' });
    await insertWindow(db, id, 2, '09:00', '17:00');
    await insertWindow(db, id, 1, '08:00', '12:00');
    await insertCertification(db, researcher.user_id, id);

    const res = await as(app, cookie, { method: 'GET', url: `/api/v1/equipment/${id}` });
    expect(res.json()).toMatchObject({
      code: 'EBL_CRESTEC', buffer_time_minutes: 30, has_interlock: false, certification_validity_months: null,
      availability_windows: [{ weekday: 1, opens_at: '08:00', closes_at: '12:00' }, { weekday: 2, opens_at: '09:00', closes_at: '17:00' }],
      support_tariffs: [
        { tier: 'none', rate_hourly: '0.00', is_available: true },
        { tier: 'technician', rate_hourly: '40.00', is_available: true },
        { tier: 'supervisor', rate_hourly: '60.00', is_available: true },
      ],
      my_certification: { access: 'certified' },
    });
  });

  it('reports expired certification and treats retired equipment as gone', async () => {
    const id = await insertEquipment(db);
    await insertCertification(db, researcher.user_id, id, { expires_at: '2020-01-01T00:00:00Z' });
    expect((await as(app, cookie, { method: 'GET', url: `/api/v1/equipment/${id}` })).json().my_certification.access).toBe('expired');

    const retired = await insertEquipment(db, { is_active: false });
    const res = await as(app, cookie, { method: 'GET', url: `/api/v1/equipment/${retired}` });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.details).toEqual({ entity: 'equipment' });
  });
});

describe('PATCH /equipment/:id/status (operations)', () => {
  let tech: string;
  beforeEach(async () => {
    await insertUser(db, { email: 'tech@icfo.test', role: 'super_user', full_name: 'Marc Tech' });
    tech = await loginAs(app, 'tech@icfo.test');
  });

  it('changes status with an event, an audit row and notifications for upcoming bookings', async () => {
    const id = await insertEquipment(db);
    const group = await insertGroup(db);
    await addMember(db, group, researcher.user_id);
    const grant = await insertGrant(db, researcher.user_id);
    const allocation = await insertAllocation(db, grant, group);
    const base = { equipment_id: id, user_id: researcher.user_id, grant_id: grant, allocation_id: allocation };
    await insertBookingRow(db, { ...base, start: '2099-01-05T09:00:00Z', end: '2099-01-05T10:00:00Z' });
    await insertBookingRow(db, { ...base, start: '2099-01-06T09:00:00Z', end: '2099-01-06T10:00:00Z', status: 'cancelled' });
    await insertBookingRow(db, { ...base, start: '2020-01-05T09:00:00Z', end: '2020-01-05T10:00:00Z', status: 'completed' });

    const res = await as(app, tech, { method: 'PATCH', url: `/api/v1/equipment/${id}/status`, payload: { status: 'maintenance', reason: 'Chamber pump service' } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ equipment: { status: 'maintenance' }, affected_bookings: 1 });

    const history = await as(app, cookie, { method: 'GET', url: `/api/v1/equipment/${id}/status-events` });
    expect(history.json()).toMatchObject([{ previous_status: 'operational', new_status: 'maintenance', reason: 'Chamber pump service', changed_by: { full_name: 'Marc Tech' } }]);
    expect((await auditFor(db, id)).map((a) => a.action)).toEqual(['equipment.status_changed']);
    const { rows } = await db.query('SELECT user_id, type FROM notifications');
    expect(rows).toEqual([{ user_id: researcher.user_id, type: 'equipment_status_changed' }]);
    const { rows: bookings } = await db.query("SELECT count(*)::int AS n FROM bookings WHERE status = 'confirmed'");
    expect(bookings[0].n).toBe(1); // never auto-cancelled
  });

  it('requires a reason and a real change', async () => {
    const id = await insertEquipment(db);
    const blank = await as(app, tech, { method: 'PATCH', url: `/api/v1/equipment/${id}/status`, payload: { status: 'offline', reason: '   ' } });
    expect(blank.json().error.code).toBe('REASON_REQUIRED');
    const same = await as(app, tech, { method: 'PATCH', url: `/api/v1/equipment/${id}/status`, payload: { status: 'operational', reason: 'noop' } });
    expect(same.json().error.code).toBe('STATUS_UNCHANGED');
  });

  it('is limited to super users and admins', async () => {
    const id = await insertEquipment(db);
    const res = await as(app, cookie, { method: 'PATCH', url: `/api/v1/equipment/${id}/status`, payload: { status: 'offline', reason: 'x' } });
    expect(res.statusCode).toBe(403);
  });
});

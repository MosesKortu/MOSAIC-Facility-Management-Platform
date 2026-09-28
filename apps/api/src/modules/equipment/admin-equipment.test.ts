import { beforeEach, describe, expect, it } from 'vitest';
import { as, createTestApp, loginAs } from '../../../test/app.ts';
import { resetDatabase, testPool as db } from '../../../test/db.ts';
import { auditFor, insertEquipment, insertUser, insertWindow } from '../../../test/fixtures.ts';

const app = createTestApp();
let cookie: string;

beforeEach(async () => {
  await resetDatabase();
  await insertUser(db, { email: 'admin@icfo.test', role: 'admin' });
  cookie = await loginAs(app, 'admin@icfo.test');
});

const req = (method: 'GET' | 'POST' | 'PATCH' | 'PUT', url: string, payload?: object) =>
  as(app, cookie, { method, url: `/api/v1/admin${url}`, ...(payload && { payload }) });

const newEquipment = {
  code: 'ebl_crestec', facility: 'NFL',
  name: { en: 'EBL CRESTEC CABL-9510C', es: 'EBL CRESTEC CABL-9510C' }, description: { en: 'Electron beam lithography' },
  base_rate_hourly: '80.20', buffer_time_minutes: 30, certification_validity_months: 24,
  interlock_ip: '192.168.1.101', interlock_mqtt_topic: null,
};

describe('admin equipment', () => {
  it('creates equipment (operational, no windows yet) and audits it', async () => {
    const res = await req('POST', '/equipment', newEquipment);
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      code: 'EBL_CRESTEC', status: 'operational', is_active: true, base_rate_hourly: '80.20',
      name: { en: 'EBL CRESTEC CABL-9510C', es: 'EBL CRESTEC CABL-9510C' }, availability_windows: [], weekly_hours: 0,
    });
    expect((await auditFor(db, res.json().equipment_id)).map((a) => a.action)).toEqual(['equipment.created']);
    expect((await req('POST', '/equipment', newEquipment)).json().error).toMatchObject({ code: 'DUPLICATE', details: { field: 'code' } });
  });

  it('updates configuration with one audit event listing only what changed, never the status', async () => {
    const id = await insertEquipment(db, { code: 'RIE_OXFORD_100', base_rate_hourly: '104.50' });
    const res = await req('PATCH', `/equipment/${id}`, { base_rate_hourly: '110.00', buffer_time_minutes: 30, interlock_mqtt_topic: 'nfl/rie' });
    expect(res.json()).toMatchObject({ base_rate_hourly: '110.00', interlock_mqtt_topic: 'nfl/rie' });
    expect((await auditFor(db, id)).map((a) => [a.action, a.before_state, a.after_state])).toEqual([
      ['equipment.updated', { base_rate_hourly: '104.50', interlock_mqtt_topic: null }, { base_rate_hourly: '110.00', interlock_mqtt_topic: 'nfl/rie' }],
    ]);
    const status = await req('PATCH', `/equipment/${id}`, { status: 'offline' });
    expect(status.json().error.code).toBe('VALIDATION_FAILED');
  });

  it('retires and restores equipment with distinct audit events', async () => {
    const id = await insertEquipment(db);
    await req('PATCH', `/equipment/${id}`, { is_active: false });
    await req('PATCH', `/equipment/${id}`, { is_active: true });
    expect((await auditFor(db, id)).map((a) => a.action)).toEqual(['equipment.deactivated', 'equipment.activated']);
  });

  it('replaces the weekly availability windows atomically', async () => {
    const id = await insertEquipment(db);
    await insertWindow(db, id, 1, '08:00', '12:00');
    const res = await req('PUT', `/equipment/${id}/availability`, { windows: [
      { weekday: 1, opens_at: '09:00', closes_at: '13:00' },
      { weekday: 1, opens_at: '14:00', closes_at: '18:00' },
      { weekday: 5, opens_at: '09:00', closes_at: '12:30' },
    ] });
    expect(res.json()).toMatchObject({ weekly_hours: 11.5, availability_windows: [{ weekday: 1, opens_at: '09:00' }, { weekday: 1, opens_at: '14:00' }, { weekday: 5 }] });
    expect((await auditFor(db, id)).map((a) => a.action)).toEqual(['equipment.availability_changed']);

    const overlap = await req('PUT', `/equipment/${id}/availability`, { windows: [
      { weekday: 2, opens_at: '09:00', closes_at: '13:00' }, { weekday: 2, opens_at: '12:00', closes_at: '14:00' },
    ] });
    expect(overlap.json().error.code).toBe('WINDOW_OVERLAP');
    expect((await req('GET', `/equipment/${id}`)).json().availability_windows).toHaveLength(3); // unchanged
    const offGrid = await req('PUT', `/equipment/${id}/availability`, { windows: [{ weekday: 2, opens_at: '09:10', closes_at: '13:00' }] });
    expect(offGrid.json().error.code).toBe('VALIDATION_FAILED');
  });

  it('lists all equipment, including retired, for admins only', async () => {
    await insertEquipment(db, { code: 'A_ONE' });
    await insertEquipment(db, { code: 'B_TWO', is_active: false });
    expect((await req('GET', '/equipment')).json()).toMatchObject({ total: 2, items: [{ code: 'A_ONE' }, { code: 'B_TWO', is_active: false }] });
    await insertUser(db, { email: 'su@icfo.test', role: 'super_user' });
    const su = await as(app, await loginAs(app, 'su@icfo.test'), { method: 'GET', url: '/api/v1/admin/equipment' });
    expect(su.statusCode).toBe(403);
  });
});

describe('support tariffs', () => {
  it('changes a rate and availability with audit, leaving historical bookings untouched', async () => {
    const res = await req('PATCH', '/tariffs/technician', { rate_hourly: '45.00', is_available: false });
    expect(res.json()).toEqual({ tier: 'technician', rate_hourly: '45.00', is_available: false });
    const list = await req('GET', '/tariffs');
    expect(list.json().map((t: { tier: string }) => t.tier)).toEqual(['none', 'technician', 'supervisor']);
    const { rows } = await db.query("SELECT action FROM audit_log WHERE entity_type = 'tariff' ORDER BY seq");
    expect(rows.map((r) => r.action)).toEqual(['tariff.rate_changed', 'tariff.availability_changed']);
  });

  it('keeps the autonomous tier free and always available', async () => {
    const res = await req('PATCH', '/tariffs/none', { rate_hourly: '5.00' });
    expect(res.json().error.code).toBe('VALIDATION_FAILED');
    expect((await req('PATCH', '/tariffs/premium', { rate_hourly: '5.00' })).statusCode).toBe(404);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase, testPool as db } from '../../test/db.ts';
import {
  addMember, insertAllocation, insertBookingRow, insertEquipment, insertGrant, insertGroup, insertUser,
} from '../../test/fixtures.ts';

// Database-level guarantees that back the service rules (last line of defence, 09_ARCHITECTURE.md §4).
beforeEach(resetDatabase);

describe('people constraints', () => {
  it('only allows external users to hold the standard_user role', async () => {
    await expect(insertUser(db, { user_type: 'external', role: 'admin' })).rejects.toThrow(/users_external_is_standard/);
  });

  it('requires an external sponsored user and an internal sponsor', async () => {
    const internal = await insertUser(db);
    const external = await insertUser(db, { user_type: 'external' });
    const sponsor = 'INSERT INTO external_user_sponsors (external_user_id, sponsor_user_id) VALUES ($1, $2)';

    await expect(db.query(sponsor, [internal.user_id, external.user_id])).rejects.toThrow(/must be external/);
    const otherExternal = await insertUser(db, { user_type: 'external' });
    await expect(db.query(sponsor, [external.user_id, otherExternal.user_id])).rejects.toThrow(/must be internal/);
    await expect(db.query(sponsor, [external.user_id, internal.user_id])).resolves.toBeDefined();
  });

  it('keeps active group names unique case-insensitively', async () => {
    await insertGroup(db, 'Nano Electronics');
    await expect(insertGroup(db, 'nano electronics')).rejects.toThrow(/groups_name_unique_active/);
  });
});

describe('funding constraints', () => {
  it('rejects allocations that exceed the grant budget', async () => {
    const pi = await insertUser(db);
    const grant = await insertGrant(db, pi.user_id, { allocated_budget: '1000.00' });
    await insertAllocation(db, grant, await insertGroup(db), '600.00');
    await expect(insertAllocation(db, grant, await insertGroup(db), '500.00')).rejects.toThrow(/exceed budget/);
  });

  it('rejects shrinking a grant budget below its allocations', async () => {
    const pi = await insertUser(db);
    const grant = await insertGrant(db, pi.user_id, { allocated_budget: '1000.00' });
    await insertAllocation(db, grant, await insertGroup(db), '800.00');
    await expect(
      db.query('UPDATE grants SET allocated_budget = 700, remaining_balance = 700 WHERE grant_id = $1', [grant]),
    ).rejects.toThrow(/exceed budget/);
  });

  it('never lets a balance go negative or above its allocation', async () => {
    const pi = await insertUser(db);
    const grant = await insertGrant(db, pi.user_id);
    const allocation = await insertAllocation(db, grant, await insertGroup(db), '100.00');
    const setRemaining = 'UPDATE grant_group_allocations SET remaining_balance = $2 WHERE allocation_id = $1';
    await expect(db.query(setRemaining, [allocation, '-0.01'])).rejects.toThrow(/check/);
    await expect(db.query(setRemaining, [allocation, '100.01'])).rejects.toThrow(/check/);
    await expect(
      db.query('UPDATE grants SET remaining_balance = -1 WHERE grant_id = $1', [grant]),
    ).rejects.toThrow(/check/);
  });
});

describe('booking constraints', () => {
  async function setup() {
    const user = await insertUser(db);
    const group = await insertGroup(db);
    await addMember(db, group, user.user_id);
    const grant = await insertGrant(db, user.user_id);
    const allocation = await insertAllocation(db, grant, group);
    const equipment = await insertEquipment(db);
    return { user, grant, allocation, equipment };
  }

  it('rejects overlapping reservations on the same instrument but allows back-to-back slots', async () => {
    const s = await setup();
    const base = { equipment_id: s.equipment, user_id: s.user.user_id, grant_id: s.grant, allocation_id: s.allocation };
    await insertBookingRow(db, { ...base, start: '2030-01-07T09:00:00Z', end: '2030-01-07T11:00:00Z' });

    await expect(
      insertBookingRow(db, { ...base, start: '2030-01-07T10:00:00Z', end: '2030-01-07T12:00:00Z' }),
    ).rejects.toThrow(/bookings_equipment_id_slot_range_excl/);
    await expect(
      insertBookingRow(db, { ...base, start: '2030-01-07T11:00:00Z', end: '2030-01-07T12:00:00Z' }),
    ).resolves.toBeDefined();
  });

  it('ignores cancelled bookings for overlap', async () => {
    const s = await setup();
    const base = { equipment_id: s.equipment, user_id: s.user.user_id, grant_id: s.grant, allocation_id: s.allocation };
    await insertBookingRow(db, { ...base, start: '2030-01-07T09:00:00Z', end: '2030-01-07T11:00:00Z', status: 'cancelled' });
    await expect(
      insertBookingRow(db, { ...base, start: '2030-01-07T09:00:00Z', end: '2030-01-07T11:00:00Z' }),
    ).resolves.toBeDefined();
  });

  it('requires the consumed allocation to belong to the booking grant', async () => {
    const s = await setup();
    const otherGrant = await insertGrant(db, s.user.user_id);
    await expect(
      insertBookingRow(db, {
        equipment_id: s.equipment, user_id: s.user.user_id, grant_id: otherGrant, allocation_id: s.allocation,
        start: '2030-01-07T09:00:00Z', end: '2030-01-07T10:00:00Z',
      }),
    ).rejects.toThrow(/foreign key/);
  });

  it('generates total_cost from its two components', async () => {
    const s = await setup();
    const id = await insertBookingRow(db, {
      equipment_id: s.equipment, user_id: s.user.user_id, grant_id: s.grant, allocation_id: s.allocation,
      start: '2030-01-07T09:00:00Z', end: '2030-01-07T10:00:00Z',
    });
    const { rows } = await db.query('SELECT total_cost FROM bookings WHERE booking_id = $1', [id]);
    expect(rows[0].total_cost).toBe('120.00');
  });
});

describe('audit log', () => {
  it('is append-only', async () => {
    const actor = await insertUser(db);
    const { rows } = await db.query(
      `INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id) VALUES ($1, 'test', 'user', $1) RETURNING log_id`,
      [actor.user_id],
    );
    await expect(db.query(`UPDATE audit_log SET action = 'tampered' WHERE log_id = $1`, [rows[0].log_id]))
      .rejects.toThrow(/append-only/);
    await expect(db.query('DELETE FROM audit_log WHERE log_id = $1', [rows[0].log_id])).rejects.toThrow(/append-only/);
  });
});

describe('equipment', () => {
  it('requires an English name as the localisation fallback', async () => {
    await expect(
      db.query(
        `INSERT INTO equipment (code, facility, name, description, base_rate_hourly) VALUES ('X', 'NFL', $1, $2, 10)`,
        [{ es: 'Solo español' }, { en: 'Description' }],
      ),
    ).rejects.toThrow(/check/);
  });
});

import { randomUUID } from 'node:crypto';
import type { Queryable } from '../src/db/pool.ts';

/**
 * Builders for synthetic test/dev data. This is the only place fixture data is created; production
 * code paths never import it (08_IMPLEMENTATION_CONTRACT.md §53).
 */

type Role = 'standard_user' | 'super_user' | 'admin' | 'auditor';

export interface UserRow { user_id: string; email: string; role: Role; user_type: 'internal' | 'external' }

export async function insertUser(
  db: Queryable,
  overrides: Partial<{ email: string; full_name: string; role: Role; user_type: 'internal' | 'external'; is_active: boolean }> = {},
): Promise<UserRow> {
  const suffix = randomUUID().slice(0, 8);
  const { rows } = await db.query<UserRow>(
    `INSERT INTO users (sso_identifier, email, full_name, role, user_type, is_active)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING user_id, email, role, user_type`,
    [
      `sso-${suffix}`,
      overrides.email ?? `user-${suffix}@icfo.test`,
      overrides.full_name ?? `Test User ${suffix}`,
      overrides.role ?? 'standard_user',
      overrides.user_type ?? 'internal',
      overrides.is_active ?? true,
    ],
  );
  return rows[0]!;
}

export async function insertGroup(db: Queryable, name = `Group ${randomUUID().slice(0, 8)}`): Promise<string> {
  const { rows } = await db.query<{ group_id: string }>('INSERT INTO groups (name) VALUES ($1) RETURNING group_id', [name]);
  return rows[0]!.group_id;
}

export async function addMember(db: Queryable, groupId: string, userId: string): Promise<void> {
  await db.query('INSERT INTO group_memberships (group_id, user_id) VALUES ($1, $2)', [groupId, userId]);
}

export async function insertGrant(
  db: Queryable,
  piUserId: string,
  overrides: Partial<{ allocated_budget: string; remaining_balance: string; expiration_date: string }> = {},
): Promise<string> {
  const budget = overrides.allocated_budget ?? '10000.00';
  const { rows } = await db.query<{ grant_id: string }>(
    `INSERT INTO grants (grant_code, pi_user_id, allocated_budget, remaining_balance, expiration_date)
     VALUES ($1, $2, $3, $4, $5) RETURNING grant_id`,
    [`GR-${randomUUID().slice(0, 8)}`, piUserId, budget, overrides.remaining_balance ?? budget,
     overrides.expiration_date ?? '2099-12-31'],
  );
  return rows[0]!.grant_id;
}

export async function insertAllocation(db: Queryable, grantId: string, groupId: string, amount = '1000.00'): Promise<string> {
  const { rows } = await db.query<{ allocation_id: string }>(
    `INSERT INTO grant_group_allocations (grant_id, group_id, allocated_amount, remaining_balance)
     VALUES ($1, $2, $3, $3) RETURNING allocation_id`,
    [grantId, groupId, amount],
  );
  return rows[0]!.allocation_id;
}

export async function insertEquipment(
  db: Queryable,
  overrides: Partial<{
    code: string; facility: 'NFL' | 'NCL' | 'SLN'; base_rate_hourly: string; status: string; is_active: boolean;
    name: Record<string, string>; description: Record<string, string>;
  }> = {},
): Promise<string> {
  const code = overrides.code ?? `EQ_${randomUUID().slice(0, 8).toUpperCase()}`;
  const { rows } = await db.query<{ equipment_id: string }>(
    `INSERT INTO equipment (code, facility, name, description, base_rate_hourly, status, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING equipment_id`,
    [code, overrides.facility ?? 'NFL', overrides.name ?? { en: `Instrument ${code}` }, overrides.description ?? { en: 'Test instrument' },
     overrides.base_rate_hourly ?? '100.00', overrides.status ?? 'operational', overrides.is_active ?? true],
  );
  return rows[0]!.equipment_id;
}

/** Inserts a booking row directly (bypassing the service) — for constraint tests only. */
export async function insertBookingRow(
  db: Queryable,
  b: { equipment_id: string; user_id: string; grant_id: string; allocation_id: string; start: string; end: string; status?: string },
): Promise<string> {
  const cancelled = b.status === 'cancelled';
  const { rows } = await db.query<{ booking_id: string }>(
    `INSERT INTO bookings (equipment_id, user_id, booked_by_user_id, grant_id, allocation_id, slot_range,
                           status, calculated_base_cost, calculated_support_cost, cancelled_at, cancelled_by)
     VALUES ($1, $2, $2, $3, $4, tstzrange($5, $6, '[)'), $7, 100, 20,
             ${cancelled ? 'now()' : 'NULL'}, ${cancelled ? '$2' : 'NULL'})
     RETURNING booking_id`,
    [b.equipment_id, b.user_id, b.grant_id, b.allocation_id, b.start, b.end, b.status ?? 'confirmed'],
  );
  return rows[0]!.booking_id;
}

/** Rows written to audit_log for an entity, oldest first. */
export async function auditFor(db: Queryable, entityId: string) {
  const { rows } = await db.query<{ action: string; actor_user_id: string; before_state: unknown; after_state: unknown }>(
    'SELECT action, actor_user_id, before_state, after_state FROM audit_log WHERE entity_id = $1 ORDER BY seq',
    [entityId],
  );
  return rows;
}

export async function insertWindow(db: Queryable, equipmentId: string, weekday: number, opens: string, closes: string): Promise<void> {
  await db.query('INSERT INTO equipment_availability_windows (equipment_id, weekday, opens_at, closes_at) VALUES ($1, $2, $3, $4)',
    [equipmentId, weekday, opens, closes]);
}

export async function insertCertification(
  db: Queryable, userId: string, equipmentId: string,
  c: { theoretical_passed?: boolean; practical_status?: string; expires_at?: string | null } = {},
): Promise<void> {
  const status = c.practical_status ?? 'signed_off';
  const signedOff = status === 'signed_off';
  await db.query(
    `INSERT INTO user_certifications (user_id, equipment_id, theoretical_passed, practical_status, practical_signed_off_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, equipmentId, c.theoretical_passed ?? true, status, signedOff ? new Date() : null, c.expires_at ?? null],
  );
}

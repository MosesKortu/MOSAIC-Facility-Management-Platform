import type { BookingDetail, PersonRef, BookingListQuery, BookingSummary, FundingOption, LocalizedText } from '@mosaic/contracts';
import type { z } from 'zod';
import type { Queryable } from '../../db/pool.ts';
import { containsPattern } from '../../db/sql.ts';
import type { Range } from './slots.ts';

// ─── Gate inputs ───────────────────────────────────────────────────────────────────────────────

export async function findUser(db: Queryable, userId: string) {
  const { rows } = await db.query<{ user_id: string; role: string; is_active: boolean }>(
    'SELECT user_id, role, is_active FROM users WHERE user_id = $1', [userId]);
  return rows[0];
}

export async function tariff(db: Queryable, tier: string) {
  const { rows } = await db.query<{ rate_hourly: string; is_available: boolean }>(
    'SELECT rate_hourly, is_available FROM support_tariffs WHERE tier = $1', [tier]);
  return rows[0]!; // one row per tier, seeded by the schema
}

export async function certification(db: Queryable, userId: string, equipmentId: string) {
  const { rows } = await db.query<{ theoretical_passed: boolean; practical_status: 'not_requested' | 'pending' | 'signed_off' | 'rejected'; expires_at: Date | null }>(
    'SELECT theoretical_passed, practical_status, expires_at FROM user_certifications WHERE user_id = $1 AND equipment_id = $2',
    [userId, equipmentId]);
  return rows[0] ?? null;
}

export interface LockedAllocation {
  allocation_id: string;
  grant_id: string;
  group_id: string;
  group_name: string;
  allocated_amount: string;
  remaining_balance: string;
  is_active: boolean;
  group_active: boolean;
  /** The beneficiary is an active member of the allocation's group. */
  is_member: boolean;
}

/** Locks the allocation row (lock order: equipment → allocation → grant, 09 §4). */
export async function lockAllocation(db: Queryable, allocationId: string, userId: string): Promise<LockedAllocation | undefined> {
  const { rows } = await db.query<LockedAllocation>(
    `SELECT a.allocation_id, a.grant_id, a.group_id, g.name AS group_name, a.allocated_amount, a.remaining_balance, a.is_active,
            g.is_active AS group_active,
            EXISTS (SELECT 1 FROM group_memberships m WHERE m.group_id = a.group_id AND m.user_id = $2 AND m.is_active) AS is_member
     FROM grant_group_allocations a JOIN groups g ON g.group_id = a.group_id
     WHERE a.allocation_id = $1 FOR UPDATE OF a`,
    [allocationId, userId]);
  return rows[0];
}

export async function lockGrant(db: Queryable, grantId: string) {
  const { rows } = await db.query<{ grant_code: string; remaining_balance: string; expiration_date: string }>(
    'SELECT grant_code, remaining_balance, expiration_date::text AS expiration_date FROM grants WHERE grant_id = $1 FOR UPDATE', [grantId]);
  return rows[0]!; // composite FK: the allocation's grant exists
}

/** Non-cancelled bookings on the instrument overlapping `range`, oldest first. */
export async function bookingsIn(db: Queryable, equipmentId: string, range: Range) {
  const { rows } = await db.query<{ user_id: string; start: Date; end: Date }>(
    `SELECT user_id, lower(slot_range) AS start, upper(slot_range) AS "end" FROM bookings
     WHERE equipment_id = $1 AND status <> 'cancelled' AND slot_range && tstzrange($2, $3, '[)')
     ORDER BY lower(slot_range)`,
    [equipmentId, range.start, range.end]);
  return rows;
}

// ─── Writes ────────────────────────────────────────────────────────────────────────────────────

export async function insertBooking(db: Queryable, b: {
  equipment_id: string; user_id: string; booked_by_user_id: string; grant_id: string; allocation_id: string; support_requested: string;
  start: Date; end: Date; base: string; support: string; force_override: boolean;
}): Promise<string> {
  const { rows } = await db.query<{ booking_id: string }>(
    `INSERT INTO bookings (equipment_id, user_id, booked_by_user_id, grant_id, allocation_id, support_requested, slot_range,
                           calculated_base_cost, calculated_support_cost, force_override)
     VALUES ($1, $2, $3, $4, $5, $6, tstzrange($7, $8, '[)'), $9, $10, $11) RETURNING booking_id`,
    [b.equipment_id, b.user_id, b.booked_by_user_id, b.grant_id, b.allocation_id, b.support_requested, b.start, b.end, b.base, b.support, b.force_override]);
  return rows[0]!.booking_id;
}

/** Adds `delta` (negative to charge, positive to refund) to both balances (D7). */
export async function adjustBalances(db: Queryable, allocationId: string, grantId: string, delta: string): Promise<void> {
  await db.query('UPDATE grant_group_allocations SET remaining_balance = remaining_balance + $2 WHERE allocation_id = $1', [allocationId, delta]);
  await db.query('UPDATE grants SET remaining_balance = remaining_balance + $2 WHERE grant_id = $1', [grantId, delta]);
}

export async function lockBooking(db: Queryable, bookingId: string) {
  const { rows } = await db.query<{
    user_id: string; status: string; start: Date; allocation_id: string; grant_id: string; total_cost: string; equipment_id: string; equipment_name: LocalizedText;
  }>(
    `SELECT b.user_id, b.status, lower(b.slot_range) AS start, b.allocation_id, b.grant_id, b.total_cost, b.equipment_id, e.name AS equipment_name
     FROM bookings b JOIN equipment e ON e.equipment_id = b.equipment_id WHERE b.booking_id = $1 FOR UPDATE OF b`,
    [bookingId]);
  return rows[0];
}

export async function markCancelled(db: Queryable, bookingId: string, actorId: string, reason: string | null): Promise<void> {
  await db.query(
    `UPDATE bookings SET status = 'cancelled', cancelled_at = now(), cancelled_by = $2, cancellation_reason = $3 WHERE booking_id = $1`,
    [bookingId, actorId, reason]);
}

// ─── Reads ─────────────────────────────────────────────────────────────────────────────────────

export type BookingRow = Omit<BookingSummary, 'equipment' | 'start_time' | 'end_time' | 'cancelled_at' | 'created_at'> & {
  equipment: { equipment_id: string; code: string; name: LocalizedText };
  start_time: Date; end_time: Date; cancelled_at: Date | null; created_at: Date;
};

const person = (alias: string) => `json_build_object('user_id', ${alias}.user_id, 'full_name', ${alias}.full_name, 'email', ${alias}.email)`;
const BOOKING_SELECT = `
  SELECT b.booking_id, b.status, b.support_requested, b.calculated_base_cost, b.calculated_support_cost, b.total_cost,
         b.force_override, b.cancelled_at, b.cancellation_reason, b.created_at,
         lower(b.slot_range) AS start_time, upper(b.slot_range) AS end_time,
         json_build_object('equipment_id', e.equipment_id, 'code', e.code, 'name', e.name) AS equipment,
         ${person('u')} AS user, ${person('bb')} AS booked_by,
         gr.grant_code, json_build_object('group_id', g.group_id, 'name', g.name) AS "group"
  FROM bookings b
  JOIN equipment e ON e.equipment_id = b.equipment_id
  JOIN users u ON u.user_id = b.user_id
  JOIN users bb ON bb.user_id = b.booked_by_user_id
  JOIN grants gr ON gr.grant_id = b.grant_id
  JOIN grant_group_allocations a ON a.allocation_id = b.allocation_id
  JOIN groups g ON g.group_id = a.group_id`;

export async function listBookings(db: Queryable, userId: string | null, query: z.output<typeof BookingListQuery>) {
  const params = [userId, query.status ?? null, query.equipment_id ?? null, query.from ?? null, query.to ?? null];
  const where = `WHERE ($1::uuid IS NULL OR b.user_id = $1)
    AND ($2::booking_status IS NULL OR b.status = $2)
    AND ($3::uuid IS NULL OR b.equipment_id = $3)
    AND ($4::timestamptz IS NULL OR upper(b.slot_range) > $4)
    AND ($5::timestamptz IS NULL OR lower(b.slot_range) < $5)`;
  const [items, count] = await Promise.all([
    db.query<BookingRow>(`${BOOKING_SELECT} ${where}
      ORDER BY lower(b.slot_range) ${query.order === 'desc' ? 'DESC' : 'ASC'}, b.booking_id LIMIT $6 OFFSET $7`,
    [...params, query.limit, query.offset]),
    db.query<{ total: number }>(`SELECT count(*)::int AS total FROM bookings b ${where}`, params),
  ]);
  return { items: items.rows, total: count.rows[0]!.total };
}

export async function findBooking(db: Queryable, bookingId: string): Promise<BookingRow | undefined> {
  const { rows } = await db.query<BookingRow>(`${BOOKING_SELECT} WHERE b.booking_id = $1`, [bookingId]);
  return rows[0];
}

export async function sessionEvents(db: Queryable, bookingId: string): Promise<BookingDetail['session_events']> {
  const { rows } = await db.query<Omit<BookingDetail['session_events'][number], 'occurred_at'> & { occurred_at: Date }>(
    'SELECT state, source, detail, occurred_at FROM session_events WHERE booking_id = $1 ORDER BY occurred_at, event_id', [bookingId]);
  return rows.map((r) => ({ ...r, occurred_at: r.occurred_at.toISOString() }));
}

/** Allocations of every group the user actively belongs to; $2 is the facility timezone. */
export async function fundingFor(db: Queryable, userId: string, tz: string) {
  const { rows } = await db.query<Omit<FundingOption, 'usable' | 'unusable_reason'> & { is_active: boolean; group_active: boolean; expired: boolean }>(
    `SELECT a.allocation_id, a.grant_id, gr.grant_code, json_build_object('group_id', g.group_id, 'name', g.name) AS "group",
            a.remaining_balance, gr.expiration_date::text AS expiration_date, a.is_active, g.is_active AS group_active,
            gr.expiration_date < (now() AT TIME ZONE $2)::date AS expired
     FROM group_memberships m
     JOIN groups g ON g.group_id = m.group_id
     JOIN grant_group_allocations a ON a.group_id = m.group_id
     JOIN grants gr ON gr.grant_id = a.grant_id
     WHERE m.user_id = $1 AND m.is_active
     ORDER BY gr.expiration_date, gr.grant_code, g.name`,
    [userId, tz]);
  return rows;
}

/** People staff may book for (D20 d): active users in a booking role, by name. */
export async function searchBeneficiaries(db: Queryable, q: string | undefined): Promise<PersonRef[]> {
  const { rows } = await db.query<PersonRef>(
    `SELECT user_id, full_name, email FROM users
     WHERE is_active AND role <> 'auditor' AND ($1::text IS NULL OR full_name ILIKE $1 OR email ILIKE $1)
     ORDER BY full_name, email LIMIT 20`,
    [q ? containsPattern(q) : null]);
  return rows;
}

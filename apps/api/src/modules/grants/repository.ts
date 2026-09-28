import type { AllocationListQuery, AllocationRow, GrantListQuery, GrantSummary } from '@mosaic/contracts';
import type { z } from 'zod';
import type { Queryable } from '../../db/pool.ts';
import { containsPattern } from '../../db/sql.ts';

// Totals follow GrantTotals in packages/contracts/src/funding.ts. consumed = budget − remaining (D7).
// $1 is always the facility timezone, so "expired" means past the end of the local calendar day.
const GRANT_COLUMNS = `
  gr.grant_id, gr.grant_code, gr.expiration_date::text AS expiration_date, gr.created_at,
  gr.expiration_date < (now() AT TIME ZONE $1)::date AS is_expired,
  json_build_object('user_id', pi.user_id, 'full_name', pi.full_name, 'email', pi.email) AS pi,
  gr.allocated_budget, gr.remaining_balance,
  (gr.allocated_budget - gr.remaining_balance)::numeric(14, 2)::text AS consumed,
  COALESCE(a.allocated, 0)::numeric(14, 2)::text AS allocated_to_groups,
  (gr.allocated_budget - COALESCE(a.allocated, 0))::numeric(14, 2)::text AS unallocated,
  COALESCE(a.count, 0)::int AS allocation_count`;

const GRANT_FROM = `
  FROM grants gr
  JOIN users pi ON pi.user_id = gr.pi_user_id
  LEFT JOIN LATERAL (SELECT sum(allocated_amount) AS allocated, count(*) AS count
                     FROM grant_group_allocations WHERE grant_id = gr.grant_id) a ON true`;

type GrantQuery = z.output<typeof GrantListQuery>;
const GRANT_SORT: Record<GrantQuery['sort'], string> = {
  grant_code: 'gr.grant_code', expiration_date: 'gr.expiration_date', created_at: 'gr.created_at',
};

export async function listGrants(db: Queryable, tz: string, query: GrantQuery) {
  const params = [tz, query.q ? containsPattern(query.q) : null, query.expired ?? null];
  const where = `WHERE ($2::text IS NULL OR gr.grant_code ILIKE $2)
    AND ($3::boolean IS NULL OR (gr.expiration_date < (now() AT TIME ZONE $1)::date) = $3)`;
  const [items, count] = await Promise.all([
    db.query<GrantSummary>(
      `SELECT ${GRANT_COLUMNS} ${GRANT_FROM} ${where}
       ORDER BY ${GRANT_SORT[query.sort]} ${query.order === 'desc' ? 'DESC' : 'ASC'}, gr.grant_id
       LIMIT $4 OFFSET $5`,
      [...params, query.limit, query.offset],
    ),
    db.query<{ total: number }>(`SELECT count(*)::int AS total FROM grants gr ${where}`, params),
  ]);
  return { items: items.rows, total: count.rows[0]!.total };
}

export async function findGrant(db: Queryable, tz: string, grantId: string): Promise<GrantSummary | null> {
  const { rows } = await db.query<GrantSummary>(`SELECT ${GRANT_COLUMNS} ${GRANT_FROM} WHERE gr.grant_id = $2`, [tz, grantId]);
  return rows[0] ?? null;
}

const ALLOCATION_COLUMNS = `
  a.allocation_id, a.grant_id, gr.grant_code, a.allocated_amount, a.remaining_balance, a.is_active, a.created_at,
  (a.allocated_amount - a.remaining_balance)::numeric(14, 2)::text AS consumed,
  gr.expiration_date::text AS expiration_date,
  json_build_object('group_id', g.group_id, 'name', g.name, 'is_active', g.is_active) AS "group"`;
const ALLOCATION_FROM = `FROM grant_group_allocations a
  JOIN grants gr ON gr.grant_id = a.grant_id JOIN groups g ON g.group_id = a.group_id`;

type AllocationQuery = z.output<typeof AllocationListQuery>;
const ALLOCATION_SORT: Record<AllocationQuery['sort'], string> = {
  grant_code: 'gr.grant_code', group_name: 'lower(g.name)',
  consumed: '(a.allocated_amount - a.remaining_balance)', remaining_balance: 'a.remaining_balance',
};

export async function listAllocations(db: Queryable, query: AllocationQuery) {
  const params = [query.grant_id ?? null, query.group_id ?? null, query.is_active ?? null];
  const where = `WHERE ($1::uuid IS NULL OR a.grant_id = $1) AND ($2::uuid IS NULL OR a.group_id = $2)
    AND ($3::boolean IS NULL OR a.is_active = $3)`;
  const [items, count] = await Promise.all([
    db.query<AllocationRow>(
      `SELECT ${ALLOCATION_COLUMNS} ${ALLOCATION_FROM} ${where}
       ORDER BY ${ALLOCATION_SORT[query.sort]} ${query.order === 'desc' ? 'DESC' : 'ASC'}, a.allocation_id
       LIMIT $4 OFFSET $5`,
      [...params, query.limit, query.offset],
    ),
    db.query<{ total: number }>(`SELECT count(*)::int AS total ${ALLOCATION_FROM} ${where}`, params),
  ]);
  return { items: items.rows, total: count.rows[0]!.total };
}

export async function findAllocation(db: Queryable, allocationId: string): Promise<AllocationRow | null> {
  const { rows } = await db.query<AllocationRow>(`SELECT ${ALLOCATION_COLUMNS} ${ALLOCATION_FROM} WHERE a.allocation_id = $1`, [allocationId]);
  return rows[0] ?? null;
}

export async function allocationsOfGrant(db: Queryable, grantId: string): Promise<AllocationRow[]> {
  const { rows } = await db.query<AllocationRow>(
    `SELECT ${ALLOCATION_COLUMNS} ${ALLOCATION_FROM} WHERE a.grant_id = $1 ORDER BY lower(g.name)`, [grantId]);
  return rows;
}

export interface LockedGrant {
  grant_id: string;
  grant_code: string;
  pi_user_id: string;
  allocated_budget: string;
  remaining_balance: string;
  expiration_date: string;
  /** Σ allocated_amount over all of the grant's allocations. */
  allocated_to_groups: string;
}

/**
 * Locks the grant row: every change to a grant's budget or allocations takes this lock first,
 * which serialises them and makes the "Σ allocations ≤ budget" check race-free (09 §4).
 */
export async function lockGrant(db: Queryable, grantId: string): Promise<LockedGrant | null> {
  const { rows } = await db.query<Omit<LockedGrant, 'allocated_to_groups'>>(
    `SELECT grant_id, grant_code, pi_user_id, allocated_budget, remaining_balance, expiration_date::text AS expiration_date
     FROM grants WHERE grant_id = $1 FOR UPDATE`,
    [grantId],
  );
  const grant = rows[0];
  if (!grant) return null;
  const sum = await db.query<{ total: string }>(
    'SELECT COALESCE(sum(allocated_amount), 0)::numeric(14, 2)::text AS total FROM grant_group_allocations WHERE grant_id = $1',
    [grantId],
  );
  return { ...grant, allocated_to_groups: sum.rows[0]!.total };
}

export async function insertGrant(db: Queryable, g: { grant_code: string; pi_user_id: string; allocated_budget: string; expiration_date: string }) {
  const { rows } = await db.query<{ grant_id: string }>(
    `INSERT INTO grants (grant_code, pi_user_id, allocated_budget, remaining_balance, expiration_date)
     VALUES ($1, $2, $3, $3, $4) RETURNING grant_id`,
    [g.grant_code, g.pi_user_id, g.allocated_budget, g.expiration_date],
  );
  return rows[0]!.grant_id;
}

export async function updateGrant(
  db: Queryable, grantId: string,
  f: { grant_code: string; pi_user_id: string; allocated_budget: string; remaining_balance: string; expiration_date: string },
): Promise<void> {
  await db.query(
    `UPDATE grants SET grant_code = $2, pi_user_id = $3, allocated_budget = $4, remaining_balance = $5, expiration_date = $6
     WHERE grant_id = $1`,
    [grantId, f.grant_code, f.pi_user_id, f.allocated_budget, f.remaining_balance, f.expiration_date],
  );
}

export interface LockedAllocation {
  allocation_id: string;
  grant_id: string;
  group_id: string;
  allocated_amount: string;
  remaining_balance: string;
  is_active: boolean;
}

export async function lockAllocation(db: Queryable, allocationId: string): Promise<LockedAllocation | null> {
  const { rows } = await db.query<LockedAllocation>(
    `SELECT allocation_id, grant_id, group_id, allocated_amount, remaining_balance, is_active
     FROM grant_group_allocations WHERE allocation_id = $1 FOR UPDATE`,
    [allocationId],
  );
  return rows[0] ?? null;
}

export async function insertAllocation(db: Queryable, a: { grant_id: string; group_id: string; allocated_amount: string }) {
  const { rows } = await db.query<{ allocation_id: string }>(
    `INSERT INTO grant_group_allocations (grant_id, group_id, allocated_amount, remaining_balance)
     VALUES ($1, $2, $3, $3) RETURNING allocation_id`,
    [a.grant_id, a.group_id, a.allocated_amount],
  );
  return rows[0]!.allocation_id;
}

export async function updateAllocation(
  db: Queryable, allocationId: string, f: { allocated_amount: string; remaining_balance: string; is_active: boolean },
): Promise<void> {
  await db.query(
    'UPDATE grant_group_allocations SET allocated_amount = $2, remaining_balance = $3, is_active = $4 WHERE allocation_id = $1',
    [allocationId, f.allocated_amount, f.remaining_balance, f.is_active],
  );
}

export async function lockGroupForAllocation(db: Queryable, groupId: string): Promise<{ name: string; is_active: boolean } | null> {
  const { rows } = await db.query<{ name: string; is_active: boolean }>(
    'SELECT name, is_active FROM groups WHERE group_id = $1 FOR SHARE', [groupId]);
  return rows[0] ?? null;
}

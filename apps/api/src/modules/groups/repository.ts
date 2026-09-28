import type { GroupAllocation, GroupDetail, GroupListQuery, GroupMember, GroupSummary } from '@mosaic/contracts';
import type { z } from 'zod';
import type { Queryable } from '../../db/pool.ts';
import { containsPattern } from '../../db/sql.ts';

type ListQuery = z.output<typeof GroupListQuery>;

const SORT_SQL: Record<ListQuery['sort'], string> = { name: 'lower(g.name)', created_at: 'g.created_at' };

// Member counts (active memberships) and funding totals across the group's allocations.
// Money is summed in NUMERIC and returned as text so no float ever carries it.
const SUMMARY_COLUMNS = `
  g.group_id, g.name, g.description, g.is_active, g.created_at,
  (SELECT count(*) FROM group_memberships m JOIN users u ON u.user_id = m.user_id
    WHERE m.group_id = g.group_id AND m.is_active AND u.user_type = 'internal')::int AS internal_members,
  (SELECT count(*) FROM group_memberships m JOIN users u ON u.user_id = m.user_id
    WHERE m.group_id = g.group_id AND m.is_active AND u.user_type = 'external')::int AS external_members,
  (SELECT json_build_object(
      'allocated', COALESCE(sum(a.allocated_amount), 0)::numeric(14, 2)::text,
      'remaining', COALESCE(sum(a.remaining_balance), 0)::numeric(14, 2)::text,
      'consumed', COALESCE(sum(a.allocated_amount - a.remaining_balance), 0)::numeric(14, 2)::text,
      'active_allocations', count(*) FILTER (WHERE a.is_active))
    FROM grant_group_allocations a WHERE a.group_id = g.group_id) AS funding`;

export async function listGroups(db: Queryable, query: ListQuery): Promise<{ items: GroupSummary[]; total: number }> {
  const params = [query.is_active ?? null, query.q ? containsPattern(query.q) : null];
  const where = `WHERE ($1::boolean IS NULL OR g.is_active = $1) AND ($2::text IS NULL OR g.name ILIKE $2)`;
  const [items, count] = await Promise.all([
    db.query<GroupSummary>(
      `SELECT ${SUMMARY_COLUMNS} FROM groups g ${where}
       ORDER BY ${SORT_SQL[query.sort]} ${query.order === 'desc' ? 'DESC' : 'ASC'}, g.group_id
       LIMIT $3 OFFSET $4`,
      [...params, query.limit, query.offset],
    ),
    db.query<{ total: number }>(`SELECT count(*)::int AS total FROM groups g ${where}`, params),
  ]);
  return { items: items.rows, total: count.rows[0]!.total };
}

export async function findGroupDetail(db: Queryable, groupId: string): Promise<GroupDetail | null> {
  const { rows } = await db.query<GroupSummary>(`SELECT ${SUMMARY_COLUMNS} FROM groups g WHERE g.group_id = $1`, [groupId]);
  const group = rows[0];
  if (!group) return null;
  const [members, allocations] = await Promise.all([
    db.query<GroupMember>(
      `SELECT u.user_id, u.full_name, u.email, u.role, u.user_type, u.is_active, m.joined_at
       FROM group_memberships m JOIN users u ON u.user_id = m.user_id
       WHERE m.group_id = $1 AND m.is_active ORDER BY u.full_name`,
      [groupId],
    ),
    db.query<GroupAllocation>(
      `SELECT a.allocation_id, a.grant_id, gr.grant_code, a.allocated_amount, a.remaining_balance,
              gr.expiration_date::text AS expiration_date, a.is_active
       FROM grant_group_allocations a JOIN grants gr ON gr.grant_id = a.grant_id
       WHERE a.group_id = $1 ORDER BY gr.expiration_date, gr.grant_code`,
      [groupId],
    ),
  ]);
  return { ...group, members: members.rows, allocations: allocations.rows };
}

export interface GroupRecord {
  group_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

/** Locks the group row: serialises membership and settings changes for one group. */
export async function lockGroup(db: Queryable, groupId: string): Promise<GroupRecord | null> {
  const { rows } = await db.query<GroupRecord>(
    'SELECT group_id, name, description, is_active FROM groups WHERE group_id = $1 FOR UPDATE',
    [groupId],
  );
  return rows[0] ?? null;
}

export async function insertGroup(db: Queryable, name: string, description: string | null): Promise<string> {
  const { rows } = await db.query<{ group_id: string }>(
    'INSERT INTO groups (name, description) VALUES ($1, $2) RETURNING group_id',
    [name, description],
  );
  return rows[0]!.group_id;
}

export async function updateGroup(db: Queryable, groupId: string, fields: Partial<Omit<GroupRecord, 'group_id'>>): Promise<void> {
  await db.query(
    `UPDATE groups SET
       name = COALESCE($2, name),
       description = CASE WHEN $3::boolean THEN $4 ELSE description END,
       is_active = COALESCE($5, is_active)
     WHERE group_id = $1`,
    [groupId, fields.name ?? null, fields.description !== undefined, fields.description ?? null, fields.is_active ?? null],
  );
}

export async function findMembership(db: Queryable, groupId: string, userId: string): Promise<{ is_active: boolean } | null> {
  const { rows } = await db.query<{ is_active: boolean }>(
    'SELECT is_active FROM group_memberships WHERE group_id = $1 AND user_id = $2',
    [groupId, userId],
  );
  return rows[0] ?? null;
}

/** Adds the membership, or reactivates a removed one (a rejoin starts a new joined_at). */
export async function activateMembership(db: Queryable, groupId: string, userId: string): Promise<void> {
  await db.query(
    `INSERT INTO group_memberships (group_id, user_id) VALUES ($1, $2)
     ON CONFLICT (group_id, user_id) DO UPDATE SET is_active = true, joined_at = CURRENT_TIMESTAMP`,
    [groupId, userId],
  );
}

export async function deactivateMembership(db: Queryable, groupId: string, userId: string): Promise<void> {
  await db.query('UPDATE group_memberships SET is_active = false WHERE group_id = $1 AND user_id = $2', [groupId, userId]);
}

export async function userExists(db: Queryable, userId: string): Promise<boolean> {
  const { rowCount } = await db.query('SELECT 1 FROM users WHERE user_id = $1', [userId]);
  return rowCount === 1;
}

import type {
  CreateUserBody, PersonRef, Role, UserCertificationSummary, UserDetail, UserFundingAccess, UserListQuery,
  UserSummary, UserType,
} from '@mosaic/contracts';
import type { z } from 'zod';
import type { Queryable } from '../../db/pool.ts';
import { containsPattern } from '../../db/sql.ts';

type ListQuery = z.output<typeof UserListQuery>;

// Sort keys are whitelisted by the zod schema; this maps them to SQL, never interpolating input.
const SORT_SQL: Record<ListQuery['sort'], string> = {
  full_name: 'u.full_name',
  email: 'u.email',
  created_at: 'u.created_at',
  role: 'u.role',
};

// Active memberships in active groups, as a JSON array ordered by name.
const GROUPS_JSON = `COALESCE((
  SELECT json_agg(json_build_object('group_id', g.group_id, 'name', g.name) ORDER BY g.name)
  FROM group_memberships m JOIN groups g ON g.group_id = m.group_id
  WHERE m.user_id = u.user_id AND m.is_active AND g.is_active), '[]'::json)`;

const SUMMARY_COLUMNS = `u.user_id, u.email, u.full_name, u.role, u.user_type, u.is_active, u.created_at, ${GROUPS_JSON} AS groups`;

export async function listUsers(db: Queryable, query: ListQuery): Promise<{ items: UserSummary[]; total: number }> {
  const { rows } = await db.query<UserSummary & { total: number }>(
    `SELECT ${SUMMARY_COLUMNS}, count(*) OVER ()::int AS total
     FROM users u
     WHERE ($1::user_type IS NULL OR u.user_type = $1)
       AND ($2::user_role IS NULL OR u.role = $2)
       AND ($3::boolean IS NULL OR u.is_active = $3)
       AND ($4::uuid IS NULL OR EXISTS (
             SELECT 1 FROM group_memberships m WHERE m.user_id = u.user_id AND m.group_id = $4 AND m.is_active))
       AND ($5::text IS NULL OR u.full_name ILIKE $5 OR u.email ILIKE $5)
     ORDER BY ${SORT_SQL[query.sort]} ${query.order === 'desc' ? 'DESC' : 'ASC'}, u.user_id
     LIMIT $6 OFFSET $7`,
    [query.user_type ?? null, query.role ?? null, query.is_active ?? null, query.group_id ?? null,
     query.q ? containsPattern(query.q) : null, query.limit, query.offset],
  );
  // count(*) OVER () has no row to ride on when the page is past the end; re-count from the start.
  const total = rows[0]?.total ?? (query.offset > 0 ? (await listUsers(db, { ...query, offset: 0, limit: 1 })).total : 0);
  return { items: rows.map(({ total: _total, ...user }) => user), total };
}

export interface UserRecord {
  user_id: string;
  full_name: string;
  role: Role;
  user_type: UserType;
  is_active: boolean;
}

/** Locks the user row for the rest of the transaction. */
export async function lockUser(db: Queryable, userId: string): Promise<UserRecord | null> {
  const { rows } = await db.query<UserRecord>(
    'SELECT user_id, full_name, role, user_type, is_active FROM users WHERE user_id = $1 FOR UPDATE',
    [userId],
  );
  return rows[0] ?? null;
}

/** Reads a user and prevents it changing until commit (sponsor and PI checks). */
export async function lockUserShared(db: Queryable, userId: string): Promise<UserRecord | null> {
  const { rows } = await db.query<UserRecord>(
    'SELECT user_id, full_name, role, user_type, is_active FROM users WHERE user_id = $1 FOR SHARE',
    [userId],
  );
  return rows[0] ?? null;
}

export async function insertUser(db: Queryable, body: CreateUserBody): Promise<string> {
  const { rows } = await db.query<{ user_id: string }>(
    `INSERT INTO users (email, full_name, sso_identifier, role, user_type)
     VALUES ($1, $2, $3, $4, $5) RETURNING user_id`,
    [body.email, body.full_name, body.sso_identifier, body.role, body.user_type],
  );
  return rows[0]!.user_id;
}

export async function updateUserFields(
  db: Queryable, userId: string, fields: Partial<Pick<UserRecord, 'full_name' | 'role' | 'is_active'>>,
): Promise<void> {
  await db.query(
    `UPDATE users SET full_name = COALESCE($2, full_name), role = COALESCE($3, role), is_active = COALESCE($4, is_active)
     WHERE user_id = $1`,
    [userId, fields.full_name ?? null, fields.role ?? null, fields.is_active ?? null],
  );
}

export async function findSponsorId(db: Queryable, externalUserId: string): Promise<string | null> {
  const { rows } = await db.query<{ sponsor_user_id: string }>(
    'SELECT sponsor_user_id FROM external_user_sponsors WHERE external_user_id = $1',
    [externalUserId],
  );
  return rows[0]?.sponsor_user_id ?? null;
}

export async function upsertSponsor(db: Queryable, externalUserId: string, sponsorUserId: string): Promise<void> {
  await db.query(
    `INSERT INTO external_user_sponsors (external_user_id, sponsor_user_id) VALUES ($1, $2)
     ON CONFLICT (external_user_id) DO UPDATE SET sponsor_user_id = EXCLUDED.sponsor_user_id`,
    [externalUserId, sponsorUserId],
  );
}

export async function findUserDetail(db: Queryable, userId: string): Promise<UserDetail | null> {
  const { rows } = await db.query<UserSummary & { sso_identifier: string; sponsor: PersonRef | null }>(
    `SELECT ${SUMMARY_COLUMNS}, u.sso_identifier,
            (SELECT json_build_object('user_id', s.user_id, 'full_name', s.full_name, 'email', s.email)
             FROM external_user_sponsors es JOIN users s ON s.user_id = es.sponsor_user_id
             WHERE es.external_user_id = u.user_id) AS sponsor
     FROM users u WHERE u.user_id = $1`,
    [userId],
  );
  const user = rows[0];
  if (!user) return null;

  const [sponsored, certifications, funding] = await Promise.all([
    db.query<PersonRef>(
      `SELECT u.user_id, u.full_name, u.email FROM external_user_sponsors es JOIN users u ON u.user_id = es.external_user_id
       WHERE es.sponsor_user_id = $1 ORDER BY u.full_name`,
      [userId],
    ),
    db.query<UserCertificationSummary>(
      `SELECT e.equipment_id, e.code AS equipment_code, e.name->>'en' AS equipment_name,
              c.theoretical_passed, c.practical_status, c.expires_at
       FROM user_certifications c JOIN equipment e ON e.equipment_id = c.equipment_id
       WHERE c.user_id = $1 ORDER BY e.code`,
      [userId],
    ),
    db.query<UserFundingAccess>(
      `SELECT a.allocation_id, gr.grant_code, json_build_object('group_id', g.group_id, 'name', g.name) AS "group",
              a.remaining_balance, gr.expiration_date::text AS expiration_date,
              (a.is_active AND g.is_active) AS is_active
       FROM group_memberships m
       JOIN groups g ON g.group_id = m.group_id
       JOIN grant_group_allocations a ON a.group_id = g.group_id
       JOIN grants gr ON gr.grant_id = a.grant_id
       WHERE m.user_id = $1 AND m.is_active
       ORDER BY gr.expiration_date, gr.grant_code`,
      [userId],
    ),
  ]);
  return { ...user, sponsored: sponsored.rows, certifications: certifications.rows, funding: funding.rows };
}

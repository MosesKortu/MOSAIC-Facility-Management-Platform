import type { Queryable } from '../../db/pool.ts';
import type { Role, SessionUser, UserType } from '@mosaic/contracts';

export interface ActorRow {
  userId: string;
  role: Role;
  userType: UserType;
  isActive: boolean;
}

export async function findActor(db: Queryable, userId: string): Promise<ActorRow | null> {
  // Guard the uuid cast: a syntactically invalid id is simply "no such user".
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return null;
  const { rows } = await db.query<ActorRow>(
    `SELECT user_id AS "userId", role, user_type AS "userType", is_active AS "isActive"
     FROM users WHERE user_id = $1`,
    [userId],
  );
  return rows[0] ?? null;
}

export async function findUserIdByEmail(db: Queryable, email: string): Promise<ActorRow | null> {
  const { rows } = await db.query<ActorRow>(
    `SELECT user_id AS "userId", role, user_type AS "userType", is_active AS "isActive"
     FROM users WHERE lower(email) = lower($1)`,
    [email],
  );
  return rows[0] ?? null;
}


export async function findProfile(db: Queryable, userId: string): Promise<SessionUser | null> {
  const { rows } = await db.query<SessionUser>(
    `SELECT u.user_id, u.email, u.full_name, u.role, u.user_type,
            COALESCE(json_agg(json_build_object('group_id', g.group_id, 'name', g.name) ORDER BY g.name)
                     FILTER (WHERE g.group_id IS NOT NULL), '[]') AS groups
     FROM users u
     LEFT JOIN group_memberships m ON m.user_id = u.user_id AND m.is_active
     LEFT JOIN groups g ON g.group_id = m.group_id AND g.is_active
     WHERE u.user_id = $1
     GROUP BY u.user_id`,
    [userId],
  );
  return rows[0] ?? null;
}

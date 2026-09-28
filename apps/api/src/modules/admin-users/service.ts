import type { CreateUserBody, Page, UpdateUserBody, UserDetail, UserListQuery, UserSummary } from '@mosaic/contracts';
import type pg from 'pg';
import type { z } from 'zod';
import { rethrowUniqueViolation } from '../../db/errors.ts';
import { withTransaction, type Queryable } from '../../db/pool.ts';
import type { Actor } from '../../http/access.ts';
import { DomainError } from '../../http/errors.ts';
import { notFound } from '../../http/params.ts';
import { recordAudit } from '../audit/service.ts';
import * as repo from './repository.ts';

export async function listUsers(db: Queryable, query: z.output<typeof UserListQuery>): Promise<Page<UserSummary>> {
  const { items, total } = await repo.listUsers(db, query);
  return { items, total, limit: query.limit, offset: query.offset };
}

export async function getUser(db: Queryable, userId: string): Promise<UserDetail> {
  const user = await repo.findUserDetail(db, userId);
  if (!user) throw notFound('user');
  return user;
}

/** Only standard users may be external (08 §13.2): staff, admin and auditor roles are internal. */
function assertRoleAllowed(userType: 'internal' | 'external', role: string) {
  if (userType === 'external' && role !== 'standard_user') {
    throw new DomainError('ROLE_NOT_ALLOWED_FOR_EXTERNAL', 'External collaborators can only have the Researcher role');
  }
}

/** A sponsor must be an active internal user other than the sponsored person (D9). */
async function assertValidSponsor(tx: Queryable, sponsorUserId: string, externalUserId?: string) {
  const sponsor = await repo.lockUserShared(tx, sponsorUserId);
  if (!sponsor || sponsor.user_type !== 'internal' || !sponsor.is_active || sponsor.user_id === externalUserId) {
    throw new DomainError('INVALID_SPONSOR', 'The sponsor must be an active internal ICFO user');
  }
}

export async function createUser(pool: pg.Pool, actor: Actor, body: CreateUserBody): Promise<UserDetail> {
  assertRoleAllowed(body.user_type, body.role);
  if (body.user_type === 'internal' && body.sponsor_user_id) {
    throw new DomainError('INVALID_SPONSOR', 'Only external collaborators have a sponsor');
  }
  if (body.user_type === 'external' && !body.sponsor_user_id) {
    throw new DomainError('INVALID_SPONSOR', 'External collaborators need an internal sponsor');
  }

  const userId = await withTransaction(pool, async (tx) => {
    if (body.sponsor_user_id) await assertValidSponsor(tx, body.sponsor_user_id);
    const id = await repo.insertUser(tx, body).catch(rethrowUniqueViolation);
    if (body.sponsor_user_id) await repo.upsertSponsor(tx, id, body.sponsor_user_id);
    await recordAudit(tx, {
      actorUserId: actor.userId, action: 'user.created', entityType: 'user', entityId: id,
      after: {
        email: body.email, full_name: body.full_name, sso_identifier: body.sso_identifier, role: body.role,
        user_type: body.user_type, sponsor_user_id: body.sponsor_user_id ?? null,
      },
    });
    return id;
  });
  return getUser(pool, userId);
}

/** Applies only the fields that actually change; each change gets its own audit event. */
export async function updateUser(pool: pg.Pool, actor: Actor, userId: string, body: UpdateUserBody): Promise<UserDetail> {
  await withTransaction(pool, async (tx) => {
    const user = await repo.lockUser(tx, userId);
    if (!user) throw notFound('user');

    const roleChanges = body.role !== undefined && body.role !== user.role;
    const activeChanges = body.is_active !== undefined && body.is_active !== user.is_active;
    const nameChanges = body.full_name !== undefined && body.full_name !== user.full_name;

    // An admin must not be able to lock themselves out of administration.
    if (user.user_id === actor.userId && ((roleChanges && body.role !== 'admin') || (activeChanges && !body.is_active))) {
      throw new DomainError('SELF_LOCKOUT', "You can't remove your own administrator access or deactivate yourself");
    }
    if (roleChanges) assertRoleAllowed(user.user_type, body.role!);

    let sponsorChange: { from: string | null; to: string } | null = null;
    if (body.sponsor_user_id !== undefined) {
      if (user.user_type !== 'external') throw new DomainError('INVALID_SPONSOR', 'Only external collaborators have a sponsor');
      const current = await repo.findSponsorId(tx, userId);
      if (current !== body.sponsor_user_id) {
        await assertValidSponsor(tx, body.sponsor_user_id, userId);
        sponsorChange = { from: current, to: body.sponsor_user_id };
      }
    }

    await repo.updateUserFields(tx, userId, {
      ...(nameChanges && { full_name: body.full_name! }),
      ...(roleChanges && { role: body.role! }),
      ...(activeChanges && { is_active: body.is_active! }),
    });
    if (sponsorChange) await repo.upsertSponsor(tx, userId, sponsorChange.to);

    const audit = (action: string, before: Record<string, unknown>, after: Record<string, unknown>) =>
      recordAudit(tx, { actorUserId: actor.userId, action, entityType: 'user', entityId: userId, before, after });
    if (nameChanges) await audit('user.renamed', { full_name: user.full_name }, { full_name: body.full_name });
    if (roleChanges) await audit('user.role_changed', { role: user.role }, { role: body.role });
    if (activeChanges) {
      await audit(body.is_active ? 'user.activated' : 'user.deactivated', { is_active: user.is_active }, { is_active: body.is_active });
    }
    if (sponsorChange) {
      await audit('user.sponsor_changed', { sponsor_user_id: sponsorChange.from }, { sponsor_user_id: sponsorChange.to });
    }
  });
  return getUser(pool, userId);
}

import type { CreateGroupBody, GroupDetail, GroupListQuery, GroupSummary, Page, UpdateGroupBody } from '@mosaic/contracts';
import type pg from 'pg';
import type { z } from 'zod';
import { rethrowUniqueViolation } from '../../db/errors.ts';
import { withTransaction, type Queryable } from '../../db/pool.ts';
import type { Actor } from '../../http/access.ts';
import { DomainError } from '../../http/errors.ts';
import { notFound } from '../../http/params.ts';
import { recordAudit } from '../audit/service.ts';
import * as repo from './repository.ts';

export async function listGroups(db: Queryable, query: z.output<typeof GroupListQuery>): Promise<Page<GroupSummary>> {
  const { items, total } = await repo.listGroups(db, query);
  return { items, total, limit: query.limit, offset: query.offset };
}

export async function getGroup(db: Queryable, groupId: string): Promise<GroupDetail> {
  const group = await repo.findGroupDetail(db, groupId);
  if (!group) throw notFound('group');
  return group;
}

export async function createGroup(pool: pg.Pool, actor: Actor, body: CreateGroupBody): Promise<GroupDetail> {
  const groupId = await withTransaction(pool, async (tx) => {
    const id = await repo.insertGroup(tx, body.name, body.description ?? null).catch(rethrowUniqueViolation);
    await recordAudit(tx, {
      actorUserId: actor.userId, action: 'group.created', entityType: 'group', entityId: id,
      after: { name: body.name, description: body.description ?? null },
    });
    return id;
  });
  return getGroup(pool, groupId);
}

export async function updateGroup(pool: pg.Pool, actor: Actor, groupId: string, body: UpdateGroupBody): Promise<GroupDetail> {
  await withTransaction(pool, async (tx) => {
    const group = await repo.lockGroup(tx, groupId);
    if (!group) throw notFound('group');

    const nameChanges = body.name !== undefined && body.name !== group.name;
    const descriptionChanges = body.description !== undefined && (body.description ?? null) !== group.description;
    const activeChanges = body.is_active !== undefined && body.is_active !== group.is_active;

    await repo
      .updateGroup(tx, groupId, {
        ...(nameChanges && { name: body.name! }),
        ...(descriptionChanges && { description: body.description ?? null }),
        ...(activeChanges && { is_active: body.is_active! }),
      })
      .catch(rethrowUniqueViolation); // renaming or reactivating onto an active group's name

    const audit = (action: string, before: Record<string, unknown>, after: Record<string, unknown>) =>
      recordAudit(tx, { actorUserId: actor.userId, action, entityType: 'group', entityId: groupId, before, after });
    if (nameChanges) await audit('group.renamed', { name: group.name }, { name: body.name });
    if (descriptionChanges) await audit('group.description_changed', { description: group.description }, { description: body.description ?? null });
    if (activeChanges) {
      await audit(body.is_active ? 'group.activated' : 'group.deactivated', { is_active: group.is_active }, { is_active: body.is_active });
    }
  });
  return getGroup(pool, groupId);
}

/** Idempotent: adding an existing active member changes nothing and writes no audit event. */
export async function addMember(pool: pg.Pool, actor: Actor, groupId: string, userId: string): Promise<GroupDetail> {
  await withTransaction(pool, async (tx) => {
    const group = await repo.lockGroup(tx, groupId);
    if (!group) throw notFound('group');
    if (!group.is_active) throw new DomainError('GROUP_INACTIVE', 'This group is deactivated; reactivate it before adding members');
    if (!(await repo.userExists(tx, userId))) throw notFound('user');

    const membership = await repo.findMembership(tx, groupId, userId);
    if (membership?.is_active) return;
    await repo.activateMembership(tx, groupId, userId);
    await recordAudit(tx, {
      actorUserId: actor.userId, action: 'group.member_added', entityType: 'group', entityId: groupId,
      after: { user_id: userId },
    });
  });
  return getGroup(pool, groupId);
}

export async function removeMember(pool: pg.Pool, actor: Actor, groupId: string, userId: string): Promise<GroupDetail> {
  await withTransaction(pool, async (tx) => {
    if (!(await repo.lockGroup(tx, groupId))) throw notFound('group');
    const membership = await repo.findMembership(tx, groupId, userId);
    if (!membership?.is_active) throw notFound('membership');
    await repo.deactivateMembership(tx, groupId, userId);
    await recordAudit(tx, {
      actorUserId: actor.userId, action: 'group.member_removed', entityType: 'group', entityId: groupId,
      before: { user_id: userId },
    });
  });
  return getGroup(pool, groupId);
}

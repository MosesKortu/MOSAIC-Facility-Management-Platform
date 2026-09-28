import {
  centsToDecimal, decimalToCents, type AllocationListQuery, type AllocationRow, type CreateAllocationBody, type CreateGrantBody,
  type GrantDetail, type GrantListQuery, type GrantSummary, type Page, type UpdateAllocationBody, type UpdateGrantBody,
} from '@mosaic/contracts';
import type pg from 'pg';
import type { z } from 'zod';
import { rethrowUniqueViolation } from '../../db/errors.ts';
import { withTransaction, type Queryable } from '../../db/pool.ts';
import type { Actor } from '../../http/access.ts';
import { DomainError } from '../../http/errors.ts';
import { notFound } from '../../http/params.ts';
import { lockUserShared } from '../admin-users/repository.ts';
import { recordAudit } from '../audit/service.ts';
import { notifyGroupMembers } from '../notifications/service.ts';
import * as repo from './repository.ts';

/** Grants and group allocations. All balance arithmetic is in integer cents (09 §4 Money). */

export async function listGrants(db: Queryable, tz: string, query: z.output<typeof GrantListQuery>): Promise<Page<GrantSummary>> {
  const { items, total } = await repo.listGrants(db, tz, query);
  return { items, total, limit: query.limit, offset: query.offset };
}

export async function getGrant(db: Queryable, tz: string, grantId: string): Promise<GrantDetail> {
  const grant = await repo.findGrant(db, tz, grantId);
  if (!grant) throw notFound('grant');
  return { ...grant, allocations: await repo.allocationsOfGrant(db, grantId) };
}

async function assertValidPi(tx: Queryable, userId: string) {
  const pi = await lockUserShared(tx, userId);
  if (!pi || pi.user_type !== 'internal' || !pi.is_active) {
    throw new DomainError('INVALID_PI', 'The principal investigator must be an active internal ICFO user');
  }
}

export async function createGrant(pool: pg.Pool, tz: string, actor: Actor, body: CreateGrantBody): Promise<GrantDetail> {
  const grantId = await withTransaction(pool, async (tx) => {
    await assertValidPi(tx, body.pi_user_id);
    const id = await repo.insertGrant(tx, body).catch(rethrowUniqueViolation);
    await recordAudit(tx, {
      actorUserId: actor.userId, action: 'grant.created', entityType: 'grant', entityId: id,
      after: { ...body, allocated_budget: centsToDecimal(decimalToCents(body.allocated_budget)) },
    });
    return id;
  });
  return getGrant(pool, tz, grantId);
}

export async function updateGrant(pool: pg.Pool, tz: string, actor: Actor, grantId: string, body: UpdateGrantBody): Promise<GrantDetail> {
  await withTransaction(pool, async (tx) => {
    const grant = await repo.lockGrant(tx, grantId);
    if (!grant) throw notFound('grant');

    const budget = decimalToCents(grant.allocated_budget);
    const consumed = budget - decimalToCents(grant.remaining_balance);
    const newBudget = body.allocated_budget === undefined ? budget : decimalToCents(body.allocated_budget);
    const allocated = decimalToCents(grant.allocated_to_groups);

    if (newBudget < allocated) {
      throw new DomainError('BUDGET_BELOW_ALLOCATED', 'The budget cannot be lower than what is already allocated to groups', {
        allocated_to_groups: centsToDecimal(allocated),
      });
    }
    const changes = {
      grant_code: body.grant_code !== undefined && body.grant_code !== grant.grant_code,
      pi: body.pi_user_id !== undefined && body.pi_user_id !== grant.pi_user_id,
      budget: newBudget !== budget,
      expiration: body.expiration_date !== undefined && body.expiration_date !== grant.expiration_date,
    };
    if (changes.pi) await assertValidPi(tx, body.pi_user_id!);

    await repo.updateGrant(tx, grantId, {
      grant_code: changes.grant_code ? body.grant_code! : grant.grant_code,
      pi_user_id: changes.pi ? body.pi_user_id! : grant.pi_user_id,
      allocated_budget: centsToDecimal(newBudget),
      remaining_balance: centsToDecimal(newBudget - consumed), // consumption is preserved (D7)
      expiration_date: changes.expiration ? body.expiration_date! : grant.expiration_date,
    }).catch(rethrowUniqueViolation);

    const audit = (action: string, before: Record<string, unknown>, after: Record<string, unknown>) =>
      recordAudit(tx, { actorUserId: actor.userId, action, entityType: 'grant', entityId: grantId, before, after });
    if (changes.grant_code) await audit('grant.code_changed', { grant_code: grant.grant_code }, { grant_code: body.grant_code });
    if (changes.pi) await audit('grant.pi_changed', { pi_user_id: grant.pi_user_id }, { pi_user_id: body.pi_user_id });
    if (changes.budget) {
      await audit('grant.budget_changed',
        { allocated_budget: centsToDecimal(budget), remaining_balance: grant.remaining_balance },
        { allocated_budget: centsToDecimal(newBudget), remaining_balance: centsToDecimal(newBudget - consumed) });
    }
    if (changes.expiration) await audit('grant.expiration_changed', { expiration_date: grant.expiration_date }, { expiration_date: body.expiration_date });
  });
  return getGrant(pool, tz, grantId);
}

export async function listAllocations(db: Queryable, query: z.output<typeof AllocationListQuery>): Promise<Page<AllocationRow>> {
  const { items, total } = await repo.listAllocations(db, query);
  return { items, total, limit: query.limit, offset: query.offset };
}

async function getAllocation(db: Queryable, allocationId: string): Promise<AllocationRow> {
  const allocation = await repo.findAllocation(db, allocationId);
  if (!allocation) throw notFound('allocation');
  return allocation;
}

function overAllocation(budget: number, allocatedToOthers: number): DomainError {
  return new DomainError('OVER_ALLOCATION', 'This would allocate more than the grant budget', {
    unallocated: centsToDecimal(budget - allocatedToOthers),
  });
}

export async function createAllocation(pool: pg.Pool, actor: Actor, body: CreateAllocationBody): Promise<AllocationRow> {
  const allocationId = await withTransaction(pool, async (tx) => {
    const grant = await repo.lockGrant(tx, body.grant_id); // lock order: grant → allocation
    if (!grant) throw notFound('grant');
    const group = await repo.lockGroupForAllocation(tx, body.group_id);
    if (!group) throw notFound('group');
    if (!group.is_active) throw new DomainError('GROUP_INACTIVE', 'This group is deactivated; reactivate it before allocating funding');

    const amount = decimalToCents(body.allocated_amount);
    const allocated = decimalToCents(grant.allocated_to_groups);
    if (allocated + amount > decimalToCents(grant.allocated_budget)) throw overAllocation(decimalToCents(grant.allocated_budget), allocated);

    const id = await repo.insertAllocation(tx, { ...body, allocated_amount: centsToDecimal(amount) }).catch(rethrowUniqueViolation);
    await recordAudit(tx, {
      actorUserId: actor.userId, action: 'allocation.created', entityType: 'allocation', entityId: id,
      after: { grant_id: body.grant_id, group_id: body.group_id, allocated_amount: centsToDecimal(amount) },
    });
    await notifyGroupMembers(tx, body.group_id, 'grant_allocation_changed', {
      grant_code: grant.grant_code, group_name: group.name, allocated_amount: centsToDecimal(amount), remaining_balance: centsToDecimal(amount),
      is_active: true,
    });
    return id;
  });
  return getAllocation(pool, allocationId);
}

export async function updateAllocation(pool: pg.Pool, actor: Actor, allocationId: string, body: UpdateAllocationBody): Promise<AllocationRow> {
  await withTransaction(pool, async (tx) => {
    // Lock order allocation → grant, the same as booking (equipment → allocation → grant), so the two cannot deadlock.
    const allocation = await repo.lockAllocation(tx, allocationId);
    if (!allocation) throw notFound('allocation');
    const grant = (await repo.lockGrant(tx, allocation.grant_id))!;

    const current = decimalToCents(allocation.allocated_amount);
    const consumed = current - decimalToCents(allocation.remaining_balance);
    const amount = body.allocated_amount === undefined ? current : decimalToCents(body.allocated_amount);
    const amountChanges = amount !== current;
    const activeChanges = body.is_active !== undefined && body.is_active !== allocation.is_active;

    if (amountChanges) {
      if (amount < consumed) {
        throw new DomainError('ALLOCATION_BELOW_CONSUMED', 'The allocation cannot be lower than what has already been spent', {
          consumed: centsToDecimal(consumed),
        });
      }
      const others = decimalToCents(grant.allocated_to_groups) - current;
      if (others + amount > decimalToCents(grant.allocated_budget)) throw overAllocation(decimalToCents(grant.allocated_budget), others);
    }

    await repo.updateAllocation(tx, allocationId, {
      allocated_amount: centsToDecimal(amount),
      remaining_balance: centsToDecimal(amount - consumed), // consumption is preserved (D7)
      is_active: activeChanges ? body.is_active! : allocation.is_active,
    });

    const audit = (action: string, before: Record<string, unknown>, after: Record<string, unknown>) =>
      recordAudit(tx, { actorUserId: actor.userId, action, entityType: 'allocation', entityId: allocationId, before, after });
    if (amountChanges) await audit('allocation.amount_changed', { allocated_amount: centsToDecimal(current) }, { allocated_amount: centsToDecimal(amount) });
    if (activeChanges) {
      await audit(body.is_active ? 'allocation.activated' : 'allocation.deactivated', { is_active: allocation.is_active }, { is_active: body.is_active });
    }
    if (amountChanges || activeChanges) {
      const group = (await repo.lockGroupForAllocation(tx, allocation.group_id))!; // FK: the group exists
      await notifyGroupMembers(tx, allocation.group_id, 'grant_allocation_changed', {
        grant_code: grant.grant_code, group_name: group.name, allocated_amount: centsToDecimal(amount),
        remaining_balance: centsToDecimal(amount - consumed), is_active: activeChanges ? body.is_active! : allocation.is_active,
      });
    }
  });
  return getAllocation(pool, allocationId);
}

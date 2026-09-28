import { z } from 'zod';
import type { GroupRef, PersonRef } from './admin.ts';
import { MONEY_PATTERN } from './money.ts';
import { PageQuery, QueryBoolean, type ListParams } from './pagination.ts';

/** Grants and group allocations (08 §17–19, 09 D7). Money is a decimal string on the wire. */

const Uuid = z.string().uuid();
const Money = z.string().trim().regex(MONEY_PATTERN, 'Enter an amount like 1250.00');
// Round-trip check: Date.parse accepts impossible dates like 2027-02-30 by rolling them over.
export const CalendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((d) => {
    const date = new Date(`${d}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(d);
  }, 'Not a real calendar date');

export const GrantListQuery = PageQuery.extend({
  q: z.string().trim().max(100).optional(),
  expired: QueryBoolean.optional(),
  sort: z.enum(['grant_code', 'expiration_date', 'created_at']).default('grant_code'),
});
export type GrantListQuery = ListParams<typeof GrantListQuery>;

export const CreateGrantBody = z.object({
  grant_code: z.string().trim().min(1, 'Required').max(100),
  pi_user_id: Uuid,
  allocated_budget: Money,
  expiration_date: CalendarDate,
});
export type CreateGrantBody = z.infer<typeof CreateGrantBody>;

export const UpdateGrantBody = CreateGrantBody.partial().refine(
  (body) => Object.values(body).some((v) => v !== undefined), 'Nothing to update',
);
export type UpdateGrantBody = z.infer<typeof UpdateGrantBody>;

/**
 * Funding totals for a grant:
 *  allocated_budget = allocated_to_groups + unallocated
 *  remaining_balance = allocated_budget − consumed
 */
export interface GrantTotals {
  allocated_budget: string;
  allocated_to_groups: string;
  unallocated: string;
  consumed: string;
  remaining_balance: string;
}

export interface GrantSummary extends GrantTotals {
  grant_id: string;
  grant_code: string;
  pi: PersonRef;
  expiration_date: string;
  is_expired: boolean;
  allocation_count: number;
  created_at: string;
}

export interface AllocationRow {
  allocation_id: string;
  grant_id: string;
  grant_code: string;
  group: GroupRef & { is_active: boolean };
  allocated_amount: string;
  remaining_balance: string;
  consumed: string;
  is_active: boolean;
  expiration_date: string;
  created_at: string;
}

export interface GrantDetail extends GrantSummary {
  allocations: AllocationRow[];
}

export const AllocationListQuery = PageQuery.extend({
  grant_id: Uuid.optional(),
  group_id: Uuid.optional(),
  is_active: QueryBoolean.optional(),
  sort: z.enum(['grant_code', 'group_name', 'consumed', 'remaining_balance']).default('grant_code'),
});
export type AllocationListQuery = ListParams<typeof AllocationListQuery>;

export const CreateAllocationBody = z.object({
  grant_id: Uuid,
  group_id: Uuid,
  allocated_amount: Money,
});
export type CreateAllocationBody = z.infer<typeof CreateAllocationBody>;

export const UpdateAllocationBody = z
  .object({ allocated_amount: Money.optional(), is_active: z.boolean().optional() })
  .refine((body) => body.allocated_amount !== undefined || body.is_active !== undefined, 'Nothing to update');
export type UpdateAllocationBody = z.infer<typeof UpdateAllocationBody>;

import { z } from 'zod';
import { ROLES, type Role, type UserType } from './auth.ts';
import { PageQuery, QueryBoolean, type ListParams } from './pagination.ts';

/** Shared by the API (validation) and the web forms (client-side validation of the same rules). */

const Uuid = z.string().uuid();
const Name = z.string().trim().min(1, 'Required').max(255);

// ─── Users ─────────────────────────────────────────────────────────────────────────────────────

export const UserListQuery = PageQuery.extend({
  user_type: z.enum(['internal', 'external']).optional(),
  role: z.enum(ROLES).optional(),
  is_active: QueryBoolean.optional(),
  group_id: Uuid.optional(),
  q: z.string().trim().max(100).optional(),
  sort: z.enum(['full_name', 'email', 'created_at', 'role']).default('full_name'),
});
export type UserListQuery = ListParams<typeof UserListQuery>;

export const CreateUserBody = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(255),
  full_name: Name,
  sso_identifier: z.string().trim().min(1, 'Required').max(255),
  role: z.enum(ROLES),
  user_type: z.enum(['internal', 'external']),
  sponsor_user_id: Uuid.nullable().optional(),
});
export type CreateUserBody = z.infer<typeof CreateUserBody>;

export const UpdateUserBody = z
  .object({
    full_name: Name.optional(),
    role: z.enum(ROLES).optional(),
    is_active: z.boolean().optional(),
    sponsor_user_id: Uuid.optional(),
  })
  .refine((body) => Object.values(body).some((v) => v !== undefined), 'Nothing to update');
export type UpdateUserBody = z.infer<typeof UpdateUserBody>;

export interface GroupRef {
  group_id: string;
  name: string;
}

export interface UserSummary {
  user_id: string;
  email: string;
  full_name: string;
  role: Role;
  user_type: UserType;
  is_active: boolean;
  created_at: string;
  groups: GroupRef[];
}

export interface PersonRef {
  user_id: string;
  full_name: string;
  email: string;
}

export interface UserCertificationSummary {
  equipment_id: string;
  equipment_code: string;
  equipment_name: string;
  theoretical_passed: boolean;
  practical_status: 'not_requested' | 'pending' | 'signed_off' | 'rejected';
  expires_at: string | null;
}

export interface UserFundingAccess {
  allocation_id: string;
  grant_code: string;
  group: GroupRef;
  remaining_balance: string;
  expiration_date: string;
  is_active: boolean;
}

export interface UserDetail extends UserSummary {
  sso_identifier: string;
  sponsor: PersonRef | null;
  /** Internal users only: the externals they sponsor. */
  sponsored: PersonRef[];
  certifications: UserCertificationSummary[];
  funding: UserFundingAccess[];
}

// ─── Groups ────────────────────────────────────────────────────────────────────────────────────

export const GroupListQuery = PageQuery.extend({
  is_active: QueryBoolean.optional(),
  q: z.string().trim().max(100).optional(),
  sort: z.enum(['name', 'created_at']).default('name'),
});
export type GroupListQuery = ListParams<typeof GroupListQuery>;

export const CreateGroupBody = z.object({
  name: Name,
  description: z.string().trim().max(2000).nullable().optional(),
});
export type CreateGroupBody = z.infer<typeof CreateGroupBody>;

export const UpdateGroupBody = z
  .object({
    name: Name.optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    is_active: z.boolean().optional(),
  })
  .refine((body) => Object.values(body).some((v) => v !== undefined), 'Nothing to update');
export type UpdateGroupBody = z.infer<typeof UpdateGroupBody>;

/** Money totals are decimal strings (see money.ts). */
export interface GroupFunding {
  allocated: string;
  remaining: string;
  consumed: string;
  active_allocations: number;
}

export interface GroupSummary {
  group_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  internal_members: number;
  external_members: number;
  funding: GroupFunding;
}

export interface GroupMember extends PersonRef {
  role: Role;
  user_type: UserType;
  is_active: boolean;
  joined_at: string;
}

export interface GroupAllocation {
  allocation_id: string;
  grant_id: string;
  grant_code: string;
  allocated_amount: string;
  remaining_balance: string;
  expiration_date: string;
  is_active: boolean;
}

export interface GroupDetail extends GroupSummary {
  members: GroupMember[];
  allocations: GroupAllocation[];
}

// ─── Audit ─────────────────────────────────────────────────────────────────────────────────────

export const AuditListQuery = PageQuery.extend({
  entity_type: z.string().trim().max(50).optional(),
  entity_id: Uuid.optional(),
  /** Comma-separated ids: one record's history together with its related records (e.g. a grant and its allocations). */
  entity_ids: z
    .string()
    .transform((csv) => csv.split(',').filter(Boolean))
    .pipe(z.array(Uuid).min(1).max(50))
    .optional(),
  actor_user_id: Uuid.optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
});
export type AuditListQuery = Omit<ListParams<typeof AuditListQuery>, 'entity_ids'> & { entity_ids?: string };

export interface AuditEntry {
  log_id: string;
  actor: PersonRef;
  action: string;
  entity_type: string;
  entity_id: string;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  created_at: string;
}

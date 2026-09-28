import type { AuditEntry, Role } from '@mosaic/contracts';
import { formatDate, formatMoney } from '../../lib/format.ts';
import { ROLE_LABEL } from '../auth/roles.ts';

type Describer = (before: Record<string, unknown>, after: Record<string, unknown>) => string;

const roleLabel = (value: unknown) => ROLE_LABEL[value as Role] ?? String(value);
const money = (value: unknown) => (typeof value === 'string' ? formatMoney(value) : '—');
const date = (value: unknown) => (typeof value === 'string' ? formatDate(value) : '—');

// Human wording for audit actions. Unknown actions fall back to their code, never to nothing.
const DESCRIBERS: Record<string, Describer> = {
  'user.created': (_b, a) => `Created the account (${roleLabel(a.role)}, ${String(a.user_type)})`,
  'user.renamed': (b, a) => `Renamed from “${String(b.full_name)}” to “${String(a.full_name)}”`,
  'user.role_changed': (b, a) => `Changed role from ${roleLabel(b.role)} to ${roleLabel(a.role)}`,
  'user.activated': () => 'Activated the account',
  'user.deactivated': () => 'Deactivated the account',
  'user.sponsor_changed': () => 'Changed the sponsor',
  'group.created': (_b, a) => `Created the group “${String(a.name)}”`,
  'group.renamed': (b, a) => `Renamed the group from “${String(b.name)}” to “${String(a.name)}”`,
  'group.description_changed': () => 'Changed the group description',
  'group.activated': () => 'Reactivated the group',
  'group.deactivated': () => 'Deactivated the group',
  'group.member_added': () => 'Added a member',
  'group.member_removed': () => 'Removed a member',
  'grant.created': (_b, a) => `Created the grant with a budget of ${money(a.allocated_budget)}`,
  'grant.code_changed': (b, a) => `Changed the grant code from ${String(b.grant_code)} to ${String(a.grant_code)}`,
  'grant.pi_changed': () => 'Changed the principal investigator',
  'grant.budget_changed': (b, a) => `Changed the budget from ${money(b.allocated_budget)} to ${money(a.allocated_budget)}`,
  'grant.expiration_changed': (b, a) => `Changed the expiration date from ${date(b.expiration_date)} to ${date(a.expiration_date)}`,
  'allocation.created': (_b, a) => `Allocated ${money(a.allocated_amount)} to a group`,
  'allocation.amount_changed': (b, a) => `Changed the allocation from ${money(b.allocated_amount)} to ${money(a.allocated_amount)}`,
  'allocation.activated': () => 'Reactivated the allocation',
  'allocation.deactivated': () => 'Deactivated the allocation',
  'equipment.created': (_b, a) => `Added the instrument ${String(a.code)}`,
  'equipment.updated': (_b, a) => `Changed ${Object.keys(a).map((k) => k.replaceAll('_', ' ')).join(', ')}`,
  'equipment.activated': () => 'Returned the instrument to service',
  'equipment.deactivated': () => 'Retired the instrument',
  'equipment.status_changed': (b, a) => `Changed status from ${String(b.status)} to ${String(a.status)}: ${String(a.reason)}`,
  'equipment.availability_changed': () => 'Changed the weekly bookable hours',
  'tariff.rate_changed': (b, a) => `Changed the ${String(a.tier)} rate from ${money(b.rate_hourly)} to ${money(a.rate_hourly)} per hour`,
  'training_module.saved': (_b, a) => `Published training with ${Array.isArray(a.quiz_schema) ? a.quiz_schema.length : 0} quiz questions`,
  'certification.signed_off': () => 'Signed off a practical certification',
  'certification.rejected': (_b, a) => `Requested a reassessment: ${String(a.reason)}`,
  'tariff.availability_changed': (_b, a) => `${a.is_available ? 'Offered' : 'Withdrew'} ${String(a.tier)} support for new bookings`,
};

export function describeAudit(entry: AuditEntry): string {
  const describe = DESCRIBERS[entry.action];
  return describe ? describe(entry.before_state ?? {}, entry.after_state ?? {}) : entry.action;
}

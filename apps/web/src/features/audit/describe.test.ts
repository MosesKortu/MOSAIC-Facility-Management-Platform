import type { AuditEntry } from '@mosaic/contracts';
import { describe, expect, it } from 'vitest';
import { describeAudit } from './describe.ts';

const entry = (action: string, before: object | null, after: object | null): AuditEntry => ({
  log_id: 'l', actor: { user_id: 'a', full_name: 'Ada Admin', email: 'a@icfo.test' }, action,
  entity_type: action.split('.')[0]!, entity_id: 'e', before_state: before as never, after_state: after as never, created_at: '2026-09-28T10:00:00Z',
});

describe('describeAudit', () => {
  it('turns known actions into sentences with the before and after values', () => {
    expect(describeAudit(entry('user.role_changed', { role: 'standard_user' }, { role: 'super_user' })))
      .toBe('Changed role from Researcher to Super User');
    expect(describeAudit(entry('user.deactivated', { is_active: true }, { is_active: false }))).toBe('Deactivated the account');
    expect(describeAudit(entry('group.renamed', { name: 'Old' }, { name: 'New' }))).toBe('Renamed the group from “Old” to “New”');
    expect(describeAudit(entry('grant.budget_changed', { allocated_budget: '10000.00' }, { allocated_budget: '12500.50' })))
      .toBe('Changed the budget from €10,000.00 to €12,500.50');
  });

  it('falls back to the raw action for events it does not know', () => {
    expect(describeAudit(entry('booking.proxy_created', null, null))).toBe('booking.proxy_created');
  });
});

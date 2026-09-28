import { describe, expect, it } from 'vitest';
import { accessState } from './access.ts';

const now = new Date('2026-09-28T10:00:00Z');
const cert = (overrides: Partial<Parameters<typeof accessState>[0] & object> = {}) => ({
  theoretical_passed: true, practical_status: 'signed_off' as const, expires_at: null, ...overrides,
});

describe('accessState', () => {
  it('requires training when there is no record or the quiz is not passed', () => {
    expect(accessState(null, now)).toBe('training_required');
    expect(accessState(cert({ theoretical_passed: false, practical_status: 'not_requested' }), now)).toBe('training_required');
  });

  it('follows the practical assessment lifecycle', () => {
    expect(accessState(cert({ practical_status: 'not_requested' }), now)).toBe('assessment_required');
    expect(accessState(cert({ practical_status: 'pending' }), now)).toBe('assessment_pending');
    expect(accessState(cert({ practical_status: 'rejected' }), now)).toBe('reassessment_needed');
  });

  it('is certified until the expiry instant, then expired', () => {
    expect(accessState(cert(), now)).toBe('certified');
    expect(accessState(cert({ expires_at: new Date('2026-09-28T10:00:01Z') }), now)).toBe('certified');
    expect(accessState(cert({ expires_at: new Date('2026-09-28T10:00:00Z') }), now)).toBe('expired');
  });
});

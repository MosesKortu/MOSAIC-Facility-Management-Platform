import { describe, expect, it } from 'vitest';
import { ERROR_STATUS, isErrorCode } from './errors.ts';

describe('error catalog', () => {
  it('maps the booking gate codes to the statuses in 03_API_SPEC.md §0.3', () => {
    expect(ERROR_STATUS.BOOKING_CONFLICT).toBe(409);
    expect(ERROR_STATUS.INSUFFICIENT_GRANT_BALANCE).toBe(402);
    expect(ERROR_STATUS.CERTIFICATION_REQUIRED).toBe(403);
    expect(ERROR_STATUS.PRACTICAL_CERTIFICATION_PENDING).toBe(403);
    expect(ERROR_STATUS.OUTSIDE_AVAILABILITY).toBe(422);
    expect(ERROR_STATUS.VALIDATION_FAILED).toBe(400);
    expect(ERROR_STATUS.UNAUTHENTICATED).toBe(401);
  });

  it('only uses client or server error statuses', () => {
    for (const status of Object.values(ERROR_STATUS)) {
      expect(status).toBeGreaterThanOrEqual(400);
      expect(status).toBeLessThan(600);
    }
  });

  it('recognises catalog codes and rejects anything else', () => {
    expect(isErrorCode('BOOKING_CONFLICT')).toBe(true);
    expect(isErrorCode('booking_conflict')).toBe(false);
    expect(isErrorCode('toString')).toBe(false);
  });
});

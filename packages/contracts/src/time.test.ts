import { describe, expect, it } from 'vitest';
import { FACILITY_TIMEZONE, localParts, zonedToInstant } from './time.ts';

describe('facility-local time', () => {
  it('reads the local calendar date, ISO weekday and minutes of an instant (summer and winter offsets)', () => {
    expect(localParts(new Date('2026-10-15T07:30:00Z'), FACILITY_TIMEZONE)).toEqual({ date: '2026-10-15', weekday: 4, minutes: 9 * 60 + 30 });
    expect(localParts(new Date('2026-12-14T08:00:00Z'), FACILITY_TIMEZONE)).toEqual({ date: '2026-12-14', weekday: 1, minutes: 9 * 60 });
    expect(localParts(new Date('2026-10-18T22:30:00Z'), FACILITY_TIMEZONE)).toEqual({ date: '2026-10-19', weekday: 1, minutes: 30 });
  });

  it('converts a local date and time back to the instant, across DST', () => {
    expect(zonedToInstant('2026-10-15', 9 * 60, FACILITY_TIMEZONE).toISOString()).toBe('2026-10-15T07:00:00.000Z');
    expect(zonedToInstant('2026-12-14', 9 * 60, FACILITY_TIMEZONE).toISOString()).toBe('2026-12-14T08:00:00.000Z');
    expect(zonedToInstant('2026-10-25', 12 * 60, FACILITY_TIMEZONE).toISOString()).toBe('2026-10-25T11:00:00.000Z'); // change day
  });
});

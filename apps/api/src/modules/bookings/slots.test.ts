import { FACILITY_TIMEZONE as TZ } from '@mosaic/contracts';
import { describe, expect, it } from 'vitest';
import { checkSlot, nextAvailable, widen } from './slots.ts';

// Thursday 2026-10-15, Madrid is UTC+2: 09:00 local = 07:00Z.
const windows = [{ weekday: 4, opens_at: '09:00', closes_at: '17:00' }, { weekday: 5, opens_at: '09:00', closes_at: '12:00' }];
const now = new Date('2026-10-01T00:00:00Z');
const at = (iso: string) => new Date(iso);
const code = (fn: () => unknown) => {
  try { fn(); return 'ok'; } catch (e) { return (e as { code: string }).code; }
};

describe('checkSlot (D15)', () => {
  it('accepts a 15-minute-aligned slot of at least 30 minutes inside one window, returning its minutes', () => {
    expect(checkSlot(at('2026-10-15T07:00:00Z'), at('2026-10-15T10:00:00Z'), now, windows, TZ)).toBe(180);
    expect(checkSlot(at('2026-10-15T14:30:00Z'), at('2026-10-15T15:00:00Z'), now, windows, TZ)).toBe(30); // ends at closing
  });

  it('checks duration first, then the past, then availability', () => {
    expect(code(() => checkSlot(at('2026-10-15T07:10:00Z'), at('2026-10-15T08:00:00Z'), now, windows, TZ))).toBe('INVALID_DURATION');
    expect(code(() => checkSlot(at('2026-10-15T07:00:00Z'), at('2026-10-15T07:15:00Z'), now, windows, TZ))).toBe('INVALID_DURATION');
    expect(code(() => checkSlot(at('2026-10-15T08:00:00Z'), at('2026-10-15T07:00:00Z'), now, windows, TZ))).toBe('INVALID_DURATION');
    expect(code(() => checkSlot(at('2026-09-01T07:00:00Z'), at('2026-09-01T07:10:00Z'), now, windows, TZ))).toBe('INVALID_DURATION');
    expect(code(() => checkSlot(at('2026-09-03T07:00:00Z'), at('2026-09-03T08:00:00Z'), now, windows, TZ))).toBe('BOOKING_IN_PAST');
    expect(code(() => checkSlot(at('2026-10-15T06:45:00Z'), at('2026-10-15T08:00:00Z'), now, windows, TZ))).toBe('OUTSIDE_AVAILABILITY');
    expect(code(() => checkSlot(at('2026-10-15T14:30:00Z'), at('2026-10-16T08:00:00Z'), now, windows, TZ))).toBe('OUTSIDE_AVAILABILITY');
    expect(code(() => checkSlot(at('2026-10-14T07:00:00Z'), at('2026-10-14T08:00:00Z'), now, windows, TZ))).toBe('OUTSIDE_AVAILABILITY'); // Wednesday
  });
});

describe('nextAvailable', () => {
  it('finds the earliest free slot of the same length after the requested start, respecting buffers', () => {
    const busy = [widen(at('2026-10-15T07:00:00Z'), at('2026-10-15T13:00:00Z'), 30)]; // 09–15 local, blocks 08:30–15:30
    expect(nextAvailable({ windows, busy, minutes: 60, after: at('2026-10-15T07:00:00Z'), tz: TZ })).toBe('2026-10-15T13:30:00.000Z');
    expect(nextAvailable({ windows, busy, minutes: 120, after: at('2026-10-15T07:00:00Z'), tz: TZ })).toBe('2026-10-16T07:00:00.000Z');
  });

  it('returns null when nothing fits within the horizon', () => {
    expect(nextAvailable({ windows, busy: [], minutes: 600, after: at('2026-10-15T07:00:00Z'), tz: TZ })).toBeNull();
  });
});

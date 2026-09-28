import { describe, expect, it } from 'vitest';
import { addDays, dayRange, durationOptions, startOptions } from './slots.ts';

// Thursday 2026-10-15 in Madrid (UTC+2). Window 09:00–12:00.
const windows = [{ weekday: 4, opens_at: '09:00', closes_at: '12:00' }];
const now = new Date('2026-10-01T00:00:00Z');
const busy = [{ start: '2026-10-15T08:00:00Z', end: '2026-10-15T08:45:00Z', mine: false }]; // 10:00–10:45 local

describe('booking slots', () => {
  it('does calendar arithmetic on local dates and gives the instant range of a local day', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(dayRange('2026-10-15')).toEqual({ from: '2026-10-14T22:00:00.000Z', to: '2026-10-15T22:00:00.000Z' });
  });

  it('offers 15-minute starts that leave at least 30 free minutes, skipping busy time and the past', () => {
    expect(startOptions({ date: '2026-10-15', windows, busy, now }).map((o) => o.label))
      .toEqual(['09:00', '09:15', '09:30', '10:45', '11:00', '11:15', '11:30']);
    expect(startOptions({ date: '2026-10-15', windows, busy: [], now: new Date('2026-10-15T09:20:00Z') }).map((o) => o.label))
      .toEqual(['11:30']);
    expect(startOptions({ date: '2026-10-16', windows, busy, now })).toEqual([]); // no window on Friday
  });

  it('offers durations up to the next busy range or the window close', () => {
    expect(durationOptions({ start: '2026-10-15T07:00:00.000Z', date: '2026-10-15', windows, busy })).toEqual([30, 45, 60]);
    expect(durationOptions({ start: '2026-10-15T08:45:00.000Z', date: '2026-10-15', windows, busy })).toEqual([30, 45, 60, 75]);
  });
});

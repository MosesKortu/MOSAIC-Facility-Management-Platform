import { describe, expect, it } from 'vitest';
import { normalizeWindows, weeklyHours } from './windows.ts';

describe('normalizeWindows', () => {
  it('sorts windows by weekday and opening time', () => {
    expect(normalizeWindows([
      { weekday: 2, opens_at: '09:00', closes_at: '12:00' },
      { weekday: 1, opens_at: '14:00', closes_at: '18:00' },
      { weekday: 1, opens_at: '08:00', closes_at: '12:00' },
    ]).map((w) => `${w.weekday} ${w.opens_at}`)).toEqual(['1 08:00', '1 14:00', '2 09:00']);
  });

  it('allows back-to-back windows but rejects overlaps and empty windows', () => {
    expect(() => normalizeWindows([
      { weekday: 1, opens_at: '08:00', closes_at: '12:00' },
      { weekday: 1, opens_at: '12:00', closes_at: '18:00' },
    ])).not.toThrow();
    expect(() => normalizeWindows([
      { weekday: 1, opens_at: '08:00', closes_at: '12:15' },
      { weekday: 1, opens_at: '12:00', closes_at: '18:00' },
    ])).toThrow(expect.objectContaining({ code: 'WINDOW_OVERLAP' }));
    expect(() => normalizeWindows([{ weekday: 3, opens_at: '10:00', closes_at: '10:00' }]))
      .toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
  });
});

describe('weeklyHours', () => {
  it('sums window lengths', () => {
    expect(weeklyHours([
      { weekday: 1, opens_at: '08:00', closes_at: '12:30' },
      { weekday: 2, opens_at: '09:15', closes_at: '10:00' },
    ])).toBe(5.25);
    expect(weeklyHours([])).toBe(0);
  });
});

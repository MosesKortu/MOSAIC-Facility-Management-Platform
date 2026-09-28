import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, formatMoney, formatTime } from './format.ts';

describe('format', () => {
  it('formats euro amounts from decimal strings', () => {
    expect(formatMoney('25000.00')).toBe('€25,000.00');
    expect(formatMoney('0.00')).toBe('€0.00');
  });

  it('formats calendar dates without shifting the day across timezones', () => {
    expect(formatDate('2026-12-31')).toBe('31 Dec 2026');
  });

  it('shows instants in facility time (Europe/Madrid) whatever the viewer timezone', () => {
    expect(formatDateTime('2026-10-15T07:00:00Z')).toBe('15 Oct 2026, 09:00');
    expect(formatDateTime('2026-12-15T08:00:00Z')).toBe('15 Dec 2026, 09:00');
    expect(formatTime('2026-10-15T13:45:00Z')).toBe('15:45');
  });
});

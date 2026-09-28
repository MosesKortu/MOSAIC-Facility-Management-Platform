import { describe, expect, it } from 'vitest';
import { centsToDecimal, costForDuration, decimalToCents } from './money.ts';

describe('decimalToCents', () => {
  it('parses Postgres NUMERIC strings exactly', () => {
    expect(decimalToCents('80.20')).toBe(8020);
    expect(decimalToCents('0.00')).toBe(0);
    expect(decimalToCents('12450')).toBe(1245000);
    expect(decimalToCents('104.5')).toBe(10450);
  });

  it('rejects anything that is not a non-negative decimal with at most two places', () => {
    for (const bad of ['', 'abc', '1.234', '-1.00', '1e3', ' 1.00']) {
      expect(() => decimalToCents(bad)).toThrow();
    }
  });
});

describe('centsToDecimal', () => {
  it('formats with exactly two decimals', () => {
    expect(centsToDecimal(8020)).toBe('80.20');
    expect(centsToDecimal(5)).toBe('0.05');
    expect(centsToDecimal(0)).toBe('0.00');
    expect(centsToDecimal(-3000)).toBe('-30.00');
  });
});

describe('costForDuration', () => {
  it('multiplies an hourly rate by duration in minutes', () => {
    // 3 h × €104.50 = €313.50 (the API spec example)
    expect(costForDuration(10450, 180)).toBe(31350);
    // 2.5 h × €80.20 = €200.50
    expect(costForDuration(8020, 150)).toBe(20050);
  });

  it('rounds half up to the cent', () => {
    // 15 min × €65.30 = €16.325 → €16.33
    expect(costForDuration(6530, 15)).toBe(1633);
    // 45 min × €133.70 = €100.275 → €100.28
    expect(costForDuration(13370, 45)).toBe(10028);
  });

  it('is zero for a zero rate', () => {
    expect(costForDuration(0, 120)).toBe(0);
  });
});

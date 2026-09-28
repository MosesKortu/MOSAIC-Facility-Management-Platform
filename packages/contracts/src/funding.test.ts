import { describe, expect, it } from 'vitest';
import { CalendarDate, CreateAllocationBody } from './funding.ts';

describe('CalendarDate', () => {
  it('accepts real dates, including leap days', () => {
    expect(CalendarDate.safeParse('2028-02-29').success).toBe(true);
  });

  it('rejects impossible dates without throwing', () => {
    for (const bad of ['2027-02-29', '2027-02-30', '2027-13-01', '2027-00-10', '27-01-01']) {
      expect(CalendarDate.safeParse(bad).success).toBe(false);
    }
  });
});

describe('money fields', () => {
  it('accept at most two decimals', () => {
    const base = { grant_id: '00000000-0000-4000-8000-000000000001', group_id: '00000000-0000-4000-8000-000000000002' };
    expect(CreateAllocationBody.safeParse({ ...base, allocated_amount: '100.5' }).success).toBe(true);
    expect(CreateAllocationBody.safeParse({ ...base, allocated_amount: '100.505' }).success).toBe(false);
    expect(CreateAllocationBody.safeParse({ ...base, allocated_amount: '-5' }).success).toBe(false);
  });
});

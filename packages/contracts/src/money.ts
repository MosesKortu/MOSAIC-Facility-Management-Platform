/**
 * Money is carried as integer cents in TypeScript and as a two-decimal string on the wire, so a
 * balance is never represented by a binary float (09_ARCHITECTURE.md §4 "Money").
 */

/** Wire format: non-negative decimal with at most two places, e.g. "313.50". */
export const MONEY_PATTERN = /^\d+(\.\d{1,2})?$/;

/** Parses a Postgres NUMERIC / wire decimal string into integer cents. */
export function decimalToCents(value: string): number {
  if (!MONEY_PATTERN.test(value)) {
    throw new RangeError(`Not a money amount: ${JSON.stringify(value)}`);
  }
  const [units = '0', fraction = ''] = value.split('.');
  const cents = Number(units) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) throw new RangeError(`Money amount too large: ${value}`);
  return cents;
}

/** Formats integer cents as a two-decimal string. Negative values are allowed (e.g. shortfalls). */
export function centsToDecimal(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new RangeError(`Cents must be a safe integer: ${cents}`);
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/**
 * Cost of `minutes` at an hourly rate, rounded half-up to the cent. Used for both the base and the
 * support component (08_IMPLEMENTATION_CONTRACT.md §6); the total is their sum (a generated column).
 * Integer arithmetic keeps the rounding exact: cents × minutes fits comfortably in a safe integer.
 */
export function costForDuration(rateCentsPerHour: number, minutes: number): number {
  if (!Number.isSafeInteger(rateCentsPerHour) || rateCentsPerHour < 0) {
    throw new RangeError(`Invalid hourly rate: ${rateCentsPerHour}`);
  }
  if (!Number.isSafeInteger(minutes) || minutes < 0) throw new RangeError(`Invalid duration: ${minutes}`);
  const numerator = rateCentsPerHour * minutes;
  return Math.floor((numerator + 30) / 60); // +30/60 = +0.5 → half-up for non-negative values
}

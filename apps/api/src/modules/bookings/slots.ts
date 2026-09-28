import { MIN_BOOKING_MINUTES, SLOT_STEP_MINUTES, localParts, zonedToInstant, type AvailabilityWindow } from '@mosaic/contracts';
import { DomainError } from '../../http/errors.ts';

const MINUTE = 60_000;
const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

export interface Range { start: Date; end: Date }

/**
 * D15 time rules in gate order: duration (15-minute boundaries, ≥ 30 min), then not in the past,
 * then inside one availability window (facility-local). Returns the duration in minutes.
 */
export function checkSlot(start: Date, end: Date, now: Date, windows: AvailabilityWindow[], tz: string): number {
  const minutes = (end.getTime() - start.getTime()) / MINUTE;
  const aligned = (d: Date) => d.getTime() % (SLOT_STEP_MINUTES * MINUTE) === 0;
  if (!aligned(start) || !aligned(end) || minutes < MIN_BOOKING_MINUTES) {
    throw new DomainError('INVALID_DURATION',
      `Bookings start and end on ${SLOT_STEP_MINUTES}-minute boundaries and last at least ${MIN_BOOKING_MINUTES} minutes`);
  }
  if (start.getTime() <= now.getTime()) throw new DomainError('BOOKING_IN_PAST', 'The booking must start in the future');

  const from = localParts(start, tz);
  const to = localParts(end, tz);
  const fits = from.date === to.date && windows.some((w) =>
    w.weekday === from.weekday && minutesOf(w.opens_at) <= from.minutes && to.minutes <= minutesOf(w.closes_at));
  if (!fits) throw new DomainError('OUTSIDE_AVAILABILITY', 'The slot must fit inside one of the instrument’s availability windows');
  return minutes;
}

/** The range a booking blocks: its slot widened by the buffer on both sides (D20). */
export function widen(start: Date, end: Date, bufferMinutes: number): Range {
  return { start: new Date(start.getTime() - bufferMinutes * MINUTE), end: new Date(end.getTime() + bufferMinutes * MINUTE) };
}

export const overlaps = (a: Range, b: Range) => a.start < b.end && b.start < a.end;

const HORIZON_DAYS = 14;

/**
 * Earliest free slot of `minutes` starting at or after `after`, within the windows and clear of
 * every blocked range, looking ahead HORIZON_DAYS local days. Powers BOOKING_CONFLICT.next_available.
 */
export function nextAvailable(o: { windows: AvailabilityWindow[]; busy: Range[]; minutes: number; after: Date; tz: string }): string | null {
  const first = localParts(o.after, o.tz);
  for (let day = 0; day < HORIZON_DAYS; day++) {
    const noon = zonedToInstant(first.date, 12 * 60, o.tz);
    const { date, weekday } = localParts(new Date(noon.getTime() + day * 24 * 60 * MINUTE), o.tz);
    for (const w of o.windows.filter((x) => x.weekday === weekday)) {
      for (let m = minutesOf(w.opens_at); m + o.minutes <= minutesOf(w.closes_at); m += SLOT_STEP_MINUTES) {
        const start = zonedToInstant(date, m, o.tz);
        if (start < o.after) continue;
        const slot = { start, end: new Date(start.getTime() + o.minutes * MINUTE) };
        if (!o.busy.some((b) => overlaps(slot, b))) return start.toISOString();
      }
    }
  }
  return null;
}

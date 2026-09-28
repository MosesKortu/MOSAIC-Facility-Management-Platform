import {
  FACILITY_TIMEZONE, MIN_BOOKING_MINUTES, SLOT_STEP_MINUTES, localParts, zonedToInstant, type Availability, type AvailabilityWindow,
} from '@mosaic/contracts';

/**
 * Slot choices offered by the booking form (D15, D20). They mirror the server rules so users are
 * only offered slots that can succeed; the server still decides.
 */

const MINUTE = 60_000;
const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
type Busy = Availability['busy'];

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

export function todayLocal(now = new Date()): string {
  return localParts(now, FACILITY_TIMEZONE).date;
}

/** The instants bounding a facility-local calendar day. */
export function dayRange(date: string) {
  return {
    from: zonedToInstant(date, 0, FACILITY_TIMEZONE).toISOString(),
    to: zonedToInstant(addDays(date, 1), 0, FACILITY_TIMEZONE).toISOString(),
  };
}

const windowsOn = (date: string, windows: AvailabilityWindow[]) => {
  const { weekday } = localParts(zonedToInstant(date, 12 * 60, FACILITY_TIMEZONE), FACILITY_TIMEZONE);
  return windows.filter((w) => w.weekday === weekday);
};

const isFree = (start: number, end: number, busy: Busy) => busy.every((b) => end <= Date.parse(b.start) || Date.parse(b.end) <= start);
const label = (instant: Date) => localParts(instant, FACILITY_TIMEZONE).minutes;
const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

export function startOptions(o: { date: string; windows: AvailabilityWindow[]; busy: Busy; now: Date }): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  for (const w of windowsOn(o.date, o.windows)) {
    for (let m = minutesOf(w.opens_at); m + MIN_BOOKING_MINUTES <= minutesOf(w.closes_at); m += SLOT_STEP_MINUTES) {
      const start = zonedToInstant(o.date, m, FACILITY_TIMEZONE);
      if (start <= o.now || !isFree(start.getTime(), start.getTime() + MIN_BOOKING_MINUTES * MINUTE, o.busy)) continue;
      options.push({ value: start.toISOString(), label: hhmm(label(start)) });
    }
  }
  return options;
}

/** Durations in minutes from `start`, each fully free and inside the start's window. */
export function durationOptions(o: { start: string; date: string; windows: AvailabilityWindow[]; busy: Busy }): number[] {
  const startMs = Date.parse(o.start);
  const startMinutes = label(new Date(startMs));
  const window = windowsOn(o.date, o.windows).find((w) => minutesOf(w.opens_at) <= startMinutes && startMinutes < minutesOf(w.closes_at));
  if (!window) return [];
  const durations: number[] = [];
  for (let d = MIN_BOOKING_MINUTES; startMinutes + d <= minutesOf(window.closes_at); d += SLOT_STEP_MINUTES) {
    if (!isFree(startMs, startMs + d * MINUTE, o.busy)) break;
    durations.push(d);
  }
  return durations;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h > 0 && `${h} h`, m > 0 && `${m} min`].filter(Boolean).join(' ');
}

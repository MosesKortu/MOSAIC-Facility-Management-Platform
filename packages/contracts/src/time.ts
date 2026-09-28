/**
 * Facility-local time (09 §4 Time). Instants are UTC on the wire; availability windows and calendar
 * days are local to the facilities in Barcelona. One constant, shared by the API and the web app.
 */
export const FACILITY_TIMEZONE = 'Europe/Madrid';

export interface LocalParts {
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  /** ISO weekday, 1 = Monday … 7 = Sunday. */
  weekday: number;
  /** Minutes since local midnight. */
  minutes: number;
}

const WEEKDAY: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

export function localParts(instant: Date, timeZone: string): LocalParts {
  const parts = Object.fromEntries(formatter(timeZone).formatToParts(instant).map((p) => [p.type, p.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: WEEKDAY[parts.weekday!]!,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/** The instant at which the local clock in `timeZone` reads `date` + `minutes` (resolved in two passes for DST). */
export function zonedToInstant(date: string, minutes: number, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const wanted = Date.UTC(y!, m! - 1, d, 0, minutes);
  let guess = wanted;
  for (let pass = 0; pass < 2; pass++) {
    const local = localParts(new Date(guess), timeZone);
    const [ly, lm, ld] = local.date.split('-').map(Number);
    guess += wanted - Date.UTC(ly!, lm! - 1, ld, 0, local.minutes);
  }
  return new Date(guess);
}

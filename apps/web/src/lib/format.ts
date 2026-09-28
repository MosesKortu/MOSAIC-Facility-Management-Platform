import { FACILITY_TIMEZONE } from '@mosaic/contracts';

const EUR = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' });
const DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
// Instants are shown in facility time: bookings, windows and sessions all happen in Barcelona.
const DATE_TIME = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: FACILITY_TIMEZONE,
});
const TIME = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: FACILITY_TIMEZONE });

/** Display only: money arrives as an exact decimal string; it is never used for arithmetic here. */
export function formatMoney(amount: string): string {
  return EUR.format(Number(amount));
}

/** "YYYY-MM-DD" dates are calendar dates, not instants: format without timezone shifting. */
export function formatDate(value: string): string {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  return DATE.format(new Date(y!, m! - 1, d));
}

export function formatDateTime(instant: string): string {
  return DATE_TIME.format(new Date(instant));
}

export function formatTime(instant: string): string {
  return TIME.format(new Date(instant));
}

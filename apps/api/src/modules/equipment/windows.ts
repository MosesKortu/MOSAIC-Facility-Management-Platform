import type { AvailabilityWindow } from '@mosaic/contracts';
import { DomainError } from '../../http/errors.ts';

const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/**
 * Validates and orders weekly availability windows (D8): each window must be non-empty, and windows
 * on the same weekday must not overlap (touching end-to-start is allowed).
 */
export function normalizeWindows(windows: AvailabilityWindow[]): AvailabilityWindow[] {
  const sorted = [...windows].sort((a, b) => a.weekday - b.weekday || minutes(a.opens_at) - minutes(b.opens_at));
  sorted.forEach((window, i) => {
    if (minutes(window.closes_at) <= minutes(window.opens_at)) {
      throw new DomainError('VALIDATION_FAILED', 'A window must close after it opens', {
        issues: [{ path: `windows.${i}.closes_at`, message: 'Must be after the opening time' }],
      });
    }
    const previous = sorted[i - 1];
    if (previous && previous.weekday === window.weekday && minutes(window.opens_at) < minutes(previous.closes_at)) {
      throw new DomainError('WINDOW_OVERLAP', 'Availability windows on the same day must not overlap', {
        weekday: window.weekday,
      });
    }
  });
  return sorted;
}

/** Bookable hours per week. */
export function weeklyHours(windows: AvailabilityWindow[]): number {
  return windows.reduce((total, w) => total + (minutes(w.closes_at) - minutes(w.opens_at)), 0) / 60;
}

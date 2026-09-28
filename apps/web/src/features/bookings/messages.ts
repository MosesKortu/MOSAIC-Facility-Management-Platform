import type { BookingStatus, UnusableReason } from '@mosaic/contracts';
import type { BadgeTone } from '../../components/ui/badge.tsx';
import { ApiError } from '../../lib/api.ts';
import { formatDate, formatDateTime, formatMoney } from '../../lib/format.ts';

export const BOOKING_STATUS: Record<BookingStatus, { label: string; tone: BadgeTone }> = {
  confirmed: { label: 'Confirmed', tone: 'info' },
  active: { label: 'In session', tone: 'success' },
  completed: { label: 'Completed', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
};

export const UNUSABLE_REASON: Record<UnusableReason, string> = {
  allocation_inactive: 'This allocation has been deactivated',
  group_inactive: 'This group has been deactivated',
  grant_expired: 'The grant has expired',
  no_balance: 'Nothing left to spend',
};

export type BookingStep = 'time' | 'support' | 'funding';

export interface GateProblem {
  title: string;
  detail: string;
  /** The step where the user can fix it, if any. */
  step?: BookingStep;
  link?: { to: string; label: string };
}

const str = (details: Record<string, unknown>, key: string) => (typeof details[key] === 'string' ? details[key] : undefined);

/** Specific, actionable wording for each booking gate (03 §3.1), never "Booking failed". */
export function bookingProblem(error: unknown, equipmentId: string): GateProblem {
  if (!(error instanceof ApiError)) return { title: 'The booking could not be checked', detail: 'Something went wrong. Please try again.' };
  const d = error.details;
  const training = { to: `/training/${equipmentId}`, label: 'Go to training' };
  switch (error.code) {
    case 'INVALID_DURATION':
    case 'BOOKING_IN_PAST':
    case 'OUTSIDE_AVAILABILITY':
      return { title: 'This time cannot be booked', detail: error.message, step: 'time' };
    case 'BOOKING_CONFLICT': {
      const next = str(d, 'next_available');
      return {
        title: 'Someone booked this time first',
        detail: next ? `The next free slot of the same length starts ${formatDateTime(next)}.` : 'Choose another time; nothing of the same length is free in the next two weeks.',
        step: 'time',
      };
    }
    case 'EQUIPMENT_NOT_OPERATIONAL':
      return { title: 'The instrument is not available', detail: `It is currently ${str(d, 'status') ?? 'not operational'}. New bookings open again when it is operational.` };
    case 'SUPPORT_UNAVAILABLE':
      return { title: 'This support level is not offered right now', detail: 'Choose another support level.', step: 'support' };
    case 'CERTIFICATION_REQUIRED':
      return { title: 'Training required', detail: 'Read the SOP and pass the safety quiz for this instrument first.', link: training };
    case 'PRACTICAL_CERTIFICATION_PENDING':
      return {
        title: 'Practical assessment not signed off',
        detail: str(d, 'practical_status') === 'pending' ? 'Your assessment request is waiting for a super user.' : 'Request a practical assessment for this instrument first.',
        link: training,
      };
    case 'CERTIFICATION_EXPIRED': {
      const at = str(d, 'expired_at');
      return { title: 'Your certification runs out before this session ends', detail: `${at ? `It is valid until ${formatDateTime(at)}. ` : ''}Renew it with a new practical assessment, or book an earlier slot.`, link: training };
    }
    case 'ALLOCATION_NOT_AVAILABLE':
      return { title: 'This funding cannot be used', detail: 'It is inactive or not available to you. Choose another allocation.', step: 'funding' };
    case 'GRANT_EXPIRED': {
      const on = str(d, 'expired_on');
      return { title: 'The grant expires before this booking', detail: `${on ? `It ends on ${formatDate(on)}. ` : ''}Choose other funding or an earlier date.`, step: 'funding' };
    }
    case 'INSUFFICIENT_GRANT_BALANCE': {
      const available = str(d, 'available');
      const shortfall = str(d, 'shortfall');
      return {
        title: 'Not enough funding left',
        detail: `${available ? `${formatMoney(available)} is available` : 'The balance is too low'}${shortfall ? `, ${formatMoney(shortfall)} short` : ''}. Choose other funding or a shorter slot.`,
        step: 'funding',
      };
    }
    default:
      return { title: 'The booking could not be made', detail: error.message };
  }
}

export function cancelProblem(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Something went wrong. Please try again.';
  switch (error.code) {
    case 'SLOT_ALREADY_STARTED':
      return 'The slot has already started, so it can no longer be cancelled or refunded.';
    case 'BOOKING_NOT_CANCELLABLE':
      return 'This booking is no longer confirmed, so there is nothing to cancel.';
    case 'REASON_REQUIRED':
      return 'Give a reason; the researcher sees it.';
    default:
      return error.message;
  }
}

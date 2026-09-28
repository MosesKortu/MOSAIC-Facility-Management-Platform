import { z } from 'zod';
import type { GroupRef, PersonRef } from './admin.ts';
import { SUPPORT_TIERS, type SupportTier } from './equipment.ts';
import { PageQuery, type ListParams } from './pagination.ts';

/** Booking, funding choice and availability (08 §6, 03 §3.1, 09 D5/D7/D15/D20). */

const Uuid = z.string().uuid();
const Instant = z.string().datetime({ offset: true });

export const BOOKING_STATUSES = ['confirmed', 'active', 'completed', 'cancelled'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** D15 time rules, shared so the web offers only slots the API accepts. */
export const SLOT_STEP_MINUTES = 15;
export const MIN_BOOKING_MINUTES = 30;
/** A session can be started this long before the slot starts (D15). */
export const SESSION_EARLY_START_MINUTES = 15;

// ─── Availability ──────────────────────────────────────────────────────────────────────────────

const MAX_AVAILABILITY_DAYS = 31;
export const AvailabilityQuery = z.object({ from: Instant, to: Instant }).refine(
  (q) => Date.parse(q.to) > Date.parse(q.from) && Date.parse(q.to) - Date.parse(q.from) <= MAX_AVAILABILITY_DAYS * 24 * 3600_000,
  { path: ['to'], message: `Must be after "from" and at most ${MAX_AVAILABILITY_DAYS} days later` },
);
export type AvailabilityQuery = z.infer<typeof AvailabilityQuery>;

export interface Availability {
  timezone: string;
  buffer_time_minutes: number;
  windows: { weekday: number; opens_at: string; closes_at: string }[];
  /** Blocked ranges: each booking widened by the buffer on both sides (D20). No identities, only `mine`. */
  busy: { start: string; end: string; mine: boolean }[];
}

// ─── Funding choice ────────────────────────────────────────────────────────────────────────────

export const FundingQuery = z.object({ user_id: Uuid.optional() });
export type FundingQuery = z.infer<typeof FundingQuery>;

export type UnusableReason = 'allocation_inactive' | 'group_inactive' | 'grant_expired' | 'no_balance';

/** GET /funding/me — allocations of the groups the user is an active member of. */
export interface FundingOption {
  allocation_id: string;
  grant_id: string;
  grant_code: string;
  group: GroupRef;
  remaining_balance: string;
  expiration_date: string;
  usable: boolean;
  unusable_reason: UnusableReason | null;
}

/** GET /bookings/beneficiaries — staff search for proxy booking: active standard/super/admin users. */
export const BeneficiaryQuery = z.object({ q: z.string().trim().max(100).optional() });
export type BeneficiaryQuery = z.infer<typeof BeneficiaryQuery>;

// ─── Create / quote ────────────────────────────────────────────────────────────────────────────

export const BookingBody = z.object({
  equipment_id: Uuid,
  allocation_id: Uuid,
  start_time: Instant,
  end_time: Instant,
  support_requested: z.enum(SUPPORT_TIERS).default('none'),
  /** Staff only: book for this user; every gate is evaluated against them. */
  on_behalf_of_user_id: Uuid.nullish(),
  /** Staff only: bypass the operational-status gate (audited). */
  force_override: z.boolean().default(false),
});
export type BookingBody = z.input<typeof BookingBody>;

export interface BookingQuote {
  duration_minutes: number;
  calculated_base_cost: string;
  calculated_support_cost: string;
  total_cost: string;
  allocation_remaining_after: string;
}

export interface BookingCreated extends BookingQuote {
  booking_id: string;
  status: 'confirmed';
}

// ─── Read / cancel ─────────────────────────────────────────────────────────────────────────────

export const BookingListQuery = PageQuery.extend({
  scope: z.enum(['me', 'all']).default('me'),
  status: z.enum(BOOKING_STATUSES).optional(),
  equipment_id: Uuid.optional(),
  /** Bookings whose slot ends after `from` / starts before `to`. */
  from: Instant.optional(),
  to: Instant.optional(),
});
export type BookingListQuery = ListParams<typeof BookingListQuery>;

export interface BookingSummary {
  booking_id: string;
  equipment: { equipment_id: string; code: string; name: string };
  user: PersonRef;
  booked_by: PersonRef;
  start_time: string;
  end_time: string;
  status: BookingStatus;
  support_requested: SupportTier;
  calculated_base_cost: string;
  calculated_support_cost: string;
  total_cost: string;
  grant_code: string;
  group: GroupRef;
  force_override: boolean;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
}

export interface BookingDetail extends BookingSummary {
  /** Confirmed and not yet started: the caller may cancel with a full refund (D5). */
  cancellable: boolean;
  session_events: { state: 'authorizing' | 'active' | 'fault' | 'completed'; source: 'relay' | 'user' | 'system'; detail: string | null; occurred_at: string }[];
}

export const CancelBookingBody = z.object({ reason: z.string().trim().max(2000).optional() });
export type CancelBookingBody = z.infer<typeof CancelBookingBody>;

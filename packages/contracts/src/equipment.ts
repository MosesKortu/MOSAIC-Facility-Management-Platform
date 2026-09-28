import { z } from 'zod';
import type { PersonRef } from './admin.ts';
import { MONEY_PATTERN } from './money.ts';
import { PageQuery, QueryBoolean, type ListParams } from './pagination.ts';

/** Equipment, availability windows, status history and support tariffs (08 §21–22, 25; 09 D8). */

export const FACILITIES = ['NFL', 'NCL', 'SLN'] as const;
export type Facility = (typeof FACILITIES)[number];
export const FACILITY_NAME: Record<Facility, string> = {
  NFL: 'Nano Fabrication Lab',
  NCL: 'Nanocharacterization Lab',
  SLN: 'Super-resolution Light Microscopy & Nanoscopy',
};

export const EQUIPMENT_STATUSES = ['operational', 'maintenance', 'offline'] as const;
export type EquipmentStatus = (typeof EQUIPMENT_STATUSES)[number];

export const SUPPORT_TIERS = ['none', 'technician', 'supervisor'] as const;
export type SupportTier = (typeof SUPPORT_TIERS)[number];

export const LOCALES = ['en', 'es', 'ca'] as const;
export type Locale = (typeof LOCALES)[number];

/**
 * A user's access to one instrument, derived from their certification record (one definition,
 * shared by equipment pages and the booking gate):
 *  training_required     no record, or theory not passed
 *  assessment_required   theory passed, practical not requested
 *  assessment_pending    practical requested, awaiting a super user
 *  reassessment_needed   practical rejected
 *  expired               certified, but expires_at has passed
 *  certified             theory passed, practical signed off, not expired
 */
export const ACCESS_STATES = [
  'training_required', 'assessment_required', 'assessment_pending', 'reassessment_needed', 'expired', 'certified',
] as const;
export type AccessState = (typeof ACCESS_STATES)[number];

export interface MyCertification {
  access: AccessState;
  theoretical_passed: boolean;
  theoretical_score: number | null;
  practical_status: 'not_requested' | 'pending' | 'signed_off' | 'rejected';
  practical_rejection_reason: string | null;
  expires_at: string | null;
}

const Money = z.string().trim().regex(MONEY_PATTERN, 'Enter an amount like 80.20');
const Localized = z.object({
  en: z.string().trim().min(1, 'An English value is required').max(500),
  es: z.string().trim().max(500).optional(),
  ca: z.string().trim().max(500).optional(),
});
export type LocalizedText = z.infer<typeof Localized>;

// ─── Researcher views ──────────────────────────────────────────────────────────────────────────

export const EquipmentListQuery = PageQuery.extend({
  facility: z.enum(FACILITIES).optional(),
  status: z.enum(EQUIPMENT_STATUSES).optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
export type EquipmentListQuery = ListParams<typeof EquipmentListQuery>;

export interface AvailabilityWindow {
  weekday: number; // ISO 1 = Monday … 7 = Sunday
  opens_at: string; // "HH:MM", facility-local time
  closes_at: string;
}

export interface EquipmentSummary {
  equipment_id: string;
  code: string;
  facility: Facility;
  /** Resolved to the requested locale (Accept-Language), falling back to English. */
  name: string;
  description: string;
  status: EquipmentStatus;
  base_rate_hourly: string;
  my_certification: MyCertification;
}

export interface SupportTariff {
  tier: SupportTier;
  rate_hourly: string;
  is_available: boolean;
}

export interface EquipmentDetail extends EquipmentSummary {
  buffer_time_minutes: number;
  certification_validity_months: number | null;
  /** Whether a hardware interlock is configured; without one access is manual (D13). */
  has_interlock: boolean;
  availability_windows: AvailabilityWindow[];
  support_tariffs: SupportTariff[];
}

export interface StatusEvent {
  event_id: string;
  previous_status: EquipmentStatus;
  new_status: EquipmentStatus;
  reason: string;
  changed_by: PersonRef;
  changed_at: string;
}

// ─── Operations ────────────────────────────────────────────────────────────────────────────────

export const ChangeStatusBody = z.object({
  status: z.enum(EQUIPMENT_STATUSES),
  reason: z.string().trim().max(2000),
});
export type ChangeStatusBody = z.infer<typeof ChangeStatusBody>;

export interface StatusChangeResult {
  equipment: EquipmentDetail;
  /** Upcoming non-cancelled bookings whose owners were notified (bookings are never auto-cancelled). */
  affected_bookings: number;
}

// ─── Administration ────────────────────────────────────────────────────────────────────────────

const EquipmentFields = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{2,50}$/, 'Use 2–50 letters, digits or underscores'),
  facility: z.enum(FACILITIES),
  name: Localized,
  description: Localized,
  base_rate_hourly: Money,
  buffer_time_minutes: z.number().int().min(0).max(240),
  certification_validity_months: z.number().int().min(1).max(120).nullable(),
  interlock_ip: z.union([z.ipv4(), z.ipv6()]).nullable(),
  interlock_mqtt_topic: z.string().trim().min(1).max(255).nullable(),
});

export const CreateEquipmentBody = EquipmentFields;
export type CreateEquipmentBody = z.infer<typeof CreateEquipmentBody>;

// Strict: status is never set here — it changes only via the status endpoint, which records an event.
export const UpdateEquipmentBody = EquipmentFields.partial()
  .extend({ is_active: z.boolean().optional() })
  .strict()
  .refine((body) => Object.values(body).some((v) => v !== undefined), 'Nothing to update');
export type UpdateEquipmentBody = z.infer<typeof UpdateEquipmentBody>;

export const AdminEquipmentListQuery = PageQuery.extend({
  facility: z.enum(FACILITIES).optional(),
  status: z.enum(EQUIPMENT_STATUSES).optional(),
  is_active: QueryBoolean.optional(),
  q: z.string().trim().max(100).optional(),
  sort: z.enum(['code', 'facility', 'status', 'created_at']).default('code'),
});
export type AdminEquipmentListQuery = ListParams<typeof AdminEquipmentListQuery>;

export interface AdminEquipment {
  equipment_id: string;
  code: string;
  facility: Facility;
  name: LocalizedText;
  description: LocalizedText;
  status: EquipmentStatus;
  base_rate_hourly: string;
  buffer_time_minutes: number;
  certification_validity_months: number | null;
  interlock_ip: string | null;
  interlock_mqtt_topic: string | null;
  is_active: boolean;
  created_at: string;
  availability_windows: AvailabilityWindow[];
  /** Bookable hours per week from the windows (0 = cannot be booked). */
  weekly_hours: number;
}

const Time = z.string().regex(/^([01]\d|2[0-3]):(00|15|30|45)$/, 'Use HH:MM on a quarter hour');
export const AvailabilityBody = z.object({
  windows: z.array(z.object({ weekday: z.number().int().min(1).max(7), opens_at: Time, closes_at: Time })).max(50),
});
export type AvailabilityBody = z.infer<typeof AvailabilityBody>;

export const UpdateTariffBody = z
  .object({ rate_hourly: Money.optional(), is_available: z.boolean().optional() })
  .refine((body) => body.rate_hourly !== undefined || body.is_available !== undefined, 'Nothing to update');
export type UpdateTariffBody = z.infer<typeof UpdateTariffBody>;

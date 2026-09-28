import { z } from 'zod';
import type { EquipmentStatus } from './equipment.ts';
import { QueryBoolean, type ListParams } from './pagination.ts';

/** In-app notifications (08 §28, 03 §2). Each type has one payload shape, written only by `notify()`. */
export interface NotificationPayloads {
  grant_allocation_changed: {
    grant_code: string;
    group_name: string;
    allocated_amount: string;
    remaining_balance: string;
    is_active: boolean;
  };
  equipment_status_changed: {
    equipment_id: string;
    equipment_code: string;
    equipment_name: string;
    previous_status: EquipmentStatus;
    new_status: EquipmentStatus;
    reason: string;
    booking_ids: string[];
  };
  certification_signed_off: { equipment_id: string; equipment_code: string; equipment_name: string; expires_at: string | null };
  certification_rejected: { equipment_id: string; equipment_code: string; equipment_name: string; reason: string };
  booking_cancelled_by_staff: {
    booking_id: string;
    equipment_id: string;
    equipment_name: string;
    start_time: string;
    reason: string;
    refunded: string;
  };
  /** A booking took the allocation below 10 % of its amount (D20); sent once per crossing. */
  allocation_low_balance: { grant_code: string; group_name: string; allocated_amount: string; remaining_balance: string };
}

export type NotificationType = keyof NotificationPayloads;

/** A notification as returned by GET /notifications, discriminated by `type`. */
export type Notification = {
  [K in NotificationType]: { notification_id: string; type: K; payload: NotificationPayloads[K]; read_at: string | null; created_at: string };
}[NotificationType];

export const NotificationListQuery = z.object({
  unread_only: QueryBoolean.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
export type NotificationListQuery = ListParams<typeof NotificationListQuery>;

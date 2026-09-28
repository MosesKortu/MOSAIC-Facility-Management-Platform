import type { Notification } from '@mosaic/contracts';
import { formatDate, formatDateTime, formatMoney } from '../../lib/format.ts';
import { EQUIPMENT_STATUS } from '../equipment/labels.ts';

export interface NotificationText {
  title: string;
  detail: string;
  /** Where the user acts on it; absent when there is no page for it yet. */
  link?: { to: string; label: string };
}

/** Readable wording for each notification type (08 §28). The switch is exhaustive over the contract. */
export function describeNotification(n: Notification): NotificationText {
  switch (n.type) {
    case 'equipment_status_changed': {
      const count = n.payload.booking_ids.length;
      return {
        title: `${n.payload.equipment_name} is now ${EQUIPMENT_STATUS[n.payload.new_status].phrase}`,
        detail: `Reason: ${n.payload.reason}. ${count} of your upcoming booking${count === 1 ? ' is' : 's are'} affected; ${count === 1 ? 'it has' : 'they have'} not been cancelled.`,
        link: { to: `/equipment/${n.payload.equipment_id}`, label: 'View instrument' },
      };
    }
    case 'certification_signed_off':
      return {
        title: `You are certified for ${n.payload.equipment_name}`,
        detail: n.payload.expires_at ? `Valid until ${formatDate(n.payload.expires_at)}.` : 'This certification does not expire.',
        link: { to: `/training/${n.payload.equipment_id}`, label: 'View certification' },
      };
    case 'certification_rejected':
      return {
        title: `Your practical assessment for ${n.payload.equipment_name} was not approved`,
        detail: `Reviewer's note: ${n.payload.reason}`,
        link: { to: `/training/${n.payload.equipment_id}`, label: 'Request a new assessment' },
      };
    case 'booking_cancelled_by_staff':
      return {
        title: `Your ${n.payload.equipment_name} booking on ${formatDateTime(n.payload.start_time)} was cancelled`,
        detail: `Reason: ${n.payload.reason}. ${formatMoney(n.payload.refunded)} was refunded to your funding.`,
        link: { to: `/bookings/${n.payload.booking_id}`, label: 'View booking' },
      };
    case 'allocation_low_balance':
      return {
        title: `Funding for ${n.payload.group_name} is running low`,
        detail: `Grant ${n.payload.grant_code}: ${formatMoney(n.payload.remaining_balance)} of ${formatMoney(n.payload.allocated_amount)} remaining. Ask your group leader before booking more.`,
      };
    case 'grant_allocation_changed':
      return n.payload.is_active
        ? {
          title: `Funding for ${n.payload.group_name} was updated`,
          detail: `Grant ${n.payload.grant_code}: ${formatMoney(n.payload.allocated_amount)} allocated, ${formatMoney(n.payload.remaining_balance)} remaining.`,
        }
        : {
          title: `Funding for ${n.payload.group_name} from grant ${n.payload.grant_code} was deactivated`,
          detail: 'It can no longer be used for new bookings. Ask your group leader or a facility administrator about other funding.',
        };
  }
}

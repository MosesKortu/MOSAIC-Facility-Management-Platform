import type { Notification } from '@mosaic/contracts';
import { describe, expect, it } from 'vitest';
import { describeNotification } from './messages.ts';

const eid = '66666666-6666-4666-8666-666666666666';
const base = { notification_id: 'n1', read_at: null, created_at: '2026-09-28T10:00:00Z' };
const equipment = { equipment_id: eid, equipment_code: 'EBL', equipment_name: 'EBL CRESTEC' };

describe('describeNotification', () => {
  it('explains a status change, its reason and the affected bookings', () => {
    const n: Notification = { ...base, type: 'equipment_status_changed', payload: {
      ...equipment, previous_status: 'operational', new_status: 'maintenance', reason: 'Pump service', booking_ids: ['b1', 'b2'],
    } };
    expect(describeNotification(n)).toEqual({
      title: 'EBL CRESTEC is now under maintenance',
      detail: 'Reason: Pump service. 2 of your upcoming bookings are affected; they have not been cancelled.',
      link: { to: `/equipment/${eid}`, label: 'View instrument' },
    });
  });

  it('describes certification decisions with expiry or the reviewer note', () => {
    expect(describeNotification({ ...base, type: 'certification_signed_off', payload: { ...equipment, expires_at: '2028-09-28T10:00:00Z' } }))
      .toEqual({ title: 'You are certified for EBL CRESTEC', detail: 'Valid until 28 Sept 2028.', link: { to: `/training/${eid}`, label: 'View certification' } });
    expect(describeNotification({ ...base, type: 'certification_signed_off', payload: { ...equipment, expires_at: null } }).detail)
      .toBe('This certification does not expire.');
    expect(describeNotification({ ...base, type: 'certification_rejected', payload: { ...equipment, reason: 'Needs another run' } })).toEqual({
      title: 'Your practical assessment for EBL CRESTEC was not approved',
      detail: "Reviewer's note: Needs another run",
      link: { to: `/training/${eid}`, label: 'Request a new assessment' },
    });
  });

  it('summarises funding changes in euros', () => {
    const payload = { grant_code: 'ES-042', group_name: 'Nano Group', allocated_amount: '10000.00', remaining_balance: '7250.50', is_active: true };
    expect(describeNotification({ ...base, type: 'grant_allocation_changed', payload })).toEqual({
      title: 'Funding for Nano Group was updated',
      detail: 'Grant ES-042: €10,000.00 allocated, €7,250.50 remaining.',
    });
    expect(describeNotification({ ...base, type: 'grant_allocation_changed', payload: { ...payload, is_active: false } }).title)
      .toBe('Funding for Nano Group from grant ES-042 was deactivated');
  });

  it('explains a staff cancellation with the refund, and a low allocation', () => {
    expect(describeNotification({ ...base, type: 'booking_cancelled_by_staff', payload: {
      booking_id: 'b1', equipment_id: eid, equipment_name: 'EBL CRESTEC', start_time: '2026-10-15T07:00:00Z', reason: 'Chamber vented', refunded: '420.00',
    } })).toEqual({
      title: 'Your EBL CRESTEC booking on 15 Oct 2026, 09:00 was cancelled',
      detail: 'Reason: Chamber vented. €420.00 was refunded to your funding.',
      link: { to: '/bookings/b1', label: 'View booking' },
    });
    expect(describeNotification({ ...base, type: 'allocation_low_balance', payload: {
      grant_code: 'ES-042', group_name: 'Nano Group', allocated_amount: '1000.00', remaining_balance: '50.00',
    } })).toEqual({
      title: 'Funding for Nano Group is running low',
      detail: 'Grant ES-042: €50.00 of €1,000.00 remaining. Ask your group leader before booking more.',
    });
  });
});

import { SESSION_EARLY_START_MINUTES, type BookingDetail } from '@mosaic/contracts';
import { useState, type ReactNode } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { Alert } from '../../components/ui/alert.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { Dialog } from '../../components/ui/dialog.tsx';
import { TextAreaField } from '../../components/ui/field.tsx';
import { ErrorState, NotFound, PageLoading } from '../../components/ui/states.tsx';
import { ApiError } from '../../lib/api.ts';
import { formatDateTime, formatMoney, formatTime } from '../../lib/format.ts';
import { useSession } from '../auth/api.ts';
import { SUPPORT_TIER_LABEL } from '../equipment/labels.ts';
import { useBooking, useCancelBooking } from './api.ts';
import { BOOKING_STATUS, cancelProblem } from './messages.ts';
import { formatDuration } from './slots.ts';

/** /bookings/:bookingId — one booking: when, cost, funding, and cancellation before it starts. */
export function BookingDetailPage() {
  const bookingId = useParams().bookingId!;
  const booking = useBooking(bookingId);
  if (booking.isPending) return <PageLoading label="Loading the booking" />;
  if (booking.isError) {
    if (booking.error instanceof ApiError && booking.error.code === 'NOT_FOUND') return <NotFound what="booking" />;
    return <ErrorState error={booking.error} onRetry={() => void booking.refetch()} />;
  }
  return <BookingView booking={booking.data} />;
}

function BookingView({ booking }: { booking: BookingDetail }) {
  const { data: user } = useSession();
  const created = (useLocation().state as { created?: boolean } | null)?.created === true;
  const [cancelling, setCancelling] = useState(false);
  const minutes = (Date.parse(booking.end_time) - Date.parse(booking.start_time)) / 60_000;
  const opensAt = new Date(Date.parse(booking.start_time) - SESSION_EARLY_START_MINUTES * 60_000).toISOString();
  const isOwner = user?.user_id === booking.user.user_id;
  const row = (label: string, value: ReactNode) => (
    <div className="flex flex-col gap-0.5 py-2 sm:flex-row sm:justify-between sm:gap-4"><dt className="text-ink-muted">{label}</dt><dd className="sm:text-right">{value}</dd></div>
  );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      {isOwner
        ? <Link to="/bookings" className="text-body-sm font-semibold text-pix-blue hover:underline">← My bookings</Link>
        : <Link to="/operations/bookings" className="text-body-sm font-semibold text-pix-blue hover:underline">← All bookings</Link>}
      {created && booking.status === 'confirmed' && (
        <Alert tone="success" title="Booking confirmed">{`${formatMoney(booking.total_cost)} has been charged to ${booking.grant_code}.`}</Alert>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="eyebrow font-mono normal-case">{booking.equipment.code}</span>
          <h1 className="font-title text-title-lg text-ink">{booking.equipment.name}</h1>
        </div>
        <Badge tone={BOOKING_STATUS[booking.status].tone}>{BOOKING_STATUS[booking.status].label}</Badge>
      </div>

      {booking.status === 'confirmed' && (
        <Alert tone="info" title={`You can start your session from ${formatTime(opensAt)}`}>
          That is {SESSION_EARLY_START_MINUTES} minutes before the slot starts.
        </Alert>
      )}
      {booking.status === 'cancelled' && booking.cancelled_at && (
        <Alert tone="info" title={`Cancelled on ${formatDateTime(booking.cancelled_at)}`}>
          {booking.cancellation_reason ? <>Reason: {booking.cancellation_reason}. </> : null}{formatMoney(booking.total_cost)} was refunded to {booking.grant_code}.
        </Alert>
      )}

      <Card>
        <dl className="divide-y divide-line text-body">
          {row('When', <><span className="font-mono">{formatDateTime(booking.start_time)}–{formatTime(booking.end_time)}</span> · {formatDuration(minutes)}</>)}
          {row('Support', SUPPORT_TIER_LABEL[booking.support_requested])}
          {row('Funding', <>{booking.grant_code} · {booking.group.name}</>)}
          {!isOwner && row('Booked for', booking.user.full_name)}
          {booking.booked_by.user_id !== booking.user.user_id && row('Booked by', booking.booked_by.full_name)}
          {booking.force_override && row('Status override', 'Booked by staff while the instrument was not operational')}
        </dl>
      </Card>
      <Card>
        <dl className="divide-y divide-line text-body [&_dd]:font-mono">
          {row('Instrument time', formatMoney(booking.calculated_base_cost))}
          {row('Support', formatMoney(booking.calculated_support_cost))}
          {row('Total', <span className="font-semibold">{formatMoney(booking.total_cost)}</span>)}
        </dl>
      </Card>

      {booking.cancellable && (
        <div><Button variant="secondary" onClick={() => setCancelling(true)}>Cancel booking</Button></div>
      )}
      {cancelling && <CancelDialog booking={booking} requireReason={!isOwner} onClose={() => setCancelling(false)} />}
    </div>
  );
}

function CancelDialog({ booking, requireReason, onClose }: { booking: BookingDetail; requireReason: boolean; onClose: () => void }) {
  const cancel = useCancelBooking(booking.booking_id);
  const [reason, setReason] = useState('');
  const [attempted, setAttempted] = useState(false);
  const missing = requireReason && reason.trim() === '';

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Cancel this booking?"
      footer={<>
        <Button variant="ghost" onClick={onClose} disabled={cancel.isPending}>Keep booking</Button>
        <Button variant="danger" loading={cancel.isPending} onClick={() => {
          setAttempted(true);
          if (!missing) cancel.mutate(reason.trim() ? { reason: reason.trim() } : {}, { onSuccess: onClose });
        }}>Cancel booking</Button>
      </>}>
      <div className="flex flex-col gap-4 text-body">
        <p>{booking.equipment.name}, <span className="font-mono">{formatDateTime(booking.start_time)}–{formatTime(booking.end_time)}</span>. {formatMoney(booking.total_cost)} is refunded to {booking.grant_code} and the slot becomes free for others.</p>
        {requireReason && (
          <TextAreaField label="Reason" value={reason} onChange={(e) => setReason(e.target.value)}
            error={attempted && missing ? `Give a reason — ${booking.user.full_name} is notified with it.` : undefined} />
        )}
        {cancel.error && <Alert tone="danger" title="The booking was not cancelled">{cancelProblem(cancel.error)}</Alert>}
      </div>
    </Dialog>
  );
}

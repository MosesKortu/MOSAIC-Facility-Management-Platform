import type { BookingSummary } from '@mosaic/contracts';
import { Link } from 'react-router';
import { Badge } from '../../components/ui/badge.tsx';
import { Table, Td, Th } from '../../components/ui/table.tsx';
import { formatDateTime, formatMoney, formatTime } from '../../lib/format.ts';
import { BOOKING_STATUS } from './messages.ts';

/** Booking rows for My bookings and the staff all-bookings view (which also shows who each is for). */
export function BookingsTable({ bookings, showUser = false }: { bookings: BookingSummary[]; showUser?: boolean }) {
  return (
    <Table caption="Bookings">
      <thead><tr><Th>When</Th><Th>Instrument</Th>{showUser && <Th>For</Th>}<Th>Status</Th><Th>Funding</Th><Th className="text-right">Cost</Th></tr></thead>
      <tbody>
        {bookings.map((b) => (
          <tr key={b.booking_id}>
            <Td className="font-mono whitespace-nowrap">{formatDateTime(b.start_time)}–{formatTime(b.end_time)}</Td>
            <Td><Link to={`/bookings/${b.booking_id}`} className="font-semibold text-pix-blue hover:underline">{b.equipment.name}</Link>
              <span className="block font-mono text-caption text-ink-muted">{b.equipment.code}</span></Td>
            {showUser && <Td>{b.user.full_name}<span className="block text-caption text-ink-muted">{b.user.email}</span></Td>}
            <Td><Badge tone={BOOKING_STATUS[b.status].tone}>{BOOKING_STATUS[b.status].label}</Badge>
              {b.force_override && <span className="mt-1 block text-caption text-ink-muted">Status override</span>}</Td>
            <Td>{b.grant_code}<span className="block text-caption text-ink-muted">{b.group.name}</span></Td>
            <Td className="text-right font-mono">{formatMoney(b.total_cost)}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

/** "Now" fixed per visit, to the minute, so upcoming/past query keys stay stable across renders. */
export function visitNow(): string {
  return new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString();
}

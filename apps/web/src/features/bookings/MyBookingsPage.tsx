import { useState } from 'react';
import { Link } from 'react-router';
import { FilterChips } from '../../components/ui/filter-chips.tsx';
import { PageHeader } from '../../components/ui/page-header.tsx';
import { Pagination } from '../../components/ui/pagination.tsx';
import { EmptyState, ErrorState } from '../../components/ui/states.tsx';
import { TableSkeleton } from '../../components/ui/table-skeleton.tsx';
import { useUrlFilters } from '../../lib/use-url-filters.ts';
import { useBookings } from './api.ts';
import { BookingsTable, visitNow } from './BookingsTable.tsx';

const LIMIT = 20;
const VIEWS = [{ value: null, label: 'Upcoming' }, { value: 'past', label: 'Past' }] as const;

/** /bookings — the caller's upcoming confirmed bookings, or everything in the past (newest first). */
export function MyBookingsPage() {
  const { params, update, offset } = useUrlFilters();
  const past = params.get('when') === 'past';
  const [now] = useState(visitNow);
  const bookings = useBookings(past
    ? { to: now, order: 'desc', limit: LIMIT, offset }
    : { from: now, status: 'confirmed', order: 'asc', limit: LIMIT, offset });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="My bookings" description="Your reservations, their cost and the funding they are charged to. Times are facility time (Barcelona)."
        actions={<Link to="/equipment" className="inline-flex h-10 items-center rounded-lg bg-pix-blue px-4 font-semibold text-white hover:bg-pix-blue-75">Book an instrument</Link>} />
      <FilterChips label="Show" options={VIEWS} value={past ? 'past' : null} onChange={(value) => update({ when: value })} />
      {bookings.isPending ? <TableSkeleton label="bookings" />
        : bookings.isError ? <ErrorState error={bookings.error} onRetry={() => void bookings.refetch()} />
        : bookings.data.items.length === 0 ? (
          past ? <EmptyState title="No past bookings" />
            : <EmptyState title="No upcoming bookings" action={<Link to="/equipment" className="font-semibold text-pix-blue hover:underline">Find an instrument to book</Link>}>
                Instruments you are certified for can be booked from their page.
              </EmptyState>
        ) : (
          <>
            <BookingsTable bookings={bookings.data.items} />
            <Pagination total={bookings.data.total} limit={LIMIT} offset={offset} onOffsetChange={(o) => update({ offset: String(o) })} />
          </>
        )}
    </div>
  );
}

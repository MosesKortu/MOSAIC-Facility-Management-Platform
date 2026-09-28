import { useState } from 'react';
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

/** /operations/bookings — every researcher's bookings (super users and admins). */
export function AllBookingsPage() {
  const { params, update, offset } = useUrlFilters();
  const past = params.get('when') === 'past';
  const [now] = useState(visitNow);
  const bookings = useBookings(past
    ? { scope: 'all', to: now, order: 'desc', limit: LIMIT, offset }
    : { scope: 'all', from: now, status: 'confirmed', order: 'asc', limit: LIMIT, offset });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="All bookings" description="Every booking across the facilities. Open one to see its details or cancel it with a reason; the researcher is notified." />
      <FilterChips label="Show" options={VIEWS} value={past ? 'past' : null} onChange={(value) => update({ when: value })} />
      {bookings.isPending ? <TableSkeleton label="bookings" />
        : bookings.isError ? <ErrorState error={bookings.error} onRetry={() => void bookings.refetch()} />
        : bookings.data.items.length === 0 ? <EmptyState title={past ? 'No past bookings' : 'No upcoming bookings'} />
        : (
          <>
            <BookingsTable bookings={bookings.data.items} showUser />
            <Pagination total={bookings.data.total} limit={LIMIT} offset={offset} onOffsetChange={(o) => update({ offset: String(o) })} />
          </>
        )}
    </div>
  );
}

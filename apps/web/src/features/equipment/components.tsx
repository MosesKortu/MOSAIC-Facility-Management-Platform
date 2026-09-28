import type { AccessState, AvailabilityWindow, EquipmentStatus } from '@mosaic/contracts';
import { Badge } from '../../components/ui/badge.tsx';
import { Skeleton } from '../../components/ui/skeleton.tsx';
import { Table, Td, Th } from '../../components/ui/table.tsx';
import { formatDateTime } from '../../lib/format.ts';
import { useStatusEvents } from './api.ts';
import { ACCESS, EQUIPMENT_STATUS, WEEKDAYS } from './labels.ts';

export function EquipmentStatusBadge({ status }: { status: EquipmentStatus }) {
  const { label, tone } = EQUIPMENT_STATUS[status];
  return <Badge tone={tone}>{label}</Badge>;
}

export function AccessBadge({ access }: { access: AccessState }) {
  const { label, tone } = ACCESS[access];
  return <Badge tone={tone}>{label}</Badge>;
}

/** Weekly bookable hours, one row per weekday (facility-local time). */
export function WeeklyWindows({ windows }: { windows: AvailabilityWindow[] }) {
  return (
    <Table caption="Weekly availability (facility local time)">
      <thead><tr><Th>Day</Th><Th>Bookable hours</Th></tr></thead>
      <tbody>
        {WEEKDAYS.map((day, index) => {
          const today = windows.filter((w) => w.weekday === index + 1);
          return (
            <tr key={day}>
              <Td className="font-semibold">{day}</Td>
              <Td className={today.length ? 'font-mono' : 'text-ink-muted'}>
                {today.length ? today.map((w) => `${w.opens_at}–${w.closes_at}`).join(', ') : 'Closed'}
              </Td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}

/** Maintenance / offline history from equipment_status_events, newest first. */
export function StatusHistory({ equipmentId }: { equipmentId: string }) {
  const events = useStatusEvents(equipmentId);
  if (events.isPending) return <div aria-busy="true" className="flex flex-col gap-2"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>;
  if (events.isError) return <p className="text-body-sm text-danger">The status history could not be loaded. {events.error.message}</p>;
  if (events.data.length === 0) return <p className="text-body-sm text-ink-muted">No status changes recorded. This instrument has been operational since it was added.</p>;
  return (
    <ol className="flex flex-col divide-y divide-line">
      {events.data.map((event) => (
        <li key={event.event_id} className="flex flex-col gap-1 py-3">
          <span className="flex flex-wrap items-center gap-2 text-body">
            <EquipmentStatusBadge status={event.previous_status} /> <span aria-hidden>→</span> <span className="sr-only">changed to</span>
            <EquipmentStatusBadge status={event.new_status} />
          </span>
          <span className="text-body text-ink">{event.reason}</span>
          <span className="text-caption text-ink-muted">
            {event.changed_by.full_name} · <time dateTime={event.changed_at} className="font-mono">{formatDateTime(event.changed_at)}</time>
          </span>
        </li>
      ))}
    </ol>
  );
}

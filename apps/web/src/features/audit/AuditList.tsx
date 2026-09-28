import { Skeleton } from '../../components/ui/skeleton.tsx';
import { formatDateTime } from '../../lib/format.ts';
import { useAdminAudit } from './api.ts';
import { describeAudit } from './describe.ts';

/**
 * Recent audit events for one record (the "Activity" panel of detail pages), optionally merged with
 * the history of related records (e.g. a grant's allocations).
 */
export function AuditList({ entityId, relatedIds = [], limit = 10 }: { entityId: string; relatedIds?: string[]; limit?: number }) {
  const audit = useAdminAudit(relatedIds.length === 0
    ? { entity_id: entityId, limit, offset: 0 }
    : { entity_ids: [entityId, ...relatedIds].join(','), limit, offset: 0 });
  if (audit.isPending) {
    return <div aria-busy="true" className="flex flex-col gap-2"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>;
  }
  if (audit.isError) return <p className="text-body-sm text-danger">Activity could not be loaded. {audit.error.message}</p>;
  if (audit.data.items.length === 0) return <p className="text-body-sm text-ink-muted">No recorded changes yet.</p>;
  return (
    <ol className="flex flex-col divide-y divide-line">
      {audit.data.items.map((entry) => (
        <li key={entry.log_id} className="flex flex-col gap-0.5 py-2.5">
          <span className="text-body text-ink">{describeAudit(entry)}</span>
          <span className="text-caption text-ink-muted">
            {entry.actor.full_name} · <time dateTime={entry.created_at} className="font-mono">{formatDateTime(entry.created_at)}</time>
          </span>
        </li>
      ))}
    </ol>
  );
}

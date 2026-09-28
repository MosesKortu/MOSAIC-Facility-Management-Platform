import { PageHeader } from '../../components/ui/page-header.tsx';
import { Pagination } from '../../components/ui/pagination.tsx';
import { SelectField } from '../../components/ui/select-field.tsx';
import { EmptyState, ErrorState } from '../../components/ui/states.tsx';
import { Table, Td, Th } from '../../components/ui/table.tsx';
import { TableSkeleton } from '../../components/ui/table-skeleton.tsx';
import { formatDateTime } from '../../lib/format.ts';
import { useUrlFilters } from '../../lib/use-url-filters.ts';
import { useAdminAudit } from './api.ts';
import { describeAudit } from './describe.ts';

const LIMIT = 50;
const ENTITY_TYPES = [
  { value: 'user', label: 'People' }, { value: 'group', label: 'Groups' },
  { value: 'grant', label: 'Grants' }, { value: 'allocation', label: 'Allocations' },
  { value: 'equipment', label: 'Equipment' }, { value: 'tariff', label: 'Tariffs' },
] as const;

/** /admin/audit — administrative audit trail, newest first. */
export function AuditPage() {
  const { params, update, offset } = useUrlFilters();
  const entityType = params.get('entity_type') ?? '';
  const audit = useAdminAudit({ entity_type: entityType || undefined, limit: LIMIT, offset });


  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Administrative audit" description="Every administrative change: who made it, when, and what changed. Records cannot be edited." />
      <div className="w-52">
        <SelectField label="Record type" hideLabel value={entityType} onChange={(e) => update({ entity_type: e.target.value || null })}>
          <option value="">All record types</option>
          {ENTITY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </SelectField>
      </div>
      {audit.isPending ? <TableSkeleton label="audit events" />
        : audit.isError ? <ErrorState error={audit.error} onRetry={() => void audit.refetch()} />
        : audit.data.items.length === 0 ? <EmptyState title="No audit events recorded yet." />
        : (
          <>
            <Table caption="Audit events">
              <thead><tr><Th>When</Th><Th>Who</Th><Th>What</Th><Th>Record</Th></tr></thead>
              <tbody>
                {audit.data.items.map((entry) => (
                  <tr key={entry.log_id}>
                    <Td className="font-mono whitespace-nowrap"><time dateTime={entry.created_at}>{formatDateTime(entry.created_at)}</time></Td>
                    <Td>{entry.actor.full_name}<span className="block text-caption text-ink-muted">{entry.actor.email}</span></Td>
                    <Td>{describeAudit(entry)}<span className="block font-mono text-caption text-ink-muted">{entry.action}</span></Td>
                    <Td className="font-mono text-caption">{entry.entity_type} · {entry.entity_id.slice(0, 8)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination total={audit.data.total} limit={LIMIT} offset={offset} onOffsetChange={(o) => update({ offset: String(o) })} />
          </>
        )}
    </div>
  );
}

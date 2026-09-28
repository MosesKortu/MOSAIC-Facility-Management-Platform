import { decimalToCents } from '@mosaic/contracts';
import { Link } from 'react-router';
import { Badge } from '../../components/ui/badge.tsx';
import { PageHeader } from '../../components/ui/page-header.tsx';
import { Pagination } from '../../components/ui/pagination.tsx';
import { Progress } from '../../components/ui/progress.tsx';
import { EmptyState, ErrorState } from '../../components/ui/states.tsx';
import { Table, Td, Th } from '../../components/ui/table.tsx';
import { TableSkeleton } from '../../components/ui/table-skeleton.tsx';
import { formatDate, formatMoney } from '../../lib/format.ts';
import { useUrlFilters } from '../../lib/use-url-filters.ts';
import { useAllocations } from './api.ts';
import { GrantsTabs } from './GrantsTabs.tsx';

const LIMIT = 50;

/** Share of an allocation already spent, with the tone warning as it runs out. */
export function spendProgress(allocated: string, consumed: string) {
  const total = decimalToCents(allocated);
  const ratio = total === 0 ? 0 : decimalToCents(consumed) / total;
  return {
    ratio,
    tone: ratio >= 0.9 ? 'danger' : ratio >= 0.75 ? 'warning' : 'primary',
    label: `${formatMoney(consumed)} of ${formatMoney(allocated)} spent (${Math.round(ratio * 100)}%)`,
  } as const;
}

/** /admin/grant-allocations — all allocations; ?view=spending ranks them by consumption. */
export function AllocationsPage() {
  const { params, update, offset } = useUrlFilters();
  const spending = params.get('view') === 'spending';
  const allocations = useAllocations({ limit: LIMIT, offset, ...(spending && { sort: 'consumed', order: 'desc' }) });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Grants & funding" description={spending
        ? 'Where allocated funding is being spent, highest consumption first.'
        : 'Every grant allocation to a research group.'} />
      <GrantsTabs />
      {allocations.isPending ? <TableSkeleton label="allocations" />
        : allocations.isError ? <ErrorState error={allocations.error} onRetry={() => void allocations.refetch()} />
        : allocations.data.items.length === 0 ? (
          <EmptyState title="No grant allocations yet.">Open a grant and allocate part of its budget to a group.</EmptyState>
        ) : (
          <>
            <Table caption={spending ? 'Spending by allocation' : 'Group allocations'}>
              <thead><tr>
                <Th>Grant</Th><Th>Group</Th><Th className="text-right">Allocated</Th>
                {spending ? <Th className="min-w-56">Spent</Th> : <Th className="text-right">Remaining</Th>}
                <Th>Expires</Th><Th>Status</Th>
              </tr></thead>
              <tbody>
                {allocations.data.items.map((a) => {
                  const progress = spendProgress(a.allocated_amount, a.consumed);
                  return (
                    <tr key={a.allocation_id} className="hover:bg-canvas">
                      <Td><Link to={`/admin/grants/${a.grant_id}`} className="font-mono font-semibold text-pix-blue hover:underline">{a.grant_code}</Link></Td>
                      <Td><Link to={`/admin/groups/${a.group.group_id}`} className="hover:underline">{a.group.name}</Link></Td>
                      <Td className="text-right font-mono">{formatMoney(a.allocated_amount)}</Td>
                      {spending
                        ? <Td><Progress value={progress.ratio} tone={progress.tone} label={progress.label} /></Td>
                        : <Td className="text-right font-mono">{formatMoney(a.remaining_balance)}</Td>}
                      <Td className="font-mono">{formatDate(a.expiration_date)}</Td>
                      <Td><Badge tone={a.is_active && a.group.is_active ? 'success' : 'neutral'}>{a.is_active ? (a.group.is_active ? 'Active' : 'Group inactive') : 'Inactive'}</Badge></Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            <Pagination total={allocations.data.total} limit={LIMIT} offset={offset} onOffsetChange={(o) => update({ offset: String(o) })} />
          </>
        )}
    </div>
  );
}

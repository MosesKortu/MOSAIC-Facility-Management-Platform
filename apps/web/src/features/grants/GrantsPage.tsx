import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Badge } from '../../components/ui/badge.tsx';
import { Button } from '../../components/ui/button.tsx';
import { PageHeader } from '../../components/ui/page-header.tsx';
import { Pagination } from '../../components/ui/pagination.tsx';
import { SearchInput } from '../../components/ui/search-input.tsx';
import { SelectField } from '../../components/ui/select-field.tsx';
import { EmptyState, ErrorState } from '../../components/ui/states.tsx';
import { Table, Td, Th } from '../../components/ui/table.tsx';
import { TableSkeleton } from '../../components/ui/table-skeleton.tsx';
import { formatDate, formatMoney } from '../../lib/format.ts';
import { useUrlFilters } from '../../lib/use-url-filters.ts';
import { useGrants } from './api.ts';
import { GrantFormDialog } from './GrantFormDialog.tsx';
import { GrantsTabs } from './GrantsTabs.tsx';

const LIMIT = 50;

export function GrantsPage() {
  const { params, update, offset } = useUrlFilters();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const q = params.get('q') ?? '';
  const status = params.get('status');
  const grants = useGrants({
    q: q || undefined, limit: LIMIT, offset,
    expired: status === 'expired' ? 'true' : status === 'current' ? 'false' : undefined,
  });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Grants & funding" description="Grant budgets and how they are allocated to research groups."
        actions={<Button onClick={() => setCreating(true)}><Plus aria-hidden className="h-4 w-4" /> Create grant</Button>} />
      <GrantsTabs />
      <div className="flex flex-wrap items-end gap-3">
        <SearchInput label="Search grants" value={q} onChange={(v) => update({ q: v || null })} placeholder="Search by grant code" />
        <div className="w-44">
          <SelectField label="Expiry" hideLabel value={status ?? ''} onChange={(e) => update({ status: e.target.value || null })}>
            <option value="">Any expiry</option>
            <option value="current">Current</option>
            <option value="expired">Expired</option>
          </SelectField>
        </div>
      </div>

      {grants.isPending ? <TableSkeleton label="grants" />
        : grants.isError ? <ErrorState error={grants.error} onRetry={() => void grants.refetch()} />
        : grants.data.items.length === 0 ? (
          q || status ? <EmptyState title="No grants match these filters." />
            : <EmptyState title="No grants have been created yet." action={<Button onClick={() => setCreating(true)}>Create grant</Button>}>
                A grant holds a funding budget that you allocate to research groups.
              </EmptyState>
        ) : (
          <>
            <Table caption="Grants">
              <thead><tr>
                <Th>Grant</Th><Th>PI</Th><Th className="text-right">Budget</Th><Th className="text-right">Unallocated</Th>
                <Th className="text-right">Remaining</Th><Th>Expires</Th>
              </tr></thead>
              <tbody>
                {grants.data.items.map((g) => (
                  <tr key={g.grant_id} className="hover:bg-canvas">
                    <Td><Link to={`/admin/grants/${g.grant_id}`} className="font-mono font-semibold text-pix-blue hover:underline">{g.grant_code}</Link></Td>
                    <Td>{g.pi.full_name}</Td>
                    <Td className="text-right font-mono">{formatMoney(g.allocated_budget)}</Td>
                    <Td className="text-right font-mono">{formatMoney(g.unallocated)}</Td>
                    <Td className="text-right font-mono">{formatMoney(g.remaining_balance)}</Td>
                    <Td>
                      <span className="flex items-center gap-2">
                        <span className="font-mono">{formatDate(g.expiration_date)}</span>
                        {g.is_expired && <Badge tone="danger">Expired</Badge>}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination total={grants.data.total} limit={LIMIT} offset={offset} onOffsetChange={(o) => update({ offset: String(o) })} />
          </>
        )}

      <GrantFormDialog open={creating} onOpenChange={setCreating} onSaved={(g) => void navigate(`/admin/grants/${g.grant_id}`)} />
    </div>
  );
}

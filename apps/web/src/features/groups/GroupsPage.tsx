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
import { formatMoney } from '../../lib/format.ts';
import { useUrlFilters } from '../../lib/use-url-filters.ts';
import { activeBadge } from '../people/labels.ts';
import { PeopleTabs } from '../people/PeopleTabs.tsx';
import { useGroups } from './api.ts';
import { GroupFormDialog } from './GroupFormDialog.tsx';

const LIMIT = 50;

export function GroupsPage() {
  const { params, update, offset } = useUrlFilters();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const q = params.get('q') ?? '';
  const status = params.get('status');
  const groups = useGroups({
    q: q || undefined, limit: LIMIT, offset,
    is_active: status === 'active' ? 'true' : status === 'inactive' ? 'false' : undefined,
  });


  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Groups" description="Research groups: their members and the grant funding allocated to them."
        actions={<Button onClick={() => setCreating(true)}><Plus aria-hidden className="h-4 w-4" /> Create group</Button>} />
      <PeopleTabs />
      <div className="flex flex-wrap items-end gap-3">
        <SearchInput label="Search groups" value={q} onChange={(value) => update({ q: value || null })} placeholder="Search by name" />
        <div className="w-40">
          <SelectField label="Status" hideLabel value={status ?? ''} onChange={(e) => update({ status: e.target.value || null })}>
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </SelectField>
        </div>
      </div>

      {groups.isPending ? <TableSkeleton label="groups" />
        : groups.isError ? <ErrorState error={groups.error} onRetry={() => void groups.refetch()} />
        : groups.data.items.length === 0 ? (
          q || status
            ? <EmptyState title="No groups match these filters." />
            : <EmptyState title="No groups have been created yet.">Groups receive grant allocations that their members can book against.</EmptyState>
        ) : (
          <>
            <Table caption="Groups">
              <thead>
                <tr><Th>Group</Th><Th>Members</Th><Th className="text-right">Allocated</Th><Th className="text-right">Consumed</Th><Th className="text-right">Remaining</Th><Th>Status</Th></tr>
              </thead>
              <tbody>
                {groups.data.items.map((g) => {
                  const active = activeBadge(g.is_active);
                  return (
                    <tr key={g.group_id} className="hover:bg-canvas">
                      <Td><Link to={`/admin/groups/${g.group_id}`} className="font-semibold text-pix-blue hover:underline">{g.name}</Link></Td>
                      <Td>{g.internal_members} internal · {g.external_members} external</Td>
                      <Td className="text-right font-mono">{formatMoney(g.funding.allocated)}</Td>
                      <Td className="text-right font-mono">{formatMoney(g.funding.consumed)}</Td>
                      <Td className="text-right font-mono">{formatMoney(g.funding.remaining)}</Td>
                      <Td><Badge tone={active.tone}>{active.label}</Badge></Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            <Pagination total={groups.data.total} limit={LIMIT} offset={offset} onOffsetChange={(o) => update({ offset: String(o) })} />
          </>
        )}

      <GroupFormDialog open={creating} onOpenChange={setCreating} onSaved={(g) => void navigate(`/admin/groups/${g.group_id}`)} />
    </div>
  );
}

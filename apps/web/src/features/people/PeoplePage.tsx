import { ROLES, type Role } from '@mosaic/contracts';
import { UserPlus } from 'lucide-react';
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
import { useUrlFilters } from '../../lib/use-url-filters.ts';
import { ROLE_LABEL } from '../auth/roles.ts';
import { useUsers } from './api.ts';
import { CreateUserDialog } from './CreateUserDialog.tsx';
import { activeBadge } from './labels.ts';
import { PeopleTabs } from './PeopleTabs.tsx';

const LIMIT = 50;

/** /admin/people — filters live in the URL so every view is deep-linkable. */
export function PeoplePage() {
  const { params, update, offset } = useUrlFilters();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  const type = params.get('type') === 'external' ? 'external' : 'internal';
  const q = params.get('q') ?? '';
  const role = ROLES.includes(params.get('role') as Role) ? (params.get('role') as Role) : undefined;
  const status = params.get('status');

  const users = useUsers({
    user_type: type, q: q || undefined, role,
    is_active: status === 'active' ? 'true' : status === 'inactive' ? 'false' : undefined,
    limit: LIMIT, offset,
  });


  const filtered = Boolean(q || role || status);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="People" description="Internal users and external collaborators, their roles, groups and access."
        actions={<Button onClick={() => setCreating(true)}><UserPlus aria-hidden className="h-4 w-4" /> Add person</Button>} />
      <PeopleTabs />

      <div className="flex flex-wrap items-end gap-3">
        <SearchInput label="Search people" value={q} onChange={(value) => update({ q: value || null })} placeholder="Search by name or email" />
        {type === 'internal' && (
          <div className="w-44">
            <SelectField label="Role" hideLabel value={role ?? ''} onChange={(e) => update({ role: e.target.value || null })}>
              <option value="">All roles</option>
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </SelectField>
          </div>
        )}
        <div className="w-40">
          <SelectField label="Status" hideLabel value={status ?? ''} onChange={(e) => update({ status: e.target.value || null })}>
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </SelectField>
        </div>
      </div>

      {users.isPending ? (
        <TableSkeleton label="people" />
      ) : users.isError ? (
        <ErrorState error={users.error} onRetry={() => void users.refetch()} />
      ) : users.data.items.length === 0 ? (
        filtered ? (
          <EmptyState title="No people match these filters.">Try a different search, or clear the filters.</EmptyState>
        ) : (
          <EmptyState title={type === 'external' ? 'No external collaborators have been added yet.' : 'No internal users have been added yet.'}
            action={<Button onClick={() => setCreating(true)}>Add person</Button>} />
        )
      ) : (
        <>
          <Table caption={`${type === 'external' ? 'External collaborators' : 'Internal users'}`}>
            <thead>
              <tr><Th>Person</Th><Th>Role</Th><Th>Groups</Th><Th>Status</Th><Th><span className="sr-only">Actions</span></Th></tr>
            </thead>
            <tbody>
              {users.data.items.map((user) => {
                const active = activeBadge(user.is_active);
                return (
                  <tr key={user.user_id} className="hover:bg-canvas">
                    <Td>
                      <div className="flex flex-col">
                        <span className="font-semibold text-ink">{user.full_name}</span>
                        <span className="text-caption text-ink-muted">{user.email}</span>
                      </div>
                    </Td>
                    <Td><Badge tone={user.role === 'standard_user' ? 'neutral' : 'info'}>{ROLE_LABEL[user.role]}</Badge></Td>
                    <Td>
                      {user.groups.length === 0
                        ? <span className="text-ink-muted">No group</span>
                        : user.groups.map((g) => g.name).join(', ')}
                    </Td>
                    <Td><Badge tone={active.tone}>{active.label}</Badge></Td>
                    <Td className="text-right">
                      <Link to={`/admin/people/${user.user_id}`} aria-label={`Manage ${user.full_name}`} className="font-semibold text-pix-blue hover:underline">
                        Manage →
                      </Link>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <Pagination total={users.data.total} limit={LIMIT} offset={offset} onOffsetChange={(o) => update({ offset: String(o) })} />
        </>
      )}

      <CreateUserDialog open={creating} onOpenChange={setCreating} defaultType={type}
        onCreated={(user) => void navigate(`/admin/people/${user.user_id}`)} />
    </div>
  );
}

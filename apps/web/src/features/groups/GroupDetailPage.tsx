import type { GroupDetail, GroupMember } from '@mosaic/contracts';
import { UserPlus } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { Alert } from '../../components/ui/alert.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { ConfirmDialog, Dialog } from '../../components/ui/dialog.tsx';
import { PageHeader } from '../../components/ui/page-header.tsx';
import { ErrorState, NotFound, PageLoading } from '../../components/ui/states.tsx';
import { Table, Td, Th } from '../../components/ui/table.tsx';
import { ApiError } from '../../lib/api.ts';
import { formatDate, formatMoney } from '../../lib/format.ts';
import { AuditList } from '../audit/AuditList.tsx';
import { ROLE_LABEL, USER_TYPE_LABEL } from '../auth/roles.ts';
import { activeBadge } from '../people/labels.ts';
import { UserPicker } from '../people/UserPicker.tsx';
import { useGroup, useMembership, useUpdateGroup } from './api.ts';
import { GroupFormDialog } from './GroupFormDialog.tsx';

export function GroupDetailPage() {
  const groupId = useParams().groupId!;
  const group = useGroup(groupId);
  if (group.isPending) return <PageLoading label="Loading group" />;
  if (group.isError) {
    if (group.error instanceof ApiError && group.error.code === 'NOT_FOUND') return <NotFound what="group" />;
    return <ErrorState error={group.error} onRetry={() => void group.refetch()} />;
  }
  return <GroupDetailView group={group.data} />;
}

function Stat({ label, value, context }: { label: string; value: ReactNode; context: string }) {
  return (
    <Card className="flex flex-col gap-1">
      <p className="eyebrow">{label}</p>
      <p className="font-title text-title-md text-ink">{value}</p>
      <p className="text-caption text-ink-muted">{context}</p>
    </Card>
  );
}

function GroupDetailView({ group }: { group: GroupDetail }) {
  const membership = useMembership();
  const update = useUpdateGroup(group.group_id);
  const [dialog, setDialog] = useState<null | 'edit' | 'add' | 'activation' | { remove: GroupMember }>(null);
  const [newMember, setNewMember] = useState<string | null>(null);
  const active = activeBadge(group.is_active);

  function close() {
    setDialog(null);
    setNewMember(null);
    membership.reset();
    update.reset();
  }
  const refusal = (error: Error | null) => error && <Alert tone="danger" title="The change was not saved">{error.message}</Alert>;
  const removing = typeof dialog === 'object' && dialog !== null ? dialog.remove : null;

  return (
    <div className="flex flex-col gap-5">
      <Link to="/admin/groups" className="text-body-sm font-semibold text-pix-blue hover:underline">← Groups</Link>
      <PageHeader title={group.name} description={group.description ?? undefined}
        eyebrow={<Badge tone={active.tone}>{active.label}</Badge>}
        actions={<>
          <Button variant="ghost" onClick={() => setDialog('edit')}>Edit</Button>
          <Button variant={group.is_active ? 'danger' : 'secondary'} onClick={() => setDialog('activation')}>
            {group.is_active ? 'Deactivate group' : 'Reactivate group'}
          </Button>
        </>} />

      {!group.is_active && (
        <Alert tone="warning" title="This group is deactivated">
          Its members cannot book against its allocations, and no members can be added until it is reactivated.
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Members" value={`${group.internal_members + group.external_members}`} context={`${group.internal_members} internal · ${group.external_members} external`} />
        <Stat label="Allocated" value={<span className="font-mono">{formatMoney(group.funding.allocated)}</span>} context={`${group.funding.active_allocations} active allocation${group.funding.active_allocations === 1 ? '' : 's'}`} />
        <Stat label="Consumed" value={<span className="font-mono">{formatMoney(group.funding.consumed)}</span>} context="Charged to bookings so far" />
        <Stat label="Remaining" value={<span className="font-mono">{formatMoney(group.funding.remaining)}</span>} context="Available for new bookings" />
      </div>

      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="eyebrow">Members</h2>
          {group.is_active && <Button size="sm" variant="secondary" onClick={() => setDialog('add')}><UserPlus aria-hidden className="h-4 w-4" /> Add member</Button>}
        </div>
        {group.members.length === 0 ? <p className="text-body-sm text-ink-muted">This group has no members yet.</p> : (
          <Table caption="Group members">
            <thead><tr><Th>Person</Th><Th>Role</Th><Th>Type</Th><Th>Joined</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
            <tbody>
              {group.members.map((m) => (
                <tr key={m.user_id}>
                  <Td>
                    <Link to={`/admin/people/${m.user_id}`} className="font-semibold text-pix-blue hover:underline">{m.full_name}</Link>
                    <span className="block text-caption text-ink-muted">{m.email}{!m.is_active && ' · account inactive'}</span>
                  </Td>
                  <Td>{ROLE_LABEL[m.role]}</Td>
                  <Td>{USER_TYPE_LABEL[m.user_type]}</Td>
                  <Td className="font-mono">{formatDate(m.joined_at)}</Td>
                  <Td className="text-right">
                    <Button variant="ghost" size="sm" aria-label={`Remove ${m.full_name}`} onClick={() => setDialog({ remove: m })}>Remove</Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <h2 className="eyebrow">Grant allocations</h2>
          {group.allocations.length === 0 ? <p className="text-body-sm text-ink-muted">No grant allocations yet.</p> : (
            <Table caption="Grant allocations">
              <thead><tr><Th>Grant</Th><Th className="text-right">Allocated</Th><Th className="text-right">Remaining</Th><Th>Expires</Th></tr></thead>
              <tbody>
                {group.allocations.map((a) => (
                  <tr key={a.allocation_id}>
                    <Td>
                      <Link to={`/admin/grants/${a.grant_id}`} className="font-mono font-semibold text-pix-blue hover:underline">{a.grant_code}</Link>
                      {!a.is_active && <span className="ml-2"><Badge tone="neutral">Inactive</Badge></span>}
                    </Td>
                    <Td className="text-right font-mono">{formatMoney(a.allocated_amount)}</Td>
                    <Td className="text-right font-mono">{formatMoney(a.remaining_balance)}</Td>
                    <Td className="font-mono">{formatDate(a.expiration_date)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <Card className="flex flex-col gap-3">
          <h2 className="eyebrow">Activity</h2>
          <AuditList entityId={group.group_id} />
        </Card>
      </div>

      <GroupFormDialog open={dialog === 'edit'} onOpenChange={(o) => !o && close()} group={group} />

      <Dialog open={dialog === 'add'} onOpenChange={(o) => !o && close()} title="Add member"
        footer={<>
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button loading={membership.isPending} disabled={!newMember}
            onClick={() => newMember && membership.mutate({ groupId: group.group_id, userId: newMember, action: 'add' }, { onSuccess: close })}>Add member</Button>
        </>}>
        <div className="flex flex-col gap-4">
          {refusal(membership.error)}
          <UserPicker label="Person" value={newMember} onChange={setNewMember} filter={{ is_active: 'true' }} exclude={group.members.map((m) => m.user_id)} />
        </div>
      </Dialog>

      <ConfirmDialog open={removing !== null} onOpenChange={(o) => !o && close()} title="Remove member?" confirmLabel="Remove" destructive
        pending={membership.isPending} error={refusal(membership.error)}
        onConfirm={() => removing && membership.mutate({ groupId: group.group_id, userId: removing.user_id, action: 'remove' }, { onSuccess: close })}>
        <p>{removing?.full_name} will no longer be able to book against this group's allocations. Existing bookings are not affected.</p>
      </ConfirmDialog>

      <ConfirmDialog open={dialog === 'activation'} onOpenChange={(o) => !o && close()}
        title={group.is_active ? 'Deactivate this group?' : 'Reactivate this group?'}
        confirmLabel={group.is_active ? 'Deactivate' : 'Reactivate'} destructive={group.is_active}
        pending={update.isPending} error={refusal(update.error)}
        onConfirm={() => update.mutate({ is_active: !group.is_active }, { onSuccess: close })}>
        <p>{group.is_active
          ? 'Members will no longer be able to book against this group’s allocations. Memberships and history are kept.'
          : 'Members will again be able to book against this group’s active allocations.'}</p>
      </ConfirmDialog>
    </div>
  );
}

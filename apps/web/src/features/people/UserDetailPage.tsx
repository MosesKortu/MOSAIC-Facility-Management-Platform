import { ROLES, type Role, type UserDetail } from '@mosaic/contracts';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Alert } from '../../components/ui/alert.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { ConfirmDialog, Dialog } from '../../components/ui/dialog.tsx';
import { TextField } from '../../components/ui/field.tsx';
import { PageHeader } from '../../components/ui/page-header.tsx';
import { SelectField } from '../../components/ui/select-field.tsx';
import { ErrorState, NotFound, PageLoading } from '../../components/ui/states.tsx';
import { Table, Td, Th } from '../../components/ui/table.tsx';
import { ApiError } from '../../lib/api.ts';
import { formatDate, formatMoney } from '../../lib/format.ts';
import { AuditList } from '../audit/AuditList.tsx';
import { ROLE_LABEL, USER_TYPE_LABEL } from '../auth/roles.ts';
import { useGroups, useMembership } from '../groups/api.ts';
import { useUpdateUser, useUser } from './api.ts';
import { activeBadge, PRACTICAL_LABEL } from './labels.ts';
import { UserPicker } from './UserPicker.tsx';

export function UserDetailPage() {
  const userId = useParams().userId!;
  const user = useUser(userId);

  if (user.isPending) return <PageLoading label="Loading person" />;
  if (user.isError) {
    if (user.error instanceof ApiError && user.error.code === 'NOT_FOUND') return <NotFound what="person" />;
    return <ErrorState error={user.error} onRetry={() => void user.refetch()} />;
  }
  return <UserDetailView user={user.data} />;
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="eyebrow">{title}</h2>
        {action}
      </div>
      {children}
    </Card>
  );
}

function UserDetailView({ user }: { user: UserDetail }) {
  const update = useUpdateUser(user.user_id);
  const membership = useMembership();
  const [dialog, setDialog] = useState<null | 'activation' | 'role' | 'name' | 'sponsor' | 'add-group' | { remove: { group_id: string; name: string } }>(null);
  const [role, setRole] = useState<Role>(user.role);
  const active = activeBadge(user.is_active);

  function close() {
    setDialog(null);
    update.reset();
    membership.reset();
  }
  const refusal = (error: unknown) =>
    error ? <Alert tone="danger" title="The change was not saved">{error instanceof Error ? error.message : 'Please try again.'}</Alert> : null;

  return (
    <div className="flex flex-col gap-5">
      <Link to={`/admin/people${user.user_type === 'external' ? '?type=external' : ''}`} className="text-body-sm font-semibold text-pix-blue hover:underline">
        ← {user.user_type === 'external' ? 'External collaborators' : 'Internal users'}
      </Link>
      <PageHeader title={user.full_name} description={user.email}
        eyebrow={<span className="flex flex-wrap gap-2 normal-case tracking-normal">
          <Badge tone="info">{ROLE_LABEL[user.role]}</Badge>
          <Badge tone="neutral">{USER_TYPE_LABEL[user.user_type]}</Badge>
          <Badge tone={active.tone}>{active.label}</Badge>
        </span>}
        actions={(
          <>
            <Button variant="ghost" onClick={() => setDialog('name')}>Edit name</Button>
            <Button variant={user.is_active ? 'danger' : 'secondary'} onClick={() => setDialog('activation')}>
              {user.is_active ? 'Deactivate account' : 'Reactivate account'}
            </Button>
          </>
        )} />

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Access">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-body">
            <dt className="text-ink-muted">SSO identifier</dt><dd className="font-mono text-body-sm break-all">{user.sso_identifier}</dd>
            <dt className="text-ink-muted">Member since</dt><dd>{formatDate(user.created_at)}</dd>
          </dl>
          {user.user_type === 'external' ? (
            <p className="text-body-sm text-ink-muted">External collaborators always have the Researcher role.</p>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-56">
                <SelectField label="Role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                  {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </SelectField>
              </div>
              <Button variant="secondary" disabled={role === user.role} onClick={() => setDialog('role')}>Change role</Button>
            </div>
          )}
        </Section>

        {user.user_type === 'external' ? (
          <Section title="Sponsor" action={<Button variant="link" size="sm" onClick={() => setDialog('sponsor')}>Change sponsor</Button>}>
            {user.sponsor ? (
              <Link to={`/admin/people/${user.sponsor.user_id}`} className="flex flex-col hover:underline">
                <span className="font-semibold text-ink">{user.sponsor.full_name}</span>
                <span className="text-caption text-ink-muted">{user.sponsor.email}</span>
              </Link>
            ) : (
              <Alert tone="warning" title="No sponsor recorded">External collaborators need an internal sponsor.</Alert>
            )}
          </Section>
        ) : (
          <Section title="Sponsored collaborators">
            {user.sponsored.length === 0 ? <p className="text-body-sm text-ink-muted">Not sponsoring any external collaborators.</p> : (
              <ul className="flex flex-col divide-y divide-line">
                {user.sponsored.map((p) => (
                  <li key={p.user_id} className="py-2"><Link to={`/admin/people/${p.user_id}`} className="font-semibold text-pix-blue hover:underline">{p.full_name}</Link></li>
                ))}
              </ul>
            )}
          </Section>
        )}

        <Section title="Groups" action={<Button variant="link" size="sm" onClick={() => setDialog('add-group')}>Add to group</Button>}>
          {user.groups.length === 0 ? (
            <p className="text-body-sm text-ink-muted">Not in any group. Group membership gives access to the group's funding.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {user.groups.map((g) => (
                <li key={g.group_id} className="flex items-center justify-between gap-3 py-2">
                  <Link to={`/admin/groups/${g.group_id}`} className="font-semibold text-pix-blue hover:underline">{g.name}</Link>
                  <Button variant="ghost" size="sm" onClick={() => setDialog({ remove: g })} aria-label={`Remove from ${g.name}`}>Remove</Button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Activity"><AuditList entityId={user.user_id} /></Section>
      </div>

      <Section title="Certifications">
        {user.certifications.length === 0 ? <p className="text-body-sm text-ink-muted">No training started on any instrument.</p> : (
          <Table caption="Certifications">
            <thead><tr><Th>Instrument</Th><Th>Theory</Th><Th>Practical</Th><Th>Expires</Th></tr></thead>
            <tbody>
              {user.certifications.map((c) => (
                <tr key={c.equipment_id}>
                  <Td><span className="font-mono">{c.equipment_code}</span><span className="block text-caption text-ink-muted">{c.equipment_name}</span></Td>
                  <Td><Badge tone={c.theoretical_passed ? 'success' : 'warning'}>{c.theoretical_passed ? 'Quiz passed' : 'Quiz not passed'}</Badge></Td>
                  <Td><Badge tone={PRACTICAL_LABEL[c.practical_status].tone}>{PRACTICAL_LABEL[c.practical_status].label}</Badge></Td>
                  <Td>{c.expires_at ? <span className="font-mono">{formatDate(c.expires_at)}</span> : <span className="text-ink-muted">No expiry</span>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>

      <Section title="Funding access">
        {user.funding.length === 0 ? <p className="text-body-sm text-ink-muted">No grant allocations reach this person through their groups.</p> : (
          <Table caption="Funding access">
            <thead><tr><Th>Grant</Th><Th>Group</Th><Th className="text-right">Remaining</Th><Th>Expires</Th><Th>Status</Th></tr></thead>
            <tbody>
              {user.funding.map((f) => (
                <tr key={f.allocation_id}>
                  <Td className="font-mono">{f.grant_code}</Td>
                  <Td>{f.group.name}</Td>
                  <Td className="text-right font-mono">{formatMoney(f.remaining_balance)}</Td>
                  <Td className="font-mono">{formatDate(f.expiration_date)}</Td>
                  <Td><Badge tone={f.is_active ? 'success' : 'neutral'}>{f.is_active ? 'Usable' : 'Inactive'}</Badge></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>

      <ConfirmDialog open={dialog === 'activation'} onOpenChange={(o) => !o && close()}
        title={user.is_active ? 'Deactivate this account?' : 'Reactivate this account?'}
        confirmLabel={user.is_active ? 'Deactivate' : 'Reactivate'} destructive={user.is_active} pending={update.isPending}
        error={refusal(update.error)}
        onConfirm={() => update.mutate({ is_active: !user.is_active }, { onSuccess: close })}>
        <p>{user.is_active
          ? `${user.full_name} will no longer be able to sign in or book equipment. Existing records are kept.`
          : `${user.full_name} will be able to sign in again with their current role and groups.`}</p>
      </ConfirmDialog>

      <ConfirmDialog open={dialog === 'role'} onOpenChange={(o) => !o && close()} title="Change role?"
        confirmLabel="Change role" pending={update.isPending} error={refusal(update.error)}
        onConfirm={() => update.mutate({ role }, { onSuccess: close })}>
        <p>{user.full_name} will change from <strong>{ROLE_LABEL[user.role]}</strong> to <strong>{ROLE_LABEL[role]}</strong>. This takes effect immediately.</p>
      </ConfirmDialog>

      <EditNameDialog open={dialog === 'name'} user={user} onClose={close} />

      <SponsorDialog open={dialog === 'sponsor'} user={user} onClose={close} />

      <AddToGroupDialog open={dialog === 'add-group'} user={user} onClose={close} />

      <ConfirmDialog open={typeof dialog === 'object' && dialog !== null} onOpenChange={(o) => !o && close()} title="Remove from group?"
        confirmLabel="Remove" destructive pending={membership.isPending} error={refusal(membership.error)}
        onConfirm={() => {
          if (typeof dialog === 'object' && dialog) membership.mutate({ groupId: dialog.remove.group_id, userId: user.user_id, action: 'remove' }, { onSuccess: close });
        }}>
        <p>{user.full_name} will lose access to {typeof dialog === 'object' && dialog ? `“${dialog.remove.name}”` : 'the group'}'s funding for new bookings.</p>
      </ConfirmDialog>
    </div>
  );
}

function EditNameDialog({ open, user, onClose }: { open: boolean; user: UserDetail; onClose: () => void }) {
  const update = useUpdateUser(user.user_id);
  const [name, setName] = useState(user.full_name);
  const blank = name.trim() === '';
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title="Edit name"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button loading={update.isPending} disabled={blank || name.trim() === user.full_name}
          onClick={() => update.mutate({ full_name: name.trim() }, { onSuccess: onClose })}>Save</Button>
      </>}>
      <div className="flex flex-col gap-4">
        {update.error && <Alert tone="danger" title="The name was not saved">{update.error.message}</Alert>}
        <TextField label="Full name" value={name} onChange={(e) => setName(e.target.value)} error={blank ? 'Required' : undefined} />
      </div>
    </Dialog>
  );
}

function SponsorDialog({ open, user, onClose }: { open: boolean; user: UserDetail; onClose: () => void }) {
  const update = useUpdateUser(user.user_id);
  const [sponsorId, setSponsorId] = useState<string | null>(user.sponsor?.user_id ?? null);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title="Change sponsor"
      description="The sponsor is the internal ICFO host responsible for this collaborator."
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button loading={update.isPending} disabled={!sponsorId || sponsorId === user.sponsor?.user_id}
          onClick={() => sponsorId && update.mutate({ sponsor_user_id: sponsorId }, { onSuccess: onClose })}>Save sponsor</Button>
      </>}>
      <div className="flex flex-col gap-4">
        {update.error && <Alert tone="danger" title="The sponsor was not changed">{update.error.message}</Alert>}
        <UserPicker label="Internal sponsor" value={sponsorId} onChange={setSponsorId} filter={{ user_type: 'internal', is_active: 'true' }} />
      </div>
    </Dialog>
  );
}

function AddToGroupDialog({ open, user, onClose }: { open: boolean; user: UserDetail; onClose: () => void }) {
  const groups = useGroups({ is_active: 'true', limit: 200, offset: 0 });
  const membership = useMembership();
  const [groupId, setGroupId] = useState('');
  const options = (groups.data?.items ?? []).filter((g) => !user.groups.some((m) => m.group_id === g.group_id));
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title="Add to group"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button loading={membership.isPending} disabled={!groupId}
          onClick={() => membership.mutate({ groupId, userId: user.user_id, action: 'add' }, { onSuccess: () => { setGroupId(''); onClose(); } })}>Add</Button>
      </>}>
      <div className="flex flex-col gap-4">
        {membership.error && <Alert tone="danger" title="Not added">{membership.error.message}</Alert>}
        {groups.isError ? <p className="text-body-sm text-danger">Groups could not be loaded. {groups.error.message}</p>
          : groups.isPending ? <p className="text-body-sm text-ink-muted" aria-busy="true">Loading groups…</p>
          : options.length === 0 ? <p className="text-body-sm text-ink-muted">There are no other active groups to join.</p>
          : (
            <SelectField label="Group" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              <option value="">Choose a group</option>
              {options.map((g) => <option key={g.group_id} value={g.group_id}>{g.name}</option>)}
            </SelectField>
          )}
        {groups.data && groups.data.total > groups.data.items.length && (
          <p className="text-caption text-ink-muted">Showing the first {groups.data.items.length} active groups.</p>
        )}
      </div>
    </Dialog>
  );
}

import { centsToDecimal, decimalToCents, MONEY_PATTERN, type AllocationRow, type GrantDetail } from '@mosaic/contracts';
import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { Alert } from '../../components/ui/alert.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { ConfirmDialog, Dialog } from '../../components/ui/dialog.tsx';
import { MoneyField } from '../../components/ui/money-field.tsx';
import { PageHeader } from '../../components/ui/page-header.tsx';
import { Progress } from '../../components/ui/progress.tsx';
import { SelectField } from '../../components/ui/select-field.tsx';
import { ErrorState, NotFound, PageLoading } from '../../components/ui/states.tsx';
import { Table, Td, Th } from '../../components/ui/table.tsx';
import { ApiError } from '../../lib/api.ts';
import { formatDate, formatMoney } from '../../lib/format.ts';
import { AuditList } from '../audit/AuditList.tsx';
import { useGroups } from '../groups/api.ts';
import { spendProgress } from './AllocationsPage.tsx';
import { useCreateAllocation, useGrant, useUpdateAllocation } from './api.ts';
import { GrantFormDialog } from './GrantFormDialog.tsx';
import { fundingErrorMessage } from './messages.ts';

export function GrantDetailPage() {
  const grantId = useParams().grantId!;
  const grant = useGrant(grantId);
  if (grant.isPending) return <PageLoading label="Loading grant" />;
  if (grant.isError) {
    if (grant.error instanceof ApiError && grant.error.code === 'NOT_FOUND') return <NotFound what="grant" />;
    return <ErrorState error={grant.error} onRetry={() => void grant.refetch()} />;
  }
  return <GrantDetailView grant={grant.data} />;
}

function Stat({ label, value, context }: { label: string; value: string; context: string }) {
  return (
    <Card className="flex flex-col gap-1">
      <p className="eyebrow">{label}</p>
      <p className="font-mono text-title-sm text-ink">{formatMoney(value)}</p>
      <p className="text-caption text-ink-muted">{context}</p>
    </Card>
  );
}

/** Parses an amount typed by the user; null when it is not a valid money string. */
function parseCents(value: string): number | null {
  const trimmed = value.trim();
  return MONEY_PATTERN.test(trimmed) ? decimalToCents(trimmed) : null;
}

function GrantDetailView({ grant }: { grant: GrantDetail }) {
  const [dialog, setDialog] = useState<null | 'edit' | 'allocate' | { adjust: AllocationRow } | { toggle: AllocationRow }>(null);
  const toggleAllocation = useUpdateAllocation();
  const consumed = spendProgress(grant.allocated_budget, grant.consumed);
  const close = () => {
    setDialog(null);
    toggleAllocation.reset();
  };
  const toggling = dialog && typeof dialog === 'object' && 'toggle' in dialog ? dialog.toggle : null;
  const adjusting = dialog && typeof dialog === 'object' && 'adjust' in dialog ? dialog.adjust : null;

  return (
    <div className="flex flex-col gap-5">
      <Link to="/admin/grants" className="text-body-sm font-semibold text-pix-blue hover:underline">← Grants</Link>
      <PageHeader title={grant.grant_code}
        description={<>PI: <Link to={`/admin/people/${grant.pi.user_id}`} className="font-semibold text-pix-blue hover:underline">{grant.pi.full_name}</Link>
          {' · '}Expires <span className="font-mono">{formatDate(grant.expiration_date)}</span></>}
        eyebrow={grant.is_expired ? <Badge tone="danger">Expired</Badge> : <Badge tone="success">Current</Badge>}
        actions={<>
          <Button variant="ghost" onClick={() => setDialog('edit')}>Edit grant</Button>
          <Button onClick={() => setDialog('allocate')} disabled={decimalToCents(grant.unallocated) === 0}>Allocate to group</Button>
        </>} />

      {grant.is_expired && (
        <Alert tone="warning" title="This grant has expired">Its allocations can no longer fund new bookings. Extend the expiration date to use it again.</Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Total budget" value={grant.allocated_budget} context="Awarded to this grant" />
        <Stat label="Allocated to groups" value={grant.allocated_to_groups} context={`${grant.allocation_count} allocation${grant.allocation_count === 1 ? '' : 's'}`} />
        <Stat label="Unallocated" value={grant.unallocated} context="Available to allocate" />
        <Stat label="Consumed" value={grant.consumed} context="Charged to bookings" />
        <Stat label="Remaining" value={grant.remaining_balance} context="Budget not yet spent" />
      </div>
      <Card>
        <Progress value={consumed.ratio} tone={consumed.tone} label={`${formatMoney(grant.consumed)} consumed of ${formatMoney(grant.allocated_budget)} (${Math.round(consumed.ratio * 100)}%)`} />
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="eyebrow">Group allocations</h2>
        {grant.allocations.length === 0 ? <p className="text-body-sm text-ink-muted">Nothing has been allocated to a group yet.</p> : (
          <Table caption="Group allocations of this grant">
            <thead><tr><Th>Group</Th><Th className="text-right">Allocated</Th><Th className="min-w-56">Spent</Th><Th className="text-right">Remaining</Th><Th>Status</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
            <tbody>
              {grant.allocations.map((a) => {
                const progress = spendProgress(a.allocated_amount, a.consumed);
                return (
                  <tr key={a.allocation_id}>
                    <Td><Link to={`/admin/groups/${a.group.group_id}`} className="font-semibold text-pix-blue hover:underline">{a.group.name}</Link></Td>
                    <Td className="text-right font-mono">{formatMoney(a.allocated_amount)}</Td>
                    <Td><Progress value={progress.ratio} tone={progress.tone} label={progress.label} /></Td>
                    <Td className="text-right font-mono">{formatMoney(a.remaining_balance)}</Td>
                    <Td><Badge tone={a.is_active ? 'success' : 'neutral'}>{a.is_active ? 'Active' : 'Inactive'}</Badge></Td>
                    <Td className="text-right whitespace-nowrap">
                      <Button variant="ghost" size="sm" aria-label={`Adjust ${a.group.name} allocation`} onClick={() => setDialog({ adjust: a })}>Adjust</Button>
                      <Button variant="ghost" size="sm" aria-label={`${a.is_active ? 'Deactivate' : 'Reactivate'} ${a.group.name} allocation`}
                        onClick={() => setDialog({ toggle: a })}>{a.is_active ? 'Deactivate' : 'Reactivate'}</Button>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="eyebrow">Activity</h2>
        <AuditList entityId={grant.grant_id} relatedIds={grant.allocations.map((a) => a.allocation_id)} />
      </Card>

      <GrantFormDialog open={dialog === 'edit'} onOpenChange={(o) => !o && close()} grant={grant} />
      {dialog === 'allocate' && <AllocateDialog grant={grant} onClose={close} />}
      {adjusting && <AdjustAllocationDialog allocation={adjusting} grant={grant} onClose={close} />}
      <ConfirmDialog open={toggling !== null} onOpenChange={(o) => !o && close()}
        title={toggling?.is_active ? 'Deactivate allocation?' : 'Reactivate allocation?'}
        confirmLabel={toggling?.is_active ? 'Deactivate' : 'Reactivate'} destructive={toggling?.is_active}
        pending={toggleAllocation.isPending}
        error={toggleAllocation.error && <Alert tone="danger" title="Not saved">{fundingErrorMessage(toggleAllocation.error)}</Alert>}
        onConfirm={() => toggling && toggleAllocation.mutate({ allocationId: toggling.allocation_id, body: { is_active: !toggling.is_active } }, { onSuccess: close })}>
        <p>{toggling?.is_active
          ? `Members of ${toggling.group.name} will not be able to use this allocation for new bookings. The balance is kept.`
          : `Members of ${toggling?.group.name} will be able to book against this allocation again.`}</p>
      </ConfirmDialog>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line py-2 last:border-b-0">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

/** Grant → select group → enter amount → validate → review → confirm (08 §33). */
function AllocateDialog({ grant, onClose }: { grant: GrantDetail; onClose: () => void }) {
  const groups = useGroups({ is_active: 'true', limit: 200, offset: 0 });
  const create = useCreateAllocation();
  const [step, setStep] = useState<'form' | 'review'>('form');
  const [groupId, setGroupId] = useState('');
  const [amount, setAmount] = useState('');
  const [attempted, setAttempted] = useState(false);

  const unallocated = decimalToCents(grant.unallocated);
  const cents = parseCents(amount);
  const alreadyAllocated = new Set(grant.allocations.map((a) => a.group.group_id));
  const options = (groups.data?.items ?? []).filter((g) => !alreadyAllocated.has(g.group_id));
  const group = options.find((g) => g.group_id === groupId);

  const amountError = cents === null ? 'Enter an amount like 1250.00'
    : cents === 0 ? 'The amount must be more than zero'
    : cents > unallocated ? `Only ${formatMoney(grant.unallocated)} is unallocated in this grant`
    : undefined;
  const groupError = groupId ? undefined : 'Choose a group';

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={step === 'form' ? 'Allocate to a group' : 'Review allocation'}
      description={`${grant.grant_code} · ${formatMoney(grant.unallocated)} unallocated`}
      footer={step === 'form' ? (
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => {
            setAttempted(true);
            if (!amountError && !groupError) setStep('review');
          }}>Review</Button>
        </>
      ) : (
        <>
          <Button variant="ghost" onClick={() => { create.reset(); setStep('form'); }} disabled={create.isPending}>Back</Button>
          <Button loading={create.isPending}
            onClick={() => create.mutate({ grant_id: grant.grant_id, group_id: groupId, allocated_amount: amount.trim() }, { onSuccess: onClose })}>
            Confirm allocation
          </Button>
        </>
      )}>
      {step === 'form' ? (
        <div className="flex flex-col gap-4">
          {groups.isError ? <Alert tone="danger" title="Groups could not be loaded">{groups.error.message}</Alert>
            : groups.isPending ? <p aria-busy="true" className="text-body-sm text-ink-muted">Loading groups…</p>
            : options.length === 0 ? <Alert tone="info" title="No group to allocate to">Every active group already has an allocation from this grant. Adjust an existing allocation instead.</Alert>
            : (
              <SelectField label="Group" value={groupId} onChange={(e) => setGroupId(e.target.value)} error={attempted ? groupError : undefined}>
                <option value="">Choose a group</option>
                {options.map((g) => <option key={g.group_id} value={g.group_id}>{g.name}</option>)}
              </SelectField>
            )}
          <MoneyField label="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00"
            hint={`Up to ${formatMoney(grant.unallocated)}`} error={attempted ? amountError : undefined} />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {create.error && <Alert tone="danger" title="The allocation was not made">{fundingErrorMessage(create.error)}</Alert>}
          <dl className="flex flex-col text-body">
            <Row label="Grant"><span className="font-mono">{grant.grant_code}</span></Row>
            <Row label="Group">{group?.name}</Row>
            <Row label="Amount"><span className="font-mono">{formatMoney(centsToDecimal(cents ?? 0))}</span></Row>
            <Row label="Unallocated after"><span className="font-mono">{formatMoney(centsToDecimal(unallocated - (cents ?? 0)))}</span></Row>
          </dl>
          <p className="text-body-sm text-ink-muted">Members of this group will be notified and can book against it immediately.</p>
        </div>
      )}
    </Dialog>
  );
}

function AdjustAllocationDialog({ allocation, grant, onClose }: { allocation: AllocationRow; grant: GrantDetail; onClose: () => void }) {
  const update = useUpdateAllocation();
  const [amount, setAmount] = useState(allocation.allocated_amount);
  const cents = parseCents(amount);
  const max = decimalToCents(grant.unallocated) + decimalToCents(allocation.allocated_amount);
  const error = cents === null ? 'Enter an amount like 1250.00' : undefined;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`Adjust ${allocation.group.name}`}
      description={`${formatMoney(allocation.consumed)} spent so far · up to ${formatMoney(centsToDecimal(max))} available`}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button loading={update.isPending} disabled={cents === null || amount.trim() === allocation.allocated_amount}
          onClick={() => update.mutate({ allocationId: allocation.allocation_id, body: { allocated_amount: amount.trim() } }, { onSuccess: onClose })}>
          Save amount
        </Button>
      </>}>
      <div className="flex flex-col gap-4">
        {update.error && <Alert tone="danger" title="The amount was not changed">{fundingErrorMessage(update.error)}</Alert>}
        <MoneyField label="New amount" value={amount} onChange={(e) => setAmount(e.target.value)} error={error}
          hint="What was already spent stays spent; the remaining balance adjusts." />
      </div>
    </Dialog>
  );
}

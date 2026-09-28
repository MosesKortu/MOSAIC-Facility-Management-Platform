import { FACILITY_NAME, type AdminEquipment } from '@mosaic/contracts';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { Alert } from '../../components/ui/alert.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { ConfirmDialog } from '../../components/ui/dialog.tsx';
import { PageHeader } from '../../components/ui/page-header.tsx';
import { ErrorState, NotFound, PageLoading } from '../../components/ui/states.tsx';
import { TabLinks } from '../../components/ui/tabs.tsx';
import { ApiError } from '../../lib/api.ts';
import { formatMoney } from '../../lib/format.ts';
import { AuditList } from '../audit/AuditList.tsx';
import { useAdminEquipment, useUpdateEquipment } from '../equipment/api.ts';
import { ChangeStatusDialog } from '../equipment/ChangeStatusDialog.tsx';
import { EquipmentStatusBadge, StatusHistory } from '../equipment/components.tsx';
import { useAdminTrainingModule } from '../training/api.ts';
import { TrainingModuleEditor } from '../training/TrainingModuleEditor.tsx';
import { AvailabilityEditor } from './AvailabilityEditor.tsx';
import { EquipmentFormDialog } from './EquipmentFormDialog.tsx';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'availability', label: 'Availability' },
  { key: 'training', label: 'Training' },
  { key: 'maintenance', label: 'Maintenance' },
  { key: 'audit', label: 'Audit' },
] as const;
type Tab = (typeof TABS)[number]['key'];

export function AdminEquipmentDetailPage() {
  const equipmentId = useParams().equipmentId!;
  const equipment = useAdminEquipment(equipmentId);
  if (equipment.isPending) return <PageLoading label="Loading instrument" />;
  if (equipment.isError) {
    if (equipment.error instanceof ApiError && equipment.error.code === 'NOT_FOUND') return <NotFound what="instrument" />;
    return <ErrorState error={equipment.error} onRetry={() => void equipment.refetch()} />;
  }
  return <AdminEquipmentView equipment={equipment.data} />;
}

function AdminEquipmentView({ equipment }: { equipment: AdminEquipment }) {
  const [params] = useSearchParams();
  const tab: Tab = TABS.some((t) => t.key === params.get('tab')) ? (params.get('tab') as Tab) : 'overview';
  const [dialog, setDialog] = useState<null | 'edit' | 'status' | 'activation'>(null);
  const update = useUpdateEquipment(equipment.equipment_id);
  const close = () => {
    setDialog(null);
    update.reset();
  };

  return (
    <div className="flex flex-col gap-5">
      <Link to="/admin/equipment" className="text-body-sm font-semibold text-pix-blue hover:underline">← Equipment portfolio</Link>
      <PageHeader title={equipment.name.en}
        description={<>{FACILITY_NAME[equipment.facility]} · <span className="font-mono">{equipment.code}</span></>}
        eyebrow={equipment.is_active ? <EquipmentStatusBadge status={equipment.status} /> : <Badge tone="neutral">Retired</Badge>}
        actions={<>
          <Button variant="ghost" onClick={() => setDialog('edit')}>Edit</Button>
          {equipment.is_active && <Button variant="secondary" onClick={() => setDialog('status')}>Change status</Button>}
          <Button variant={equipment.is_active ? 'danger' : 'secondary'} onClick={() => setDialog('activation')}>
            {equipment.is_active ? 'Retire' : 'Return to service'}
          </Button>
        </>} />

      {!equipment.is_active && <Alert tone="warning" title="This instrument is retired">Researchers cannot see or book it. Its history is kept.</Alert>}
      {equipment.is_active && equipment.weekly_hours === 0 && (
        <Alert tone="warning" title="No bookable hours">Researchers cannot book this instrument until you set its weekly hours on the Availability tab.</Alert>
      )}

      <TabLinks label="Instrument administration" tabs={TABS.map((t) => ({ to: t.key === 'overview' ? '?' : `?tab=${t.key}`, label: t.label, active: tab === t.key }))} />

      {tab === 'overview' && (
        <Card>
          <dl className="grid gap-x-8 gap-y-3 text-body sm:grid-cols-[auto_1fr]">
            <dt className="text-ink-muted">Hourly rate</dt><dd className="font-mono">{formatMoney(equipment.base_rate_hourly)}</dd>
            <dt className="text-ink-muted">Buffer after bookings</dt><dd><span className="font-mono">{equipment.buffer_time_minutes}</span> min</dd>
            <dt className="text-ink-muted">Certification validity</dt>
            <dd>{equipment.certification_validity_months === null ? 'Does not expire' : <><span className="font-mono">{equipment.certification_validity_months}</span> months</>}</dd>
            <dt className="text-ink-muted">Bookable hours</dt><dd><span className="font-mono">{equipment.weekly_hours}</span> per week</dd>
            <dt className="text-ink-muted">Interlock</dt>
            <dd className="font-mono">{equipment.interlock_mqtt_topic ?? <span className="font-sans text-ink-muted">None — manual access</span>}{equipment.interlock_ip && ` · ${equipment.interlock_ip}`}</dd>
            <dt className="text-ink-muted">Description</dt><dd>{equipment.description.en}</dd>
            <dt className="text-ink-muted">Translations</dt>
            <dd>{(['es', 'ca'] as const).map((l) => equipment.name[l] ? l.toUpperCase() : null).filter(Boolean).join(', ') || <span className="text-ink-muted">English only</span>}</dd>
          </dl>
        </Card>
      )}
      {tab === 'availability' && <AvailabilityEditor equipmentId={equipment.equipment_id} windows={equipment.availability_windows} />}
      {tab === 'training' && <TrainingTab equipmentId={equipment.equipment_id} />}
      {tab === 'maintenance' && <Card><StatusHistory equipmentId={equipment.equipment_id} /></Card>}
      {tab === 'audit' && <Card><AuditList entityId={equipment.equipment_id} limit={25} /></Card>}

      <EquipmentFormDialog open={dialog === 'edit'} onOpenChange={(o) => !o && close()} equipment={equipment} />
      {dialog === 'status' && <ChangeStatusDialog equipment={equipment} onClose={close} />}
      <ConfirmDialog open={dialog === 'activation'} onOpenChange={(o) => !o && close()}
        title={equipment.is_active ? 'Retire this instrument?' : 'Return this instrument to service?'}
        confirmLabel={equipment.is_active ? 'Retire' : 'Return to service'} destructive={equipment.is_active} pending={update.isPending}
        error={update.error && <Alert tone="danger" title="Not saved">{update.error.message}</Alert>}
        onConfirm={() => update.mutate({ is_active: !equipment.is_active }, { onSuccess: close })}>
        <p>{equipment.is_active
          ? `${equipment.code} will disappear from equipment discovery and cannot be booked. Existing bookings and history are kept.`
          : `${equipment.code} will be visible and bookable again (within its weekly hours).`}</p>
      </ConfirmDialog>
    </div>
  );
}

/** The instrument's SOP and quiz; a missing module (404) starts an empty editor. */
export function TrainingTab({ equipmentId }: { equipmentId: string }) {
  const module = useAdminTrainingModule(equipmentId);
  if (module.isPending) return <PageLoading label="Loading training" />;
  const missing = module.isError && module.error instanceof ApiError && module.error.code === 'NOT_FOUND';
  if (module.isError && !missing) return <ErrorState error={module.error} onRetry={() => void module.refetch()} />;
  return (
    <div className="flex flex-col gap-3">
      {missing && <Alert tone="info" title="No training yet">Researchers cannot become certified on this instrument until you publish its SOP and quiz.</Alert>}
      <TrainingModuleEditor equipmentId={equipmentId} initial={missing ? null : module.data ?? null} />
    </div>
  );
}

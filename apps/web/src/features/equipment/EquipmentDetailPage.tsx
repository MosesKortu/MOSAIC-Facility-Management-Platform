import { FACILITY_NAME, type EquipmentDetail } from '@mosaic/contracts';
import { CheckCircle2, CircleDashed, KeyRound } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router';
import { Alert } from '../../components/ui/alert.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Card } from '../../components/ui/card.tsx';
import { ErrorState, NotFound, PageLoading } from '../../components/ui/states.tsx';
import { Table, Td, Th } from '../../components/ui/table.tsx';
import { TabLinks } from '../../components/ui/tabs.tsx';
import { ApiError } from '../../lib/api.ts';
import { formatDate, formatMoney } from '../../lib/format.ts';
import { useEquipment } from './api.ts';
import { AccessBadge, EquipmentStatusBadge, StatusHistory, WeeklyWindows } from './components.tsx';
import { ACCESS, SUPPORT_TIER_LABEL } from './labels.ts';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'availability', label: 'Availability' },
  { key: 'pricing', label: 'Pricing' },
  { key: 'maintenance', label: 'Maintenance' },
] as const;
type Tab = (typeof TABS)[number]['key'];

export function EquipmentDetailPage() {
  const equipmentId = useParams().equipmentId!;
  const equipment = useEquipment(equipmentId);
  if (equipment.isPending) return <PageLoading label="Loading instrument" />;
  if (equipment.isError) {
    if (equipment.error instanceof ApiError && equipment.error.code === 'NOT_FOUND') return <NotFound what="instrument" />;
    return <ErrorState error={equipment.error} onRetry={() => void equipment.refetch()} />;
  }
  return <EquipmentDetailView equipment={equipment.data} />;
}

function Step({ done, children }: { done: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2 text-body">
      {done ? <CheckCircle2 aria-hidden className="h-4 w-4 text-success" /> : <CircleDashed aria-hidden className="h-4 w-4 text-ink-muted" />}
      <span className={done ? 'text-ink' : 'text-ink-muted'}>{children}</span>
      <span className="sr-only">{done ? '(done)' : '(not done)'}</span>
    </li>
  );
}

function EquipmentDetailView({ equipment }: { equipment: EquipmentDetail }) {
  const [params] = useSearchParams();
  const tab: Tab = TABS.some((t) => t.key === params.get('tab')) ? (params.get('tab') as Tab) : 'overview';
  const cert = equipment.my_certification;
  const noWindows = equipment.availability_windows.length === 0;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <Link to="/equipment" className="text-body-sm font-semibold text-pix-blue hover:underline">← Equipment</Link>
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <Card className="flex flex-col gap-3 p-6">
          <span className="flex flex-wrap items-center gap-2 text-body-sm text-ink-muted">
            {FACILITY_NAME[equipment.facility]} · <span className="font-mono">{equipment.code}</span>
          </span>
          <h1 className="font-title text-title-lg text-ink">{equipment.name}</h1>
          <p className="text-body text-ink">{equipment.description}</p>
          <div className="flex flex-wrap items-end justify-between gap-4 pt-2">
            <EquipmentStatusBadge status={equipment.status} />
            <p className="text-right"><span className="font-mono text-title-md text-ink">{formatMoney(equipment.base_rate_hourly)}</span>
              <span className="block text-caption text-ink-muted">per hour, before support</span></p>
          </div>
        </Card>

        <Card aria-labelledby="access-heading" className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 id="access-heading" className="eyebrow">Your access</h2>
            <AccessBadge access={cert.access} />
          </div>
          <ol className="flex flex-col gap-2">
            <Step done={cert.theoretical_passed}>SOP read and quiz passed{cert.theoretical_score !== null && <> · <span className="font-mono">{cert.theoretical_score}%</span></>}</Step>
            <Step done={cert.practical_status === 'signed_off'}>Practical assessment approved</Step>
          </ol>
          <p className="text-body-sm text-ink">{ACCESS[cert.access].next}</p>
          {cert.access === 'certified' && equipment.status === 'operational' && !noWindows && (
            <Link to={`/equipment/${equipment.equipment_id}/book`}
              className="inline-flex w-fit items-center rounded-lg bg-pix-blue px-4 py-2 text-body font-semibold text-white hover:bg-pix-blue-75">
              Book this instrument
            </Link>
          )}
          {cert.access !== 'certified' && (
            <Link to={`/training/${equipment.equipment_id}`}
              className="inline-flex w-fit items-center rounded-lg bg-pix-yellow px-4 py-2 text-body font-semibold text-ink hover:bg-[#ffda41]">
              {cert.access === 'training_required' ? 'Start training' : 'Continue certification'}
            </Link>
          )}
          {cert.practical_rejection_reason && cert.access === 'reassessment_needed' && (
            <p className="text-body-sm text-ink-muted">Reviewer's note: {cert.practical_rejection_reason}</p>
          )}
          {cert.expires_at && <p className="text-caption text-ink-muted">Certification {cert.access === 'expired' ? 'expired' : 'valid until'} <span className="font-mono">{formatDate(cert.expires_at)}</span></p>}
        </Card>
      </div>

      {equipment.status !== 'operational' && (
        <Alert tone={equipment.status === 'offline' ? 'danger' : 'warning'} title={`This instrument is currently ${equipment.status === 'offline' ? 'offline' : 'under maintenance'}`}>
          New bookings are not possible until it is operational again. The Maintenance tab shows the reason.
        </Alert>
      )}

      <TabLinks label="Instrument details" tabs={TABS.map((t) => ({ to: t.key === 'overview' ? '?' : `?tab=${t.key}`, label: t.label, active: tab === t.key }))} />

      {tab === 'overview' && (
        <Card className="flex flex-col gap-3">
          <dl className="grid grid-cols-[auto_1fr] gap-x-8 gap-y-2 text-body">
            <dt className="text-ink-muted">Buffer between bookings</dt><dd><span className="font-mono">{equipment.buffer_time_minutes}</span> min</dd>
            <dt className="text-ink-muted">Certification validity</dt>
            <dd>{equipment.certification_validity_months === null ? 'Does not expire' : <><span className="font-mono">{equipment.certification_validity_months}</span> months</>}</dd>
            <dt className="text-ink-muted">Physical access</dt>
            <dd className="flex items-center gap-2"><KeyRound aria-hidden className="h-4 w-4 text-ink-muted" />
              {equipment.has_interlock ? 'Hardware interlock' : 'Manual access — no interlock is connected to this instrument'}</dd>
          </dl>
        </Card>
      )}

      {tab === 'availability' && (
        <div className="flex flex-col gap-3">
          {noWindows && <Alert tone="warning" title="No bookable hours are set">This instrument cannot be booked until the facility sets its weekly hours.</Alert>}
          <WeeklyWindows windows={equipment.availability_windows} />
        </div>
      )}

      {tab === 'pricing' && (
        <Card className="flex flex-col gap-3">
          <p className="text-body text-ink">The session cost is the instrument rate plus the support rate, for the booked duration.</p>
          <Table caption="Hourly rates">
            <thead><tr><Th>Rate</Th><Th className="text-right">Per hour</Th><Th>Availability</Th></tr></thead>
            <tbody>
              <tr><Td className="font-semibold">Instrument</Td><Td className="text-right font-mono">{formatMoney(equipment.base_rate_hourly)}</Td><Td /></tr>
              {equipment.support_tariffs.map((t) => (
                <tr key={t.tier}>
                  <Td>{SUPPORT_TIER_LABEL[t.tier]}</Td>
                  <Td className="text-right font-mono">+{formatMoney(t.rate_hourly)}</Td>
                  <Td>{t.is_available ? <Badge tone="success">Offered</Badge> : <Badge tone="neutral">Not offered</Badge>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {tab === 'maintenance' && (
        <Card className="flex flex-col gap-3">
          <h2 className="eyebrow">Status history</h2>
          <StatusHistory equipmentId={equipment.equipment_id} />
        </Card>
      )}
    </div>
  );
}

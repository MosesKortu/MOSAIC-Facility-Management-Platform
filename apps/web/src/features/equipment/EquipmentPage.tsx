import { FACILITIES, FACILITY_NAME, EQUIPMENT_STATUSES, type EquipmentStatus, type Facility } from '@mosaic/contracts';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import { FilterChips } from '../../components/ui/filter-chips.tsx';
import { PageHeader } from '../../components/ui/page-header.tsx';
import { SearchInput } from '../../components/ui/search-input.tsx';
import { SelectField } from '../../components/ui/select-field.tsx';
import { Skeleton } from '../../components/ui/skeleton.tsx';
import { EmptyState, ErrorState } from '../../components/ui/states.tsx';
import { formatMoney } from '../../lib/format.ts';
import { useUrlFilters } from '../../lib/use-url-filters.ts';
import { useEquipmentList } from './api.ts';
import { AccessBadge, EquipmentStatusBadge } from './components.tsx';
import { EQUIPMENT_STATUS } from './labels.ts';

const FACILITY_OPTIONS = [{ value: null, label: 'All' }, ...FACILITIES.map((f) => ({ value: f, label: f }))] as const;

/** /equipment — discovery: every instrument shows its status and the user's own access together. */
export function EquipmentPage() {
  const { params, update } = useUrlFilters();
  const facility = (FACILITIES as readonly string[]).includes(params.get('facility') ?? '') ? (params.get('facility') as Facility) : null;
  const status = (EQUIPMENT_STATUSES as readonly string[]).includes(params.get('status') ?? '') ? (params.get('status') as EquipmentStatus) : undefined;
  const q = params.get('q') ?? '';
  const equipment = useEquipmentList({ facility: facility ?? undefined, status, q: q || undefined, limit: 100, offset: 0 });

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <PageHeader title="Equipment" description="Instruments across the core facilities, with your access to each." />
      <div className="flex flex-col gap-3">
        <SearchInput label="Search equipment" value={q} onChange={(v) => update({ q: v || null })} placeholder="Search by name or code" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <FilterChips label="Facility" options={FACILITY_OPTIONS} value={facility} onChange={(f) => update({ facility: f })} />
          <div className="w-44">
            <SelectField label="Status" hideLabel value={status ?? ''} onChange={(e) => update({ status: e.target.value || null })}>
              <option value="">Any status</option>
              {EQUIPMENT_STATUSES.map((s) => <option key={s} value={s}>{EQUIPMENT_STATUS[s].label}</option>)}
            </SelectField>
          </div>
        </div>
      </div>

      {equipment.isPending ? (
        <div role="status" aria-busy="true" className="flex flex-col gap-3">
          <span className="sr-only">Loading equipment…</span>
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : equipment.isError ? (
        <ErrorState error={equipment.error} onRetry={() => void equipment.refetch()} />
      ) : equipment.data.items.length === 0 ? (
        q || status ? <EmptyState title="No instruments match these filters." />
          : <EmptyState title={facility ? `No instruments in the ${FACILITY_NAME[facility]} yet.` : 'No instruments have been added yet.'} />
      ) : (
        <ul className="flex flex-col gap-3">
          {equipment.data.items.map((item) => (
            <li key={item.equipment_id}>
              <Link to={`/equipment/${item.equipment_id}`}
                className="group flex items-center gap-4 rounded-xl border border-line bg-surface p-5 transition-colors hover:border-pix-blue">
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-title text-title-sm text-ink">{item.name}</span>
                    <EquipmentStatusBadge status={item.status} />
                  </span>
                  <span className="text-body-sm text-ink-muted">
                    {FACILITY_NAME[item.facility]} · <span className="font-mono">{item.code}</span>
                  </span>
                  <span className="text-body text-ink">{item.description}</span>
                  <span className="mt-1"><AccessBadge access={item.my_certification.access} /></span>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                  <span className="font-mono text-title-sm text-ink">{formatMoney(item.base_rate_hourly)}</span>
                  <span className="text-caption text-ink-muted">per hour</span>
                </div>
                <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-ink-muted group-hover:text-pix-blue" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

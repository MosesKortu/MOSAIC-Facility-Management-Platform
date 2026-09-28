import { FACILITIES, FACILITY_NAME, type Facility } from '@mosaic/contracts';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Badge } from '../../components/ui/badge.tsx';
import { Button } from '../../components/ui/button.tsx';
import { FilterChips } from '../../components/ui/filter-chips.tsx';
import { PageHeader } from '../../components/ui/page-header.tsx';
import { Pagination } from '../../components/ui/pagination.tsx';
import { SearchInput } from '../../components/ui/search-input.tsx';
import { EmptyState, ErrorState } from '../../components/ui/states.tsx';
import { Table, Td, Th } from '../../components/ui/table.tsx';
import { TableSkeleton } from '../../components/ui/table-skeleton.tsx';
import { formatMoney } from '../../lib/format.ts';
import { useUrlFilters } from '../../lib/use-url-filters.ts';
import { useAdminEquipmentList } from '../equipment/api.ts';
import { EquipmentStatusBadge } from '../equipment/components.tsx';
import { EquipmentFormDialog } from './EquipmentFormDialog.tsx';

const LIMIT = 50;
const FACILITY_OPTIONS = [{ value: null, label: 'All' }, ...FACILITIES.map((f) => ({ value: f, label: f }))] as const;

/** /admin/equipment — the full portfolio, including retired instruments. */
export function AdminEquipmentPage() {
  const { params, update, offset } = useUrlFilters();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const facility = (FACILITIES as readonly string[]).includes(params.get('facility') ?? '') ? (params.get('facility') as Facility) : null;
  const q = params.get('q') ?? '';
  const equipment = useAdminEquipmentList({ facility: facility ?? undefined, q: q || undefined, limit: LIMIT, offset });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Equipment portfolio" description="Instruments, their pricing, bookable hours and configuration."
        actions={<Button onClick={() => setCreating(true)}><Plus aria-hidden className="h-4 w-4" /> Add instrument</Button>} />
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput label="Search equipment" value={q} onChange={(v) => update({ q: v || null })} placeholder="Search by name or code" />
        <FilterChips label="Facility" options={FACILITY_OPTIONS} value={facility} onChange={(f) => update({ facility: f })} />
      </div>
      {equipment.isPending ? <TableSkeleton label="equipment" />
        : equipment.isError ? <ErrorState error={equipment.error} onRetry={() => void equipment.refetch()} />
        : equipment.data.items.length === 0 ? (
          q || facility ? <EmptyState title="No instruments match these filters." />
            : <EmptyState title="No instruments have been added yet." action={<Button onClick={() => setCreating(true)}>Add instrument</Button>} />
        ) : (
          <>
            <Table caption="Equipment portfolio">
              <thead><tr><Th>Instrument</Th><Th>Facility</Th><Th className="text-right">Rate / h</Th><Th className="text-right">Hours / week</Th><Th>Status</Th></tr></thead>
              <tbody>
                {equipment.data.items.map((e) => (
                  <tr key={e.equipment_id} className="hover:bg-canvas">
                    <Td>
                      <Link to={`/admin/equipment/${e.equipment_id}`} className="font-semibold text-pix-blue hover:underline">{e.name.en}</Link>
                      <span className="block font-mono text-caption text-ink-muted">{e.code}</span>
                    </Td>
                    <Td title={FACILITY_NAME[e.facility]}>{e.facility}</Td>
                    <Td className="text-right font-mono">{formatMoney(e.base_rate_hourly)}</Td>
                    <Td className="text-right">
                      {e.weekly_hours === 0 ? <Badge tone="warning">Not bookable</Badge> : <span className="font-mono">{e.weekly_hours}</span>}
                    </Td>
                    <Td>{e.is_active ? <EquipmentStatusBadge status={e.status} /> : <Badge tone="neutral">Retired</Badge>}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination total={equipment.data.total} limit={LIMIT} offset={offset} onOffsetChange={(o) => update({ offset: String(o) })} />
          </>
        )}
      <EquipmentFormDialog open={creating} onOpenChange={setCreating} onSaved={(e) => void navigate(`/admin/equipment/${e.equipment_id}`)} />
    </div>
  );
}

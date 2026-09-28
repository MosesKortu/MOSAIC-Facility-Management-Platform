import { FACILITIES, FACILITY_NAME, type EquipmentSummary, type Facility } from '@mosaic/contracts';
import { useState } from 'react';
import { Button } from '../../components/ui/button.tsx';
import { Dialog } from '../../components/ui/dialog.tsx';
import { FilterChips } from '../../components/ui/filter-chips.tsx';
import { PageHeader } from '../../components/ui/page-header.tsx';
import { EmptyState, ErrorState } from '../../components/ui/states.tsx';
import { Table, Td, Th } from '../../components/ui/table.tsx';
import { TableSkeleton } from '../../components/ui/table-skeleton.tsx';
import { useUrlFilters } from '../../lib/use-url-filters.ts';
import { useEquipmentList } from '../equipment/api.ts';
import { ChangeStatusDialog } from '../equipment/ChangeStatusDialog.tsx';
import { EquipmentStatusBadge, StatusHistory } from '../equipment/components.tsx';

const FACILITY_OPTIONS = [{ value: null, label: 'All' }, ...FACILITIES.map((f) => ({ value: f, label: f }))] as const;

/** /operations/equipment — exception-first: instruments that are not operational are listed first. */
export function EquipmentStatusPage() {
  const { params, update } = useUrlFilters();
  const facility = (FACILITIES as readonly string[]).includes(params.get('facility') ?? '') ? (params.get('facility') as Facility) : null;
  const equipment = useEquipmentList({ facility: facility ?? undefined, limit: 200, offset: 0 });
  const [dialog, setDialog] = useState<null | { status: EquipmentSummary } | { history: EquipmentSummary }>(null);

  const rows = equipment.data
    ? [...equipment.data.items].sort((a, b) => Number(a.status === 'operational') - Number(b.status === 'operational'))
    : [];
  const down = rows.filter((e) => e.status !== 'operational').length;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Equipment status" description={equipment.data ? `${down === 0 ? 'Every instrument is operational.' : `${down} instrument${down === 1 ? '' : 's'} not operational.`}` : undefined} />
      <FilterChips label="Facility" options={FACILITY_OPTIONS} value={facility} onChange={(f) => update({ facility: f })} />
      {equipment.isPending ? <TableSkeleton label="equipment status" />
        : equipment.isError ? <ErrorState error={equipment.error} onRetry={() => void equipment.refetch()} />
        : rows.length === 0 ? <EmptyState title="No instruments to show." />
        : (
          <Table caption="Equipment status">
            <thead><tr><Th>Instrument</Th><Th>Facility</Th><Th>Status</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.equipment_id}>
                  <Td><span className="font-semibold">{e.name}</span><span className="block font-mono text-caption text-ink-muted">{e.code}</span></Td>
                  <Td title={FACILITY_NAME[e.facility]}>{e.facility}</Td>
                  <Td><EquipmentStatusBadge status={e.status} /></Td>
                  <Td className="text-right whitespace-nowrap">
                    <Button variant="ghost" size="sm" aria-label={`History of ${e.code}`} onClick={() => setDialog({ history: e })}>History</Button>
                    <Button variant="secondary" size="sm" aria-label={`Change status of ${e.code}`} onClick={() => setDialog({ status: e })}>Change status</Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      {dialog && 'status' in dialog && <ChangeStatusDialog equipment={dialog.status} onClose={() => setDialog(null)} />}
      {dialog && 'history' in dialog && (
        <Dialog open onOpenChange={(o) => !o && setDialog(null)} title={`Status history · ${dialog.history.code}`}>
          <StatusHistory equipmentId={dialog.history.equipment_id} />
        </Dialog>
      )}
    </div>
  );
}

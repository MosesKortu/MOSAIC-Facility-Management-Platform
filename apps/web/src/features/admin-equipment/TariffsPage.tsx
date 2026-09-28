import { MONEY_PATTERN, type SupportTariff } from '@mosaic/contracts';
import { useState } from 'react';
import { Alert } from '../../components/ui/alert.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Dialog } from '../../components/ui/dialog.tsx';
import { MoneyField } from '../../components/ui/money-field.tsx';
import { PageHeader } from '../../components/ui/page-header.tsx';
import { ErrorState } from '../../components/ui/states.tsx';
import { Table, Td, Th } from '../../components/ui/table.tsx';
import { TableSkeleton } from '../../components/ui/table-skeleton.tsx';
import { formatMoney } from '../../lib/format.ts';
import { useTariffs, useUpdateTariff } from '../equipment/api.ts';
import { SUPPORT_TIER_LABEL } from '../equipment/labels.ts';

/** /admin/tariffs — support tariffs added to the instrument rate (08 §22). */
export function TariffsPage() {
  const tariffs = useTariffs();
  const [editing, setEditing] = useState<SupportTariff | null>(null);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Support tariffs" description="Hourly surcharges for staff support during a session." />
      <Alert tone="info" title="Changes apply to new bookings only">Existing bookings keep the price calculated when they were made. Every change is recorded in the administrative audit.</Alert>
      {tariffs.isPending ? <TableSkeleton rows={3} label="tariffs" />
        : tariffs.isError ? <ErrorState error={tariffs.error} onRetry={() => void tariffs.refetch()} />
        : (
          <Table caption="Support tariffs">
            <thead><tr><Th>Support</Th><Th className="text-right">Per hour</Th><Th>New bookings</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
            <tbody>
              {tariffs.data.map((t) => (
                <tr key={t.tier}>
                  <Td className="font-semibold">{SUPPORT_TIER_LABEL[t.tier]}</Td>
                  <Td className="text-right font-mono">{formatMoney(t.rate_hourly)}</Td>
                  <Td>{t.is_available ? <Badge tone="success">Offered</Badge> : <Badge tone="neutral">Not offered</Badge>}</Td>
                  <Td className="text-right">
                    {t.tier === 'none'
                      ? <span className="text-caption text-ink-muted">Always free</span>
                      : <Button variant="ghost" size="sm" aria-label={`Edit ${SUPPORT_TIER_LABEL[t.tier]}`} onClick={() => setEditing(t)}>Edit</Button>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      {editing && <TariffDialog tariff={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function TariffDialog({ tariff, onClose }: { tariff: SupportTariff; onClose: () => void }) {
  const update = useUpdateTariff();
  const [rate, setRate] = useState(tariff.rate_hourly);
  const [available, setAvailable] = useState(tariff.is_available);
  const valid = MONEY_PATTERN.test(rate.trim());
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`Edit ${SUPPORT_TIER_LABEL[tariff.tier]}`}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button loading={update.isPending} disabled={!valid}
          onClick={() => update.mutate({ tier: tariff.tier, body: { rate_hourly: rate.trim(), is_available: available } }, { onSuccess: onClose })}>
          Save tariff
        </Button>
      </>}>
      <div className="flex flex-col gap-4">
        {update.error && <Alert tone="danger" title="The tariff was not changed">{update.error.message}</Alert>}
        <MoneyField label="Hourly rate" value={rate} onChange={(e) => setRate(e.target.value)} error={valid ? undefined : 'Enter an amount like 40.00'} />
        <label className="flex items-center gap-3 text-body">
          <input type="checkbox" checked={available} onChange={(e) => setAvailable(e.target.checked)} className="h-4 w-4 accent-pix-blue" />
          Offered for new bookings
        </label>
      </div>
    </Dialog>
  );
}

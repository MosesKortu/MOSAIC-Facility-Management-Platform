import { EQUIPMENT_STATUSES, type EquipmentStatus } from '@mosaic/contracts';
import { useState } from 'react';
import { Alert } from '../../components/ui/alert.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Dialog } from '../../components/ui/dialog.tsx';
import { TextAreaField } from '../../components/ui/field.tsx';
import { cn } from '../../lib/cn.ts';
import { useChangeStatus } from './api.ts';
import { EQUIPMENT_STATUS } from './labels.ts';

interface ChangeStatusDialogProps {
  equipment: { equipment_id: string; code: string; status: EquipmentStatus };
  onClose: () => void;
}

/** Operational status change (super user / admin). Owners of upcoming bookings are notified. */
export function ChangeStatusDialog({ equipment, onClose }: ChangeStatusDialogProps) {
  const change = useChangeStatus(equipment.equipment_id);
  const [status, setStatus] = useState<EquipmentStatus | null>(null);
  const [reason, setReason] = useState('');
  const [attempted, setAttempted] = useState(false);
  const reasonMissing = reason.trim() === '';

  if (change.isSuccess) {
    const affected = change.data.affected_bookings;
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()} title="Status changed" footer={<Button onClick={onClose}>Done</Button>}>
        <Alert tone="success" title={`${equipment.code} is now ${EQUIPMENT_STATUS[change.data.equipment.status].phrase}`}>
          {affected === 0
            ? 'No upcoming bookings were affected.'
            : `The owners of ${affected} upcoming booking${affected === 1 ? '' : 's'} have been notified. Nothing was cancelled — they or a super user can cancel if needed.`}
        </Alert>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`Change status of ${equipment.code}`}
      description="Upcoming bookings are kept; their owners are notified."
      footer={<>
        <Button variant="ghost" onClick={onClose} disabled={change.isPending}>Cancel</Button>
        <Button loading={change.isPending} disabled={!status}
          onClick={() => {
            setAttempted(true);
            if (status && !reasonMissing) change.mutate({ status, reason: reason.trim() });
          }}>Change status</Button>
      </>}>
      <div className="flex flex-col gap-4">
        {change.error && <Alert tone="danger" title="The status was not changed">{change.error.message}</Alert>}
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-body-sm font-semibold text-ink">New status</legend>
          {EQUIPMENT_STATUSES.filter((s) => s !== equipment.status).map((s) => (
            <label key={s} className={cn('flex cursor-pointer items-center gap-3 rounded-lg border-2 p-3',
              status === s ? 'border-pix-blue bg-surface-sunken' : 'border-line')}>
              <input type="radio" name="status" checked={status === s} onChange={() => setStatus(s)} className="accent-pix-blue" />
              <span className="font-semibold">{EQUIPMENT_STATUS[s].label}</span>
            </label>
          ))}
        </fieldset>
        <TextAreaField label="Reason" value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Chamber vacuum pump service — expected back 25 Sep"
          error={attempted && reasonMissing ? 'Give a reason — it is shown to affected users and kept in the history.' : undefined} />
      </div>
    </Dialog>
  );
}

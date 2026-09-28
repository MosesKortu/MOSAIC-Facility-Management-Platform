import type { AvailabilityWindow } from '@mosaic/contracts';
import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Alert } from '../../components/ui/alert.tsx';
import { Button } from '../../components/ui/button.tsx';
import { ApiError } from '../../lib/api.ts';
import { useReplaceAvailability } from '../equipment/api.ts';
import { WEEKDAYS } from '../equipment/labels.ts';

let nextKey = 0;
type EditableWindow = AvailabilityWindow & { key: number };
const withKey = (w: AvailabilityWindow): EditableWindow => ({ ...w, key: nextKey++ });

function overlapMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === 'WINDOW_OVERLAP' && typeof error.details.weekday === 'number') {
    return `${WEEKDAYS[error.details.weekday - 1]} has overlapping hours. Adjust them so they don't overlap.`;
  }
  return error instanceof Error ? error.message : 'The hours were not saved.';
}

/** Weekly bookable hours editor: the whole week is saved at once (replaces all windows). */
export function AvailabilityEditor({ equipmentId, windows }: { equipmentId: string; windows: AvailabilityWindow[] }) {
  const save = useReplaceAvailability(equipmentId);
  const [draft, setDraft] = useState<EditableWindow[]>(() => windows.map(withKey));

  const edit = (key: number, change: Partial<AvailabilityWindow>) => {
    save.reset();
    setDraft((current) => current.map((w) => (w.key === key ? { ...w, ...change } : w)));
  };
  const add = (weekday: number) => {
    save.reset();
    setDraft((current) => [...current, withKey({ weekday, opens_at: '09:00', closes_at: '17:00' })]);
  };
  const remove = (key: number) => {
    save.reset();
    setDraft((current) => current.filter((w) => w.key !== key));
  };

  return (
    <div className="flex flex-col gap-3">
      {save.isError && <Alert tone="danger" title="The hours were not saved">{overlapMessage(save.error)}</Alert>}
      {save.isSuccess && <Alert tone="success" title="Weekly hours saved." />}
      <ul className="flex flex-col divide-y divide-line rounded-xl border border-line bg-surface">
        {WEEKDAYS.map((day, index) => {
          const weekday = index + 1;
          const today = draft.filter((w) => w.weekday === weekday);
          return (
            <li key={day} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="w-28 font-semibold">{day}</span>
              <div className="flex flex-1 flex-wrap items-center gap-2">
                {today.length === 0 && <span className="text-body-sm text-ink-muted">Closed</span>}
                {today.map((w) => (
                  <span key={w.key} className="flex items-center gap-1 rounded-lg border border-line px-2 py-1">
                    <input type="time" step={900} aria-label={`${day} opens`} value={w.opens_at} onChange={(e) => edit(w.key, { opens_at: e.target.value })}
                      className="font-mono text-body-sm outline-none" />
                    <span aria-hidden>–</span>
                    <input type="time" step={900} aria-label={`${day} closes`} value={w.closes_at} onChange={(e) => edit(w.key, { closes_at: e.target.value })}
                      className="font-mono text-body-sm outline-none" />
                    <button type="button" aria-label={`Remove ${day} ${w.opens_at}–${w.closes_at}`} onClick={() => remove(w.key)}
                      className="rounded p-1 text-ink-muted hover:bg-surface-sunken"><X aria-hidden className="h-3.5 w-3.5" /></button>
                  </span>
                ))}
              </div>
              <Button variant="ghost" size="sm" aria-label={`Add hours on ${day}`} onClick={() => add(weekday)}><Plus aria-hidden className="h-4 w-4" /> Add</Button>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-between gap-3">
        <p className="text-caption text-ink-muted">Times are facility local time, on quarter hours. Existing bookings are not changed.</p>
        <Button loading={save.isPending}
          onClick={() => save.mutate({ windows: [...draft].sort((a, b) => a.weekday - b.weekday).map(({ key: _key, ...w }) => w) })}>
          Save hours
        </Button>
      </div>
    </div>
  );
}

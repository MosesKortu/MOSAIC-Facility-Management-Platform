import { cn } from '../../lib/cn.ts';

const TONES = { primary: 'bg-pix-blue', success: 'bg-status-operational', warning: 'bg-pix-yellow', danger: 'bg-status-offline' } as const;

interface ProgressProps {
  /** 0–1; values outside are clamped for display only. */
  value: number;
  /** Always pair the bar with the exact text it represents (04_DESIGN_SYSTEM.md §4). */
  label: string;
  tone?: keyof typeof TONES;
}

export function Progress({ value, label, tone = 'primary' }: ProgressProps) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className="flex flex-col gap-1">
      <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={label}
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
        <div className={cn('h-full rounded-full', TONES[tone])} style={{ width: `${percent}%` }} />
      </div>
      <span className="text-caption text-ink-muted">{label}</span>
    </div>
  );
}

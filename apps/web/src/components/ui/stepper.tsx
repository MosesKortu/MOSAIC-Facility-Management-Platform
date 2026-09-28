import { Check } from 'lucide-react';
import { cn } from '../../lib/cn.ts';

export interface Step {
  label: string;
  state: 'complete' | 'current' | 'upcoming' | 'error';
}

/** Horizontal progress through a sequential workflow (04_DESIGN_SYSTEM.md §4 Stepper). */
export function Stepper({ label, steps }: { label: string; steps: Step[] }) {
  return (
    <ol aria-label={label} className="flex flex-wrap items-center gap-x-2 gap-y-3">
      {steps.map((step, index) => (
        <li key={step.label} aria-current={step.state === 'current' ? 'step' : undefined} className="flex items-center gap-2">
          <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-caption font-bold', {
            complete: 'bg-status-operational text-white',
            current: 'bg-pix-yellow text-pix-blue',
            upcoming: 'bg-surface-sunken text-ink-muted',
            error: 'bg-danger text-white',
          }[step.state])}>
            {step.state === 'complete' ? <Check aria-hidden className="h-4 w-4" /> : index + 1}
          </span>
          <span className={cn('text-body-sm', step.state === 'current' ? 'font-semibold text-ink' : 'text-ink-muted')}>
            {step.label}
            <span className="sr-only"> ({step.state === 'complete' ? 'done' : step.state === 'current' ? 'current step' : step.state === 'error' ? 'needs attention' : 'not started'})</span>
          </span>
          {index < steps.length - 1 && <span aria-hidden className="mx-1 h-px w-6 bg-line" />}
        </li>
      ))}
    </ol>
  );
}

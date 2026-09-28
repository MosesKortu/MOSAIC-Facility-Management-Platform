import type { ReactNode } from 'react';
import { cn } from '../../lib/cn.ts';

const TONES = {
  neutral: 'bg-surface-sunken text-ink-muted',
  info: 'bg-pix-blue-10 text-pix-blue',
  success: 'bg-success-surface text-success',
  warning: 'bg-warning-surface text-warning-ink',
  danger: 'bg-danger-surface text-danger',
} as const;

export type BadgeTone = keyof typeof TONES;

/** Status pill: always carries text, never colour alone. */
export function Badge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap', TONES[tone])}>{children}</span>;
}

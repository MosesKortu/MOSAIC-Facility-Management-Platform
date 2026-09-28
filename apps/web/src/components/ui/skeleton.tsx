import { cn } from '../../lib/cn.ts';

/** Placeholder shaped by the caller to match the content it stands in for. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-lg bg-surface-sunken', className)} />;
}

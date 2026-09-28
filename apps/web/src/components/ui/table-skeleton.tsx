import { Skeleton } from './skeleton.tsx';

/** Loading placeholder shaped like a data table. */
export function TableSkeleton({ rows = 6, label }: { rows?: number; label: string }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
      <span className="sr-only">Loading {label}…</span>
      <Skeleton className="h-6 w-full" />
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-10 w-full" />)}
    </div>
  );
}

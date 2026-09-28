import { FileQuestion, Inbox, Lock, RefreshCw, WifiOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ApiError } from '../../lib/api.ts';
import { Button } from './button.tsx';
import { Skeleton } from './skeleton.tsx';

function Panel({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
      <div className="text-ink-muted">{icon}</div>
      <h2 className="font-title text-title-md text-ink">{title}</h2>
      {children}
    </div>
  );
}

/** Page-level loading: announced once, shaped like a typical page header and body. */
export function PageLoading({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="flex flex-col gap-4 p-6">
      <span className="sr-only">{label}…</span>
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <Panel icon={<Inbox aria-hidden className="h-8 w-8" />} title={title}>
      {children && <p className="text-body text-ink-muted">{children}</p>}
      {action}
    </Panel>
  );
}

/** What failed, whether shown data may be stale, how to retry, and a reference for support. */
export function ErrorState({ error, onRetry, stale = false }: { error: unknown; onRetry?: () => void; stale?: boolean }) {
  const apiError = error instanceof ApiError ? error : undefined;
  const offline = apiError?.code === 'NETWORK_ERROR';
  return (
    <Panel
      icon={offline ? <WifiOff aria-hidden className="h-8 w-8" /> : <RefreshCw aria-hidden className="h-8 w-8" />}
      title={offline ? 'MOSAIC is unreachable' : 'This could not be loaded'}
    >
      <p className="text-body text-ink-muted">
        {apiError?.message ?? 'Something went wrong.'}
        {stale && ' The information shown may be out of date.'}
      </p>
      {onRetry && <Button variant="secondary" onClick={onRetry}>Try again</Button>}
      {apiError?.requestId && (
        <p className="text-caption text-ink-muted">
          If this keeps happening, contact facility support with reference <span className="font-mono">{apiError.requestId}</span>.
        </p>
      )}
    </Panel>
  );
}

export function PermissionDenied({ what = 'this page' }: { what?: string }) {
  return (
    <Panel icon={<Lock aria-hidden className="h-8 w-8" />} title="You don't have access">
      <p className="text-body text-ink-muted">You don't have permission to view {what}. If you think you should, ask a facility administrator.</p>
      <Link to="/" className="font-semibold text-pix-blue hover:underline">Go to your home page</Link>
    </Panel>
  );
}

export function NotFound({ what = 'page' }: { what?: string }) {
  return (
    <Panel icon={<FileQuestion aria-hidden className="h-8 w-8" />} title={`This ${what} doesn't exist`}>
      <p className="text-body text-ink-muted">It may have been removed or deactivated, or the link may be wrong.</p>
      <Link to="/" className="font-semibold text-pix-blue hover:underline">Go to your home page</Link>
    </Panel>
  );
}

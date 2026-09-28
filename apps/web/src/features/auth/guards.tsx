import type { Role } from '@mosaic/contracts';
import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { Alert } from '../../components/ui/alert.tsx';
import { ErrorState, PageLoading, PermissionDenied } from '../../components/ui/states.tsx';
import { ApiError } from '../../lib/api.ts';
import { useSession } from './api.ts';

/** Route layout that requires a signed-in, active user. */
export function RequireSession() {
  const session = useSession();
  const location = useLocation();

  if (session.isPending) return <PageLoading label="Checking your session" />;
  if (session.isError) {
    if (session.error instanceof ApiError && session.error.code === 'USER_INACTIVE') {
      return (
        <div className="mx-auto max-w-lg p-6">
          <Alert tone="danger" title="Your account is deactivated">
            Contact a facility administrator if you need access to MOSAIC again.
          </Alert>
        </div>
      );
    }
    return <ErrorState error={session.error} onRetry={() => void session.refetch()} />;
  }
  if (!session.data) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return <Outlet />;
}

/**
 * Renders children only for the listed roles. Other roles see a permission explanation; the
 * protected content (and its data queries) never mount. The API enforces the same rule independently.
 */
export function RequireRole({ roles, what, children }: { roles: readonly Role[]; what: string; children: ReactNode }) {
  const { data: user } = useSession();
  if (!user || !roles.includes(user.role)) return <PermissionDenied what={what} />;
  return children;
}

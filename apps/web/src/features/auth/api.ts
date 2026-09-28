import type { SessionUser } from '@mosaic/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiFetch } from '../../lib/api.ts';

export const SESSION_KEY = ['session'] as const;

/**
 * The signed-in user, or null when signed out. Every other error (deactivated account, network)
 * surfaces as an error so guards can explain it rather than bouncing to login.
 */
export function useSession() {
  return useQuery({
    queryKey: SESSION_KEY,
    queryFn: async ({ signal }) => {
      try {
        return await apiFetch<SessionUser>('/auth/me', { signal });
      } catch (error) {
        if (error instanceof ApiError && error.code === 'UNAUTHENTICATED') return null;
        throw error;
      }
    },
    staleTime: 30_000,
  });
}

export function useDevLogin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (email: string) => apiFetch<SessionUser>('/auth/dev-login', { method: 'POST', body: { email } }),
    onSuccess: (user) => client.setQueryData(SESSION_KEY, user),
  });
}

export function useLogout() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<void>('/auth/logout', { method: 'POST' }),
    // Drop every cached query: nothing from the previous session may leak into the next one.
    onSuccess: () => {
      client.clear();
      client.setQueryData(SESSION_KEY, null);
    },
  });
}

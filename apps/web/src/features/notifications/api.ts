import type { Notification, NotificationListQuery, Page } from '@mosaic/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api.ts';
import { toQueryString } from '../../lib/query-string.ts';

export const notificationKeys = {
  list: (query: NotificationListQuery) => ['notifications', 'list', query] as const,
  unreadCount: ['notifications', 'unread-count'] as const,
};

export function useNotifications(query: NotificationListQuery) {
  return useQuery({
    queryKey: notificationKeys.list(query),
    queryFn: ({ signal }) => apiFetch<Page<Notification>>(`/notifications${toQueryString(query)}`, { signal }),
  });
}

/** Unread total for the top-bar bell: one row requested, `total` is the count. Polls while the tab is open. */
export function useUnreadCount() {
  return useQuery({
    queryKey: notificationKeys.unreadCount,
    queryFn: async ({ signal }) =>
      (await apiFetch<Page<Notification>>(`/notifications${toQueryString({ unread_only: 'true', limit: 1 })}`, { signal })).total,
    refetchInterval: 60_000,
  });
}

function useInvalidateNotifications() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: ['notifications'] });
}

export function useMarkRead() {
  const invalidate = useInvalidateNotifications();
  return useMutation({
    mutationFn: (notificationId: string) => apiFetch<Notification>(`/notifications/${notificationId}/read`, { method: 'PATCH' }),
    onSuccess: () => invalidate(),
  });
}

export function useMarkAllRead() {
  const invalidate = useInvalidateNotifications();
  return useMutation({
    mutationFn: () => apiFetch<{ updated: number }>('/notifications/read-all', { method: 'POST' }),
    onSuccess: () => invalidate(),
  });
}

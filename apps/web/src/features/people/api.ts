import type { CreateUserBody, Page, UpdateUserBody, UserDetail, UserListQuery, UserSummary } from '@mosaic/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api.ts';
import { toQueryString } from '../../lib/query-string.ts';
import { SESSION_KEY } from '../auth/api.ts';

export const peopleKeys = {
  all: ['admin', 'users'] as const,
  list: (query: UserListQuery) => ['admin', 'users', 'list', query] as const,
  detail: (id: string) => ['admin', 'users', 'detail', id] as const,
};

export function useUsers(query: UserListQuery) {
  return useQuery({
    queryKey: peopleKeys.list(query),
    queryFn: ({ signal }) => apiFetch<Page<UserSummary>>(`/admin/users${toQueryString(query)}`, { signal }),
    placeholderData: keepPreviousData, // keep the table while paging/filtering instead of flashing a skeleton
  });
}

export function useUser(userId: string) {
  return useQuery({
    queryKey: peopleKeys.detail(userId),
    queryFn: ({ signal }) => apiFetch<UserDetail>(`/admin/users/${userId}`, { signal }),
  });
}

export function useCreateUser() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateUserBody) => apiFetch<UserDetail>('/admin/users', { method: 'POST', body }),
    onSuccess: () => client.invalidateQueries({ queryKey: peopleKeys.all }),
  });
}

export function useUpdateUser(userId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateUserBody) => apiFetch<UserDetail>(`/admin/users/${userId}`, { method: 'PATCH', body }),
    onSuccess: async (user) => {
      client.setQueryData(peopleKeys.detail(userId), user);
      await Promise.all([
        client.invalidateQueries({ queryKey: peopleKeys.all }),
        client.invalidateQueries({ queryKey: ['admin', 'groups'] }), // member lists show names/roles
        client.invalidateQueries({ queryKey: SESSION_KEY }),
        client.invalidateQueries({ queryKey: ['audit'] }),
      ]);
    },
  });
}

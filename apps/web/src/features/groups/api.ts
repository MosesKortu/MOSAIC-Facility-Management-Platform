import type { CreateGroupBody, GroupDetail, GroupListQuery, GroupSummary, Page, UpdateGroupBody } from '@mosaic/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api.ts';
import { toQueryString } from '../../lib/query-string.ts';
import { peopleKeys } from '../people/api.ts';

export const groupKeys = {
  all: ['admin', 'groups'] as const,
  list: (query: GroupListQuery) => ['admin', 'groups', 'list', query] as const,
  detail: (id: string) => ['admin', 'groups', 'detail', id] as const,
};

export function useGroups(query: GroupListQuery) {
  return useQuery({
    queryKey: groupKeys.list(query),
    queryFn: ({ signal }) => apiFetch<Page<GroupSummary>>(`/admin/groups${toQueryString(query)}`, { signal }),
    placeholderData: keepPreviousData,
  });
}

export function useGroup(groupId: string) {
  return useQuery({
    queryKey: groupKeys.detail(groupId),
    queryFn: ({ signal }) => apiFetch<GroupDetail>(`/admin/groups/${groupId}`, { signal }),
  });
}

/** A group change can alter member lists, user group chips and funding access shown elsewhere. */
async function afterGroupChange(client: QueryClient, group: GroupDetail) {
  client.setQueryData(groupKeys.detail(group.group_id), group);
  await Promise.all([
    client.invalidateQueries({ queryKey: groupKeys.all }),
    client.invalidateQueries({ queryKey: peopleKeys.all }),
    client.invalidateQueries({ queryKey: ['audit'] }),
  ]);
}

export function useCreateGroup() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateGroupBody) => apiFetch<GroupDetail>('/admin/groups', { method: 'POST', body }),
    onSuccess: (group) => afterGroupChange(client, group),
  });
}

export function useUpdateGroup(groupId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateGroupBody) => apiFetch<GroupDetail>(`/admin/groups/${groupId}`, { method: 'PATCH', body }),
    onSuccess: (group) => afterGroupChange(client, group),
  });
}

export function useMembership() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, userId, action }: { groupId: string; userId: string; action: 'add' | 'remove' }) =>
      apiFetch<GroupDetail>(`/admin/groups/${groupId}/members/${userId}`, { method: action === 'add' ? 'PUT' : 'DELETE' }),
    onSuccess: (group) => afterGroupChange(client, group),
  });
}

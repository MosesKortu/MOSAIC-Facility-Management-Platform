import type {
  AllocationListQuery, AllocationRow, CreateAllocationBody, CreateGrantBody, GrantDetail, GrantListQuery, GrantSummary, Page,
  UpdateAllocationBody, UpdateGrantBody,
} from '@mosaic/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api.ts';
import { toQueryString } from '../../lib/query-string.ts';

export const grantKeys = {
  all: ['admin', 'grants'] as const,
  list: (query: GrantListQuery) => ['admin', 'grants', 'list', query] as const,
  detail: (id: string) => ['admin', 'grants', 'detail', id] as const,
  allocations: (query: AllocationListQuery) => ['admin', 'grants', 'allocations', query] as const,
};

export function useGrants(query: GrantListQuery) {
  return useQuery({
    queryKey: grantKeys.list(query),
    queryFn: ({ signal }) => apiFetch<Page<GrantSummary>>(`/admin/grants${toQueryString(query)}`, { signal }),
    placeholderData: keepPreviousData,
  });
}

export function useGrant(grantId: string) {
  return useQuery({
    queryKey: grantKeys.detail(grantId),
    queryFn: ({ signal }) => apiFetch<GrantDetail>(`/admin/grants/${grantId}`, { signal }),
  });
}

export function useAllocations(query: AllocationListQuery) {
  return useQuery({
    queryKey: grantKeys.allocations(query),
    queryFn: ({ signal }) => apiFetch<Page<AllocationRow>>(`/admin/grant-allocations${toQueryString(query)}`, { signal }),
    placeholderData: keepPreviousData,
  });
}

/** Funding changes show up on grants, groups (funding totals) and people (funding access). */
function invalidateFunding(client: QueryClient) {
  return Promise.all([
    client.invalidateQueries({ queryKey: grantKeys.all }),
    client.invalidateQueries({ queryKey: ['admin', 'groups'] }),
    client.invalidateQueries({ queryKey: ['admin', 'users'] }),
    client.invalidateQueries({ queryKey: ['audit'] }),
  ]);
}

export function useCreateGrant() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateGrantBody) => apiFetch<GrantDetail>('/admin/grants', { method: 'POST', body }),
    onSuccess: () => invalidateFunding(client),
  });
}

export function useUpdateGrant(grantId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateGrantBody) => apiFetch<GrantDetail>(`/admin/grants/${grantId}`, { method: 'PATCH', body }),
    onSuccess: (grant) => {
      client.setQueryData(grantKeys.detail(grantId), grant);
      return invalidateFunding(client);
    },
  });
}

export function useCreateAllocation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateAllocationBody) => apiFetch<AllocationRow>('/admin/grant-allocations', { method: 'POST', body }),
    onSuccess: () => invalidateFunding(client),
  });
}

export function useUpdateAllocation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ allocationId, body }: { allocationId: string; body: UpdateAllocationBody }) =>
      apiFetch<AllocationRow>(`/admin/grant-allocations/${allocationId}`, { method: 'PATCH', body }),
    onSuccess: () => invalidateFunding(client),
  });
}

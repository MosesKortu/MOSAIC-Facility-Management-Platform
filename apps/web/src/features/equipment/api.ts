import type {
  AdminEquipment, AdminEquipmentListQuery, AvailabilityBody, ChangeStatusBody, CreateEquipmentBody, EquipmentDetail,
  EquipmentListQuery, EquipmentSummary, Page, StatusChangeResult, StatusEvent, SupportTariff, SupportTier, UpdateEquipmentBody,
  UpdateTariffBody,
} from '@mosaic/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api.ts';
import { toQueryString } from '../../lib/query-string.ts';

export const equipmentKeys = {
  all: ['equipment'] as const,
  list: (query: EquipmentListQuery) => ['equipment', 'list', query] as const,
  detail: (id: string) => ['equipment', 'detail', id] as const,
  events: (id: string) => ['equipment', 'events', id] as const,
  admin: (query: AdminEquipmentListQuery) => ['equipment', 'admin', query] as const,
  adminDetail: (id: string) => ['equipment', 'admin-detail', id] as const,
  tariffs: ['tariffs'] as const,
};

export function useEquipmentList(query: EquipmentListQuery) {
  return useQuery({
    queryKey: equipmentKeys.list(query),
    queryFn: ({ signal }) => apiFetch<Page<EquipmentSummary>>(`/equipment${toQueryString(query)}`, { signal }),
    placeholderData: keepPreviousData,
  });
}

export function useEquipment(equipmentId: string) {
  return useQuery({
    queryKey: equipmentKeys.detail(equipmentId),
    queryFn: ({ signal }) => apiFetch<EquipmentDetail>(`/equipment/${equipmentId}`, { signal }),
  });
}

export function useStatusEvents(equipmentId: string) {
  return useQuery({
    queryKey: equipmentKeys.events(equipmentId),
    queryFn: ({ signal }) => apiFetch<StatusEvent[]>(`/equipment/${equipmentId}/status-events`, { signal }),
  });
}

/** Everything equipment-related is invalidated together: status, config and windows show up in every view. */
function useInvalidateEquipment() {
  const client = useQueryClient();
  return () => Promise.all([
    client.invalidateQueries({ queryKey: equipmentKeys.all }),
    client.invalidateQueries({ queryKey: ['audit'] }),
  ]);
}

export function useChangeStatus(equipmentId: string) {
  const invalidate = useInvalidateEquipment();
  return useMutation({
    mutationFn: (body: ChangeStatusBody) => apiFetch<StatusChangeResult>(`/equipment/${equipmentId}/status`, { method: 'PATCH', body }),
    onSuccess: () => invalidate(),
  });
}

export function useAdminEquipmentList(query: AdminEquipmentListQuery) {
  return useQuery({
    queryKey: equipmentKeys.admin(query),
    queryFn: ({ signal }) => apiFetch<Page<AdminEquipment>>(`/admin/equipment${toQueryString(query)}`, { signal }),
    placeholderData: keepPreviousData,
  });
}

export function useAdminEquipment(equipmentId: string) {
  return useQuery({
    queryKey: equipmentKeys.adminDetail(equipmentId),
    queryFn: ({ signal }) => apiFetch<AdminEquipment>(`/admin/equipment/${equipmentId}`, { signal }),
  });
}

export function useCreateEquipment() {
  const invalidate = useInvalidateEquipment();
  return useMutation({
    mutationFn: (body: CreateEquipmentBody) => apiFetch<AdminEquipment>('/admin/equipment', { method: 'POST', body }),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateEquipment(equipmentId: string) {
  const invalidate = useInvalidateEquipment();
  return useMutation({
    mutationFn: (body: UpdateEquipmentBody) => apiFetch<AdminEquipment>(`/admin/equipment/${equipmentId}`, { method: 'PATCH', body }),
    onSuccess: () => invalidate(),
  });
}

export function useReplaceAvailability(equipmentId: string) {
  const invalidate = useInvalidateEquipment();
  return useMutation({
    mutationFn: (body: AvailabilityBody) => apiFetch<AdminEquipment>(`/admin/equipment/${equipmentId}/availability`, { method: 'PUT', body }),
    onSuccess: () => invalidate(),
  });
}

export function useTariffs() {
  return useQuery({ queryKey: equipmentKeys.tariffs, queryFn: ({ signal }) => apiFetch<SupportTariff[]>('/admin/tariffs', { signal }) });
}

export function useUpdateTariff() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ tier, body }: { tier: SupportTier; body: UpdateTariffBody }) =>
      apiFetch<SupportTariff>(`/admin/tariffs/${tier}`, { method: 'PATCH', body }),
    onSuccess: () => Promise.all([
      client.invalidateQueries({ queryKey: equipmentKeys.tariffs }),
      client.invalidateQueries({ queryKey: equipmentKeys.all }), // equipment detail shows tariffs
      client.invalidateQueries({ queryKey: ['audit'] }),
    ]),
  });
}

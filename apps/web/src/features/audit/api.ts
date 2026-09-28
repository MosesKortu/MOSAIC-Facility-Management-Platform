import type { AuditEntry, AuditListQuery, Page } from '@mosaic/contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api.ts';
import { toQueryString } from '../../lib/query-string.ts';

/** Administrative audit read (admin). The auditor's full audit view arrives with analytics. */
export function useAdminAudit(query: AuditListQuery) {
  return useQuery({
    queryKey: ['audit', 'admin', query],
    queryFn: ({ signal }) => apiFetch<Page<AuditEntry>>(`/admin/audit${toQueryString(query)}`, { signal }),
    placeholderData: keepPreviousData,
  });
}

import { useCallback } from 'react';
import { useSearchParams } from 'react-router';

/**
 * URL-backed filters: every list view is deep-linkable and survives reloads. Changing any filter
 * other than `offset` returns to the first page.
 */
export function useUrlFilters() {
  const [params, setParams] = useSearchParams();
  const update = useCallback((changes: Record<string, string | null>) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      if (!('offset' in changes)) next.delete('offset');
      return next;
    });
  }, [setParams]);
  const offset = Math.max(0, Number(params.get('offset')) || 0);
  return { params, update, offset };
}

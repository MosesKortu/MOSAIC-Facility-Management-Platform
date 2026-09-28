import { z } from 'zod';

/** Server-side paging for every list endpoint (03_API_SPEC.md §0.2). */
export const PageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  order: z.enum(['asc', 'desc']).default('asc'),
});

/**
 * Client-side parameters for a list endpoint: the schema's input with numeric paging (coerce
 * schemas type their input as unknown, which is too loose for callers).
 */
export type ListParams<S extends z.ZodType> = Omit<z.input<S>, 'limit' | 'offset'> & { limit?: number; offset?: number };

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

/** Optional boolean query flag: "true" / "false" strings, absent = no filter. */
export const QueryBoolean = z.enum(['true', 'false']).transform((v) => v === 'true');

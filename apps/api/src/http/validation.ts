import type { z } from 'zod';
import { DomainError } from './errors.ts';

/**
 * Validates untrusted input (body, query, params) at the route edge. Failure becomes a single
 * VALIDATION_FAILED error listing every issue with its dotted field path.
 */
export function parseWith<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw new DomainError('VALIDATION_FAILED', 'The request is invalid', {
    issues: result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
  });
}

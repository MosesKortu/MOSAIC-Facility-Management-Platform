import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError } from './api.ts';

/**
 * Puts a server rejection on the field it is about, so the user sees it where they can fix it.
 * `codeFields` maps error codes that concern one field (e.g. INVALID_SPONSOR → sponsor_user_id).
 * Returns the message to show at form level when no field matches, otherwise null.
 */
export function applyApiError<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
  codeFields: Partial<Record<string, Path<T>>> = {},
): string | null {
  if (!(error instanceof ApiError)) return 'Something went wrong. Please try again.';
  const known = (name: unknown): name is Path<T> => typeof name === 'string' && (fields as readonly string[]).includes(name);

  if (error.code === 'DUPLICATE' && known(error.details.field)) {
    setError(error.details.field, { message: error.message });
    return null;
  }
  if (error.code === 'VALIDATION_FAILED' && Array.isArray(error.details.issues)) {
    let matched = false;
    for (const issue of error.details.issues as { path: string; message: string }[]) {
      if (known(issue.path)) {
        setError(issue.path, { message: issue.message });
        matched = true;
      }
    }
    if (matched) return null;
  }
  const field = codeFields[error.code];
  if (field) {
    setError(field, { message: error.message });
    return null;
  }
  return error.message;
}

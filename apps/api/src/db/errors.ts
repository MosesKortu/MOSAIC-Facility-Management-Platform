import { DomainError } from '../http/errors.ts';

// Unique constraints and the API field each one protects (03_API_SPEC.md DUPLICATE details.field).
const UNIQUE_FIELDS: Record<string, string> = {
  users_email_key: 'email',
  users_sso_identifier_key: 'sso_identifier',
  groups_name_unique_active: 'name',
  grants_grant_code_key: 'grant_code',
  equipment_code_key: 'code',
  grant_group_allocations_grant_id_group_id_key: 'group_id',
};

/**
 * Converts a Postgres unique violation on a known constraint into DUPLICATE; rethrows anything else.
 * Relying on the constraint (not a pre-check) is race-free.
 */
export function rethrowUniqueViolation(error: unknown): never {
  const pgError = error as { code?: string; constraint?: string };
  const field = pgError.code === '23505' && pgError.constraint ? UNIQUE_FIELDS[pgError.constraint] : undefined;
  if (field) throw new DomainError('DUPLICATE', `This ${field.replaceAll('_', ' ')} is already in use`, { field });
  throw error;
}

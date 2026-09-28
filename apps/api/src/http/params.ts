import { DomainError } from './errors.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Path ids: anything that is not a UUID cannot name an entity, so it is simply not found. */
export function parseId(params: unknown, key: string, entity: string): string {
  const value = (params as Record<string, unknown> | undefined)?.[key];
  if (typeof value !== 'string' || !UUID.test(value)) throw notFound(entity);
  return value;
}

export function notFound(entity: string): DomainError {
  return new DomainError('NOT_FOUND', `This ${entity} does not exist`, { entity });
}

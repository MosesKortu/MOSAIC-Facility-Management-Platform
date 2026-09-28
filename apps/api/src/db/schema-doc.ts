import path from 'node:path';
import { loadMigrations } from './migrations.ts';

/** docs/02_SCHEMA.sql is generated from the up-migrations so the reference doc cannot drift. */
export const SCHEMA_DOC_PATH = path.resolve(import.meta.dirname, '../../../../docs/02_SCHEMA.sql');

export async function renderSchemaDoc(migrationsDir: string): Promise<string> {
  const migrations = await loadMigrations(migrationsDir);
  const header = [
    '-- MOSAIC reference schema (PostgreSQL 16+) — GENERATED, do not edit.',
    '-- Source of truth: apps/api/migrations/*.up.sql. Regenerate with `pnpm schema:doc`;',
    '-- a test fails if this file is out of date.',
    '',
  ].join('\n');
  return header + migrations.map((m) => `\n-- ═══ ${m.id} ═══\n${m.up.trimEnd()}\n`).join('');
}

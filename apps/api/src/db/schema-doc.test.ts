import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR } from './migrations.ts';
import { SCHEMA_DOC_PATH, renderSchemaDoc } from './schema-doc.ts';

describe('docs/02_SCHEMA.sql', () => {
  it('matches the migrations (run `pnpm schema:doc` to regenerate)', async () => {
    expect(await readFile(SCHEMA_DOC_PATH, 'utf8')).toBe(await renderSchemaDoc(MIGRATIONS_DIR));
  });
});

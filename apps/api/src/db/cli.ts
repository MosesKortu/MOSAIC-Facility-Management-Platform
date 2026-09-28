import { writeFile } from 'node:fs/promises';
import { MIGRATIONS_DIR, migrateDown, migrateUp } from './migrations.ts';
import { createPool } from './pool.ts';
import { SCHEMA_DOC_PATH, renderSchemaDoc } from './schema-doc.ts';

// Usage: node src/db/cli.ts up | down [steps] | doc
const [command, arg] = process.argv.slice(2);

if (command === 'doc') {
  await writeFile(SCHEMA_DOC_PATH, await renderSchemaDoc(MIGRATIONS_DIR));
  console.log(`Wrote ${SCHEMA_DOC_PATH}`);
} else if (command === 'up' || command === 'down') {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const pool = createPool(url);
  try {
    const ids = command === 'up' ? await migrateUp(pool, MIGRATIONS_DIR) : await migrateDown(pool, MIGRATIONS_DIR, Number(arg ?? 1));
    console.log(ids.length ? `${command}: ${ids.join(', ')}` : `${command}: nothing to do`);
  } finally {
    await pool.end();
  }
} else {
  console.error('Usage: cli.ts up | down [steps] | doc');
  process.exitCode = 1;
}

import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type pg from 'pg';

/**
 * Minimal forward/backward migration runner over plain SQL files (09_ARCHITECTURE.md §3).
 *
 * Layout: `NNNN_name.up.sql` + `NNNN_name.down.sql`. Each migration runs in its own transaction, so a
 * failure leaves the database at the previous version. A session advisory lock prevents two
 * processes migrating at once. Applied files are checksummed: editing a migration after it ran is
 * refused — write a new migration instead.
 */

export const MIGRATIONS_DIR = path.resolve(import.meta.dirname, '../../migrations');

const FILE_PATTERN = /^(\d{4})_([a-z0-9_]+)\.(up|down)\.sql$/;
const LOCK_KEY = 72_616_001; // arbitrary constant identifying the MOSAIC migration lock

export interface Migration {
  id: string; // e.g. "0001_initial_schema"
  up: string;
  down: string;
  checksum: string;
}

export async function loadMigrations(dir: string): Promise<Migration[]> {
  const byId = new Map<string, { up?: string; down?: string }>();
  for (const file of (await readdir(dir)).sort()) {
    const match = FILE_PATTERN.exec(file);
    if (!match) continue;
    const id = `${match[1]}_${match[2]}`;
    const entry = byId.get(id) ?? {};
    entry[match[3] as 'up' | 'down'] = await readFile(path.join(dir, file), 'utf8');
    byId.set(id, entry);
  }
  return [...byId.entries()].map(([id, { up, down }]) => {
    if (up === undefined || down === undefined) {
      throw new Error(`Migration ${id} must have both an up and a down file`);
    }
    return { id, up, down, checksum: createHash('sha256').update(up).digest('hex') };
  });
}

export async function pendingMigrations(pool: pg.Pool, dir: string): Promise<Migration[]> {
  return withMigrationLock(pool, async (client) => {
    const { pending } = await plan(client, await loadMigrations(dir));
    return pending;
  });
}

/** Applies all pending migrations; returns the ids applied. */
export async function migrateUp(pool: pg.Pool, dir: string): Promise<string[]> {
  const migrations = await loadMigrations(dir);
  return withMigrationLock(pool, async (client) => {
    const { pending } = await plan(client, migrations);
    for (const migration of pending) {
      await runInTransaction(client, migration.id, async () => {
        await client.query(migration.up);
        await client.query('INSERT INTO schema_migrations (id, checksum) VALUES ($1, $2)', [
          migration.id,
          migration.checksum,
        ]);
      });
    }
    return pending.map((m) => m.id);
  });
}

/** Reverts the `steps` most recently applied migrations; returns the ids reverted. */
export async function migrateDown(pool: pg.Pool, dir: string, steps = 1): Promise<string[]> {
  const migrations = new Map((await loadMigrations(dir)).map((m) => [m.id, m]));
  return withMigrationLock(pool, async (client) => {
    await ensureTable(client);
    const { rows } = await client.query<{ id: string }>(
      'SELECT id FROM schema_migrations ORDER BY id DESC LIMIT $1',
      [steps],
    );
    for (const { id } of rows) {
      const migration = migrations.get(id);
      if (!migration) throw new Error(`Applied migration ${id} has no files; cannot roll back`);
      await runInTransaction(client, id, async () => {
        await client.query(migration.down);
        await client.query('DELETE FROM schema_migrations WHERE id = $1', [id]);
      });
    }
    return rows.map((r) => r.id);
  });
}

async function plan(client: pg.PoolClient, migrations: Migration[]) {
  await ensureTable(client);
  const { rows } = await client.query<{ id: string; checksum: string }>(
    'SELECT id, checksum FROM schema_migrations',
  );
  const applied = new Map(rows.map((r) => [r.id, r.checksum]));
  for (const migration of migrations) {
    const checksum = applied.get(migration.id);
    if (checksum !== undefined && checksum !== migration.checksum) {
      throw new Error(`Migration ${migration.id} changed after it was applied; add a new migration instead`);
    }
  }
  return { pending: migrations.filter((m) => !applied.has(m.id)) };
}

async function ensureTable(client: pg.PoolClient) {
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    checksum TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
}

async function runInTransaction(client: pg.PoolClient, id: string, work: () => Promise<void>) {
  try {
    await client.query('BEGIN');
    await work();
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw new Error(`Migration ${id} failed: ${(error as Error).message}`, { cause: error });
  }
}

async function withMigrationLock<T>(pool: pg.Pool, work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    try {
      return await work(client);
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}

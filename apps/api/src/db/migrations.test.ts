import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createScratchDatabase } from '../../test/scratch-db.ts';
import { MIGRATIONS_DIR, loadMigrations, migrateDown, migrateUp, pendingMigrations } from './migrations.ts';

let db: Awaited<ReturnType<typeof createScratchDatabase>>;
let pool: pg.Pool;
let dir: string;

beforeEach(async () => {
  db = await createScratchDatabase();
  pool = new pg.Pool({ connectionString: db.url });
  dir = await mkdtemp(path.join(tmpdir(), 'mosaic-migrations-'));
});

afterEach(async () => {
  await pool.end();
  await db.drop();
  await rm(dir, { recursive: true, force: true });
});

async function writeMigration(file: string, sql: string) {
  await writeFile(path.join(dir, file), sql);
}

async function tableExists(name: string): Promise<boolean> {
  const { rows } = await pool.query('SELECT to_regclass($1) IS NOT NULL AS exists', [`public.${name}`]);
  return rows[0].exists;
}

describe('migration runner', () => {
  it('applies pending migrations in version order and records them once', async () => {
    await writeMigration('0002_b.up.sql', 'CREATE TABLE b (id int REFERENCES a(id));');
    await writeMigration('0002_b.down.sql', 'DROP TABLE b;');
    await writeMigration('0001_a.up.sql', 'CREATE TABLE a (id int PRIMARY KEY);');
    await writeMigration('0001_a.down.sql', 'DROP TABLE a;');

    expect(await migrateUp(pool, dir)).toEqual(['0001_a', '0002_b']);
    expect(await tableExists('b')).toBe(true);
    expect(await migrateUp(pool, dir)).toEqual([]);
    expect(await pendingMigrations(pool, dir)).toEqual([]);
  });

  it('rolls back the most recent migrations', async () => {
    await writeMigration('0001_a.up.sql', 'CREATE TABLE a (id int);');
    await writeMigration('0001_a.down.sql', 'DROP TABLE a;');
    await writeMigration('0002_b.up.sql', 'CREATE TABLE b (id int);');
    await writeMigration('0002_b.down.sql', 'DROP TABLE b;');
    await migrateUp(pool, dir);

    expect(await migrateDown(pool, dir, 1)).toEqual(['0002_b']);
    expect(await tableExists('b')).toBe(false);
    expect(await tableExists('a')).toBe(true);
    expect((await pendingMigrations(pool, dir)).map((m) => m.id)).toEqual(['0002_b']);
  });

  it('runs each migration atomically: a failing migration leaves nothing behind', async () => {
    await writeMigration('0001_a.up.sql', 'CREATE TABLE a (id int); SELECT not_a_function();');
    await writeMigration('0001_a.down.sql', 'DROP TABLE a;');

    await expect(migrateUp(pool, dir)).rejects.toThrow(/0001_a/);
    expect(await tableExists('a')).toBe(false);
    expect(await pendingMigrations(pool, dir)).toHaveLength(1);
  });

  it('refuses to run when an applied migration file has changed', async () => {
    await writeMigration('0001_a.up.sql', 'CREATE TABLE a (id int);');
    await writeMigration('0001_a.down.sql', 'DROP TABLE a;');
    await migrateUp(pool, dir);
    await writeMigration('0001_a.up.sql', 'CREATE TABLE a (id bigint);');

    await expect(migrateUp(pool, dir)).rejects.toThrow(/0001_a.*changed/);
  });

  it('requires every migration to have a down file', async () => {
    await writeMigration('0001_a.up.sql', 'CREATE TABLE a (id int);');
    await expect(loadMigrations(dir)).rejects.toThrow(/0001_a.*down/);
  });
});

describe('MOSAIC schema migrations', () => {
  it('round-trips cleanly: up from empty, down to empty, up again', async () => {
    const applied = await migrateUp(pool, MIGRATIONS_DIR);
    expect(applied.length).toBeGreaterThan(0);
    expect(await tableExists('bookings')).toBe(true);

    await migrateDown(pool, MIGRATIONS_DIR, applied.length);
    const { rows } = await pool.query(
      `SELECT (SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations')::int AS tables,
              (SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                WHERE n.nspname = 'public' AND t.typtype = 'e')::int AS enums`,
    );
    expect(rows[0]).toEqual({ tables: 0, enums: 0 });

    expect(await migrateUp(pool, MIGRATIONS_DIR)).toEqual(applied);
  });
});

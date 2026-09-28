import pg from 'pg';
import { MIGRATIONS_DIR, migrateUp } from '../src/db/migrations.ts';

/** Rebuilds the shared test database from the migrations once per test run. */
export default async function setup() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migrateUp(pool, MIGRATIONS_DIR);
  } finally {
    await pool.end();
  }
}

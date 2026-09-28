import { randomUUID } from 'node:crypto';
import pg from 'pg';

/**
 * Creates an isolated, throwaway database for tests that must control the whole schema lifecycle
 * (e.g. migration round-trips) without disturbing the shared test database.
 */
export async function createScratchDatabase(): Promise<{ url: string; drop: () => Promise<void> }> {
  const baseUrl = new URL(process.env.DATABASE_URL!);
  const name = `mosaic_scratch_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Client({ connectionString: withDatabase(baseUrl, 'postgres') });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();
  return {
    url: withDatabase(baseUrl, name),
    drop: async () => {
      const client = new pg.Client({ connectionString: withDatabase(baseUrl, 'postgres') });
      await client.connect();
      await client.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await client.end();
    },
  };
}

function withDatabase(url: URL, database: string): string {
  const copy = new URL(url);
  copy.pathname = `/${database}`;
  return copy.toString();
}

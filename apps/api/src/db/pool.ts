import pg from 'pg';

// NUMERIC stays a string (exact money); DATE stays 'YYYY-MM-DD' (no timezone shifting).
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);

/** Anything that can run a query: the pool, or a client inside a transaction. */
export type Queryable = Pick<pg.Pool | pg.PoolClient, 'query'>;

export function createPool(connectionString: string): pg.Pool {
  return new pg.Pool({ connectionString, max: 10 });
}

/**
 * Runs `work` in one READ COMMITTED transaction on a dedicated client. Commits on success, rolls
 * back and rethrows on any error. Row locks taken inside (`FOR UPDATE`) are held until commit.
 */
export async function withTransaction<T>(pool: pg.Pool, work: (tx: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

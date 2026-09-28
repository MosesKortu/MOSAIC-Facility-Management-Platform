import { withTransaction, createPool } from '../src/db/pool.ts';
import { addMember, insertGroup, insertUser } from '../test/fixtures.ts';

/**
 * Development-only seed: one account per role so every application area can be exercised locally.
 * Refuses to run in production or against a database that already has users.
 */
if (process.env.NODE_ENV === 'production') throw new Error('seed-dev must never run in production');
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const pool = createPool(url);
try {
  await withTransaction(pool, async (tx) => {
    const { rows } = await tx.query<{ n: number }>('SELECT count(*)::int AS n FROM users');
    if (rows[0]!.n > 0) throw new Error('Database already has users; seed-dev only seeds an empty database');

    const researcher = await insertUser(tx, { email: 'researcher@icfo.test', full_name: 'Anna Kowalski' });
    await insertUser(tx, { email: 'superuser@icfo.test', full_name: 'Marc Llopis', role: 'super_user' });
    await insertUser(tx, { email: 'admin@icfo.test', full_name: 'Ferran Marsà', role: 'admin' });
    await insertUser(tx, { email: 'auditor@icfo.test', full_name: 'Sofia Ruiz', role: 'auditor' });
    const external = await insertUser(tx, { email: 'external@partner.test', full_name: 'Daniel Chen', user_type: 'external' });
    await tx.query('INSERT INTO external_user_sponsors (external_user_id, sponsor_user_id) VALUES ($1, $2)',
      [external.user_id, researcher.user_id]);

    const group = await insertGroup(tx, 'Nano Electronics Group');
    await addMember(tx, group, researcher.user_id);
    await addMember(tx, group, external.user_id);
  });
  console.log('Seeded: researcher@ superuser@ admin@ auditor@ (icfo.test), external@partner.test');
} finally {
  await pool.end();
}

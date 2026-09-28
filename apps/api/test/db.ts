import pg from 'pg';
import { afterAll } from 'vitest';

/** Shared pool for integration tests in the current file. */
export const testPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
afterAll(() => testPool.end());

// Every domain table except the reference support_tariffs rows, which migrations seed.
const DOMAIN_TABLES = [
  'notifications', 'audit_log', 'session_events', 'equipment_status_events', 'bookings',
  'user_certifications', 'training_modules', 'equipment_availability_windows', 'equipment',
  'grant_group_allocations', 'grants', 'group_memberships', 'groups', 'external_user_sponsors', 'users',
];

/** Empties all domain tables and restores reference tariffs. Call in beforeEach. */
export async function resetDatabase(): Promise<void> {
  await testPool.query(`TRUNCATE ${DOMAIN_TABLES.join(', ')} RESTART IDENTITY CASCADE`);
  await testPool.query(`UPDATE support_tariffs SET is_available = true,
    rate_hourly = CASE tier WHEN 'none' THEN 0 WHEN 'technician' THEN 40 ELSE 60 END`);
}

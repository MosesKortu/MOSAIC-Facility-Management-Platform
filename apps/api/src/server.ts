import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { createPool } from './db/pool.ts';

const config = loadConfig();
const pool = createPool(config.databaseUrl);
const app = buildApp({ config, pool });

async function shutdown() {
  await app.close();
  await pool.end();
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => void shutdown());
}

await app.listen({ port: config.port, host: '0.0.0.0' });

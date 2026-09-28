import { defineConfig } from 'vitest/config';

// Set on the main process too: globalSetup (schema rebuild) runs there, not in the test workers.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://mosaic:mosaic@localhost:54329/mosaic_test';

export default defineConfig({
  test: {
    // Integration tests share one Postgres database; run files sequentially.
    fileParallelism: false,
    globalSetup: ['./test/global-setup.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.DATABASE_URL,
      JWT_SECRET: 'test-secret-that-is-definitely-at-least-32-characters',
      AUTH_DEV_LOGIN: 'true',
      WEB_ORIGIN: 'http://localhost:5173',
    },
  },
});

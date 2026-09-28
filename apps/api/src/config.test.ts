import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.ts';

const base = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  JWT_SECRET: 'x'.repeat(32),
  WEB_ORIGIN: 'http://localhost:5173',
};

describe('loadConfig', () => {
  it('parses a valid environment with defaults', () => {
    const config = loadConfig(base);
    expect(config).toMatchObject({ port: 3100, authDevLogin: false, facilityTimezone: 'Europe/Madrid' });
  });

  it('enables dev login only when explicitly requested', () => {
    expect(loadConfig({ ...base, AUTH_DEV_LOGIN: 'true' }).authDevLogin).toBe(true);
  });

  it('refuses dev login in production (D6)', () => {
    expect(() => loadConfig({ ...base, NODE_ENV: 'production', AUTH_DEV_LOGIN: 'true' })).toThrow(
      /AUTH_DEV_LOGIN/,
    );
  });

  it('rejects a short JWT secret', () => {
    expect(() => loadConfig({ ...base, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });

  it('rejects a missing database URL', () => {
    const { DATABASE_URL: _omitted, ...rest } = base;
    expect(() => loadConfig(rest)).toThrow(/DATABASE_URL/);
  });
});

import { FACILITY_TIMEZONE } from '@mosaic/contracts';
import { z } from 'zod';

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']),
    PORT: z.coerce.number().int().positive().default(3100),
    DATABASE_URL: z.string().url(),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    AUTH_DEV_LOGIN: z.enum(['true', 'false']).default('false'),
    WEB_ORIGIN: z.string().url(),
  })
  .refine((env) => !(env.NODE_ENV === 'production' && env.AUTH_DEV_LOGIN === 'true'), {
    path: ['AUTH_DEV_LOGIN'],
    message: 'AUTH_DEV_LOGIN must not be enabled in production',
  });

export interface Config {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  authDevLogin: boolean;
  /** Fixed (contracts FACILITY_TIMEZONE): the web renders slots in the same zone (D20). */
  facilityTimezone: string;
  webOrigin: string;
}

/** Parses the environment once at startup; any problem aborts the process with every issue listed. */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const result = EnvSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid configuration — ${issues}`);
  }
  const e = result.data;
  return {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    jwtSecret: e.JWT_SECRET,
    authDevLogin: e.AUTH_DEV_LOGIN === 'true',
    facilityTimezone: FACILITY_TIMEZONE,
    webOrigin: e.WEB_ORIGIN,
  };
}

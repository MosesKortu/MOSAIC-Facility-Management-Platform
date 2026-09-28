import type { FastifyInstance, FastifyReply } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import type { Config } from '../../config.ts';
import { SESSION_COOKIE } from '../../http/access.ts';
import { parseWith } from '../../http/validation.ts';
import { currentProfile, devLogin } from './service.ts';

const SESSION_HOURS = 8;

export function registerAuthRoutes(app: FastifyInstance, pool: pg.Pool, config: Config) {
  const cookieOptions = {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: config.nodeEnv === 'production',
  };

  async function startSession(reply: FastifyReply, userId: string) {
    const token = await reply.jwtSign({ sub: userId }, { expiresIn: `${SESSION_HOURS}h` });
    reply.setCookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_HOURS * 3600 });
  }

  if (config.authDevLogin) {
    app.post('/api/v1/auth/dev-login', { config: { access: 'public' } }, async (request, reply) => {
      const { email } = parseWith(z.object({ email: z.string().email() }), request.body);
      const profile = await devLogin(pool, email);
      await startSession(reply, profile.user_id);
      return profile;
    });
  }

  app.post('/api/v1/auth/logout', { config: { access: 'public' } }, async (_request, reply) => {
    reply.clearCookie(SESSION_COOKIE, cookieOptions);
    return reply.status(204).send();
  });

  app.get('/api/v1/auth/me', { config: { access: 'authenticated' } }, async (request) =>
    currentProfile(pool, request.actor!.userId),
  );
}

import type { Role, UserType } from '@mosaic/contracts';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type pg from 'pg';
import { findActor } from '../modules/users/repository.ts';
import { DomainError } from './errors.ts';

export type { Role };

/**
 * Every /api route declares who may call it (default deny):
 *  - 'public'         no session required
 *  - 'authenticated'  any active user
 *  - Role[]           active user with one of these roles
 * Data-dependent rules ("own booking or staff") are enforced in services on top of this.
 */
export type Access = 'public' | 'authenticated' | readonly Role[];

/** The caller, loaded from the database on every request so role/activation changes apply immediately. */
export interface Actor {
  userId: string;
  role: Role;
  userType: UserType;
}

declare module 'fastify' {
  interface FastifyContextConfig {
    access?: Access;
  }
  interface FastifyRequest {
    actor: Actor | null;
  }
  interface FastifyInstance {
    /** Every API route and its declared access, for policy tests. */
    routeAccessTable: RouteAccess[];
  }
}

export interface RouteAccess {
  method: string;
  url: string;
  access: Access | undefined;
}

/** Role sets reused by route declarations. Auditors never appear in a mutating route's list. */
export const RESEARCHERS: readonly Role[] = ['standard_user', 'super_user', 'admin'];
export const STAFF: readonly Role[] = ['super_user', 'admin'];
export const ADMIN: readonly Role[] = ['admin'];
export const AUDITOR: readonly Role[] = ['auditor'];

export const SESSION_COOKIE = 'mosaic_session';

/** Registers the startup check that every API route declared its access level. */
export function registerAccessControl(app: FastifyInstance) {
  const table: RouteAccess[] = [];
  app.decorate('routeAccessTable', table);
  app.addHook('onRoute', (route) => {
    if (!route.url.startsWith('/api/')) return;
    for (const method of [route.method].flat()) {
      table.push({ method, url: route.url, access: route.config?.access });
    }
  });
  app.addHook('onReady', async () => {
    const undeclared = table.filter((r) => r.access === undefined).map((r) => `${r.method} ${r.url}`);
    if (undeclared.length > 0) throw new Error(`Routes without an access declaration: ${undeclared.join(', ')}`);
  });
}

/** Authenticates the session cookie and enforces the route's declared access, before body parsing. */
export function registerAuthentication(app: FastifyInstance, pool: pg.Pool, webOrigin: string) {
  app.decorateRequest('actor', null);

  app.addHook('onRequest', async (request) => {
    rejectForeignOrigin(request, webOrigin);

    const access = request.routeOptions.config.access;
    if (access === undefined || access === 'public') return;

    request.actor = await authenticate(request, pool);
    if (access !== 'authenticated' && !access.includes(request.actor.role)) {
      throw new DomainError('FORBIDDEN', "You don't have permission to do this");
    }
  });
}

async function authenticate(request: FastifyRequest, pool: pg.Pool): Promise<Actor> {
  let userId: string;
  try {
    userId = (await request.jwtVerify<{ sub: string }>()).sub;
  } catch {
    throw new DomainError('UNAUTHENTICATED', 'Please sign in');
  }
  const user = await findActor(pool, userId);
  if (!user) throw new DomainError('UNAUTHENTICATED', 'Please sign in');
  if (!user.isActive) throw new DomainError('USER_INACTIVE', 'Your account is deactivated');
  return { userId: user.userId, role: user.role, userType: user.userType };
}

/**
 * CSRF defence in depth on top of the SameSite=Lax cookie: a state-changing request that carries an
 * Origin header must come from the web app's origin.
 */
function rejectForeignOrigin(request: FastifyRequest, webOrigin: string) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
  const origin = request.headers.origin;
  if (origin !== undefined && origin !== webOrigin) {
    throw new DomainError('FORBIDDEN', 'Cross-site requests are not allowed');
  }
}

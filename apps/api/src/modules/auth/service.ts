import type { Queryable } from '../../db/pool.ts';
import { DomainError } from '../../http/errors.ts';
import type { SessionUser } from '@mosaic/contracts';
import { findProfile, findUserIdByEmail } from '../users/repository.ts';

/** Development/CI login (09_ARCHITECTURE.md D6): identifies an existing user by email, no password. */
export async function devLogin(db: Queryable, email: string): Promise<SessionUser> {
  const user = await findUserIdByEmail(db, email);
  if (!user) throw new DomainError('UNAUTHENTICATED', 'No MOSAIC account uses this email');
  if (!user.isActive) throw new DomainError('USER_INACTIVE', 'This account is deactivated');
  return (await findProfile(db, user.userId))!;
}

export async function currentProfile(db: Queryable, userId: string): Promise<SessionUser> {
  const profile = await findProfile(db, userId);
  if (!profile) throw new DomainError('UNAUTHENTICATED', 'Please sign in');
  return profile;
}

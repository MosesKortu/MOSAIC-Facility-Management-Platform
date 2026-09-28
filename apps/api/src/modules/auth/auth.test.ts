import { beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, as, loginAs } from '../../../test/app.ts';
import { resetDatabase, testPool as db } from '../../../test/db.ts';
import { addMember, insertGroup, insertUser } from '../../../test/fixtures.ts';

const app = createTestApp();
beforeEach(resetDatabase);

describe('POST /auth/dev-login', () => {
  it('starts an httpOnly session for an existing active user', async () => {
    const user = await insertUser(db, { email: 'anna@icfo.test' });
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/dev-login', payload: { email: 'anna@icfo.test' } });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ user_id: user.user_id, role: 'standard_user' });
    const cookie = res.cookies.find((c) => c.name === 'mosaic_session');
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });
  });

  it('matches the email case-insensitively', async () => {
    await insertUser(db, { email: 'anna@icfo.test' });
    await expect(loginAs(app, 'Anna@ICFO.test')).resolves.toMatch(/^mosaic_session=/);
  });

  it('rejects unknown and deactivated accounts with distinct codes', async () => {
    await insertUser(db, { email: 'gone@icfo.test', is_active: false });
    const unknown = await app.inject({ method: 'POST', url: '/api/v1/auth/dev-login', payload: { email: 'nobody@icfo.test' } });
    const inactive = await app.inject({ method: 'POST', url: '/api/v1/auth/dev-login', payload: { email: 'gone@icfo.test' } });

    expect(unknown.statusCode).toBe(401);
    expect(unknown.json().error.code).toBe('UNAUTHENTICATED');
    expect(inactive.statusCode).toBe(403);
    expect(inactive.json().error.code).toBe('USER_INACTIVE');
  });

  it('does not exist when dev login is disabled', async () => {
    const prodLike = createTestApp({ authDevLogin: false });
    await insertUser(db, { email: 'anna@icfo.test' });
    const res = await prodLike.inject({ method: 'POST', url: '/api/v1/auth/dev-login', payload: { email: 'anna@icfo.test' } });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /auth/me', () => {
  it('returns the session user with type and active groups', async () => {
    const user = await insertUser(db, { email: 'anna@icfo.test', full_name: 'Anna Kowalski' });
    const group = await insertGroup(db, 'Nano Electronics');
    await addMember(db, group, user.user_id);
    const cookie = await loginAs(app, 'anna@icfo.test');

    const res = await as(app, cookie, { method: 'GET', url: '/api/v1/auth/me' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      user_id: user.user_id, email: 'anna@icfo.test', full_name: 'Anna Kowalski',
      role: 'standard_user', user_type: 'internal', groups: [{ group_id: group, name: 'Nano Electronics' }],
    });
  });

  it('requires a valid session', async () => {
    const none = await app.inject({ method: 'GET', url: '/api/v1/auth/me' });
    const forged = await as(app, 'mosaic_session=not-a-jwt', { method: 'GET', url: '/api/v1/auth/me' });
    expect(none.statusCode).toBe(401);
    expect(forged.statusCode).toBe(401);
    expect(forged.json().error.code).toBe('UNAUTHENTICATED');
  });

  it('applies deactivation and role changes to existing sessions immediately', async () => {
    const user = await insertUser(db, { email: 'anna@icfo.test' });
    const cookie = await loginAs(app, 'anna@icfo.test');

    await db.query(`UPDATE users SET role = 'super_user' WHERE user_id = $1`, [user.user_id]);
    expect((await as(app, cookie, { method: 'GET', url: '/api/v1/auth/me' })).json().role).toBe('super_user');

    await db.query('UPDATE users SET is_active = false WHERE user_id = $1', [user.user_id]);
    const res = await as(app, cookie, { method: 'GET', url: '/api/v1/auth/me' });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('USER_INACTIVE');
  });
});

describe('POST /auth/logout', () => {
  it('clears the session cookie', async () => {
    await insertUser(db, { email: 'anna@icfo.test' });
    const cookie = await loginAs(app, 'anna@icfo.test');
    const res = await as(app, cookie, { method: 'POST', url: '/api/v1/auth/logout' });
    expect(res.statusCode).toBe(204);
    expect(res.cookies.find((c) => c.name === 'mosaic_session')?.value).toBe('');
  });
});

describe('cross-site request protection', () => {
  it('rejects state-changing requests from a foreign Origin', async () => {
    await insertUser(db, { email: 'anna@icfo.test' });
    const res = await app.inject({
      method: 'POST', url: '/api/v1/auth/dev-login', payload: { email: 'anna@icfo.test' },
      headers: { origin: 'https://evil.example' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
  });
});

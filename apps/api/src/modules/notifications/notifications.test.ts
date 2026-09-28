import { beforeEach, describe, expect, it } from 'vitest';
import { as, createTestApp, loginAs } from '../../../test/app.ts';
import { resetDatabase, testPool as db } from '../../../test/db.ts';
import { addMember, insertGroup, insertUser, type UserRow } from '../../../test/fixtures.ts';
import { notify, notifyGroupMembers } from './service.ts';

const app = createTestApp();
let anna: UserRow;
let other: UserRow;
let cookie: string;

const rejected = (code: string) => ({ equipment_id: '00000000-0000-4000-8000-000000000001', equipment_code: code, equipment_name: code, reason: 'Retry' });

/** Inserts a notification at a given time so ordering is deterministic. */
async function insertAt(userId: string, createdAt: string, code: string): Promise<string> {
  const { rows } = await db.query<{ notification_id: string }>(
    `INSERT INTO notifications (user_id, type, payload, created_at) VALUES ($1, 'certification_rejected', $2, $3) RETURNING notification_id`,
    [userId, rejected(code), createdAt],
  );
  return rows[0]!.notification_id;
}

const list = (query = '', c = cookie) => as(app, c, { method: 'GET', url: `/api/v1/notifications${query}` });
const markRead = (id: string, c = cookie) => as(app, c, { method: 'PATCH', url: `/api/v1/notifications/${id}/read` });

beforeEach(async () => {
  await resetDatabase();
  anna = await insertUser(db, { email: 'anna@icfo.test' });
  other = await insertUser(db, { email: 'other@icfo.test' });
  cookie = await loginAs(app, 'anna@icfo.test');
});

describe('GET /notifications', () => {
  it("lists only the caller's notifications, newest first, with an unread filter and paging", async () => {
    const older = await insertAt(anna.user_id, '2026-09-01T10:00:00Z', 'OLD');
    await insertAt(anna.user_id, '2026-09-02T10:00:00Z', 'NEW');
    await insertAt(other.user_id, '2026-09-03T10:00:00Z', 'NOT_MINE');
    await db.query('UPDATE notifications SET read_at = now() WHERE notification_id = $1', [older]);

    const all = await list();
    expect(all.statusCode).toBe(200);
    expect(all.json()).toMatchObject({ total: 2, limit: 20, offset: 0 });
    expect(all.json().items.map((n: { payload: { equipment_code: string } }) => n.payload.equipment_code)).toEqual(['NEW', 'OLD']);
    expect(all.json().items[0]).toEqual({
      notification_id: expect.any(String), type: 'certification_rejected', payload: rejected('NEW'), read_at: null, created_at: '2026-09-02T10:00:00.000Z',
    });

    const unread = await list('?unread_only=true&limit=1');
    expect(unread.json()).toMatchObject({ total: 1, items: [{ payload: { equipment_code: 'NEW' } }] });
    expect((await list('?limit=1&offset=1')).json().items[0].payload.equipment_code).toBe('OLD');
  });

  it('is not available to auditors, who receive no notifications', async () => {
    await insertUser(db, { email: 'auditor@icfo.test', role: 'auditor' });
    expect((await list('', await loginAs(app, 'auditor@icfo.test'))).statusCode).toBe(403);
  });
});

describe('marking read', () => {
  it('is idempotent: the first read time is kept', async () => {
    const id = await insertAt(anna.user_id, '2026-09-01T10:00:00Z', 'X');
    const first = await markRead(id);
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ notification_id: id, read_at: expect.any(String) });
    const second = await markRead(id);
    expect(second.json().read_at).toBe(first.json().read_at);
  });

  it("reports someone else's notification as not found and leaves it unread", async () => {
    const id = await insertAt(other.user_id, '2026-09-01T10:00:00Z', 'X');
    const res = await markRead(id);
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toMatchObject({ code: 'NOT_FOUND', details: { entity: 'notification' } });
    const { rows } = await db.query('SELECT read_at FROM notifications WHERE notification_id = $1', [id]);
    expect(rows[0].read_at).toBeNull();
  });

  it("marks all of the caller's unread notifications read", async () => {
    await insertAt(anna.user_id, '2026-09-01T10:00:00Z', 'A');
    await insertAt(anna.user_id, '2026-09-02T10:00:00Z', 'B');
    await insertAt(other.user_id, '2026-09-02T10:00:00Z', 'C');
    const res = await as(app, cookie, { method: 'POST', url: '/api/v1/notifications/read-all' });
    expect(res.json()).toEqual({ updated: 2 });
    expect((await list('?unread_only=true')).json().total).toBe(0);
    const { rows } = await db.query('SELECT count(*)::int AS n FROM notifications WHERE read_at IS NULL');
    expect(rows[0].n).toBe(1);
  });
});

describe('writers', () => {
  it('notify() writes one typed notification', async () => {
    await notify(db, anna.user_id, 'certification_rejected', rejected('EBL'));
    const { rows } = await db.query('SELECT user_id, type, payload FROM notifications');
    expect(rows).toEqual([{ user_id: anna.user_id, type: 'certification_rejected', payload: rejected('EBL') }]);
  });

  it('notifyGroupMembers() skips inactive members, inactive accounts and auditors', async () => {
    const group = await insertGroup(db);
    const inactiveAccount = await insertUser(db);
    await db.query('UPDATE users SET is_active = false WHERE user_id = $1', [inactiveAccount.user_id]);
    const auditor = await insertUser(db, { role: 'auditor' });
    for (const user of [anna, other, inactiveAccount, auditor]) await addMember(db, group, user.user_id);
    await db.query('UPDATE group_memberships SET is_active = false WHERE user_id = $1', [other.user_id]);

    await notifyGroupMembers(db, group, 'grant_allocation_changed', {
      grant_code: 'G-1', group_name: 'G', allocated_amount: '10.00', remaining_balance: '10.00', is_active: true,
    });
    const { rows } = await db.query('SELECT user_id FROM notifications');
    expect(rows).toEqual([{ user_id: anna.user_id }]);
  });
});

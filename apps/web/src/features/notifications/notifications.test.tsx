import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Role } from '@mosaic/contracts';
import { describe, expect, it } from 'vitest';
import { Shell } from '../../app/Shell.tsx';
import { RequireSession } from '../auth/guards.tsx';
import { apiCalls, page, renderRoutes, sessionUser, stubApi } from '../../test/render.tsx';
import { NotificationsPage } from './NotificationsPage.tsx';

const eid = '66666666-6666-4666-8666-666666666666';
const rejected = (id: string, read_at: string | null = null) => ({
  notification_id: id, type: 'certification_rejected', read_at, created_at: '2026-09-28T10:00:00Z',
  payload: { equipment_id: eid, equipment_code: 'EBL', equipment_name: 'EBL CRESTEC', reason: 'Needs another run' },
});
const pageOf = (items: unknown[], total = items.length) => ({ items, total, limit: 20, offset: 0 });
const me = { 'GET /auth/me': [200, sessionUser()] } as const;
const UNREAD_COUNT = 'GET /notifications?limit=1&unread_only=true';
const routes = [
  { path: '/notifications', element: <NotificationsPage /> },
  { path: '/training/:equipmentId', element: page('training page') },
];

describe('NotificationsPage', () => {
  it('lists notifications with readable text and marks one read', async () => {
    let readAt: string | null = null;
    const fetchMock = stubApi({
      ...me,
      'GET /notifications?limit=20&offset=0': () => [200, pageOf([rejected('n1', readAt), rejected('n2', '2026-09-27T10:00:00Z')])],
      [UNREAD_COUNT]: () => [200, pageOf([], readAt ? 0 : 1)],
      'PATCH /notifications/n1/read': () => { readAt = '2026-09-28T11:00:00Z'; return [200, rejected('n1', readAt)]; },
    });
    renderRoutes(routes, '/notifications');

    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByText('Your practical assessment for EBL CRESTEC was not approved')).toBeTruthy();
    expect(within(items[0]!).getByText('Unread')).toBeTruthy(); // state is text, not colour alone
    expect(within(items[1]!).queryByText('Unread')).toBeNull();

    await userEvent.click(within(items[0]!).getByRole('button', { name: 'Mark as read' }));
    await waitFor(() => expect(within(screen.getAllByRole('listitem')[0]!).queryByText('Unread')).toBeNull());
    expect(apiCalls(fetchMock).filter((c) => c.method === 'PATCH').map((c) => c.path)).toEqual(['/notifications/n1/read']);
  });

  it('marks a notification read when its link is followed', async () => {
    const fetchMock = stubApi({
      ...me,
      'GET /notifications?limit=20&offset=0': [200, pageOf([rejected('n1')])],
      [UNREAD_COUNT]: [200, pageOf([], 1)],
      'PATCH /notifications/n1/read': [200, rejected('n1', '2026-09-28T11:00:00Z')],
    });
    renderRoutes(routes, '/notifications');
    await userEvent.click(await screen.findByRole('link', { name: 'Request a new assessment' }));
    expect(await screen.findByText('training page')).toBeTruthy();
    await waitFor(() => expect(apiCalls(fetchMock).some((c) => c.method === 'PATCH')).toBe(true));
  });

  it('filters to unread in the URL and marks all read', async () => {
    let unread = 2;
    const fetchMock = stubApi({
      ...me,
      'GET /notifications?limit=20&offset=0': [200, pageOf([rejected('n1'), rejected('n2')])],
      'GET /notifications?limit=20&offset=0&unread_only=true': () => [200, pageOf(unread ? [rejected('n1'), rejected('n2')] : [])],
      [UNREAD_COUNT]: () => [200, pageOf([], unread)],
      'POST /notifications/read-all': () => { unread = 0; return [200, { updated: 2 }]; },
    });
    const { router } = renderRoutes(routes, '/notifications');
    await userEvent.click(await screen.findByRole('button', { name: 'Unread' }));
    expect(router.state.location.search).toBe('?unread_only=true');

    await userEvent.click(await screen.findByRole('button', { name: 'Mark all as read' }));
    expect(await screen.findByText("You're all caught up")).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Mark all as read' })).toBeNull();
    expect(apiCalls(fetchMock).filter((c) => c.method === 'POST').map((c) => c.path)).toEqual(['/notifications/read-all']);
  });

  it('explains an empty inbox and offers a retry on errors', async () => {
    stubApi({ ...me, 'GET /notifications?limit=20&offset=0': [200, pageOf([])], [UNREAD_COUNT]: [200, pageOf([])] });
    renderRoutes(routes, '/notifications');
    expect(await screen.findByText('No notifications yet')).toBeTruthy();

    stubApi({ ...me, 'GET /notifications?limit=20&offset=0': [500, { error: { code: 'INTERNAL', message: 'Boom' }, request_id: 'r' }], [UNREAD_COUNT]: [200, pageOf([])] });
    renderRoutes(routes, '/notifications');
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});

describe('notification bell', () => {
  const renderShellAs = (role: Role, unread: number) => {
    const fetchMock = stubApi({ 'GET /auth/me': [200, sessionUser({ role })], [UNREAD_COUNT]: [200, pageOf([], unread)] });
    renderRoutes([{ element: <RequireSession />, children: [{ element: <Shell />, children: [{ path: '/', element: page('home') }] }] }], '/');
    return fetchMock;
  };

  it('shows the unread count in the top bar and links to the notifications page', async () => {
    renderShellAs('standard_user', 3);
    const bell = await screen.findByRole('link', { name: 'Notifications, 3 unread' });
    expect(bell.getAttribute('href')).toBe('/notifications');
    expect(within(bell).getByText('3')).toBeTruthy();
  });

  it('is absent for auditors, who receive no notifications', async () => {
    const fetchMock = renderShellAs('auditor', 0);
    await screen.findByRole('navigation', { name: 'Main' });
    expect(screen.queryByRole('link', { name: /Notifications/ })).toBeNull();
    expect(apiCalls(fetchMock).some((c) => c.path.startsWith('/notifications'))).toBe(false);
  });
});

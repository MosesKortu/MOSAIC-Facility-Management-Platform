import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderRoutes, sessionUser, stubApi } from '../../test/render.tsx';
import { GroupDetailPage } from './GroupDetailPage.tsx';
import { GroupsPage } from './GroupsPage.tsx';

const gid = '33333333-3333-4333-8333-333333333333';
const summary = {
  group_id: gid, name: 'Nano Electronics Group', description: 'Quantum devices', is_active: true, created_at: '2026-01-01T00:00:00Z',
  internal_members: 12, external_members: 3,
  funding: { allocated: '25000.00', remaining: '10180.00', consumed: '14820.00', active_allocations: 1 },
};
const anna = { user_id: '11111111-1111-4111-8111-111111111111', full_name: 'Anna Kowalski', email: 'anna@icfo.test', role: 'standard_user', user_type: 'internal', is_active: true, joined_at: '2026-02-01T00:00:00Z' };
const detail = { ...summary, members: [anna], allocations: [] };
const me = ['GET /auth/me', [200, sessionUser({ role: 'admin' })]] as const;
const audit = [`GET /admin/audit?entity_id=${gid}&limit=10&offset=0`, [200, { items: [], total: 0, limit: 10, offset: 0 }]] as const;

describe('GroupsPage', () => {
  it('lists groups with member counts and funding in context', async () => {
    stubApi({ [me[0]]: me[1], 'GET /admin/groups?limit=50&offset=0': [200, { items: [summary], total: 1, limit: 50, offset: 0 }] });
    renderRoutes([{ path: '/admin/groups', element: <GroupsPage /> }], '/admin/groups');
    const row = (await screen.findByRole('link', { name: 'Nano Electronics Group' })).closest('tr')!;
    expect(within(row).getByText('12 internal · 3 external')).toBeTruthy();
    expect(within(row).getByText('€25,000.00')).toBeTruthy();
    expect(within(row).getByText('€10,180.00')).toBeTruthy();
  });

  it('offers to create the first group when there are none', async () => {
    stubApi({ [me[0]]: me[1], 'GET /admin/groups?limit=50&offset=0': [200, { items: [], total: 0, limit: 50, offset: 0 }] });
    renderRoutes([{ path: '/admin/groups', element: <GroupsPage /> }], '/admin/groups');
    expect(await screen.findByText('No groups have been created yet.')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Create group' }).length).toBeGreaterThan(0);
  });
});

describe('GroupDetailPage', () => {
  const routes = [{ path: '/admin/groups/:groupId', element: <GroupDetailPage /> }];

  it('summarises members and funding', async () => {
    stubApi({ [me[0]]: me[1], [audit[0]]: audit[1], [`GET /admin/groups/${gid}`]: [200, detail] });
    renderRoutes(routes, `/admin/groups/${gid}`);
    expect(await screen.findByRole('heading', { level: 1, name: 'Nano Electronics Group' })).toBeTruthy();
    expect(screen.getByText('€14,820.00')).toBeTruthy();
    expect(screen.getByText('Anna Kowalski')).toBeTruthy();
    expect(screen.getByText('No grant allocations yet.')).toBeTruthy();
  });

  it('removes a member after confirmation', async () => {
    let current: typeof detail = detail;
    const fetchMock = stubApi({
      [me[0]]: me[1], [audit[0]]: audit[1],
      [`GET /admin/groups/${gid}`]: () => [200, current],
      [`DELETE /admin/groups/${gid}/members/${anna.user_id}`]: () => {
        current = { ...detail, members: [] };
        return [200, current];
      },
    });
    renderRoutes(routes, `/admin/groups/${gid}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Remove Anna Kowalski' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
    expect(await screen.findByText('This group has no members yet.')).toBeTruthy();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(true);
  });

  it('explains a deactivated group and does not offer adding members', async () => {
    stubApi({ [me[0]]: me[1], [audit[0]]: audit[1], [`GET /admin/groups/${gid}`]: [200, { ...detail, is_active: false }] });
    renderRoutes(routes, `/admin/groups/${gid}`);
    expect(await screen.findByText('This group is deactivated')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add member' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Reactivate group' })).toBeTruthy();
  });
});

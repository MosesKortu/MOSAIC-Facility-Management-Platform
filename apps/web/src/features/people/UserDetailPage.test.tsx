import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiCalls, renderRoutes, sessionUser, stubApi } from '../../test/render.tsx';
import { UserDetailPage } from './UserDetailPage.tsx';

const id = '11111111-1111-4111-8111-111111111111';
const detail = {
  user_id: id, email: 'anna@icfo.test', full_name: 'Anna Kowalski', role: 'standard_user', user_type: 'internal',
  is_active: true, created_at: '2026-09-01T10:00:00Z', sso_identifier: 'sso-anna',
  groups: [{ group_id: 'g1', name: 'Nano Electronics' }], sponsor: null, sponsored: [],
  certifications: [{ equipment_id: 'e1', equipment_code: 'EBL_CRESTEC', equipment_name: 'EBL CRESTEC', theoretical_passed: true, practical_status: 'pending', expires_at: null }],
  funding: [{ allocation_id: 'a1', grant_code: 'ES-MICINN-2026-042', group: { group_id: 'g1', name: 'Nano Electronics' }, remaining_balance: '2500.00', expiration_date: '2027-06-30', is_active: true }],
};
const emptyAudit = { items: [], total: 0, limit: 10, offset: 0 };
const baseRoutes = {
  'GET /auth/me': [200, sessionUser({ role: 'admin', user_id: '99999999-9999-4999-8999-999999999999' })],
  [`GET /admin/users/${id}`]: [200, detail],
  [`GET /admin/audit?entity_id=${id}&limit=10&offset=0`]: [200, emptyAudit],
  'GET /admin/groups?is_active=true&limit=200&offset=0': [200, { items: [], total: 0, limit: 200, offset: 0 }],
} satisfies Record<string, [number, unknown]>;
const routes = [{ path: '/admin/people/:userId', element: <UserDetailPage /> }];

describe('UserDetailPage', () => {
  it('shows the profile with groups, certifications and funding access', async () => {
    stubApi(baseRoutes);
    renderRoutes(routes, `/admin/people/${id}`);
    expect(await screen.findByRole('heading', { level: 1, name: 'Anna Kowalski' })).toBeTruthy();
    expect(screen.getByText('EBL_CRESTEC')).toBeTruthy();
    expect(screen.getByText('Assessment pending')).toBeTruthy();
    expect(screen.getByText('ES-MICINN-2026-042')).toBeTruthy();
    expect(screen.getByText('€2,500.00')).toBeTruthy();
  });

  it('deactivates only after confirmation', async () => {
    let current = detail;
    const fetchMock = stubApi({
      ...baseRoutes,
      [`GET /admin/users/${id}`]: () => [200, current],
      [`PATCH /admin/users/${id}`]: (body) => {
        current = { ...detail, ...(body as object) };
        return [200, current];
      },
    });
    renderRoutes(routes, `/admin/people/${id}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Deactivate account' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Anna Kowalski will no longer be able to sign in/)).toBeTruthy();
    expect(apiCalls(fetchMock).some((call) => call.method === 'PATCH')).toBe(false);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Deactivate' }));
    expect(await screen.findByRole('button', { name: 'Reactivate account' })).toBeTruthy();
    expect(apiCalls(fetchMock).find((call) => call.method === 'PATCH')?.body).toEqual({ is_active: false });
  });

  it('shows the server reason when a change is refused', async () => {
    stubApi({
      ...baseRoutes,
      [`PATCH /admin/users/${id}`]: [409, { error: { code: 'SELF_LOCKOUT', message: "You can't remove your own administrator access or deactivate yourself" }, request_id: 'r' }],
    });
    renderRoutes(routes, `/admin/people/${id}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Deactivate account' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Deactivate' }));
    expect(await screen.findByText(/can't remove your own administrator access/)).toBeTruthy();
  });

  it('shows not found for a missing person', async () => {
    stubApi({
      ...baseRoutes,
      [`GET /admin/users/${id}`]: [404, { error: { code: 'NOT_FOUND', message: 'This user does not exist', details: { entity: 'user' } }, request_id: 'r' }],
    });
    renderRoutes(routes, `/admin/people/${id}`);
    expect(await screen.findByText("This person doesn't exist")).toBeTruthy();
  });
});

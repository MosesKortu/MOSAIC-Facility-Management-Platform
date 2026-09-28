import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiCalls, renderRoutes, sessionUser, stubApi } from '../../test/render.tsx';
import { PeoplePage } from './PeoplePage.tsx';

const anna = {
  user_id: '11111111-1111-4111-8111-111111111111', email: 'anna@icfo.test', full_name: 'Anna Kowalski',
  role: 'standard_user', user_type: 'internal', is_active: true, created_at: '2026-09-01T10:00:00Z',
  groups: [{ group_id: 'g1', name: 'Nano Electronics' }],
};
const page = (items: unknown[], total = items.length) => ({ items, total, limit: 50, offset: 0 });
const routes = [{ path: '/admin/people', element: <PeoplePage /> }];

describe('PeoplePage', () => {
  it('lists internal users with role, groups and status as text', async () => {
    stubApi({
      'GET /auth/me': [200, sessionUser({ role: 'admin' })],
      'GET /admin/users?limit=50&offset=0&user_type=internal': [200, page([anna])],
    });
    renderRoutes(routes, '/admin/people');
    const row = (await screen.findByText('Anna Kowalski')).closest('tr')!;
    expect(within(row).getByText('Researcher')).toBeTruthy();
    expect(within(row).getByText('Nano Electronics')).toBeTruthy();
    expect(within(row).getByText('Active')).toBeTruthy();
    expect(within(row).getByRole('link', { name: /manage anna kowalski/i }).getAttribute('href')).toBe(`/admin/people/${anna.user_id}`);
  });

  it('shows the external tab with its own empty state', async () => {
    stubApi({
      'GET /auth/me': [200, sessionUser({ role: 'admin' })],
      'GET /admin/users?limit=50&offset=0&user_type=external': [200, page([])],
    });
    renderRoutes(routes, '/admin/people?type=external');
    expect(await screen.findByText('No external collaborators have been added yet.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'External' }).getAttribute('aria-current')).toBe('page');
  });

  it('distinguishes "no matches" from "nobody yet" when filtering', async () => {
    stubApi({
      'GET /auth/me': [200, sessionUser({ role: 'admin' })],
      'GET /admin/users?limit=50&offset=0&q=zzz&user_type=internal': [200, page([])],
    });
    renderRoutes(routes, '/admin/people?q=zzz');
    expect(await screen.findByText('No people match these filters.')).toBeTruthy();
  });

  it('explains a failed load and retries', async () => {
    const fetchMock = stubApi({
      'GET /auth/me': [200, sessionUser({ role: 'admin' })],
      'GET /admin/users?limit=50&offset=0&user_type=internal': [500, { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on our side' }, request_id: 'req-9' }],
    });
    renderRoutes(routes, '/admin/people');
    expect(await screen.findByText('Something went wrong on our side')).toBeTruthy();
    expect(screen.getByText('req-9')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(apiCalls(fetchMock).filter((call) => call.path.startsWith('/admin/users')).length).toBe(2);
  });
});

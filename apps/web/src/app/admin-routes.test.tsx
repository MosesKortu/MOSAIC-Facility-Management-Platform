import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RequireSession } from '../features/auth/guards.tsx';
import { apiCalls, renderRoutes, sessionUser, stubApi } from '../test/render.tsx';
import { adminRoutes } from './router.tsx';
import { Shell } from './Shell.tsx';

const tree = [{ element: <RequireSession />, children: [{ element: <Shell />, children: [adminRoutes] }] }];

describe('administration area', () => {
  it('is invisible and inaccessible to non-admins, without requesting admin data', async () => {
    const fetchMock = stubApi({ 'GET /auth/me': [200, sessionUser({ role: 'auditor' })] });
    renderRoutes(tree, '/admin/people');
    expect(await screen.findByText(/don't have permission to view administration/i)).toBeTruthy();
    expect(within(screen.getByRole('navigation', { name: 'Main' })).queryByText('Administration')).toBeNull();
    expect(apiCalls(fetchMock).some((call) => call.path.startsWith('/admin/'))).toBe(false);
  });

  it('appears in the navigation for admins', async () => {
    stubApi({
      'GET /auth/me': [200, sessionUser({ role: 'admin' })],
      'GET /admin/users?limit=50&offset=0&user_type=internal': [200, { items: [], total: 0, limit: 50, offset: 0 }],
    });
    renderRoutes(tree, '/admin');
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    expect(within(nav).getByText('Administration')).toBeTruthy();
    // /admin redirects to /admin/people; wait for the redirect to settle.
    await waitFor(() => expect(within(nav).getByRole('link', { name: 'People' }).getAttribute('aria-current')).toBe('page'));
  });
});

describe('administration breadcrumb', () => {
  it('shows the section and the page', async () => {
    stubApi({
      'GET /auth/me': [200, sessionUser({ role: 'admin' })],
      'GET /admin/users?limit=50&offset=0&user_type=internal': [200, { items: [], total: 0, limit: 50, offset: 0 }],
    });
    renderRoutes(tree, '/admin/people');
    const breadcrumb = await screen.findByRole('navigation', { name: 'Breadcrumb' });
    expect(within(breadcrumb).getAllByRole('listitem').map((li) => li.textContent?.replace('›', ''))).toEqual(['Administration', 'People']);
    expect(document.title).toBe('People · MOSAIC');
  });
});

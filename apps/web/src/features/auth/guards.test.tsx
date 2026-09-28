import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { page, renderRoutes, sessionUser, stubApi } from '../../test/render.tsx';
import { RequireRole, RequireSession } from './guards.tsx';

const routes = [
  { path: '/login', element: page('login page') },
  {
    element: <RequireSession />,
    children: [
      { path: '/', element: page('home page') },
      { path: '/admin', element: <RequireRole roles={['admin']} what="administration">{page('admin secrets')}</RequireRole> },
    ],
  },
];

describe('RequireSession', () => {
  it('sends signed-out visitors to login, remembering where they were going', async () => {
    stubApi({ 'GET /auth/me': [401, { error: { code: 'UNAUTHENTICATED', message: 'Please sign in' }, request_id: 'r' }] });
    const { router } = renderRoutes(routes, '/admin');
    expect(await screen.findByText('login page')).toBeTruthy();
    expect(router.state.location.search).toBe('?next=%2Fadmin');
  });

  it('explains a deactivated account instead of looping to login', async () => {
    stubApi({ 'GET /auth/me': [403, { error: { code: 'USER_INACTIVE', message: 'Your account is deactivated' }, request_id: 'r' }] });
    renderRoutes(routes, '/');
    expect(await screen.findByText(/your account is deactivated/i)).toBeTruthy();
    expect(screen.queryByText('home page')).toBeNull();
  });

  it('renders the page for a signed-in user', async () => {
    stubApi({ 'GET /auth/me': [200, sessionUser()] });
    renderRoutes(routes, '/');
    expect(await screen.findByText('home page')).toBeTruthy();
  });
});

describe('RequireRole', () => {
  it('shows permission denied and never renders the protected content', async () => {
    stubApi({ 'GET /auth/me': [200, sessionUser({ role: 'auditor' })] });
    renderRoutes(routes, '/admin');
    expect(await screen.findByText(/don't have permission to view administration/i)).toBeTruthy();
    expect(screen.queryByText('admin secrets')).toBeNull();
  });

  it('renders the content for an allowed role', async () => {
    stubApi({ 'GET /auth/me': [200, sessionUser({ role: 'admin' })] });
    renderRoutes(routes, '/admin');
    expect(await screen.findByText('admin secrets')).toBeTruthy();
  });
});

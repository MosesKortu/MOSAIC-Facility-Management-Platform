import { screen, within } from '@testing-library/react';
import type { Role } from '@mosaic/contracts';
import { describe, expect, it } from 'vitest';
import { RequireSession } from '../features/auth/guards.tsx';
import { page, renderRoutes, sessionUser, stubApi } from '../test/render.tsx';
import { Shell } from './Shell.tsx';

function renderShellAs(role: Role) {
  stubApi({ 'GET /auth/me': [200, sessionUser({ role, full_name: 'Marc Llopis' })] });
  return renderRoutes(
    [{ element: <RequireSession />, children: [{ element: <Shell />, children: [{ path: '/', element: page('home') }] }] }],
    '/',
  );
}

describe('Shell', () => {
  it('shows the signed-in user and their role as text', async () => {
    renderShellAs('super_user');
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    expect(within(nav).getByText('Marc Llopis')).toBeTruthy();
    expect(within(nav).getByText('Super User')).toBeTruthy();
  });

  it('marks the current page in the navigation', async () => {
    renderShellAs('standard_user');
    const link = await screen.findByRole('link', { name: 'Home' });
    expect(link.getAttribute('aria-current')).toBe('page');
  });
});

describe('Shell breadcrumb', () => {
  it('names the current page in the top bar breadcrumb and the document title', async () => {
    stubApi({ 'GET /auth/me': [200, sessionUser()] });
    renderRoutes(
      [{ element: <RequireSession />, children: [{ element: <Shell />, children: [{ path: '/', element: page('home'), handle: { title: 'Home' } }] }] }],
      '/',
    );
    const breadcrumb = await screen.findByRole('navigation', { name: 'Breadcrumb' });
    expect(within(breadcrumb).getByText('Home')).toBeTruthy();
    expect(document.title).toBe('Home · MOSAIC');
  });
});

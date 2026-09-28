import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { page, renderRoutes, sessionUser, stubApi } from '../../test/render.tsx';
import { LoginPage } from './LoginPage.tsx';

const routes = [
  { path: '/login', element: <LoginPage /> },
  { path: '/', element: page('home page') },
  { path: '/bookings', element: page('bookings page') },
];
const envelope = (code: string, message: string) => ({ error: { code, message }, request_id: 'r' });

describe('LoginPage', () => {
  it('signs in and continues to the requested page', async () => {
    stubApi({ 'POST /auth/dev-login': [200, sessionUser()] });
    renderRoutes(routes, '/login?next=%2Fbookings');
    await userEvent.type(screen.getByLabelText('Email'), 'anna@icfo.test');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('bookings page')).toBeTruthy();
  });

  it('ignores off-site "next" targets', async () => {
    stubApi({ 'POST /auth/dev-login': [200, sessionUser()] });
    renderRoutes(routes, '/login?next=https%3A%2F%2Fevil.example');
    await userEvent.type(screen.getByLabelText('Email'), 'anna@icfo.test');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('home page')).toBeTruthy();
  });

  it('explains an unknown email and a deactivated account differently', async () => {
    stubApi({ 'POST /auth/dev-login': [401, envelope('UNAUTHENTICATED', 'No MOSAIC account uses this email')] });
    renderRoutes(routes, '/login');
    await userEvent.type(screen.getByLabelText('Email'), 'nobody@icfo.test');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('No MOSAIC account uses this email')).toBeTruthy();

    stubApi({ 'POST /auth/dev-login': [403, envelope('USER_INACTIVE', 'This account is deactivated')] });
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText(/account is deactivated/i)).toBeTruthy();
  });

  it('says clearly when development sign-in is not available', async () => {
    stubApi({ 'POST /auth/dev-login': [404, envelope('NOT_FOUND', 'No such endpoint')] });
    renderRoutes(routes, '/login');
    await userEvent.type(screen.getByLabelText('Email'), 'anna@icfo.test');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText(/development sign-in is not enabled/i)).toBeTruthy();
  });
});

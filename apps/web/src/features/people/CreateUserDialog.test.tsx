import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderRoutes, stubApi } from '../../test/render.tsx';
import { CreateUserDialog } from './CreateUserDialog.tsx';

const sponsor = { user_id: '22222222-2222-4222-8222-222222222222', email: 'host@icfo.test', full_name: 'Host Person', role: 'standard_user', user_type: 'internal', is_active: true, created_at: '2026-01-01T00:00:00Z', groups: [] };
const sponsorsUrl = 'GET /admin/users?is_active=true&limit=20&offset=0&user_type=internal';

function renderDialog() {
  return renderRoutes([{ path: '/', element: <CreateUserDialog open onOpenChange={() => {}} onCreated={() => {}} /> }], '/');
}

async function fillBasics(email = 'new@icfo.test') {
  await userEvent.type(screen.getByLabelText('Full name'), 'New Person');
  await userEvent.type(screen.getByLabelText('Email'), email);
  await userEvent.type(screen.getByLabelText('SSO identifier'), 'sso-new');
}

describe('CreateUserDialog', () => {
  it('requires a sponsor for an external collaborator before submitting', async () => {
    const fetchMock = stubApi({ [sponsorsUrl]: [200, { items: [sponsor], total: 1, limit: 20, offset: 0 }] });
    renderDialog();
    await fillBasics();
    await userEvent.selectOptions(screen.getByLabelText('Account type'), 'external');
    await userEvent.click(screen.getByRole('button', { name: 'Create person' }));
    expect(await screen.findByText('Choose the internal sponsor for this collaborator')).toBeTruthy();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  it('only offers the Researcher role to external collaborators', async () => {
    stubApi({ [sponsorsUrl]: [200, { items: [sponsor], total: 1, limit: 20, offset: 0 }] });
    renderDialog();
    await userEvent.selectOptions(screen.getByLabelText('Account type'), 'external');
    const roles = [...screen.getByLabelText<HTMLSelectElement>('Role').options].map((o) => o.text);
    expect(roles).toEqual(['Researcher']);
  });

  it('shows a duplicate email on the email field', async () => {
    stubApi({
      [sponsorsUrl]: [200, { items: [], total: 0, limit: 20, offset: 0 }],
      'POST /admin/users': [409, { error: { code: 'DUPLICATE', message: 'This email is already in use', details: { field: 'email' } }, request_id: 'r' }],
    });
    renderDialog();
    await fillBasics();
    await userEvent.click(screen.getByRole('button', { name: 'Create person' }));
    const email = screen.getByLabelText('Email');
    expect(await screen.findByText('This email is already in use')).toBeTruthy();
    expect(email.getAttribute('aria-invalid')).toBe('true');
  });
});

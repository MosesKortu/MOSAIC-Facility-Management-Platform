import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiCalls, renderRoutes, sessionUser, stubApi } from '../../test/render.tsx';
import { AllocationsPage } from './AllocationsPage.tsx';
import { GrantDetailPage } from './GrantDetailPage.tsx';
import { GrantsPage } from './GrantsPage.tsx';

const gid = '44444444-4444-4444-8444-444444444444';
const groupId = '33333333-3333-4333-8333-333333333333';
const pi = { user_id: '11111111-1111-4111-8111-111111111111', full_name: 'Prof. PI', email: 'pi@icfo.test' };
const allocation = {
  allocation_id: '55555555-5555-4555-8555-555555555555', grant_id: gid, grant_code: 'ICFO-2026',
  group: { group_id: 'g-other', name: 'Photonics', is_active: true }, allocated_amount: '6000.00', remaining_balance: '4500.00',
  consumed: '1500.00', is_active: true, expiration_date: '2027-12-31', created_at: '2026-01-01T00:00:00Z',
};
const grant = {
  grant_id: gid, grant_code: 'ICFO-2026', pi, expiration_date: '2027-12-31', is_expired: false, allocation_count: 1, created_at: '2026-01-01T00:00:00Z',
  allocated_budget: '10000.00', allocated_to_groups: '6000.00', unallocated: '4000.00', consumed: '1500.00', remaining_balance: '8500.00',
  allocations: [allocation],
};
const group = { group_id: groupId, name: 'Nano Electronics Group', description: null, is_active: true, created_at: '2026-01-01T00:00:00Z', internal_members: 1, external_members: 0, funding: { allocated: '0.00', remaining: '0.00', consumed: '0.00', active_allocations: 0 } };
const envelope = (code: string, message: string, details?: object) => ({ error: { code, message, details }, request_id: 'r' });
const base = {
  'GET /auth/me': [200, sessionUser({ role: 'admin' })],
  [`GET /admin/grants/${gid}`]: [200, grant],
  [`GET /admin/audit?entity_ids=${gid},55555555-5555-4555-8555-555555555555&limit=10&offset=0`]: [200, { items: [], total: 0, limit: 10, offset: 0 }],
  'GET /admin/groups?is_active=true&limit=200&offset=0': [200, { items: [group], total: 1, limit: 200, offset: 0 }],
} as const;
const detailRoutes = [{ path: '/admin/grants/:grantId', element: <GrantDetailPage /> }];

async function startAllocation() {
  await userEvent.click(await screen.findByRole('button', { name: 'Allocate to group' }));
  const dialog = await screen.findByRole('dialog');
  await userEvent.selectOptions(within(dialog).getByLabelText('Group'), groupId);
  return dialog;
}

describe('GrantDetailPage', () => {
  it('shows the budget split with every figure labelled', async () => {
    stubApi(base);
    renderRoutes(detailRoutes, `/admin/grants/${gid}`);
    expect(await screen.findByRole('heading', { level: 1, name: 'ICFO-2026' })).toBeTruthy();
    for (const amount of ['€10,000.00', '€4,000.00', '€8,500.00']) expect(screen.getAllByText(amount).length).toBeGreaterThan(0);
    expect(screen.getByRole('progressbar', { name: /€1,500.00 consumed of €10,000.00/ })).toBeTruthy();
  });

  it('checks the amount against the unallocated budget before review', async () => {
    const fetchMock = stubApi(base);
    renderRoutes(detailRoutes, `/admin/grants/${gid}`);
    const dialog = await startAllocation();
    await userEvent.type(within(dialog).getByLabelText('Amount'), '4000.01');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Review' }));
    expect(within(dialog).getByText(/only €4,000.00 is unallocated/i)).toBeTruthy();
    expect(apiCalls(fetchMock).some((c) => c.method === 'POST')).toBe(false);
  });

  it('reviews then confirms an allocation', async () => {
    const fetchMock = stubApi({ ...base, 'POST /admin/grant-allocations': [201, { ...allocation, group: { ...group, is_active: true } }] });
    renderRoutes(detailRoutes, `/admin/grants/${gid}`);
    const dialog = await startAllocation();
    await userEvent.type(within(dialog).getByLabelText('Amount'), '2500');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Review' }));
    expect(within(dialog).getByText('Nano Electronics Group')).toBeTruthy();
    expect(within(dialog).getByText('€2,500.00')).toBeTruthy();
    expect(within(dialog).getByText('€1,500.00')).toBeTruthy(); // unallocated after
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm allocation' }));
    await screen.findByRole('button', { name: 'Allocate to group' });
    expect(apiCalls(fetchMock).find((c) => c.method === 'POST')?.body).toEqual({ grant_id: gid, group_id: groupId, allocated_amount: '2500' });
  });

  it('explains a server refusal in the review step', async () => {
    stubApi({ ...base, 'POST /admin/grant-allocations': [409, envelope('OVER_ALLOCATION', 'This would allocate more than the grant budget', { unallocated: '1000.00' })] });
    renderRoutes(detailRoutes, `/admin/grants/${gid}`);
    const dialog = await startAllocation();
    await userEvent.type(within(dialog).getByLabelText('Amount'), '2500');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Review' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm allocation' }));
    expect(await within(dialog).findByText(/only €1,000.00 is still unallocated/i)).toBeTruthy();
  });

  it('shows why an allocation cannot go below what was spent', async () => {
    stubApi({ ...base, [`PATCH /admin/grant-allocations/${allocation.allocation_id}`]: [409, envelope('ALLOCATION_BELOW_CONSUMED', 'The allocation cannot be lower than what has already been spent', { consumed: '1500.00' })] });
    renderRoutes(detailRoutes, `/admin/grants/${gid}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Adjust Photonics allocation' }));
    const dialog = await screen.findByRole('dialog');
    const amount = within(dialog).getByLabelText('New amount');
    await userEvent.clear(amount);
    await userEvent.type(amount, '1000');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save amount' }));
    expect(await within(dialog).findByText(/€1,500.00 has already been spent/)).toBeTruthy();
  });
});

describe('GrantsPage', () => {
  it('lists grants and marks expired ones in text', async () => {
    stubApi({
      'GET /auth/me': [200, sessionUser({ role: 'admin' })],
      'GET /admin/grants?limit=50&offset=0': [200, { items: [grant, { ...grant, grant_id: 'old', grant_code: 'OLD-2020', is_expired: true }], total: 2, limit: 50, offset: 0 }],
    });
    renderRoutes([{ path: '/admin/grants', element: <GrantsPage /> }], '/admin/grants');
    const row = (await screen.findByRole('link', { name: 'OLD-2020' })).closest('tr')!;
    expect(within(row).getByText('Expired')).toBeTruthy();
  });
});

describe('AllocationsPage spending view', () => {
  it('ranks allocations by consumption with exact figures', async () => {
    stubApi({
      'GET /auth/me': [200, sessionUser({ role: 'admin' })],
      'GET /admin/grant-allocations?limit=50&offset=0&order=desc&sort=consumed': [200, { items: [allocation], total: 1, limit: 50, offset: 0 }],
    });
    renderRoutes([{ path: '/admin/grant-allocations', element: <AllocationsPage /> }], '/admin/grant-allocations?view=spending');
    expect(await screen.findByRole('progressbar', { name: '€1,500.00 of €6,000.00 spent (25%)' })).toBeTruthy();
  });
});

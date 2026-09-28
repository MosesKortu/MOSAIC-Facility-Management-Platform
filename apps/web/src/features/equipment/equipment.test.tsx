import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiCalls, renderRoutes, sessionUser, stubApi } from '../../test/render.tsx';
import { ChangeStatusDialog } from './ChangeStatusDialog.tsx';
import { EquipmentDetailPage } from './EquipmentDetailPage.tsx';
import { EquipmentPage } from './EquipmentPage.tsx';

const id = '66666666-6666-4666-8666-666666666666';
const cert = { theoretical_passed: false, theoretical_score: null, practical_status: 'not_requested', practical_rejection_reason: null, expires_at: null };
const summary = {
  equipment_id: id, code: 'EBL_CRESTEC', facility: 'NFL', name: 'EBL CRESTEC CABL-9510C', description: 'Electron beam lithography',
  status: 'operational', base_rate_hourly: '80.20', my_certification: { ...cert, access: 'training_required' },
};
const detail = {
  ...summary, buffer_time_minutes: 30, certification_validity_months: 24, has_interlock: false,
  availability_windows: [{ weekday: 1, opens_at: '08:00', closes_at: '12:00' }, { weekday: 1, opens_at: '13:00', closes_at: '18:00' }],
  support_tariffs: [
    { tier: 'none', rate_hourly: '0.00', is_available: true },
    { tier: 'technician', rate_hourly: '40.00', is_available: true },
    { tier: 'supervisor', rate_hourly: '60.00', is_available: false },
  ],
};
const page = (items: unknown[]) => ({ items, total: items.length, limit: 100, offset: 0 });
const me = { 'GET /auth/me': [200, sessionUser()] } as const;

describe('EquipmentPage', () => {
  it('shows each instrument with its status and my access, as text', async () => {
    stubApi({ ...me, 'GET /equipment?limit=100&offset=0': [200, page([summary, { ...summary, equipment_id: 'x', code: 'RIE', name: 'RIE Oxford', status: 'maintenance', my_certification: { ...cert, access: 'certified' } }])] });
    renderRoutes([{ path: '/equipment', element: <EquipmentPage /> }], '/equipment');
    const card = (await screen.findByRole('link', { name: /EBL CRESTEC CABL-9510C/ })).closest('li')!;
    expect(within(card).getByText('Operational')).toBeTruthy();
    expect(within(card).getByText('Training required')).toBeTruthy();
    expect(within(card).getByText('€80.20')).toBeTruthy();
    const rie = screen.getByRole('link', { name: /RIE Oxford/ }).closest('li')!;
    expect(within(rie).getByText('Maintenance')).toBeTruthy();
    expect(within(rie).getByText('Certified')).toBeTruthy();
  });

  it('filters by facility through the URL and explains an empty facility', async () => {
    stubApi({ ...me, 'GET /equipment?facility=NCL&limit=100&offset=0': [200, page([])] });
    renderRoutes([{ path: '/equipment', element: <EquipmentPage /> }], '/equipment?facility=NCL');
    expect(await screen.findByText('No instruments in the Nanocharacterization Lab yet.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'NCL' }).getAttribute('aria-pressed')).toBe('true');
  });
});

describe('EquipmentDetailPage', () => {
  const routes = [{ path: '/equipment/:equipmentId', element: <EquipmentDetailPage /> }];

  it('explains my access and the next step', async () => {
    stubApi({ ...me, [`GET /equipment/${id}`]: [200, detail] });
    renderRoutes(routes, `/equipment/${id}`);
    expect(await screen.findByRole('heading', { level: 1, name: 'EBL CRESTEC CABL-9510C' })).toBeTruthy();
    expect(screen.getByText('Read the SOP and pass the safety quiz for this instrument.')).toBeTruthy();
    expect(screen.getByText(/Manual access/)).toBeTruthy();
  });

  it('shows availability windows and pricing on their tabs, with unavailable support marked', async () => {
    stubApi({ ...me, [`GET /equipment/${id}`]: [200, detail] });
    renderRoutes(routes, `/equipment/${id}?tab=availability`);
    const monday = (await screen.findByText('Monday')).closest('tr')!;
    expect(within(monday).getByText('08:00–12:00, 13:00–18:00')).toBeTruthy();
    expect(screen.getAllByText('Closed').length).toBe(6);

    stubApi({ ...me, [`GET /equipment/${id}`]: [200, detail] });
    renderRoutes(routes, `/equipment/${id}?tab=pricing`);
    const supervisor = (await screen.findAllByText('Supervisor support')).at(-1)!.closest('tr')!;
    expect(within(supervisor).getByText('Not offered')).toBeTruthy();
  });

  it('says clearly when an instrument is no longer available', async () => {
    stubApi({ ...me, [`GET /equipment/${id}`]: [404, { error: { code: 'NOT_FOUND', message: 'This equipment does not exist', details: { entity: 'equipment' } }, request_id: 'r' }] });
    renderRoutes(routes, `/equipment/${id}`);
    expect(await screen.findByText("This instrument doesn't exist")).toBeTruthy();
  });
});

describe('ChangeStatusDialog', () => {
  function renderDialog() {
    return renderRoutes([{ path: '/', element: <ChangeStatusDialog equipment={{ equipment_id: id, code: 'EBL_CRESTEC', status: 'operational' }} onClose={() => {}} /> }], '/');
  }

  it('requires a reason before sending', async () => {
    const fetchMock = stubApi({});
    renderDialog();
    await userEvent.click(screen.getByRole('radio', { name: /Maintenance/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Change status' }));
    expect(screen.getByText('Give a reason — it is shown to affected users and kept in the history.')).toBeTruthy();
    expect(apiCalls(fetchMock)).toEqual([]);
  });

  it('reports how many bookings were affected, and that none were cancelled', async () => {
    const fetchMock = stubApi({ [`PATCH /equipment/${id}/status`]: [200, { equipment: { ...detail, status: 'maintenance' }, affected_bookings: 2 }] });
    renderDialog();
    await userEvent.click(screen.getByRole('radio', { name: /Maintenance/ }));
    await userEvent.type(screen.getByLabelText('Reason'), 'Chamber pump service');
    await userEvent.click(screen.getByRole('button', { name: 'Change status' }));
    expect(await screen.findByText(/2 upcoming bookings/)).toBeTruthy();
    expect(screen.getByText(/nothing was cancelled/i)).toBeTruthy();
    expect(apiCalls(fetchMock)[0]?.body).toEqual({ status: 'maintenance', reason: 'Chamber pump service' });
  });
});

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiCalls, renderRoutes, sessionUser, stubApi } from '../../test/render.tsx';
import { AvailabilityEditor } from './AvailabilityEditor.tsx';
import { EquipmentFormDialog } from './EquipmentFormDialog.tsx';
import { TariffsPage } from './TariffsPage.tsx';

const id = '66666666-6666-4666-8666-666666666666';
const envelope = (code: string, message: string, details?: object) => ({ error: { code, message, details }, request_id: 'r' });

describe('EquipmentFormDialog', () => {
  const render = () => renderRoutes([{ path: '/', element: <EquipmentFormDialog open onOpenChange={() => {}} /> }], '/');

  it('validates required fields and money before sending', async () => {
    const fetchMock = stubApi({});
    render();
    await userEvent.type(screen.getByLabelText('Hourly rate'), '80.205');
    await userEvent.click(screen.getByRole('button', { name: 'Add instrument' }));
    expect(await screen.findByText('Enter an amount like 80.20')).toBeTruthy();
    expect(screen.getAllByText('An English value is required').length).toBe(2);
    expect(apiCalls(fetchMock)).toEqual([]);
  });

  it('puts a duplicate code on the code field', async () => {
    stubApi({ 'POST /admin/equipment': [409, envelope('DUPLICATE', 'This code is already in use', { field: 'code' })] });
    render();
    await userEvent.type(screen.getByLabelText('Code'), 'EBL_CRESTEC');
    await userEvent.type(screen.getByLabelText('Name (English)'), 'EBL CRESTEC');
    await userEvent.type(screen.getByLabelText('Description (English)'), 'Electron beam lithography');
    await userEvent.type(screen.getByLabelText('Hourly rate'), '80.20');
    await userEvent.click(screen.getByRole('button', { name: 'Add instrument' }));
    expect(await screen.findByText('This code is already in use')).toBeTruthy();
    expect(screen.getByLabelText('Code').getAttribute('aria-invalid')).toBe('true');
  });
});

describe('AvailabilityEditor', () => {
  const windows = [{ weekday: 1, opens_at: '08:00', closes_at: '12:00' }];

  it('adds a window and saves the whole week', async () => {
    const fetchMock = stubApi({ [`PUT /admin/equipment/${id}/availability`]: [200, {}] });
    renderRoutes([{ path: '/', element: <AvailabilityEditor equipmentId={id} windows={windows} /> }], '/');
    await userEvent.click(screen.getByRole('button', { name: 'Add hours on Tuesday' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save hours' }));
    expect(await screen.findByText('Weekly hours saved.')).toBeTruthy();
    expect(apiCalls(fetchMock)[0]?.body).toEqual({ windows: [...windows, { weekday: 2, opens_at: '09:00', closes_at: '17:00' }] });
  });

  it('explains overlapping hours', async () => {
    stubApi({ [`PUT /admin/equipment/${id}/availability`]: [422, envelope('WINDOW_OVERLAP', 'Availability windows on the same day must not overlap', { weekday: 1 })] });
    renderRoutes([{ path: '/', element: <AvailabilityEditor equipmentId={id} windows={windows} /> }], '/');
    await userEvent.click(screen.getByRole('button', { name: 'Add hours on Monday' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save hours' }));
    expect(await screen.findByText(/Monday has overlapping hours/)).toBeTruthy();
  });
});

describe('TariffsPage', () => {
  it('edits a support rate and explains that past bookings keep their price', async () => {
    const tariffs = [
      { tier: 'none', rate_hourly: '0.00', is_available: true },
      { tier: 'technician', rate_hourly: '40.00', is_available: true },
      { tier: 'supervisor', rate_hourly: '60.00', is_available: true },
    ];
    const fetchMock = stubApi({
      'GET /auth/me': [200, sessionUser({ role: 'admin' })],
      'GET /admin/tariffs': [200, tariffs],
      'PATCH /admin/tariffs/technician': [200, { tier: 'technician', rate_hourly: '45.00', is_available: true }],
    });
    renderRoutes([{ path: '/admin/tariffs', element: <TariffsPage /> }], '/admin/tariffs');
    expect(screen.getByText(/Existing bookings keep the price/)).toBeTruthy();
    const row = (await screen.findByText('Technician support')).closest('tr')!;
    expect(within(row).queryByRole('button', { name: /edit/i })).toBeTruthy();
    const none = screen.getByText('Autonomous').closest('tr')!;
    expect(within(none).queryByRole('button', { name: /edit/i })).toBeNull();

    await userEvent.click(within(row).getByRole('button', { name: 'Edit Technician support' }));
    const dialog = await screen.findByRole('dialog');
    const rate = within(dialog).getByLabelText('Hourly rate');
    await userEvent.clear(rate);
    await userEvent.type(rate, '45.00');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save tariff' }));
    await screen.findByText('Technician support');
    expect(apiCalls(fetchMock).find((c) => c.method === 'PATCH')?.body).toEqual({ rate_hourly: '45.00', is_available: true });
  });
});

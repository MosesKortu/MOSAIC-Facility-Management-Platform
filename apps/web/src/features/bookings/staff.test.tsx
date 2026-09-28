import { FACILITY_TIMEZONE, zonedToInstant } from '@mosaic/contracts';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toQueryString } from '../../lib/query-string.ts';
import { apiCalls, page, renderRoutes, sessionUser, stubApi } from '../../test/render.tsx';
import { AllBookingsPage } from './AllBookingsPage.tsx';
import { BookingDetailPage } from './BookingDetailPage.tsx';
import { BookingPage } from './BookingPage.tsx';
import { addDays, dayRange, todayLocal } from './slots.ts';

const eid = '66666666-6666-4666-8666-666666666666';
const aid = '88888888-8888-4888-8888-888888888888';
const bid = '99999999-9999-4999-8999-999999999999';
const anna = { user_id: '11111111-1111-4111-8111-111111111111', full_name: 'Anna Kowalski', email: 'anna@icfo.test' };
const staff = sessionUser({ role: 'super_user', full_name: 'Marc Tech', user_id: '22222222-2222-4222-8222-222222222222' });
const me = { 'GET /auth/me': [200, staff] } as const;
const date = addDays(todayLocal(), 30);
const at = (hours: number) => zonedToInstant(date, hours * 60, FACILITY_TIMEZONE).toISOString();
const windows = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, opens_at: '09:00', closes_at: '12:00' }));
const free = { timezone: 'Europe/Madrid', buffer_time_minutes: 30, windows, busy: [] };
const availability = (d: string) => `GET /equipment/${eid}/availability${toQueryString(dayRange(d))}`;
const equipment = (status = 'operational') => ({
  equipment_id: eid, code: 'EBL', facility: 'NFL', name: 'EBL CRESTEC', description: 'EBL', status, base_rate_hourly: '100.00',
  buffer_time_minutes: 30, certification_validity_months: 24, has_interlock: false, availability_windows: windows,
  support_tariffs: [{ tier: 'none', rate_hourly: '0.00', is_available: true }],
  // The staff member is not certified themselves: that must not block booking for someone else.
  my_certification: { access: 'training_required', theoretical_passed: false, theoretical_score: null, practical_status: 'not_requested', practical_rejection_reason: null, expires_at: null },
});
const funding = [{ allocation_id: aid, grant_id: 'g1', grant_code: 'ES-042', group: { group_id: 'gr1', name: 'Nano Group' }, remaining_balance: '1000.00', expiration_date: '2099-12-31', usable: true, unusable_reason: null }];
const quote = { duration_minutes: 30, calculated_base_cost: '50.00', calculated_support_cost: '0.00', total_cost: '50.00', allocation_remaining_after: '950.00' };
const bookRoutes = [{ path: '/equipment/:equipmentId/book', element: <BookingPage /> }, { path: '/bookings/:bookingId', element: page('booking detail') }];

async function pickTimeSupportFunding() {
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: date } });
  await userEvent.selectOptions(await screen.findByLabelText('Start time'), '10:00');
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Continue' }));
  await userEvent.click(await screen.findByRole('radio', { name: /ES-042/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
}

describe('staff booking', () => {
  it('books on behalf of a researcher with their funding', async () => {
    const fetchMock = stubApi({
      ...me, [`GET /equipment/${eid}`]: [200, equipment()],
      [availability(todayLocal())]: [200, free], [availability(date)]: [200, free],
      'GET /bookings/beneficiaries': [200, [anna]], 'GET /bookings/beneficiaries?q=anna': [200, [anna]],
      [`GET /funding/me?user_id=${anna.user_id}`]: [200, funding],
      'POST /bookings/quote': [200, quote], 'POST /bookings': [201, { booking_id: bid, status: 'confirmed', ...quote }],
    });
    renderRoutes(bookRoutes, `/equipment/${eid}/book`);
    await userEvent.click(await screen.findByRole('radio', { name: 'Someone else' }));
    await userEvent.type(screen.getByLabelText('Search people'), 'anna');
    await userEvent.click(await screen.findByRole('radio', { name: /Anna Kowalski/ }));
    await pickTimeSupportFunding();

    expect(within(await screen.findByRole('region', { name: 'Review' })).getByText('Anna Kowalski')).toBeTruthy();
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm booking' }));
    expect(await screen.findByText('booking detail')).toBeTruthy();
    const post = apiCalls(fetchMock).find((c) => c.path === '/bookings');
    expect(post?.body).toMatchObject({ on_behalf_of_user_id: anna.user_id, force_override: false, start_time: at(10) });
  });

  it('can override a non-operational instrument only by saying so explicitly', async () => {
    const fetchMock = stubApi({
      ...me, [`GET /equipment/${eid}`]: [200, equipment('maintenance')],
      [availability(todayLocal())]: [200, free], [availability(date)]: [200, free],
      'GET /funding/me': [200, funding], 'POST /bookings/quote': [200, quote],
    });
    renderRoutes(bookRoutes, `/equipment/${eid}/book`);
    expect(await screen.findByText(/This instrument is under maintenance/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: date } });
    await userEvent.selectOptions(await screen.findByLabelText('Start time'), '10:00');
    expect(screen.getByRole('button', { name: 'Continue' }).hasAttribute('disabled')).toBe(true);
    await userEvent.click(screen.getByRole('checkbox', { name: /Book despite the status/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Continue' }));
    await userEvent.click(await screen.findByRole('radio', { name: /ES-042/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(apiCalls(fetchMock).find((c) => c.path === '/bookings/quote')?.body).toMatchObject({ force_override: true }));
  });
});

const summary = (overrides: object = {}) => ({
  booking_id: bid, equipment: { equipment_id: eid, code: 'EBL', name: 'EBL CRESTEC' }, user: anna, booked_by: anna,
  start_time: at(10), end_time: at(11), status: 'confirmed', support_requested: 'none', calculated_base_cost: '100.00',
  calculated_support_cost: '0.00', total_cost: '100.00', grant_code: 'ES-042', group: { group_id: 'gr1', name: 'Nano Group' },
  force_override: false, cancelled_at: null, cancellation_reason: null, created_at: '2026-09-28T10:00:00Z', ...overrides,
});

describe('AllBookingsPage', () => {
  afterEach(() => { vi.useRealTimers(); });

  it("lists everyone's upcoming bookings with who they are for", async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-28T10:00:30Z') });
    stubApi({
      ...me,
      [`GET /bookings${toQueryString({ from: '2026-09-28T10:00:00.000Z', limit: 20, offset: 0, order: 'asc', scope: 'all', status: 'confirmed' })}`]:
        [200, { items: [summary()], total: 1, limit: 20, offset: 0 }],
    });
    renderRoutes([{ path: '/operations/bookings', element: <AllBookingsPage /> }], '/operations/bookings');
    expect(await screen.findByText('Anna Kowalski')).toBeTruthy();
    expect(screen.getByRole('link', { name: /EBL CRESTEC/ }).getAttribute('href')).toBe(`/bookings/${bid}`);
  });
});

describe('staff cancellation', () => {
  it("requires a reason to cancel someone else's booking", async () => {
    const fetchMock = stubApi({
      ...me,
      [`GET /bookings/${bid}`]: [200, { ...summary(), cancellable: true, session_events: [] }],
      [`PATCH /bookings/${bid}/cancel`]: [200, { ...summary({ status: 'cancelled', cancelled_at: '2026-09-28T11:00:00Z', cancellation_reason: 'Vented' }), cancellable: false, session_events: [] }],
    });
    renderRoutes([{ path: '/bookings/:bookingId', element: <BookingDetailPage /> }], `/bookings/${bid}`);
    expect((await screen.findByRole('link', { name: /All bookings/ })).getAttribute('href')).toBe('/operations/bookings');
    expect(screen.getByText('Booked for')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel booking' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel booking' }));
    expect(within(dialog).getByText(/Anna Kowalski is notified/)).toBeTruthy();
    expect(apiCalls(fetchMock).some((c) => c.method === 'PATCH')).toBe(false);
    await userEvent.type(within(dialog).getByLabelText('Reason'), 'Vented');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel booking' }));
    await waitFor(() => expect(apiCalls(fetchMock).find((c) => c.method === 'PATCH')?.body).toEqual({ reason: 'Vented' }));
  });
});

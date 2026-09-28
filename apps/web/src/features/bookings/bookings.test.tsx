import { FACILITY_TIMEZONE, zonedToInstant } from '@mosaic/contracts';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toQueryString } from '../../lib/query-string.ts';
import { apiCalls, page, renderRoutes, sessionUser, stubApi } from '../../test/render.tsx';
import { BookingDetailPage } from './BookingDetailPage.tsx';
import { BookingPage } from './BookingPage.tsx';
import { MyBookingsPage } from './MyBookingsPage.tsx';
import { addDays, dayRange, todayLocal } from './slots.ts';

const eid = '66666666-6666-4666-8666-666666666666';
const aid = '88888888-8888-4888-8888-888888888888';
const bid = '99999999-9999-4999-8999-999999999999';
const envelope = (code: string, message: string, details: object = {}) => ({ error: { code, message, details }, request_id: 'r' });
const me = { 'GET /auth/me': [200, sessionUser()] } as const;

const date = addDays(todayLocal(), 30);
const at = (hours: number) => zonedToInstant(date, hours * 60, FACILITY_TIMEZONE).toISOString();
const availabilityUrl = (d: string) => `GET /equipment/${eid}/availability${toQueryString(dayRange(d))}`;
const windows = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, opens_at: '09:00', closes_at: '12:00' }));

const equipment = (access = 'certified', status = 'operational') => ({
  equipment_id: eid, code: 'EBL', facility: 'NFL', name: 'EBL CRESTEC', description: 'EBL', status, base_rate_hourly: '100.00',
  buffer_time_minutes: 30, certification_validity_months: 24, has_interlock: false, availability_windows: windows,
  support_tariffs: [
    { tier: 'none', rate_hourly: '0.00', is_available: true },
    { tier: 'technician', rate_hourly: '40.00', is_available: true },
    { tier: 'supervisor', rate_hourly: '60.00', is_available: false },
  ],
  my_certification: { access, theoretical_passed: true, theoretical_score: 100, practical_status: 'signed_off', practical_rejection_reason: null, expires_at: null },
});
const funding = [
  { allocation_id: aid, grant_id: 'g1', grant_code: 'ES-042', group: { group_id: 'gr1', name: 'Nano Group' }, remaining_balance: '1000.00', expiration_date: '2099-12-31', usable: true, unusable_reason: null },
  { allocation_id: 'a2', grant_id: 'g2', grant_code: 'OLD-01', group: { group_id: 'gr1', name: 'Nano Group' }, remaining_balance: '50.00', expiration_date: '2020-01-01', usable: false, unusable_reason: 'grant_expired' },
];
const quote = { duration_minutes: 60, calculated_base_cost: '100.00', calculated_support_cost: '40.00', total_cost: '140.00', allocation_remaining_after: '860.00' };
const bookingRoutes = [
  { path: '/equipment/:equipmentId/book', element: <BookingPage /> },
  { path: '/bookings/:bookingId', element: page('booking detail') },
  { path: '/training/:equipmentId', element: page('training') },
];

async function chooseSlot() {
  fireEvent.change(await screen.findByLabelText('Date'), { target: { value: date } });
  await userEvent.selectOptions(await screen.findByLabelText('Start time'), '10:00');
  await userEvent.selectOptions(screen.getByLabelText('Duration'), '1 h');
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await userEvent.click(await screen.findByRole('radio', { name: /Technician support/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await userEvent.click(await screen.findByRole('radio', { name: /ES-042/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
}

describe('BookingPage', () => {
  it('books a free slot: time, support, funding, a live quote, then confirmation', async () => {
    const fetchMock = stubApi({
      ...me,
      [`GET /equipment/${eid}`]: [200, equipment()],
      [availabilityUrl(todayLocal())]: [200, { timezone: 'Europe/Madrid', buffer_time_minutes: 30, windows, busy: [] }],
      [availabilityUrl(date)]: [200, { timezone: 'Europe/Madrid', buffer_time_minutes: 30, windows, busy: [{ start: at(9), end: at(9.75), mine: false }] }],
      'GET /funding/me': [200, funding],
      'POST /bookings/quote': [200, quote],
      'POST /bookings': [201, { booking_id: bid, status: 'confirmed', ...quote }],
    });
    renderRoutes(bookingRoutes, `/equipment/${eid}/book`);

    fireEvent.change(await screen.findByLabelText('Date'), { target: { value: date } });
    const start = await screen.findByLabelText('Start time');
    await waitFor(() => expect(within(start).queryByRole('option', { name: '09:00' })).toBeNull()); // busy until 09:45
    expect(screen.getByText(/09:00–09:45/)).toBeTruthy();
    await chooseSlot();

    const review = await screen.findByRole('region', { name: 'Review' });
    expect(await within(review).findByText('€140.00')).toBeTruthy();
    expect(within(review).getByText('€860.00')).toBeTruthy();
    expect(within(review).queryByText(/OLD-01/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Confirm booking' }));
    expect(await screen.findByText('booking detail')).toBeTruthy();

    const body = { equipment_id: eid, allocation_id: aid, start_time: at(10), end_time: at(11), support_requested: 'technician' };
    const posts = apiCalls(fetchMock).filter((c) => c.method === 'POST');
    expect(posts).toEqual([{ method: 'POST', path: '/bookings/quote', body }, { method: 'POST', path: '/bookings', body }]);
  });

  it('shows unusable funding with its reason and cannot pick it', async () => {
    stubApi({
      ...me, [`GET /equipment/${eid}`]: [200, equipment()], 'GET /funding/me': [200, funding],
      [availabilityUrl(todayLocal())]: [200, { timezone: 'Europe/Madrid', buffer_time_minutes: 30, windows, busy: [] }],
      [availabilityUrl(date)]: [200, { timezone: 'Europe/Madrid', buffer_time_minutes: 30, windows, busy: [] }],
    });
    renderRoutes(bookingRoutes, `/equipment/${eid}/book`);
    fireEvent.change(await screen.findByLabelText('Date'), { target: { value: date } });
    await userEvent.selectOptions(await screen.findByLabelText('Start time'), '10:00');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Continue' }));
    const expired = await screen.findByRole('radio', { name: /OLD-01/ });
    expect(expired.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('The grant has expired')).toBeTruthy();
  });

  it('sends uncertified users to training without loading booking data', async () => {
    const fetchMock = stubApi({ ...me, [`GET /equipment/${eid}`]: [200, equipment('training_required')] });
    renderRoutes(bookingRoutes, `/equipment/${eid}/book`);
    expect(await screen.findByRole('link', { name: 'Go to training' })).toBeTruthy();
    expect(apiCalls(fetchMock).some((c) => c.path.includes('availability') || c.path.startsWith('/funding'))).toBe(false);
  });

  it('explains a conflict found at review and returns to the time step', async () => {
    stubApi({
      ...me, [`GET /equipment/${eid}`]: [200, equipment()], 'GET /funding/me': [200, funding],
      [availabilityUrl(todayLocal())]: [200, { timezone: 'Europe/Madrid', buffer_time_minutes: 30, windows, busy: [] }],
      [availabilityUrl(date)]: [200, { timezone: 'Europe/Madrid', buffer_time_minutes: 30, windows, busy: [] }],
      'POST /bookings/quote': [409, envelope('BOOKING_CONFLICT', 'Overlaps', { next_available: at(11) })],
    });
    renderRoutes(bookingRoutes, `/equipment/${eid}/book`);
    await chooseSlot();
    expect(await screen.findByText('Someone booked this time first')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Confirm booking' }).hasAttribute('disabled')).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Change the time' }));
    expect(await screen.findByLabelText('Start time')).toBeTruthy();
  });
});

const summary = (overrides: object = {}) => ({
  booking_id: bid, equipment: { equipment_id: eid, code: 'EBL', name: 'EBL CRESTEC' },
  user: { user_id: sessionUser().user_id, full_name: 'Anna Kowalski', email: 'anna@icfo.test' },
  booked_by: { user_id: sessionUser().user_id, full_name: 'Anna Kowalski', email: 'anna@icfo.test' },
  start_time: at(10), end_time: at(11), status: 'confirmed', support_requested: 'technician',
  calculated_base_cost: '100.00', calculated_support_cost: '40.00', total_cost: '140.00', grant_code: 'ES-042',
  group: { group_id: 'gr1', name: 'Nano Group' }, force_override: false, cancelled_at: null, cancellation_reason: null,
  created_at: '2026-09-28T10:00:00Z', ...overrides,
});

describe('MyBookingsPage', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('lists upcoming confirmed bookings and past ones in the URL', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-28T10:00:30Z') });
    const now = '2026-09-28T10:00:00.000Z';
    stubApi({
      ...me,
      [`GET /bookings${toQueryString({ from: now, limit: 20, offset: 0, order: 'asc', status: 'confirmed' })}`]: [200, { items: [summary()], total: 1, limit: 20, offset: 0 }],
      [`GET /bookings${toQueryString({ limit: 20, offset: 0, order: 'desc', to: now })}`]: [200, { items: [], total: 0, limit: 20, offset: 0 }],
    });
    const { router } = renderRoutes([{ path: '/bookings', element: <MyBookingsPage /> }], '/bookings');
    const row = await screen.findByRole('link', { name: /EBL CRESTEC/ });
    expect(row.getAttribute('href')).toBe(`/bookings/${bid}`);
    expect(screen.getByText('€140.00')).toBeTruthy();
    expect(screen.getByText('Confirmed')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Past' }));
    expect(router.state.location.search).toBe('?when=past');
    expect(await screen.findByText('No past bookings')).toBeTruthy();
  });
});

describe('BookingDetailPage', () => {
  const routes = [{ path: '/bookings/:bookingId', element: <BookingDetailPage /> }];

  it('shows the booking and cancels it with a full refund', async () => {
    let cancelled = false;
    const detail = () => ({ ...summary(cancelled ? { status: 'cancelled', cancelled_at: '2026-09-28T11:00:00Z' } : {}), cancellable: !cancelled, session_events: [] });
    const fetchMock = stubApi({
      ...me,
      [`GET /bookings/${bid}`]: () => [200, detail()],
      [`PATCH /bookings/${bid}/cancel`]: () => { cancelled = true; return [200, detail()]; },
    });
    renderRoutes(routes, `/bookings/${bid}`);
    expect(await screen.findByRole('heading', { name: 'EBL CRESTEC' })).toBeTruthy();
    expect(screen.getByText('Technician support')).toBeTruthy();
    expect(screen.getByText(/You can start your session from 09:45/)).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel booking' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/€140.00 is refunded/)).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel booking' }));
    expect(await screen.findByText('Cancelled')).toBeTruthy();
    expect(apiCalls(fetchMock).find((c) => c.method === 'PATCH')?.body).toEqual({});
    expect(screen.queryByRole('button', { name: 'Cancel booking' })).toBeNull();
  });

  it('explains why a started slot cannot be cancelled', async () => {
    stubApi({
      ...me,
      [`GET /bookings/${bid}`]: [200, { ...summary(), cancellable: true, session_events: [] }],
      [`PATCH /bookings/${bid}/cancel`]: [409, envelope('SLOT_ALREADY_STARTED', 'Started')],
    });
    renderRoutes(routes, `/bookings/${bid}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel booking' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel booking' }));
    expect(await screen.findByText(/already started, so it can no longer be cancelled/)).toBeTruthy();
  });

  it('reports a booking that is not visible as not found', async () => {
    stubApi({ ...me, [`GET /bookings/${bid}`]: [404, envelope('NOT_FOUND', 'No', { entity: 'booking' })] });
    renderRoutes(routes, `/bookings/${bid}`);
    expect(await screen.findByText("This booking doesn't exist")).toBeTruthy();
  });
});

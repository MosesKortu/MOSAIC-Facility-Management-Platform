import { AvailabilityQuery, BeneficiaryQuery, BookingBody, BookingListQuery, CancelBookingBody, FundingQuery } from '@mosaic/contracts';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type pg from 'pg';
import type { Config } from '../../config.ts';
import { RESEARCHERS, STAFF } from '../../http/access.ts';
import { pickLocale } from '../../http/locale.ts';
import { parseId } from '../../http/params.ts';
import { parseWith } from '../../http/validation.ts';
import * as service from './service.ts';

/** Booking and the reads it needs. Data-dependent rules (owner or staff, proxy) live in the service. */
export function registerBookingRoutes(app: FastifyInstance, pool: pg.Pool, config: Config) {
  const tz = config.facilityTimezone;
  const researchers = { config: { access: RESEARCHERS } };
  const locale = (request: FastifyRequest) => pickLocale(request.headers['accept-language']);
  const bookingId = (params: unknown) => parseId(params, 'bookingId', 'booking');

  app.get('/api/v1/equipment/:equipmentId/availability', researchers, async (request) =>
    service.availability(pool, request.actor!, parseId(request.params, 'equipmentId', 'equipment'), parseWith(AvailabilityQuery, request.query), tz));
  app.get('/api/v1/funding/me', researchers, async (request) =>
    service.fundingOptions(pool, request.actor!, parseWith(FundingQuery, request.query).user_id, tz));

  app.post('/api/v1/bookings/quote', researchers, async (request) =>
    service.quoteBooking(pool, request.actor!, parseWith(BookingBody, request.body), tz));
  app.post('/api/v1/bookings', researchers, async (request, reply) =>
    reply.status(201).send(await service.createBooking(pool, request.actor!, parseWith(BookingBody, request.body), tz)));

  app.get('/api/v1/bookings', researchers, async (request) =>
    service.listBookings(pool, request.actor!, locale(request), parseWith(BookingListQuery, request.query)));
  app.get('/api/v1/bookings/beneficiaries', { config: { access: STAFF } }, async (request) =>
    service.searchBeneficiaries(pool, parseWith(BeneficiaryQuery, request.query).q));
  app.get('/api/v1/bookings/:bookingId', researchers, async (request) =>
    service.getBooking(pool, request.actor!, locale(request), bookingId(request.params)));
  app.patch('/api/v1/bookings/:bookingId/cancel', researchers, async (request) =>
    service.cancelBooking(pool, request.actor!, locale(request), bookingId(request.params), parseWith(CancelBookingBody, request.body ?? {})));
}

import {
  type BookingBody, centsToDecimal, costForDuration, decimalToCents, localParts, type Availability, type AvailabilityQuery, type BookingCreated,
  type BookingDetail, type BookingListQuery, type BookingQuote, type BookingSummary, type CancelBookingBody, type FundingOption,
  type Locale, type Page, type PersonRef, type UnusableReason,
} from '@mosaic/contracts';
import type pg from 'pg';
import type { z } from 'zod';
import { withTransaction, type Queryable } from '../../db/pool.ts';
import { RESEARCHERS, STAFF, type Actor } from '../../http/access.ts';
import { DomainError } from '../../http/errors.ts';
import { localize } from '../../http/locale.ts';
import { notFound } from '../../http/params.ts';
import { recordAudit } from '../audit/service.ts';
import { accessState } from '../certifications/access.ts';
import * as equipmentRepo from '../equipment/repository.ts';
import { notify, notifyGroupMembers } from '../notifications/service.ts';
import * as repo from './repository.ts';
import { checkSlot, nextAvailable, overlaps, widen } from './slots.ts';

/**
 * Booking (03 §3.1). Every gate runs in one transaction, in contract order, holding the locks
 * equipment → allocation → grant (09 §4). Rules beyond the docs are recorded in 09 D20.
 */

type Body = z.output<typeof BookingBody>;
const isStaff = (actor: Actor) => STAFF.includes(actor.role);
const DAY = 24 * 3600_000;
/** An allocation is "low" below this share of its amount; the group is told once per crossing (D20). */
const LOW_BALANCE_PERCENT = 10;

interface Evaluation {
  quote: BookingQuote;
  beneficiaryId: string;
  proxy: boolean;
  overrideUsed: boolean;
  start: Date;
  end: Date;
  allocation: repo.LockedAllocation;
  grantCode: string;
  base: number;
  support: number;
}

async function evaluate(tx: Queryable, actor: Actor, body: Body, tz: string, now: Date): Promise<Evaluation> {
  // 2. Proxy / override permission, then the beneficiary every later gate is evaluated against.
  const proxy = Boolean(body.on_behalf_of_user_id) && body.on_behalf_of_user_id !== actor.userId;
  if ((proxy || body.force_override) && !isStaff(actor)) {
    throw new DomainError('PROXY_NOT_PERMITTED', 'Only super users and administrators can book on behalf of others or override status');
  }
  const beneficiaryId = proxy ? body.on_behalf_of_user_id! : actor.userId;
  if (proxy) {
    const user = await repo.findUser(tx, beneficiaryId);
    if (!user?.is_active || !RESEARCHERS.includes(user.role as Actor['role'])) throw notFound('user');
  }

  // 3. Equipment (locked: serialises bookings per instrument for the buffer check).
  const equipment = await equipmentRepo.lockEquipment(tx, body.equipment_id);
  if (!equipment?.is_active) throw notFound('equipment');

  // 4. Duration → past → availability window.
  const start = new Date(body.start_time);
  const end = new Date(body.end_time);
  const windows = (await equipmentRepo.windowsFor(tx, [equipment.equipment_id])).get(equipment.equipment_id)!;
  const minutes = checkSlot(start, end, now, windows, tz);

  // 5. Operational status; an authorized override bypasses only this gate.
  const overrideUsed = body.force_override && equipment.status !== 'operational';
  if (equipment.status !== 'operational' && !body.force_override) {
    throw new DomainError('EQUIPMENT_NOT_OPERATIONAL', `This instrument is ${equipment.status}`, { status: equipment.status });
  }

  // 6. Support tier.
  const tariff = await repo.tariff(tx, body.support_requested);
  if (!tariff.is_available) {
    throw new DomainError('SUPPORT_UNAVAILABLE', 'This support level is not offered at the moment', { tier: body.support_requested });
  }

  // 7. Certification: the single access definition, valid for the whole slot (D20).
  const cert = await repo.certification(tx, beneficiaryId, equipment.equipment_id);
  switch (accessState(cert, end)) {
    case 'training_required':
      throw new DomainError('CERTIFICATION_REQUIRED', 'Complete the SOP and safety quiz for this instrument first');
    case 'assessment_required': case 'assessment_pending': case 'reassessment_needed':
      throw new DomainError('PRACTICAL_CERTIFICATION_PENDING', 'The practical assessment for this instrument is not signed off',
        { practical_status: cert!.practical_status });
    case 'expired':
      throw new DomainError('CERTIFICATION_EXPIRED', 'The certification for this instrument expires before the session ends',
        { expired_at: cert!.expires_at!.toISOString() });
    case 'certified':
      break;
  }

  // 8. Allocation of an active group the beneficiary belongs to, then the grant's expiry.
  const allocation = await repo.lockAllocation(tx, body.allocation_id, beneficiaryId);
  if (!allocation?.is_active || !allocation.group_active || !allocation.is_member) {
    throw new DomainError('ALLOCATION_NOT_AVAILABLE', 'This funding is not available for this booking');
  }
  const grant = await repo.lockGrant(tx, allocation.grant_id);
  if (grant.expiration_date < localParts(start, tz).date) {
    throw new DomainError('GRANT_EXPIRED', 'The grant expires before this booking', { expired_on: grant.expiration_date });
  }

  // 9. Slot free, including the buffer on both sides.
  const buffer = equipment.buffer_time_minutes;
  const blocked = widen(start, end, buffer);
  const nearby = await repo.bookingsIn(tx, equipment.equipment_id, blocked);
  if (nearby.length > 0) {
    const horizon = await repo.bookingsIn(tx, equipment.equipment_id, { start: blocked.start, end: new Date(start.getTime() + 15 * DAY) });
    const busy = horizon.map((b) => widen(b.start, b.end, buffer));
    throw new DomainError('BOOKING_CONFLICT', 'This slot overlaps another booking or its buffer time', {
      next_available: nextAvailable({ windows, busy, minutes, after: start, tz }),
    });
  }

  // 10. Balance: the allocation and its grant must both cover the total.
  const base = costForDuration(decimalToCents(equipment.base_rate_hourly), minutes);
  const support = costForDuration(decimalToCents(tariff.rate_hourly), minutes);
  const total = base + support;
  const available = Math.min(decimalToCents(allocation.remaining_balance), decimalToCents(grant.remaining_balance));
  if (available < total) {
    throw new DomainError('INSUFFICIENT_GRANT_BALANCE', 'There is not enough funding left for this booking', {
      shortfall: centsToDecimal(total - available), available: centsToDecimal(available),
    });
  }

  return {
    quote: {
      duration_minutes: minutes, calculated_base_cost: centsToDecimal(base), calculated_support_cost: centsToDecimal(support),
      total_cost: centsToDecimal(total), allocation_remaining_after: centsToDecimal(decimalToCents(allocation.remaining_balance) - total),
    },
    beneficiaryId, proxy, overrideUsed, start, end, allocation, grantCode: grant.grant_code, base, support,
  };
}

/** POST /bookings/quote — every gate, with the same locks, writing nothing. */
export async function quoteBooking(pool: pg.Pool, actor: Actor, body: Body, tz: string): Promise<BookingQuote> {
  return withTransaction(pool, async (tx) => (await evaluate(tx, actor, body, tz, new Date())).quote);
}

export async function createBooking(pool: pg.Pool, actor: Actor, body: Body, tz: string): Promise<BookingCreated> {
  return withTransaction(pool, async (tx) => {
    const e = await evaluate(tx, actor, body, tz, new Date());
    const total = e.base + e.support;
    const bookingId = await repo.insertBooking(tx, {
      equipment_id: body.equipment_id, user_id: e.beneficiaryId, booked_by_user_id: actor.userId, grant_id: e.allocation.grant_id,
      allocation_id: e.allocation.allocation_id, support_requested: body.support_requested, start: e.start, end: e.end,
      base: centsToDecimal(e.base), support: centsToDecimal(e.support), force_override: e.overrideUsed,
    });
    await repo.adjustBalances(tx, e.allocation.allocation_id, e.allocation.grant_id, centsToDecimal(-total));

    if (e.proxy || e.overrideUsed) {
      await recordAudit(tx, {
        actorUserId: actor.userId, action: 'booking.created', entityType: 'booking', entityId: bookingId,
        after: {
          equipment_id: body.equipment_id, start_time: e.start.toISOString(), end_time: e.end.toISOString(), total_cost: e.quote.total_cost,
          on_behalf_of: e.proxy ? e.beneficiaryId : null, force_override: e.overrideUsed,
        },
      });
    }

    const amount = decimalToCents(e.allocation.allocated_amount);
    const before = decimalToCents(e.allocation.remaining_balance);
    const after = before - total;
    const isLow = (balance: number) => balance * 100 < amount * LOW_BALANCE_PERCENT;
    if (isLow(after) && !isLow(before)) {
      await notifyGroupMembers(tx, e.allocation.group_id, 'allocation_low_balance', {
        grant_code: e.grantCode, group_name: e.allocation.group_name,
        allocated_amount: e.allocation.allocated_amount, remaining_balance: centsToDecimal(after),
      });
    }
    return { booking_id: bookingId, status: 'confirmed', ...e.quote };
  });
}

// ─── Cancel ────────────────────────────────────────────────────────────────────────────────────

/**
 * Cancels before the slot starts with a full refund to allocation and grant (D5, D7). Staff
 * cancelling someone else's booking must give a reason; it is audited and the owner notified.
 */
export async function cancelBooking(pool: pg.Pool, actor: Actor, locale: Locale, bookingId: string, body: CancelBookingBody): Promise<BookingDetail> {
  await withTransaction(pool, async (tx) => {
    const booking = await repo.lockBooking(tx, bookingId);
    if (!booking || (booking.user_id !== actor.userId && !isStaff(actor))) throw notFound('booking');
    if (booking.status !== 'confirmed') {
      throw new DomainError('BOOKING_NOT_CANCELLABLE', `This booking is ${booking.status} and cannot be cancelled`, { status: booking.status });
    }
    if (booking.start.getTime() <= Date.now()) {
      throw new DomainError('SLOT_ALREADY_STARTED', 'The slot has started; it can no longer be cancelled or refunded');
    }
    const byStaff = booking.user_id !== actor.userId;
    const reason = body.reason || null;
    if (byStaff && !reason) throw new DomainError('REASON_REQUIRED', 'Tell the researcher why their booking is cancelled');

    await repo.lockAllocation(tx, booking.allocation_id, booking.user_id); // lock order: booking → allocation → grant
    await repo.lockGrant(tx, booking.grant_id);
    await repo.adjustBalances(tx, booking.allocation_id, booking.grant_id, booking.total_cost);
    await repo.markCancelled(tx, bookingId, actor.userId, reason);

    if (byStaff) {
      await recordAudit(tx, {
        actorUserId: actor.userId, action: 'booking.cancelled', entityType: 'booking', entityId: bookingId,
        before: { status: 'confirmed' }, after: { status: 'cancelled', reason, refunded: booking.total_cost, user_id: booking.user_id },
      });
      await notify(tx, booking.user_id, 'booking_cancelled_by_staff', {
        booking_id: bookingId, equipment_id: booking.equipment_id, equipment_name: booking.equipment_name.en,
        start_time: booking.start.toISOString(), reason: reason!, refunded: booking.total_cost,
      });
    }
  });
  return getBooking(pool, actor, locale, bookingId);
}

// ─── Read ──────────────────────────────────────────────────────────────────────────────────────

function toSummary(row: repo.BookingRow, locale: Locale): BookingSummary {
  return {
    ...row,
    equipment: { ...row.equipment, name: localize(row.equipment.name, locale) },
    start_time: row.start_time.toISOString(), end_time: row.end_time.toISOString(),
    cancelled_at: row.cancelled_at?.toISOString() ?? null, created_at: row.created_at.toISOString(),
  };
}

export async function listBookings(db: Queryable, actor: Actor, locale: Locale, query: z.output<typeof BookingListQuery>): Promise<Page<BookingSummary>> {
  if (query.scope === 'all' && !isStaff(actor)) throw new DomainError('FORBIDDEN', 'Only super users and administrators can see all bookings');
  const { items, total } = await repo.listBookings(db, query.scope === 'me' ? actor.userId : null, query);
  return { items: items.map((row) => toSummary(row, locale)), total, limit: query.limit, offset: query.offset };
}

/** Owner or staff; anyone else gets NOT_FOUND so booking ids reveal nothing. */
export async function getBooking(db: Queryable, actor: Actor, locale: Locale, bookingId: string): Promise<BookingDetail> {
  const row = await repo.findBooking(db, bookingId);
  if (!row || (row.user.user_id !== actor.userId && !isStaff(actor))) throw notFound('booking');
  return {
    ...toSummary(row, locale),
    cancellable: row.status === 'confirmed' && row.start_time.getTime() > Date.now(),
    session_events: await repo.sessionEvents(db, bookingId),
  };
}

export async function availability(db: Queryable, actor: Actor, equipmentId: string, query: AvailabilityQuery, tz: string): Promise<Availability> {
  const equipment = await equipmentRepo.findEquipment(db, equipmentId);
  if (!equipment?.is_active) throw notFound('equipment');
  const buffer = equipment.buffer_time_minutes;
  const range = widen(new Date(query.from), new Date(query.to), buffer);
  const bookings = await repo.bookingsIn(db, equipmentId, range);
  return {
    timezone: tz,
    buffer_time_minutes: buffer,
    windows: (await equipmentRepo.windowsFor(db, [equipmentId])).get(equipmentId)!,
    busy: bookings
      .map((b) => ({ ...widen(b.start, b.end, buffer), mine: b.user_id === actor.userId }))
      .filter((b) => overlaps(b, { start: new Date(query.from), end: new Date(query.to) }))
      .map((b) => ({ start: b.start.toISOString(), end: b.end.toISOString(), mine: b.mine })),
  };
}

/** GET /funding/me — the caller's, or (staff, for proxy booking) another user's funding choices. */
export async function fundingOptions(db: Queryable, actor: Actor, userId: string | undefined, tz: string): Promise<FundingOption[]> {
  if (userId && userId !== actor.userId && !isStaff(actor)) {
    throw new DomainError('PROXY_NOT_PERMITTED', "Only super users and administrators can see someone else's funding");
  }
  const rows = await repo.fundingFor(db, userId ?? actor.userId, tz);
  return rows.map(({ is_active, group_active, expired, ...option }) => {
    const reason: UnusableReason | null = !is_active ? 'allocation_inactive' : !group_active ? 'group_inactive'
      : expired ? 'grant_expired' : decimalToCents(option.remaining_balance) === 0 ? 'no_balance' : null;
    return { ...option, usable: reason === null, unusable_reason: reason };
  });
}

/** Staff search for proxy booking (route is STAFF-only). */
export async function searchBeneficiaries(db: Queryable, q: string | undefined): Promise<PersonRef[]> {
  return repo.searchBeneficiaries(db, q);
}

import {
  centsToDecimal, decimalToCents, type AdminEquipment, type AdminEquipmentListQuery, type AvailabilityBody, type ChangeStatusBody,
  type CreateEquipmentBody, type EquipmentDetail, type EquipmentListQuery, type EquipmentSummary, type Locale, type LocalizedText,
  type MyCertification, type Page, type StatusChangeResult, type StatusEvent, type UpdateEquipmentBody,
} from '@mosaic/contracts';
import type pg from 'pg';
import type { z } from 'zod';
import { rethrowUniqueViolation } from '../../db/errors.ts';
import { withTransaction, type Queryable } from '../../db/pool.ts';
import type { Actor } from '../../http/access.ts';
import { DomainError } from '../../http/errors.ts';
import { localize } from '../../http/locale.ts';
import { notFound } from '../../http/params.ts';
import { recordAudit } from '../audit/service.ts';
import { accessState } from '../certifications/access.ts';
import { notify } from '../notifications/service.ts';
import * as repo from './repository.ts';
import { normalizeWindows, weeklyHours } from './windows.ts';

// ─── Researcher views ──────────────────────────────────────────────────────────────────────────

function myCertification(row: repo.CertificationColumns, now: Date): MyCertification {
  const hasRecord = row.practical_status !== null;
  return {
    access: accessState(hasRecord ? { theoretical_passed: row.theoretical_passed!, practical_status: row.practical_status!, expires_at: row.expires_at } : null, now),
    theoretical_passed: row.theoretical_passed ?? false,
    theoretical_score: row.theoretical_score,
    practical_status: row.practical_status ?? 'not_requested',
    practical_rejection_reason: row.practical_rejection_reason,
    expires_at: row.expires_at?.toISOString() ?? null,
  };
}

function summary(row: repo.EquipmentRow & repo.CertificationColumns, locale: Locale, now: Date): EquipmentSummary {
  return {
    equipment_id: row.equipment_id, code: row.code, facility: row.facility,
    name: localize(row.name, locale), description: localize(row.description, locale),
    status: row.status, base_rate_hourly: row.base_rate_hourly, my_certification: myCertification(row, now),
  };
}

export async function listEquipment(
  db: Queryable, actor: Actor, locale: Locale, query: z.output<typeof EquipmentListQuery>,
): Promise<Page<EquipmentSummary>> {
  const now = new Date();
  const { items, total } = await repo.listWithCertification(db, actor.userId, query, query.limit, query.offset);
  return { items: items.map((row) => summary(row, locale, now)), total, limit: query.limit, offset: query.offset };
}

export async function getEquipment(db: Queryable, actor: Actor, locale: Locale, equipmentId: string): Promise<EquipmentDetail> {
  const row = await repo.findWithCertification(db, actor.userId, equipmentId);
  if (!row) throw notFound('equipment'); // missing or retired: "no longer available"
  const [windows, tariffs] = await Promise.all([repo.windowsFor(db, [equipmentId]), repo.listTariffs(db)]);
  return {
    ...summary(row, locale, new Date()),
    buffer_time_minutes: row.buffer_time_minutes,
    certification_validity_months: row.certification_validity_months,
    has_interlock: row.interlock_mqtt_topic !== null,
    availability_windows: windows.get(equipmentId)!,
    support_tariffs: tariffs.map(({ tariff_id: _id, ...tariff }) => tariff),
  };
}

export async function getStatusEvents(db: Queryable, equipmentId: string): Promise<StatusEvent[]> {
  const equipment = await repo.findEquipment(db, equipmentId);
  if (!equipment?.is_active) throw notFound('equipment');
  return repo.statusEvents(db, equipmentId);
}

// ─── Operations ────────────────────────────────────────────────────────────────────────────────

/**
 * Changes operational status (08 §43): locks the instrument, writes the status event and audit row,
 * and notifies owners of upcoming bookings. Bookings are never cancelled automatically.
 */
export async function changeStatus(
  pool: pg.Pool, actor: Actor, locale: Locale, equipmentId: string, body: ChangeStatusBody,
): Promise<StatusChangeResult> {
  if (body.reason === '') throw new DomainError('REASON_REQUIRED', 'Give a reason for the status change');
  const affected = await withTransaction(pool, async (tx) => {
    const equipment = await repo.lockEquipment(tx, equipmentId);
    if (!equipment?.is_active) throw notFound('equipment');
    if (equipment.status === body.status) {
      throw new DomainError('STATUS_UNCHANGED', `This instrument is already ${body.status}`);
    }
    await repo.insertStatusEvent(tx, {
      equipment_id: equipmentId, previous_status: equipment.status, new_status: body.status, reason: body.reason, changed_by: actor.userId,
    });
    await recordAudit(tx, {
      actorUserId: actor.userId, action: 'equipment.status_changed', entityType: 'equipment', entityId: equipmentId,
      before: { status: equipment.status }, after: { status: body.status, reason: body.reason },
    });
    const owners = await repo.upcomingBookingOwners(tx, equipmentId);
    for (const owner of owners) {
      await notify(tx, owner.user_id, 'equipment_status_changed', {
        equipment_id: equipmentId, equipment_code: equipment.code, equipment_name: equipment.name.en,
        previous_status: equipment.status, new_status: body.status, reason: body.reason, booking_ids: owner.booking_ids,
      });
    }
    return owners.reduce((count, owner) => count + owner.booking_ids.length, 0);
  });
  return { equipment: await getEquipment(pool, actor, locale, equipmentId), affected_bookings: affected };
}

// ─── Administration ────────────────────────────────────────────────────────────────────────────

/** Drops empty optional translations so "missing" is stored one way only. */
function cleanLocalized(text: LocalizedText): LocalizedText {
  return Object.fromEntries(Object.entries(text).filter(([, value]) => value !== undefined && value !== '')) as LocalizedText;
}

const normalizeMoney = (value: string) => centsToDecimal(decimalToCents(value));

function toAdmin(row: repo.EquipmentRow, windows: AdminEquipment['availability_windows']): AdminEquipment {
  return { ...row, availability_windows: windows, weekly_hours: weeklyHours(windows) };
}

export async function listAdminEquipment(db: Queryable, query: z.output<typeof AdminEquipmentListQuery>): Promise<Page<AdminEquipment>> {
  const { items, total } = await repo.listAll(db, query, query.sort, query.order, query.limit, query.offset);
  const windows = await repo.windowsFor(db, items.map((e) => e.equipment_id));
  return { items: items.map((e) => toAdmin(e, windows.get(e.equipment_id)!)), total, limit: query.limit, offset: query.offset };
}

export async function getAdminEquipment(db: Queryable, equipmentId: string): Promise<AdminEquipment> {
  const row = await repo.findEquipment(db, equipmentId);
  if (!row) throw notFound('equipment');
  return toAdmin(row, (await repo.windowsFor(db, [equipmentId])).get(equipmentId)!);
}

export async function createEquipment(pool: pg.Pool, actor: Actor, body: CreateEquipmentBody): Promise<AdminEquipment> {
  const values = {
    ...body, name: cleanLocalized(body.name), description: cleanLocalized(body.description),
    base_rate_hourly: normalizeMoney(body.base_rate_hourly),
  };
  const id = await withTransaction(pool, async (tx) => {
    const equipmentId = await repo.insertEquipment(tx, values).catch(rethrowUniqueViolation);
    await recordAudit(tx, { actorUserId: actor.userId, action: 'equipment.created', entityType: 'equipment', entityId: equipmentId, after: values });
    return equipmentId;
  });
  return getAdminEquipment(pool, id);
}

/**
 * Applies only changed configuration. Activation changes get their own audit events; every other
 * change is one `equipment.updated` event listing exactly the fields that changed.
 */
export async function updateEquipment(pool: pg.Pool, actor: Actor, equipmentId: string, body: UpdateEquipmentBody): Promise<AdminEquipment> {
  await withTransaction(pool, async (tx) => {
    const current = await repo.lockEquipment(tx, equipmentId);
    if (!current) throw notFound('equipment');

    const proposed: Partial<Record<repo.EditableColumn, unknown>> = {
      ...body,
      ...(body.name && { name: cleanLocalized(body.name) }),
      ...(body.description && { description: cleanLocalized(body.description) }),
      ...(body.base_rate_hourly && { base_rate_hourly: normalizeMoney(body.base_rate_hourly) }),
    };
    const changed = Object.fromEntries(repo.EDITABLE_COLUMNS
      .filter((column) => proposed[column] !== undefined && JSON.stringify(proposed[column]) !== JSON.stringify(current[column]))
      .map((column) => [column, proposed[column]]));
    await repo.updateEquipment(tx, equipmentId, changed).catch(rethrowUniqueViolation);

    const audit = (action: string, before: Record<string, unknown>, after: Record<string, unknown>) =>
      recordAudit(tx, { actorUserId: actor.userId, action, entityType: 'equipment', entityId: equipmentId, before, after });
    const { is_active, ...configuration } = changed;
    if (Object.keys(configuration).length > 0) {
      await audit('equipment.updated',
        Object.fromEntries(Object.keys(configuration).map((column) => [column, current[column as repo.EditableColumn]])),
        configuration);
    }
    if (is_active !== undefined) {
      await audit(is_active ? 'equipment.activated' : 'equipment.deactivated', { is_active: current.is_active }, { is_active });
    }
  });
  return getAdminEquipment(pool, equipmentId);
}

export async function replaceAvailability(pool: pg.Pool, actor: Actor, equipmentId: string, body: AvailabilityBody): Promise<AdminEquipment> {
  const windows = normalizeWindows(body.windows);
  await withTransaction(pool, async (tx) => {
    if (!(await repo.lockEquipment(tx, equipmentId))) throw notFound('equipment');
    const before = (await repo.windowsFor(tx, [equipmentId])).get(equipmentId)!;
    await repo.replaceWindows(tx, equipmentId, windows);
    await recordAudit(tx, {
      actorUserId: actor.userId, action: 'equipment.availability_changed', entityType: 'equipment', entityId: equipmentId,
      before: { windows: before }, after: { windows },
    });
  });
  return getAdminEquipment(pool, equipmentId);
}

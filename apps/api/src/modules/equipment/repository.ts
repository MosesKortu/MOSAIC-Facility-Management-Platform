import type { AvailabilityWindow, EquipmentStatus, Facility, LocalizedText, StatusEvent, SupportTariff } from '@mosaic/contracts';
import type { Queryable } from '../../db/pool.ts';
import { containsPattern } from '../../db/sql.ts';

/** Raw equipment row as stored (localized fields are JSONB objects). */
export interface EquipmentRow {
  equipment_id: string;
  code: string;
  facility: Facility;
  name: LocalizedText;
  description: LocalizedText;
  status: EquipmentStatus;
  base_rate_hourly: string;
  buffer_time_minutes: number;
  certification_validity_months: number | null;
  interlock_ip: string | null;
  interlock_mqtt_topic: string | null;
  is_active: boolean;
  created_at: string;
}

/** The caller's certification fields, joined onto each equipment row (null columns = no record). */
export interface CertificationColumns {
  theoretical_passed: boolean | null;
  theoretical_score: number | null;
  practical_status: 'not_requested' | 'pending' | 'signed_off' | 'rejected' | null;
  practical_rejection_reason: string | null;
  expires_at: Date | null;
}

const EQUIPMENT_COLUMNS = `e.equipment_id, e.code, e.facility, e.name, e.description, e.status, e.base_rate_hourly,
  e.buffer_time_minutes, e.certification_validity_months, e.interlock_ip, e.interlock_mqtt_topic, e.is_active, e.created_at`;
const CERT_COLUMNS = `c.theoretical_passed, c.theoretical_score, c.practical_status, c.practical_rejection_reason, c.expires_at`;

export interface EquipmentFilter {
  facility?: Facility | undefined;
  status?: EquipmentStatus | undefined;
  q?: string | undefined;
  is_active?: boolean | undefined;
}

function filterSql(filter: EquipmentFilter, first: number) {
  const params = [filter.facility ?? null, filter.status ?? null, filter.q ? containsPattern(filter.q) : null, filter.is_active ?? null];
  const [f, s, q, a] = [first, first + 1, first + 2, first + 3].map((n) => `$${n}`);
  const where = `(${f}::facility_code IS NULL OR e.facility = ${f})
    AND (${s}::equipment_status IS NULL OR e.status = ${s})
    AND (${q}::text IS NULL OR e.code ILIKE ${q} OR e.name->>'en' ILIKE ${q})
    AND (${a}::boolean IS NULL OR e.is_active = ${a})`;
  return { params, where };
}

/** Active equipment with the caller's certification columns (researcher discovery). */
export async function listWithCertification(db: Queryable, userId: string, filter: EquipmentFilter, limit: number, offset: number) {
  const active = { ...filter, is_active: true };
  const { params, where } = filterSql(active, 2); // $1 is the caller's user id
  const counted = filterSql(active, 1);
  const [items, count] = await Promise.all([
    db.query<EquipmentRow & CertificationColumns>(
      `SELECT ${EQUIPMENT_COLUMNS}, ${CERT_COLUMNS}
       FROM equipment e LEFT JOIN user_certifications c ON c.equipment_id = e.equipment_id AND c.user_id = $1
       WHERE ${where}
       ORDER BY e.facility, e.code LIMIT $6 OFFSET $7`,
      [userId, ...params, limit, offset],
    ),
    db.query<{ total: number }>(`SELECT count(*)::int AS total FROM equipment e WHERE ${counted.where}`, counted.params),
  ]);
  return { items: items.rows, total: count.rows[0]!.total };
}

export async function findWithCertification(db: Queryable, userId: string, equipmentId: string) {
  const { rows } = await db.query<EquipmentRow & CertificationColumns>(
    `SELECT ${EQUIPMENT_COLUMNS}, ${CERT_COLUMNS}
     FROM equipment e LEFT JOIN user_certifications c ON c.equipment_id = e.equipment_id AND c.user_id = $1
     WHERE e.equipment_id = $2 AND e.is_active`,
    [userId, equipmentId],
  );
  return rows[0] ?? null;
}

type AdminSort = 'code' | 'facility' | 'status' | 'created_at';
const ADMIN_SORT: Record<AdminSort, string> = { code: 'e.code', facility: 'e.facility, e.code', status: 'e.status, e.code', created_at: 'e.created_at' };

export async function listAll(db: Queryable, filter: EquipmentFilter, sort: AdminSort, order: 'asc' | 'desc', limit: number, offset: number) {
  const { params, where } = filterSql(filter, 1);
  const [items, count] = await Promise.all([
    db.query<EquipmentRow>(
      `SELECT ${EQUIPMENT_COLUMNS} FROM equipment e WHERE ${where}
       ORDER BY ${ADMIN_SORT[sort]} ${order === 'desc' ? 'DESC' : 'ASC'}, e.equipment_id LIMIT $5 OFFSET $6`,
      [...params, limit, offset],
    ),
    db.query<{ total: number }>(`SELECT count(*)::int AS total FROM equipment e WHERE ${where}`, params),
  ]);
  return { items: items.rows, total: count.rows[0]!.total };
}

export async function findEquipment(db: Queryable, equipmentId: string): Promise<EquipmentRow | null> {
  const { rows } = await db.query<EquipmentRow>(`SELECT ${EQUIPMENT_COLUMNS} FROM equipment e WHERE e.equipment_id = $1`, [equipmentId]);
  return rows[0] ?? null;
}

/** Locks the equipment row: serialises status changes and (later) bookings per instrument (09 §4). */
export async function lockEquipment(db: Queryable, equipmentId: string): Promise<EquipmentRow | null> {
  const { rows } = await db.query<EquipmentRow>(`SELECT ${EQUIPMENT_COLUMNS} FROM equipment e WHERE e.equipment_id = $1 FOR UPDATE`, [equipmentId]);
  return rows[0] ?? null;
}

export async function windowsFor(db: Queryable, equipmentIds: string[]): Promise<Map<string, AvailabilityWindow[]>> {
  const { rows } = await db.query<AvailabilityWindow & { equipment_id: string }>(
    `SELECT equipment_id, weekday, to_char(opens_at, 'HH24:MI') AS opens_at, to_char(closes_at, 'HH24:MI') AS closes_at
     FROM equipment_availability_windows WHERE equipment_id = ANY($1) ORDER BY weekday, opens_at`,
    [equipmentIds],
  );
  const byEquipment = new Map<string, AvailabilityWindow[]>(equipmentIds.map((id) => [id, []]));
  for (const { equipment_id, ...window } of rows) byEquipment.get(equipment_id)!.push(window);
  return byEquipment;
}

export async function replaceWindows(db: Queryable, equipmentId: string, windows: AvailabilityWindow[]): Promise<void> {
  await db.query('DELETE FROM equipment_availability_windows WHERE equipment_id = $1', [equipmentId]);
  for (const w of windows) {
    await db.query(
      'INSERT INTO equipment_availability_windows (equipment_id, weekday, opens_at, closes_at) VALUES ($1, $2, $3, $4)',
      [equipmentId, w.weekday, w.opens_at, w.closes_at],
    );
  }
}

export async function listTariffs(db: Queryable): Promise<(SupportTariff & { tariff_id: string })[]> {
  const { rows } = await db.query<SupportTariff & { tariff_id: string }>(
    `SELECT tariff_id, tier, rate_hourly, is_available FROM support_tariffs ORDER BY array_position(enum_range(NULL::support_tier), tier)`,
  );
  return rows;
}

export async function statusEvents(db: Queryable, equipmentId: string): Promise<StatusEvent[]> {
  const { rows } = await db.query<StatusEvent>(
    `SELECT ev.event_id, ev.previous_status, ev.new_status, ev.reason, ev.changed_at,
            json_build_object('user_id', u.user_id, 'full_name', u.full_name, 'email', u.email) AS changed_by
     FROM equipment_status_events ev JOIN users u ON u.user_id = ev.changed_by
     WHERE ev.equipment_id = $1 ORDER BY ev.changed_at DESC, ev.event_id`,
    [equipmentId],
  );
  return rows;
}

export async function insertStatusEvent(
  db: Queryable, e: { equipment_id: string; previous_status: EquipmentStatus; new_status: EquipmentStatus; reason: string; changed_by: string },
): Promise<void> {
  await db.query('UPDATE equipment SET status = $2 WHERE equipment_id = $1', [e.equipment_id, e.new_status]);
  await db.query(
    `INSERT INTO equipment_status_events (equipment_id, previous_status, new_status, reason, changed_by) VALUES ($1, $2, $3, $4, $5)`,
    [e.equipment_id, e.previous_status, e.new_status, e.reason, e.changed_by],
  );
}

/** Owners of upcoming (or in-progress) non-cancelled bookings on an instrument, with their booking ids. */
export async function upcomingBookingOwners(db: Queryable, equipmentId: string): Promise<{ user_id: string; booking_ids: string[] }[]> {
  const { rows } = await db.query<{ user_id: string; booking_ids: string[] }>(
    `SELECT user_id, array_agg(booking_id ORDER BY lower(slot_range)) AS booking_ids
     FROM bookings
     WHERE equipment_id = $1 AND status IN ('confirmed', 'active') AND upper(slot_range) > now()
     GROUP BY user_id`,
    [equipmentId],
  );
  return rows;
}

export async function insertEquipment(db: Queryable, e: Omit<EquipmentRow, 'equipment_id' | 'status' | 'is_active' | 'created_at'>): Promise<string> {
  const { rows } = await db.query<{ equipment_id: string }>(
    `INSERT INTO equipment (code, facility, name, description, base_rate_hourly, buffer_time_minutes, certification_validity_months,
                            interlock_ip, interlock_mqtt_topic)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING equipment_id`,
    [e.code, e.facility, e.name, e.description, e.base_rate_hourly, e.buffer_time_minutes, e.certification_validity_months,
     e.interlock_ip, e.interlock_mqtt_topic],
  );
  return rows[0]!.equipment_id;
}

// Columns an admin may change (status is excluded on purpose: it changes only through status events).
export const EDITABLE_COLUMNS = [
  'code', 'facility', 'name', 'description', 'base_rate_hourly', 'buffer_time_minutes', 'certification_validity_months',
  'interlock_ip', 'interlock_mqtt_topic', 'is_active',
] as const;
export type EditableColumn = (typeof EDITABLE_COLUMNS)[number];

export async function updateEquipment(db: Queryable, equipmentId: string, changes: Partial<Record<EditableColumn, unknown>>): Promise<void> {
  const entries = Object.entries(changes);
  if (entries.length === 0) return;
  // Column names come from EDITABLE_COLUMNS, never from input.
  const assignments = entries.map(([column], i) => `${column} = $${i + 2}`).join(', ');
  await db.query(`UPDATE equipment SET ${assignments} WHERE equipment_id = $1`, [equipmentId, ...entries.map(([, value]) => value)]);
}

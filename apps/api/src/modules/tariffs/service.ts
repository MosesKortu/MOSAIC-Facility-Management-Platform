import { centsToDecimal, decimalToCents, SUPPORT_TIERS, type SupportTariff, type SupportTier, type UpdateTariffBody } from '@mosaic/contracts';
import type pg from 'pg';
import { withTransaction, type Queryable } from '../../db/pool.ts';
import type { Actor } from '../../http/access.ts';
import { DomainError } from '../../http/errors.ts';
import { notFound } from '../../http/params.ts';
import { recordAudit } from '../audit/service.ts';
import { listTariffs as selectTariffs } from '../equipment/repository.ts';

export async function listTariffs(db: Queryable): Promise<SupportTariff[]> {
  return (await selectTariffs(db)).map(({ tariff_id: _id, ...tariff }) => tariff);
}

/**
 * Changes a support tariff (08 §22). Only future bookings use the new rate: bookings store their own
 * calculated costs, so history is never rewritten. The autonomous tier is always free and available.
 */
export async function updateTariff(pool: pg.Pool, actor: Actor, tierParam: string, body: UpdateTariffBody): Promise<SupportTariff> {
  if (!(SUPPORT_TIERS as readonly string[]).includes(tierParam)) throw notFound('tariff');
  const tier = tierParam as SupportTier;
  if (tier === 'none') {
    throw new DomainError('VALIDATION_FAILED', 'Autonomous use (no support) is always free and available', {
      issues: [{ path: 'tier', message: 'The autonomous tier cannot be changed' }],
    });
  }
  return withTransaction(pool, async (tx) => {
    const { rows } = await tx.query<SupportTariff & { tariff_id: string }>(
      'SELECT tariff_id, tier, rate_hourly, is_available FROM support_tariffs WHERE tier = $1 FOR UPDATE', [tier]);
    const current = rows[0]!;
    const rate = body.rate_hourly === undefined ? current.rate_hourly : centsToDecimal(decimalToCents(body.rate_hourly));
    const available = body.is_available ?? current.is_available;

    await tx.query('UPDATE support_tariffs SET rate_hourly = $2, is_available = $3, updated_at = now() WHERE tier = $1', [tier, rate, available]);
    const audit = (action: string, before: Record<string, unknown>, after: Record<string, unknown>) =>
      recordAudit(tx, { actorUserId: actor.userId, action, entityType: 'tariff', entityId: current.tariff_id, before: { tier, ...before }, after: { tier, ...after } });
    if (rate !== current.rate_hourly) await audit('tariff.rate_changed', { rate_hourly: current.rate_hourly }, { rate_hourly: rate });
    if (available !== current.is_available) await audit('tariff.availability_changed', { is_available: current.is_available }, { is_available: available });
    return { tier, rate_hourly: rate, is_available: available };
  });
}

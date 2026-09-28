# MOSAIC — KPI Definitions (definitions_version 1)

These are the only definitions the analytics service (`apps/api/src/modules/analytics`) implements, and every `/analytics/*` response and export applies them. The frontend displays them and never recomputes them. When a definition changes, bump `definitions_version` in the same change as the code.

## Reporting scope

- **Period:** `from`–`to` inclusive calendar dates in `Europe/Madrid`, i.e. the half-open instant interval `[from 00:00, to+1 00:00)` local time.
- **Filters** (all optional, combined with AND): `facility`, `equipment_id`, `user_type` (of the booking's beneficiary), `group_id` (of the booking's allocation), `grant_id`, `support_tier`. Capacity metrics (available hours, utilization) apply only the equipment-side filters (`facility`, `equipment_id`). People/funding filters narrow usage, not capacity, and the UI labels this.
- **Session population ("reported sessions"):** bookings with `status <> 'cancelled'` whose `slot_range` overlaps the period. This covers `confirmed`, `active` and `completed`. A reported session is also a **revenue-bearing session**: funding is charged at confirmation and refunded only on cancellation (D5), so an unattended confirmed slot is still charged. Every analytics screen uses this one population. Status breakdowns are shown alongside it, never swapped in for it.

## Metrics

| KPI | Definition |
| --- | --- |
| **Total sessions** | Count of reported sessions whose slot **starts** in the period |
| **Session hours** | Σ over reported sessions of the duration of `slot_range ∩ period`, in hours (clipping keeps periods additive) |
| **Available hours** | Σ over active equipment in scope of: availability-window hours inside the period, minus the parts of those windows during which the equipment's status was `maintenance` or `offline`. Status over time is reconstructed from `equipment_status_events` (the status before the first event in the period is that event's `previous_status`, or the current status if there are no events) |
| **Utilization %** | `session hours inside availability windows ÷ available hours × 100`, to two decimals. `null` (shown "—") when available hours = 0. Hours booked under `force_override` during downtime count in the numerator and can push utilization above 100 %; the UI flags this and never clamps it |
| **Revenue** | Σ `total_cost` of reported sessions whose slot **starts** in the period. It is attributed whole to the start date and never prorated. Base and support components are shown too |
| **Average cost / session** | Revenue ÷ total sessions (the same population). `null` when there are no sessions |
| **People** | Active users (`is_active`); internal and external active users; users with ≥ 1 reported session in the period; certified users (≥ 1 certification with practical `signed_off` and not expired at period end); new users (`created_at` in the period) |
| **Equipment** | Total active equipment; counts by current status; equipment with ≥ 1 reported session; per-equipment utilization; maintenance hours = window hours in `maintenance`/`offline` during the period |
| **Funding** | Point-in-time as of `generated_at`, not period-bounded: allocated budget (Σ `grants.allocated_budget` in scope), allocated to groups (Σ `allocated_amount`), unallocated, consumed (Σ `allocated_amount − remaining_balance`), remaining, active grants (`expiration_date ≥ today`). Period consumption = revenue of reported sessions charged to the grant/group |

## Freshness

KPIs are computed live from transactional tables, so `generated_at` is the request time. If a materialized view is ever introduced for performance, `generated_at` becomes that view's refresh time and the UI shows "Data as of …".

# API Specification: MOSAIC Backend (Fastify) — V2

**Protocol:** REST (JSON) + WebSocket · **Base path:** `/api/v1` · **Auth:** JWT in the httpOnly `mosaic_session` cookie. Institutional SSO issues it in production; `POST /auth/dev-login` issues it outside production (`09_ARCHITECTURE.md` D6).

This V2 contract supersedes V1. The changes from V1 are: `UPPER_SNAKE` error codes in one envelope (D2), the `auditor` role, groups, grant allocations (`allocation_id` required on bookings), availability windows, and the `/admin/*` and `/analytics/*` areas. Schema: `apps/api/migrations/` (mirrored in `02_SCHEMA.sql`). Request and response schemas are implemented as zod in `packages/contracts`, and that code is the executable form of this document.

---

## 0. Conventions

### 0.1 Roles

`standard_user`, `super_user`, `admin`, `auditor`. Each endpoint below lists the roles it accepts. Other authenticated roles receive `403 FORBIDDEN`; unauthenticated callers receive `401 UNAUTHENTICATED`. **No mutating endpoint accepts `auditor`.** Deactivated users (`is_active = false`) receive `403 USER_INACTIVE` on every call except `POST /auth/logout`.

### 0.2 Types on the wire

- **Money** is a decimal string with two places (`"313.50"`), never a JSON number.
- **Instants** are ISO-8601 UTC (`"2026-10-15T09:00:00.000Z"`).
- **Dates** (grant expiry, reporting periods) are `YYYY-MM-DD`, interpreted in `Europe/Madrid`.
- **Localized fields**: equipment `name`/`description` are resolved to one string using the `Accept-Language` header (`en` | `es` | `ca`, falling back to `en`). Admin endpoints return the full `{en, es, ca}` object.
- **Lists** use `{ "items": [...], "total": 123, "limit": 50, "offset": 0 }`, with `?limit` (1–200, default 50), `?offset`, `?sort=field` and `?order=asc|desc`, all applied server-side.

### 0.3 Error envelope and catalog

```json
{ "error": { "code": "BOOKING_CONFLICT", "message": "…", "details": { "next_available": "…" } }, "request_id": "…" }
```

| Code | HTTP | Meaning / `details` |
| --- | --- | --- |
| `VALIDATION_FAILED` | 400 | Body or query failed schema validation. `details.issues: [{path, message}]` |
| `UNAUTHENTICATED` | 401 | No or invalid session |
| `FORBIDDEN` | 403 | Role not permitted for this endpoint or resource |
| `USER_INACTIVE` | 403 | Caller is deactivated |
| `NOT_FOUND` | 404 | Entity missing, or deactivated where that means "gone". `details.entity` |
| `INTERNAL_ERROR` | 500 | Unexpected error, logged with `request_id` |
| **Booking** | | |
| `EQUIPMENT_NOT_OPERATIONAL` | 403 | `details.status`. Bypassed only by an authorized `force_override` |
| `OUTSIDE_AVAILABILITY` | 422 | Slot not inside one availability window |
| `INVALID_DURATION` | 422 | Not on 15-minute boundaries, under 30 min, or end ≤ start |
| `BOOKING_IN_PAST` | 422 | Start ≤ now |
| `BOOKING_CONFLICT` | 409 | Overlaps another reservation or its buffer. `details.next_available` (nullable) |
| `CERTIFICATION_REQUIRED` | 403 | Theory stage not passed |
| `PRACTICAL_CERTIFICATION_PENDING` | 403 | Practical stage not signed off. `details.practical_status` (`not_requested`/`pending`/`rejected`) |
| `CERTIFICATION_EXPIRED` | 403 | `details.expired_at` |
| `ALLOCATION_NOT_AVAILABLE` | 403 | Allocation missing or inactive, group inactive, or beneficiary not an active member of its group |
| `GRANT_EXPIRED` | 403 | `details.expired_on` |
| `INSUFFICIENT_GRANT_BALANCE` | 402 | `details.shortfall`, `details.available` |
| `SUPPORT_UNAVAILABLE` | 422 | Tier disabled. `details.tier` |
| `PROXY_NOT_PERMITTED` | 403 | `on_behalf_of_user_id` or `force_override` used by a role that may not use it |
| `SLOT_ALREADY_STARTED` | 409 | Cancelling at or after slot start |
| `BOOKING_NOT_CANCELLABLE` | 409 | Already cancelled, active or completed |
| `REASON_REQUIRED` | 400 | Staff cancellation, rejection or status change without a reason |
| **Certification** | | |
| `THEORY_INCOMPLETE` | 403 | Practical requested before the quiz was passed |
| `PRACTICAL_REQUEST_EXISTS` | 409 | A request is already `pending`, or already `signed_off` and valid |
| `ALREADY_ACTIONED` | 409 | Sign-off or rejection of a request that is no longer `pending` |
| **Sessions** | | |
| `SESSION_NOT_STARTABLE` | 409 | Outside [start − 15 min, end), or booking not `confirmed`. `details.opens_at` |
| `SESSION_NOT_ACTIVE` | 409 | Ending a booking that is not `active` |
| **Administration** | | |
| `OVER_ALLOCATION` | 409 | Σ allocations would exceed the grant budget. `details.unallocated` |
| `ALLOCATION_BELOW_CONSUMED` | 409 | New amount < already consumed. `details.consumed` |
| `BUDGET_BELOW_ALLOCATED` | 409 | Grant budget reduced below Σ allocations or consumption |
| `DUPLICATE` | 409 | Unique field taken. `details.field` (`email`, `sso_identifier`, `grant_code`, `code`, `name`) |
| `INVALID_SPONSOR` | 422 | Sponsor missing, inactive or not internal (external users only) |
| `ROLE_NOT_ALLOWED_FOR_EXTERNAL` | 422 | External users can only be `standard_user` |
| `SELF_LOCKOUT` | 409 | An admin demoting or deactivating themselves |
| `WINDOW_OVERLAP` | 422 | Availability windows overlap on a weekday |
| `STATUS_UNCHANGED` | 409 | Equipment status change to its current status |
| `GROUP_INACTIVE` | 409 | Adding members to, or allocating funding to, a deactivated group |
| `INVALID_PI` | 422 | The grant's PI must be an active internal user |

---

## 1. Health

| Method & path | Auth | Response |
| --- | --- | --- |
| `GET /health` | none | `200 {status:"ok"}` while the process is up |
| `GET /ready` | none | `200 {status:"ready"}`, or `503 {status:"not_ready", checks:{database, migrations}}` |

These two are served at the root, outside `/api/v1`.

## 2. Auth

| Method & path | Roles | Notes |
| --- | --- | --- |
| `POST /auth/dev-login` | none | Non-production only (404 when disabled). Body `{email}` → sets the session cookie for that existing user. Inactive → `USER_INACTIVE` |
| `POST /auth/logout` | any | Clears the cookie. `204` |
| `GET /auth/me` | any | `{user_id, full_name, email, role, user_type, groups:[{group_id,name}]}` |
| `GET /auth/shibboleth` | none | **Blocked**: needs IdP registration (`09` §9) |

## 3. Researcher self-service

| Method & path | Roles | Notes |
| --- | --- | --- |
| `GET /equipment` | std, super, admin | Query `facility`, `status`, `q`. Active equipment only. Items include `status`, `base_rate_hourly`, `my_certification` summary |
| `GET /equipment/:id` | std, super, admin | Detail + `availability_windows` + `my_certification {theoretical_passed, theoretical_score, practical_status, expires_at, bookable}` + `support_tariffs` |
| `GET /equipment/:id/availability?from&to` | std, super, admin | Instants, `to − from` ≤ 31 days → `{timezone, buffer_time_minutes, windows:[…], busy:[{start,end,mine}]}`. Busy ranges are bookings widened by the buffer on both sides (D20); no other user's identity is exposed, only `mine` |
| `GET /training/:equipment_id` | std, super, admin | `{module_id, sop_document_url, passing_score, questions:[{question_id,prompt,options}]}`. Answers are never sent |
| `POST /training/submit-quiz` | std, super, admin | `{module_id, answers:[{question_id, selected_option}]}` → `{score, passed, passing_score, correct, total, already_passed}`. Scored server-side; unanswered = wrong; unknown or duplicate answers → `VALIDATION_FAILED`. A pass sets `theoretical_passed`; retakes never revoke it (D18) |
| `GET /certifications/me` | std, super, admin | The caller's certification records with equipment |
| `POST /certifications/:equipment_id/request-practical` | std, super, admin | → `201` cert. `THEORY_INCOMPLETE`, `PRACTICAL_REQUEST_EXISTS` |
| `GET /funding/me?user_id` | std, super, admin | Allocations of the caller's active groups: `[{allocation_id, grant_id, grant_code, group:{group_id,name}, remaining_balance, expiration_date, usable, unusable_reason}]`, `unusable_reason` ∈ `allocation_inactive`, `group_inactive`, `grant_expired`, `no_balance`. `user_id` (staff only, for proxy booking; others → `PROXY_NOT_PERMITTED`) lists that user's |
| `GET /bookings?scope=me&status&equipment_id&from&to&limit&offset&order` | std, super, admin | `Page<BookingSummary>` ordered by slot start. Own bookings; `scope=all` for super/admin (others → `FORBIDDEN`). `from`/`to` select slots ending after / starting before |
| `GET /bookings/beneficiaries?q` | super, admin | Proxy-booking search: up to 20 active non-auditor users `[{user_id, full_name, email}]` matching name or email |
| `GET /bookings/:id` | owner, super, admin | Summary + `cancellable` + `session_events`. Anyone else → `404` |
| `POST /bookings/quote` | std, super, admin | Same body as create. Runs every gate with the same locks without writing → `200 {duration_minutes, calculated_base_cost, calculated_support_cost, total_cost, allocation_remaining_after}` or the first failing gate's error. Powers the review step |
| `POST /bookings` | std, super, admin | See §3.1 |
| `PATCH /bookings/:id/cancel` | owner, super, admin | Body `{reason?}` → booking detail. Only `confirmed` (`BOOKING_NOT_CANCELLABLE`) and before slot start (`SLOT_ALREADY_STARTED`). Full refund to allocation + grant. Staff cancelling someone else's booking: reason required (`REASON_REQUIRED`), audited, owner notified (D20) |
| `POST /bookings/:id/session/start` | owner | → `active`, `session_events` (`authorizing` then `active`, source `user`). `SESSION_NOT_STARTABLE` |
| `POST /bookings/:id/session/end` | owner, super, admin | → `completed`, `session_events` (`completed`) |
| `GET /notifications?unread_only&limit&offset` | std, super, admin | `Page<Notification>` of the caller's own notifications, newest first (`limit` default 20, max 100). `{notification_id, type, payload, read_at, created_at}`; one payload shape per `type` (`NotificationPayloads` in contracts). The unread count is `total` of `?unread_only=true&limit=1`. Auditors receive no notifications (D19) |
| `PATCH /notifications/:id/read` | std, super, admin (owner) | → the notification. Idempotent: the first `read_at` is kept. Someone else's id → `404 NOT_FOUND` |
| `POST /notifications/read-all` | std, super, admin | Marks the caller's unread notifications read → `{updated}` |

### 3.1 `POST /bookings`

```json
{ "equipment_id": "…", "allocation_id": "…", "start_time": "2026-10-15T09:00:00Z", "end_time": "2026-10-15T12:00:00Z",
  "support_requested": "technician", "on_behalf_of_user_id": null, "force_override": false }
```

`grant_id` is derived from the allocation, not sent. Gates are evaluated in this order, and the first failure is returned:

1. Authentication (session, active user)
2. Proxy/override permission
3. Equipment exists and is active
4. Duration, then not in the past, then inside availability
5. Operational status (unless an authorized `force_override`)
6. Support tier available
7. Certification: theory, then practical, then expiry
8. Allocation available to the beneficiary, then grant not expired
9. Slot free, including buffer
10. Balance sufficient

This order puts **eligibility before capacity**, so a user learns first about the problem only they can fix. The whole sequence runs in one transaction with the locks in `09` §4. On success, both balances are decremented by `total_cost`. The audit log records proxy and override bookings.

→ `201 {booking_id, status:"confirmed", duration_minutes, calculated_base_cost, calculated_support_cost, total_cost, allocation_remaining_after}`. Buffer, certification-at-slot-end, grant expiry, proxy and low-balance rules: `09` D20.

## 4. Operations (`super_user`, `admin`)

| Method & path | Notes |
| --- | --- |
| `GET /operations/overview` | Exception-first counts for today: pending certifications, faults, equipment not operational, sessions active now, bookings affected by downtime |
| `GET /certifications/pending?facility&equipment_id` | Oldest first |
| `POST /certifications/:cert_id/decision` | `{decision:"signed_off"\|"rejected", reason?}` (reason required to reject: `REASON_REQUIRED`). A conditional update on `pending` means two concurrent reviewers cannot both act (`ALREADY_ACTIONED`). Assessing your own request is `FORBIDDEN`. Sets `expires_at` from `equipment.certification_validity_months`. Audited; requester notified. Returns the certification record |
| `GET /operations/sessions?state` | Bookings active now or starting today, with latest session event |
| `PATCH /equipment/:id/status` | `{status, reason}` → `{equipment, affected_bookings}`. Locks the instrument; writes event + audit; one notification per owner of upcoming non-cancelled bookings (`equipment_status_changed`, with `booking_ids`). Never cancels bookings. `STATUS_UNCHANGED`, `REASON_REQUIRED` |
| `GET /equipment/:id/status-events` | Maintenance history, newest first. Readable by all researcher roles (operational transparency) |

## 5. Administration (`admin`)

| Method & path | Notes |
| --- | --- |
| `GET /admin/users?user_type&role&is_active&group_id&q` | Paginated |
| `POST /admin/users` | `{email, full_name, sso_identifier, role, user_type, sponsor_user_id?}`. Externals require a sponsor (`INVALID_SPONSOR`) and must be `standard_user` |
| `GET /admin/users/:id` | Profile, groups, sponsor, certifications, usable funding, recent bookings |
| `PATCH /admin/users/:id` | `{full_name?, role?, is_active?, sponsor_user_id?}`. Audited per changed field (`user.role_changed`, `user.activated`/`user.deactivated`, …). `SELF_LOCKOUT` |
| `GET /admin/groups?q&is_active` · `POST /admin/groups` · `GET /admin/groups/:id` · `PATCH /admin/groups/:id` | Detail: members (internal/external counts), allocations, allocated/consumed/remaining, recent activity |
| `PUT /admin/groups/:id/members/:user_id` · `DELETE /admin/groups/:id/members/:user_id` | Idempotent add or reactivate / deactivate membership. Audited |
| `GET /admin/grants?q&expired` · `POST /admin/grants` · `GET /admin/grants/:id` · `PATCH /admin/grants/:id` | `{grant_code, pi_user_id, allocated_budget, expiration_date}`. Detail: allocated to groups, unallocated, consumed, remaining. `BUDGET_BELOW_ALLOCATED` (budget below Σ allocations), `INVALID_PI`, `DUPLICATE grant_code`. Changing the budget keeps consumption: `remaining = budget − consumed` |
| `GET /admin/grant-allocations?grant_id&group_id` · `POST /admin/grant-allocations` · `PATCH /admin/grant-allocations/:id` | `{grant_id, group_id, allocated_amount}` / `{allocated_amount?, is_active?}`. `OVER_ALLOCATION`, `ALLOCATION_BELOW_CONSUMED`, `GROUP_INACTIVE`, `DUPLICATE group_id` (one allocation per grant × group). Serialised by a grant row lock. Adjusting keeps consumption: `remaining = amount − consumed`. Audited, and active group members notified (`grant_allocation_changed`) |
| `GET /admin/equipment` · `POST /admin/equipment` · `GET /admin/equipment/:id` · `PATCH /admin/equipment/:id` | Full localized fields, pricing, buffer, validity, interlock config, `is_active`, plus `availability_windows` and `weekly_hours`. PATCH is strict: `status` is rejected, because status changes go through `PATCH /equipment/:id/status` so an event is always written. One `equipment.updated` audit event lists only the changed fields |
| `PUT /admin/equipment/:id/availability` | Replace the weekly windows `[{weekday, opens_at, closes_at}]`. `WINDOW_OVERLAP`. Audited |
| `GET /admin/equipment/:id/training-module` · `PUT /admin/equipment/:id/training-module` | `{sop_document_url (https), passing_score, questions:[{prompt, options[2–6], correct_option}]}`. Question ids are assigned 1…n. Audited (`training_module.saved`); existing passes are kept (D18) |
| `GET /admin/tariffs` · `PATCH /admin/tariffs/:tier` | `{rate_hourly?, is_available?}`. Audited; historical bookings untouched |
| `GET /admin/audit?entity_type&entity_id&actor_user_id&from&to` | Administrative audit read |

## 6. Analytics (`auditor` only)

Every endpoint accepts the same filter set: `from`, `to` (required dates, inclusive; max 366 days), `facility`, `equipment_id`, `user_type`, `group_id`, `grant_id`, `support_tier`. Every response carries its reporting context:

```json
{ "period": {"from":"2026-09-01","to":"2026-09-30"}, "filters": {…}, "generated_at": "…", "definitions_version": "1", "metrics": {…} }
```

| Method & path | Returns (definitions: `10_KPI_DEFINITIONS.md`) |
| --- | --- |
| `GET /analytics/overview` | sessions, session_hours, available_hours, utilization_percent, revenue, average_cost_per_session, + daily usage/revenue series |
| `GET /analytics/sessions` | Paginated session table. `GET /analytics/sessions/:booking_id` for detail with session events and audit refs |
| `GET /analytics/revenue` | Totals by facility, equipment, support tier, user type, group, and over time |
| `GET /analytics/people` | Active, internal, external, with sessions, certified, new, + per-user sessions/hours/spend, per-group usage |
| `GET /analytics/equipment` | Per equipment: status, available hours, session hours, utilization, sessions, revenue, maintenance hours |
| `GET /analytics/funding` | Per grant × group: allocated, consumed, remaining, expiration, utilization |
| `GET /analytics/audit?entity_type&entity_id&actor_user_id&action` | Full audit log (paginated) |
| `GET /analytics/export?report=sessions\|revenue\|people\|equipment\|funding&format=csv\|json` | Same filters and definitions as the screen. `Content-Disposition: attachment` |

`POST /reports/email` (V1) is **blocked** pending email approval (`09` §9).

## 7. Interlock WebSocket

`WS /ws/interlock/:equipment_id` is **blocked** until the relay protocol and broker are specified (`09` §9, D13). Until then sessions use §3 `session/start`/`end`. Equipment with no `interlock_mqtt_topic` is presented as manual access.

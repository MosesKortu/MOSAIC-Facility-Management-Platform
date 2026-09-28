# MOSAIC — Engineering Functional Specification

> **V2 note (2026-09-28):** `08_IMPLEMENTATION_CONTRACT.md` overrides this document where they differ. The executable V2 contract is `03_API_SPEC.md` (error codes in its §0.3) plus `09_ARCHITECTURE.md`. Rules 4–6b below now apply to the booking's **group allocation** and its grant together (D7). Rule 3 includes the equipment buffer time (D12). Bookings must also fit an availability window (D8). The V2 booking gate order is in `03_API_SPEC.md` §3.1. `gold.fact_facility_usage` references are superseded by `10_KPI_DEFINITIONS.md` (D4).

Translates `01_PRD.md` (v2.0) into implementation logic. This document does not restate PRD rationale — see the PRD for *why*; this defines *how*. Feature set and numbering follow `01_PRD.md` §11 exactly for traceability. Every gap already flagged in the PRD is repeated here only as concrete implementation detail (missing endpoint, missing column, missing table), not re-argued.

---

## 1. Feature Specifications

### 1.1 Equipment Discovery

| Aspect | Detail |
| :--- | :--- |
| User action | Browse/search/filter equipment by facility, capability keyword, availability |
| System behavior | Query `equipment` filtered by `facility`, status; return localized `name`/`description` for the active locale |
| Required data | `equipment.facility`, `name` (JSONB), `description` (JSONB), `base_rate_hourly`, operational status |
| Validation | None (read-only) |
| Permissions | All roles |
| API/data dependencies | `GET /equipment?facility=&status=` — specified in `03_API_SPEC.md` §2 |
| Success state | Filterable results with an operational-status badge per item |
| Error state | Fetch failure → retry, not a silent empty list |
| Loading state | Skeleton list (per the established `Skeleton` component convention) |
| Edge cases | Zero results after filtering; NCL/SLN currently have no equipment seeded in `02_SCHEMA.sql` — the endpoint returns an empty array by design, which the client must render as an explicit empty state, not an error |
| Audit event | None (read-only) |
| Analytics event | `equipment_search_started`, `equipment_search_filtered` |

### 1.2 Equipment Details

| Aspect | Detail |
| :--- | :--- |
| User action | Open a specific instrument's detail view |
| System behavior | Fetch the equipment record + the current user's own certification status for it + applicable grants for cost preview |
| Required data | `equipment.*`, `user_certifications` (user_id, equipment_id), `training_modules` (equipment_id) |
| Validation | None additional |
| Permissions | All roles |
| API/data dependencies | `GET /equipment/:equipment_id` (`03_API_SPEC.md` §2) plus `GET /training/:equipment_id` |
| Success state | Capability, rate, buffer time, operational status, and own certification progress shown together |
| Error state | Equipment not found → explicit "no longer available," not a silent redirect |
| Loading state | Skeleton detail page |
| Edge cases | Equipment deactivated after being deep-linked to; viewing an instrument already certified for vs. not |
| Audit event | None |
| Analytics event | `equipment_selected` (equipment_id, facility, from_search: bool) |

### 1.3 Training (Theory Certification: SOP + Quiz)

| Aspect | Detail |
| :--- | :--- |
| User action | Open SOP, take quiz, submit answers |
| System behavior | Serve SOP + quiz schema; auto-grade server-side against `passing_score`; on pass, set `user_certifications.theoretical_passed = true` (create row if absent) |
| Required data | `training_modules.sop_document_url`, `quiz_schema`, `passing_score`; `user_certifications.theoretical_passed` |
| Validation | Score computed and checked server-side, never trusted from the client; pass requires `score >= passing_score` |
| Permissions | Any authenticated user, for their own certification |
| API/data dependencies | `GET /training/:equipment_id`, `POST /training/submit-quiz` — both exist |
| Success state | Score shown; "Theory complete" status; unlocks the practical-request action (§1.4) |
| Error state | Score below threshold → show score, threshold, retry action (already implemented) |
| Loading state | Quiz submitting / auto-grading spinner |
| Edge cases | Retake after a prior failure must reset any stale simulate-failure/attempt state (already fixed per `CLAUDE.md`); a `training_modules` schema/version change between attempts is unhandled today |
| Audit event | Not required — routine self-service activity, not a compliance-sensitive override |
| Analytics event | `training_started`, `quiz_submitted`, `quiz_passed` / `quiz_failed` (with score, equipment_id) |

### 1.4 Practical Certification & Sign-off Queue *(RESOLVED — approved schema + endpoints)*

| Aspect | Detail |
| :--- | :--- |
| User action | Standard User: request a practical assessment after passing theory. Super User: view the queue, review, sign off or reject with a reason |
| System behavior | `POST /certifications/:equipment_id/request-practical` sets `practical_status = 'pending'`, `practical_requested_at = now()`. `POST /certifications/:cert_id/sign-off` sets `practical_status = 'signed_off'` (+ `practical_signed_off_at`, `evaluated_by`) or `'rejected'` (+ `practical_rejection_reason`) |
| Required data | `user_certifications.practical_status` (enum: `not_requested`/`pending`/`signed_off`/`rejected`), `practical_requested_at`, `practical_signed_off_at`, `practical_rejection_reason`, `evaluated_by` — all approved in `02_SCHEMA.sql` |
| Validation | Only `super_user`/`admin` may call `/sign-off`; requesting requires `theoretical_passed = true`; sign-off is conditional on current status being `pending` (DB-level conditional update prevents double action) |
| Permissions | Standard User requests for self; Super User/Admin action the queue via `GET /certifications/pending` + `POST /certifications/:cert_id/sign-off` |
| API/data dependencies | `POST /certifications/:equipment_id/request-practical`, `GET /certifications/pending`, `POST /certifications/:cert_id/sign-off` — all specified in `03_API_SPEC.md` §4 |
| Success state | Requester sees "practical assessment pending" then "certified"; reviewer sees the item move from queue to history |
| Error state | Sign-off on an already-actioned item → `409 already_actioned`, not silently duplicated; requesting before theory passes → `403 theory_incomplete` |
| Loading state | Queue refresh spinner; submit-in-progress on sign-off |
| Edge cases | Two Super Users act on the same item concurrently → the conditional update means only the first succeeds, the second gets `409`; a **rejected** request can be re-submitted (`practical_status` returns to `pending` on the next request call); equipment goes non-operational while a request is pending — sign-off is still permitted (certification is a property of the person, not a live equipment-status check) |
| Audit event | **Required, always** (both outcomes): `practical_certification_signed_off` / `practical_certification_rejected` — evaluator, subject, equipment, decision, timestamp — written to `audit_log` |
| Analytics event | `practical_requested`, `practical_signed_off`, `practical_rejected` |

### 1.5 Availability (Calendar)

| Aspect | Detail |
| :--- | :--- |
| User action | View an instrument's calendar, browse open slots |
| System behavior | Render existing `bookings` for the instrument respecting `bufferMinutes`; once the equipment-status gate ships, also reflect non-operational periods |
| Required data | `bookings.slot_range`, `equipment.bufferMinutes`, equipment status |
| Validation | None (read) |
| Permissions | All roles; proxy-booking view for Super User |
| API/data dependencies | `GET /bookings?equipment_id=` (`03_API_SPEC.md` §3) |
| Success state | Calendar renders bookings + buffers + status-blocked periods |
| Error state | Fetch failure → retry; must never render a false "fully open" calendar |
| Loading state | Calendar skeleton |
| Edge cases | Overlapping buffer windows from adjacent bookings; instrument goes non-operational for an already-booked *future* slot — resolved: the booking is **not** auto-cancelled, the affected user gets a `notifications` row, and cancellation (with refund) remains their or a Super User's explicit choice (`03_API_SPEC.md` §2 `PATCH /equipment/:id/status`) |
| Audit event | None |
| Analytics event | None beyond what's captured at booking-attempt time |

### 1.6 Booking

| Aspect | Detail |
| :--- | :--- |
| User action | Select a time range, choose support tier and grant, submit |
| System behavior | Server validates certification (both stages, unexpired), equipment operational status (unless an authorized `force_override`), no time overlap (DB constraint), sufficient grant balance — atomically. On pass, insert into `bookings` and decrement `grants.remaining_balance` by `total_cost` in the same transaction |
| Required data | `equipment_id`, `user_id`, `booked_by_user_id`, `grant_id`, `support_requested`, `slot_range`, `on_behalf_of_user_id`, `force_override`; joins to `user_certifications`, `equipment.status`, `grants.remaining_balance` |
| Validation | ALL of: certified (theory + practical, unexpired) · `equipment.status = 'operational'` OR authorized `force_override` · no overlap (partial `EXCLUDE USING gist ... WHERE (status != 'cancelled')`) · `remaining_balance >= total_cost` · `expiration_date >= slot start` |
| Permissions | Standard User (self); Super User/Admin (self, proxy via `on_behalf_of_user_id`, or `force_override`) |
| API/data dependencies | `POST /bookings` — fully specified in `03_API_SPEC.md` §3, including the equipment-status/funding checks and the distinct error-reason payloads per failure |
| Success state | `201 Created`, `confirmed`, cost breakdown returned |
| Error state | Each failed condition returns a distinct, machine-readable `reason` (`equipment_unavailable_slot`, `certification_incomplete`, `equipment_not_operational`, `insufficient_grant_balance`, `grant_expired`) — never merged into one generic failure |
| Loading state | Optimistic UI while the server validates |
| Edge cases | Race between two users booking against the same grant simultaneously — resolved by making the balance check and the insert part of one DB transaction, not read-then-write; equipment transitions to non-operational between selection and submit — caught by re-validating at submit time, not just at preview; support tier requested with no modeled staff availability (§1.7 — still open) |
| Audit event | Not required for a normal successful booking; **required** when `force_override: true` is used (any role) or when `on_behalf_of_user_id` differs from the caller (proxy booking) |
| Analytics event | `booking_attempted`, `gate_blocked` (failing condition as a property), `booking_confirmed`, `cost_estimate_viewed` |

### 1.7 Support Selection

| Aspect | Detail |
| :--- | :--- |
| User action | Choose Autonomous / Technician / Supervisor tier while configuring a booking |
| System behavior | Adds `support_tariffs.rate_hourly` for the chosen tier to the cost calculation |
| Required data | `support_tariffs.tier`, `rate_hourly`; `bookings.support_requested` |
| Validation | Must be a valid `support_tier` enum value |
| Permissions | All roles, for their own booking |
| API/data dependencies | `support_tariffs` exists; **no entity or endpoint checks actual staff availability** for the requested tier/time — still an open question (§7 Q4), out of scope for this round of resolutions, not silently assumed available |
| Success state | Cost recalculates live as tier changes |
| Error state | N/A today — availability isn't checked at all, which is itself the gap |
| Loading state | Local recalculation if tariffs are client-cached; otherwise a brief round-trip |
| Edge cases | Support tier requested for a time with no staff actually available — currently silently accepted |
| Audit event | None |
| Analytics event | Captured as a property on `booking_attempted` / `cost_estimate_viewed` |

### 1.8 Funding / Grant Validation

| Aspect | Detail |
| :--- | :--- |
| User action | Select which grant pays for the booking |
| System behavior | Check `remaining_balance` and `expiration_date` against computed cost and slot date; show live post-booking balance |
| Required data | `grants.remaining_balance`, `allocated_budget`, `expiration_date`, `pi_user_id` |
| Validation | `remaining_balance >= total_cost`; `expiration_date >= slot start`; grant must belong to the requesting user (exact eligibility-linking rule TBD, §5 Open Questions) |
| Permissions | Standard User selects among grants they're linked to; Admin can view/manage all |
| API/data dependencies | `grants` table exists; whether `GET /auth/me`'s cached `grants` array is refreshed live at configuration time is unresolved |
| Success state | Post-booking remaining balance shown before submit |
| Error state | Insufficient balance → exact shortfall shown; expired grant → expiry date shown, blocked |
| Loading state | Balance-check spinner if a server round-trip is required |
| Edge cases | Two simultaneous bookings against the same grant (shared with §1.6's race condition); grant expires between quote and submit |
| Audit event | Not required for normal use; **required** if an Admin manually adjusts a balance outside the booking-deduction path |
| Analytics event | `grant_balance_checked` |

### 1.9 Confirmation

| Aspect | Detail |
| :--- | :--- |
| User action | Review final cost/grant/duration/support summary, submit |
| System behavior | Final atomic validation + insert (same gate as §1.6); returns the booking record |
| Required data | Aggregated from §1.6, §1.7, §1.8 |
| Validation | Re-validates all booking conditions at submit time, since state may have changed since preview |
| Permissions | Same as §1.6 |
| API/data dependencies | `POST /bookings` |
| Success state | Confirmation screen with booking ID, cost, next-step guidance |
| Error state | Any condition that changed since preview (e.g., grant balance consumed concurrently) must be explained specifically |
| Loading state | Submit-in-progress; disable double-submit |
| Edge cases | Double-click double-submit (must be idempotent or button-disabled after first click); client loses connection after server-side success — client must reconcile by re-fetching, not assume failure |
| Audit event | None beyond §1.6's |
| Analytics event | `booking_confirmed` |

### 1.10 My Bookings *(includes Cancellation — RESOLVED)*

| Aspect | Detail |
| :--- | :--- |
| User action | View upcoming/past bookings; cancel an upcoming booking |
| System behavior | `GET /bookings?user_id=me` lists the user's bookings. `PATCH /bookings/:id/cancel` cancels one: sets `status = 'cancelled'`, `cancelled_at`, `cancelled_by`, `cancellation_reason`, and restores `grants.remaining_balance` by `total_cost` — all in one transaction |
| Required data | `bookings.*` filtered by `user_id`; `cancelled_at`/`cancelled_by`/`cancellation_reason` |
| Validation | Cancellation permitted only while `now() < slot_range` start; caller must be the booking's `user_id` or `super_user`/`admin`; `reason` required only when `cancelled_by != user_id` |
| Permissions | Standard User sees/cancels own; Super User/Admin see/manage broader sets and can cancel on a user's behalf |
| API/data dependencies | `GET /bookings`, `PATCH /bookings/:booking_id/cancel` — both specified in `03_API_SPEC.md` §3 |
| Success state | List renders with status badges (`confirmed`/`active`/`completed`/`cancelled`); cancellation shows restored grant balance |
| Error state | Fetch failure → retry; cancellation attempted after slot start → `409 slot_already_started` (an in-progress/attended session is a different, not-yet-specified early-termination flow, not a cancellation) |
| Loading state | Skeleton list; cancel-in-progress disables the action to prevent double-submit |
| Edge cases | A past booking whose grant has since expired, or whose equipment has since gone non-operational, must still display sensibly — never retroactively hidden or corrupted. Partial refunds/no-show fees for a booking left unused after its slot starts are an explicit **out-of-scope billing-policy decision** — this flow does not invent one, it simply disallows cancellation past that point |
| Audit event | **Required** when staff-initiated (`cancelled_by != user_id`); not required for routine self-cancellation |
| Analytics event | `booking_cancelled` |

### 1.11 Active Sessions / Physical Access (Interlock) *(not built)*

| Aspect | Detail |
| :--- | :--- |
| User action | Trigger unlock within an active booking window; observe live equipment state |
| System behavior | Send `UNLOCK` over `WS /ws/interlock/:equipment_id`; relay broadcasts state; UI reflects Authorized → Waiting → Active/Powered → Fault |
| Required data | `equipment.interlock_mqtt_topic`, active `booking_id` |
| Validation | Unlock only permitted within the booking's authorized window (+ buffer); the command must include `booking_id` and `user_id` for server-side correlation |
| Permissions | Standard User within their own active booking; Super User override + PIN fallback during SSO outages |
| API/data dependencies | `WS /ws/interlock/:equipment_id` (`03_API_SPEC.md` §7); every command/broadcast is now persisted to `session_events` (`state`, `source`, `detail`) server-side |
| Success state | "Equipment powered and session active." |
| Error state | "Hardware controller unavailable — equipment state has not changed" — never imply a state change that didn't happen |
| Loading state | "Waiting for hardware controller." |
| Edge cases | Unlock attempted before the buffer window opens; relay state inconsistent with the booking record; network disconnect mid-session (must hold last known state, per existing NFR) |
| Audit event | **Required** for Super User override/PIN-fallback usage (written to `audit_log`); not required for routine self-unlock within an authorized window (the `session_events` row is sufficient) |
| Analytics event | `session_authorized`, `session_active`, `session_completed` |

### 1.12 Support (in-session contact)

| Aspect | Detail |
| :--- | :--- |
| User action | Contact assigned Technician/Supervisor during a paid-support session; or general help for unresolved issues |
| System behavior | Routes to staff assigned to that booking's `support_requested` tier |
| Required data | `bookings.support_requested`; **staff assignment is not modeled anywhere** (no scheduling/assignment table) |
| Validation | Only available if `support_requested != 'none'` |
| Permissions | Standard User in an active session; Super User receiving the contact |
| API/data dependencies | **Gap:** no endpoint/entity for staff assignment or in-session messaging |
| Success state | Contact request routed and acknowledged |
| Error state | No staff currently assigned/available (ties back to §1.7's unresolved availability gap) |
| Loading state | "Connecting you to support." |
| Edge cases | Support tier purchased but no one actually assigned — unsolvable without the staff-availability model (§5) |
| Audit event | None required |
| Analytics event | `support_contact_initiated` (not currently instrumented anywhere; new) |

### 1.13 Super User Operations

| Aspect | Detail |
| :--- | :--- |
| User action | Manage equipment status/maintenance; action the practical-certification queue (§1.4); proxy-book for a trainee |
| System behavior | `PATCH /equipment/:id/status` with a required reason; certification sign-off (§1.4); `POST /bookings` with `on_behalf_of_user_id` set |
| Required data | `equipment.status` + `equipment_status_events` row; `user_certifications`; `bookings.user_id` (subject) vs. `booked_by_user_id` (actor) — the two are now distinct columns |
| Validation | Only Super User/Admin; status-change reason non-empty; proxy booking still subject to the full booking gate (§1.6) evaluated against the **trainee** (`user_id`), not the proxying Super User (`booked_by_user_id`) |
| Permissions | Super User, Admin |
| API/data dependencies | `PATCH /equipment/:equipment_id/status`, `POST /bookings` with `on_behalf_of_user_id` — both specified in `03_API_SPEC.md` §2–3 |
| Success state | Status update immediately reflected in Availability (§1.5) plus a `notifications` row per affected user with an existing booking; proxy booking confirms same as a normal booking |
| Error state | Status update submitted without a reason → `400`; proxy booking fails the trainee's gate — response identifies the trainee's failing condition, not the proxying Super User's |
| Loading state | Status-update in progress; queue refresh (shared with §1.4) |
| Edge cases | Existing confirmed bookings on an instrument just marked non-operational — **resolved:** not auto-cancelled, notified instead (§1.5) |
| Audit event | **Required:** equipment status change (`equipment_status_events` + `audit_log`); proxy booking creation (`audit_log`, since `booked_by_user_id != user_id`) |
| Analytics event | None beyond the underlying booking/certification events |

---

## 2. Business Rules (Explicit Logic)

```
RULE 1 — Certification gate
IF theoretical_passed = false OR practical_signed_off = false OR certification expired
THEN booking action is disabled
AND system names the specific missing stage
AND provides the path to complete it (SOP/quiz link, or "request practical assessment")

RULE 2 — Equipment status gate (RESOLVED, override path approved)
IF equipment.status != 'operational'
THEN booking action is disabled, regardless of certification status
AND system explains "equipment is currently under maintenance/offline"
UNLESS the caller is super_user/admin AND explicitly sets force_override = true on the request,
   IN WHICH CASE the booking proceeds AND an audit_log entry is written unconditionally,
   capturing the equipment's actual status at booking time
force_override has no effect on certification or funding checks — those are never overridable

RULE 3 — Conflict gate
IF requested slot overlaps an existing confirmed/active booking for the same equipment
THEN the insert is rejected by the database exclusion constraint
AND the system surfaces "this time is no longer available"
AND suggests the next open slot

RULE 4 — Funding sufficiency
IF selected_grant.remaining_balance < computed_total_cost
THEN booking is rejected
AND system shows the exact shortfall amount
AND offers grant re-selection

RULE 5 — Funding expiry
IF selected_grant.expiration_date < booking_slot.start_date
THEN booking is rejected
AND system explains the grant has expired

RULE 6 — Cost computation
total_cost = base_rate_hourly * hours + support_tariffs.rate_hourly(tier) * hours
COMPUTED SERVER-SIDE ONLY — never trusted from the client

RULE 6b — Grant deduction and restoration (RESOLVED — previously unspecified anywhere)
IF a booking is confirmed
THEN grant.remaining_balance is decremented by total_cost, in the SAME transaction as the insert
IF a booking is cancelled before its slot_range start (Rule 11)
THEN grant.remaining_balance is restored by total_cost, in the SAME transaction as the cancellation
Implemented in the booking/cancellation service's transaction, not as a DB trigger — keeps business
logic in the application layer, consistent with how the rest of this schema handles computation
(e.g. total_cost itself is a GENERATED column, but no other business logic runs via triggers)

RULE 7 — Certification expiry does not revoke active bookings
IF a user's certification expires AFTER a booking was already confirmed
THEN the existing booking/session is NOT revoked
AND only new booking attempts on that equipment are blocked

RULE 8 — Sign-off is auditable
IF a Super User signs off a practical certification
THEN practical_signed_off = true AND evaluated_by is recorded
AND an immutable audit event is written

RULE 9 — Interlock fault handling
IF the interlock relay cannot confirm state (network fault)
THEN the system MUST NOT report a state change
AND MUST show "state unknown / holding last known" rather than an implied success or failure

RULE 10 — Proxy booking evaluates the trainee, not the actor
IF a Super User proxy-books on behalf of a trainee
THEN the booking gate (Rules 1–5) is evaluated against the TRAINEE
AND the action is audit-logged as a proxy booking

RULE 11 — Cancellation (RESOLVED)
IF the caller is the booking's own user_id, OR the caller is super_user/admin
AND now() < slot_range start
THEN the booking may be cancelled: status -> 'cancelled', cancelled_at/cancelled_by/cancellation_reason set
AND grant.remaining_balance is restored by total_cost (Rule 6b)
AND IF cancelled_by != user_id (staff-initiated) THEN reason is required AND an audit_log entry is written
IF now() >= slot_range start
THEN cancellation is rejected (409 slot_already_started) — an in-progress/attended session is a
   different, not-yet-specified early-termination flow, not a cancellation
Partial refunds / no-show fees for a booking left unused after its slot starts are an explicit
OUT-OF-SCOPE facility billing-policy decision — this rule does not invent one; it simply disallows
cancellation once that boundary is crossed
```

---

## 3. Acceptance Criteria

**AC-1.** Given `equipment.is_operational = false`, when a fully-certified user submits `POST /bookings` for that equipment, then the request is rejected and the failure reason returned is specifically `equipment_unavailable`, not a certification error.

**AC-2.** Given a user has `theoretical_passed = true` and `practical_signed_off = false`, when they view that equipment's certification status, then the UI shows "Practical assessment pending" with a "Request assessment" action — not a disabled button with no explanation.

**AC-3.** Given two users submit overlapping booking requests for the same `equipment_id` within milliseconds of each other, when both reach the database, then exactly one insert succeeds and the other receives a conflict-specific rejection — never both succeeding.

**AC-4.** Given a grant's `remaining_balance` is €50 and a booking's computed `total_cost` is €80, when the user attempts to confirm, then the rejection states the shortfall as €30, not a generic "insufficient funds."

**AC-5.** Given a Super User signs off a pending practical-certification request, when the action completes, then an audit record captures evaluator `user_id`, subject `user_id`, `equipment_id`, and timestamp.

**AC-6.** Given the interlock WebSocket connection drops mid-session, when the client detects the disconnect, then the UI shows "state unknown, holding last known" and renders neither "active" nor "fault" until reconnection confirms actual relay state.

**AC-7.** Given a confirmed booking, when the user's certification for that equipment expires before the session date, then the existing booking remains valid/attendable, and only a *new* booking attempt on that equipment is blocked.

**AC-8.** Given a Super User proxy-books equipment for a trainee who is not certified, when the request is submitted, then the booking is rejected on the trainee's certification status, and the audit log records the attempt as a proxy action initiated by the Super User.

**AC-9.** Given a user double-clicks "Confirm booking," when both clicks reach the server, then exactly one booking is created, not two.

**AC-10.** Given equipment discovery is filtered to NCL or SLN (currently unseeded in `02_SCHEMA.sql`), when the filter is applied, then the system returns an explicit "no equipment currently listed for this facility" empty state, not an error or a silently broken filter.

---

## 4. State Matrix

### 4.1 Theory Certification

| Current state | Event | Next state | Side effects |
| :--- | :--- | :--- | :--- |
| Not started | Quiz submitted, score ≥ 80 | Passed | `theoretical_passed = true` |
| Not started | Quiz submitted, score < 80 | Failed | Show score/threshold; retry allowed |
| Failed | Retry, score ≥ 80 | Passed | `theoretical_passed = true` |
| Passed | Certification `expires_at` reached | Expired | Re-gates booking; retake required (exact per-stage-vs-whole-row expiry semantics unresolved — §5 Q10) |

### 4.2 Practical Certification *(states now backed by `user_certifications.practical_status`)*

| Current state | Event | Next state | Side effects |
| :--- | :--- | :--- | :--- |
| `not_requested` | `POST .../request-practical` (requires `theoretical_passed = true`) | `pending` | `practical_requested_at` set |
| `pending` | Super User: `sign-off` decision=`signed_off` | `signed_off` | `practical_signed_off_at`, `evaluated_by` set; audit event (Rule 8) |
| `pending` | Super User: `sign-off` decision=`rejected` (reason required) | `rejected` | `practical_rejection_reason` set; audit event |
| `rejected` | `POST .../request-practical` again | `pending` | Re-enters the queue; `practical_requested_at` updated |
| `signed_off` | `expires_at` reached | *(re-gates booking; row remains `signed_off` — expiry is checked against `expires_at`, not by resetting `practical_status`)* | Both stages considered invalid for new bookings; existing active sessions unaffected (Rule 7) |

### 4.3 Booking

| Current state | Event | Next state | Side effects |
| :--- | :--- | :--- | :--- |
| Configuring (client-only) | Submit | Validating | Gate check in flight (Rules 1–5) |
| Validating | All conditions pass | Confirmed | Costs computed and persisted |
| Validating | Any condition fails | Rejected | Specific reason returned (never generic) |
| Confirmed | Arrival within buffer window | Active | *(No explicit status transition beyond the enum — needs an event source, e.g. the interlock authorization in §4.5, to actually flip `booking_status`)* |
| Active | Session end | Completed | Cost/usage finalized |
| Confirmed | `PATCH .../cancel`, before slot start | Cancelled | `cancelled_at`/`cancelled_by`/`cancellation_reason` set; `grant.remaining_balance` restored (Rule 6b); audited if staff-initiated (Rule 11) |
| Active | `PATCH .../cancel` attempted | *(rejected, stays Active)* | `409 slot_already_started` — cancellation is not defined once a slot has started; early termination of an active session is a separate, not-yet-specified flow |

### 4.4 Grant/Funding Check (per booking attempt — not a persisted entity state)

| Current state | Event | Next state | Side effects |
| :--- | :--- | :--- | :--- |
| Unchecked | Balance checked, sufficient | Sufficient | Proceed to insert |
| Unchecked | Balance checked, insufficient | Insufficient | Block, show shortfall (Rule 4) |
| Sufficient (at preview) | Re-checked at submit, balance consumed concurrently | Insufficient | Block at submit — state can regress between preview and submit; must re-explain, not silently fail |

### 4.5 Session / Interlock *(proposed new entity — see §4)*

| Current state | Event | Next state | Side effects |
| :--- | :--- | :--- | :--- |
| Idle | Unlock requested | Authorizing | — |
| Authorizing | Relay broadcasts `ENERGIZED`/`ONLINE` | Active | Booking's session considered started |
| Authorizing | Timeout / no response | Fault | "State unknown, holding last known" (Rule 9) |
| Active | Session end (user action or window expiry) | Completed | `booking_status` → `completed` |
| Any | Network disconnect | Fault (hold last known) | Per existing fail-safe NFR — never imply success or failure |

---

## 5. Data Model

**Legend:** ✅ existing, unchanged · ☑️ **approved and added to `02_SCHEMA.sql` this round** · ⚠️ existing, unchanged, still needs a decision.

| Entity | Status | Notes |
| :--- | :--- | :--- |
| **User** | ✅ `users` | `role` enum (`standard_user`/`super_user`/`admin`), SSO identifier, email, full name |
| **Facility** | ⚠️ enum only | `facility_code` (`NFL`/`NCL`/`SLN`) is inline on `equipment`, not a dedicated table — fine as-is unless facility-level metadata grows; not addressed this round |
| **Equipment** | ☑️ `equipment` | `is_operational BOOLEAN` **replaced** with `status equipment_status` (`operational`/`maintenance`/`offline`), matching the shipped frontend and design system. Resolves PRD §21 Q9 |
| **Certification** | ☑️ `user_certifications` | `practical_signed_off BOOLEAN` **replaced** with `practical_status` enum (`not_requested`/`pending`/`signed_off`/`rejected`). Added: `theoretical_passed_at`, `practical_requested_at`, `practical_signed_off_at`, `practical_rejection_reason`. `expires_at` semantics resolved: set once, when `practical_status` first becomes `signed_off` |
| **Training** | ✅ `training_modules` | SOP URL, quiz schema, passing score |
| **Availability** | — (computed) | Not a persisted entity — derived from `bookings` + `equipment.status` + buffer time. No schema change needed |
| **Booking** | ☑️ `bookings` | Added: `booked_by_user_id` (actor, distinct from `user_id` the beneficiary — resolves the proxy-booking data-shape question), `cancelled_at`, `cancelled_by`, `cancellation_reason`. The overlap-exclusion constraint is now partial (`WHERE status != 'cancelled'`) so a cancelled slot can be rebooked |
| **Grant** | ✅ `grants` | Budget, remaining balance, expiration, PI. Deduction/restoration behavior now defined at the application layer (Rule 6b), not in the DDL |
| **Support option** | ✅ `support_tariffs` | Seeded tiers/rates. Staff-availability/assignment entity is still an open question (§7 Q4), out of scope this round |
| **Session** | ☑️ `session_events` | Approved as a log table: `booking_id`, `state` (`authorizing`/`active`/`fault`/`completed`), `source` (`relay`/`user`/`system`), `detail`, `occurred_at` — kept separate from `bookings` to avoid overloading it with noisy hardware-state history |
| **Equipment status event** | ☑️ `equipment_status_events` | Approved: `equipment_id`, `previous_status`, `new_status`, `reason`, `changed_by`, `changed_at` — backs `PATCH /equipment/:id/status` and satisfies part of the equipment-status audit requirement with richer detail than a generic log entry |
| **Notification** | ☑️ `notifications` | Approved, **scoped to in-app only** (no `channel` column) — a deliberate scope decision, not an oversight; email/push are an explicit later extension if needed (§7 Q2 remains open for *that* extension only) |
| **Audit log** | ☑️ `audit_log` | Approved as one generic table (`actor_user_id`, `action`, `entity_type`, `entity_id`, `before_state`/`after_state` JSONB, `created_at`) rather than one bespoke table per event type. `GET /audit-log` (`03_API_SPEC.md` §8, admin-only) is its read path |

**Relationships (current, post-update):**
- `User` 1—N `Grant` (as PI), 1—N `Booking` (as `user_id` and separately as `booked_by_user_id`), 1—N `Certification`
- `Equipment` 1—N `Booking`, 1—N `Certification`, 1—1 `Training` module (per instrument), 1—N `equipment_status_events`
- `Booking` N—1 `Equipment`, N—1 `User` (×2 roles), N—1 `Grant`, 1—N `session_events`
- `Certification` N—1 `User`, N—1 `Equipment`, N—1 `User` (as `evaluated_by`)
- `Notification` N—1 `User`
- `audit_log` entries reference an actor `User` and an arbitrary `(entity_type, entity_id)` pair

---

## 6. Analytics — Mapped to Success Metrics

| PRD success metric (§6) | Required event(s) | Feasibility |
| :--- | :--- | :--- |
| Time to find suitable equipment | `equipment_search_started` → `equipment_selected` | Feasible once §1.1/§1.2 ship |
| Booking completion rate | `booking_attempted` → `booking_confirmed` | Feasible now (§1.6 events exist in this spec) |
| Certification completion rate (practical) | `quiz_passed` → `practical_requested` → `practical_signed_off` | Feasible once §1.4 ships |
| Gate-blocked abandonment | `gate_blocked` (with failing condition) vs. subsequent resolution in-session | Feasible now |
| Eligibility-related support contacts | `support_contact_initiated` | **Blocked** — no support-ticket tagging system exists; this event alone doesn't capture root cause without one |
| Repeat usage | `booking_confirmed` timestamps per user | Feasible from `bookings` history alone, no new event needed |
| Facility utilization | Derived from `gold.fact_facility_usage.booked_hours` | Feasible, already schema'd |
| Certification processing time | `theoretical_passed_at` → `practical_signed_off_at` | Feasible now — both columns approved and added (§5 Data Model) |
| Administrative workload | — | **Blocked** — no in-product instrumentation possible; requires an external time-tracking or survey mechanism |
| Equipment downtime visibility | Compare `equipment_status_events` to calendar render | Feasible now — table approved (§5 Data Model) |
| Booking conflicts | DB constraint-violation logging | Feasible now, no new event needed |
| Funding validation success rate | `grant_balance_checked` vs. `gate_blocked` (funding reason) | Feasible now |
| Cost-allocation accuracy | Compare booked vs. `actual_run_hours` (`gold.fact_facility_usage`) | Feasible, already schema'd |
| Grant utilization | `grants` table snapshots over time | Feasible now, no new event needed |

---

## 7. Open Questions (Blocking Engineering)

**Resolved this round** (decisions made and reflected in `02_SCHEMA.sql` / `03_API_SPEC.md` / this document — flagging so a reviewer can push back on any of them specifically):

- ~~Cancellation rules~~ → Rule 11: self or staff, before slot start only, full grant restoration, staff-initiated requires a reason and is audited. Partial refunds/no-show fees for a booking left unused past its start are explicitly left as a facility billing-policy decision, not invented here.
- ~~Session/interlock entity design~~ → approved as `session_events`, a separate log table (§5).
- ~~`equipment.is_operational` boolean vs. three-state status~~ → replaced with `equipment_status` enum (`operational`/`maintenance`/`offline`), matching the frontend.
- ~~Equipment-status override~~ → approved as `force_override` on `POST /bookings`, restricted to `super_user`/`admin`, always audited when used.
- ~~Proxy-booking data shape~~ → approved: `bookings.booked_by_user_id` (actor) added, distinct from `user_id` (beneficiary/subject of the gate).
- ~~Non-operational equipment with existing confirmed bookings~~ → resolved: not auto-cancelled; affected users get an in-app `notifications` row and choose whether to cancel.
- ~~Certification expiry semantics~~ → resolved: `expires_at` is set once, when `practical_status` first reaches `signed_off` (full certification), not per stage.
- ~~Notification channel~~ (partially) → scoped to in-app only for this round; email/push remain a genuinely open *future* extension (see below), not blocking anything today.

**Still open:**

1. **Notification channel expansion** — should email or push be added later, and what's the delivery infrastructure? Not blocking, since in-app notifications (approved) already satisfy PRD §15's requirements for this release.
2. **Support-tier staff availability modeling** — nothing today checks whether a requested support tier is actually staffable. Blocks §1.7's real-time check and §1.12 entirely. Out of scope for this round.
3. **Grant-eligibility linking rule** — how is a grant determined to "belong to" a requesting user (PI-only, lab membership, shared budget line)? Blocks §1.8's permission check precisely. Out of scope for this round.
4. **Early termination of an active session** — cancellation (Rule 11) explicitly does not cover a slot that has already started; if a Super User needs to end an active session early (e.g. equipment fault mid-session), that flow still has no defined rule or endpoint.

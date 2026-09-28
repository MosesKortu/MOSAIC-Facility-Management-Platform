# Product Requirement Document (PRD): MOSAIC

**Platform Name:** MOSAIC (Management & Operational System for Advanced ICFO Cores)
**Target Facilities:** Nano Fabrication Lab (NFL), Nanocharacterization Lab (NCL), Super-resolution Light Microscopy & Nanoscopy Facility (SLN)
**Version:** 2.1 (V2 build)
> **V2 note (2026-09-28):** `08_IMPLEMENTATION_CONTRACT.md` is the source of truth for the V2 build and overrides this PRD where they differ. §9 (IA), §12 (grant rule) and §13 (permissions) are updated below to match it. The main additions are the read-only `auditor` role, internal/external user type, groups, and group-level grant allocations. References to the V1 frontend, V1 `CLAUDE.md` and `gold.*` tables describe the superseded V1 system. Engineering decisions: `09_ARCHITECTURE.md` §1.

**Built on:** `docs/00_RESEARCH_SYNTHESIS.md`, `docs/PRODUCT_STRATEGY.md`, `docs/02_SCHEMA.sql`, `docs/03_API_SPEC.md`, `docs/04_DESIGN_SYSTEM.md`, and `CLAUDE.md`'s log of what is actually built.

**A note on evidence.** This PRD inherits the confidence discipline of the documents it's built from. Claims sourced only to the illustrative research document (personas, pain-point severity) are marked as such and should not be read as validated user findings. Claims sourced to the schema, API spec, or shipped frontend are facts about the current system, not about user behavior. Where a target or requirement cannot be responsibly set from current evidence, it is marked **TBD**, not invented.

---

## 1. Executive Summary

MOSAIC is the core-facility management platform for ICFO, replacing legacy software (Stratocore PPMS), serving three facilities: NFL, NCL, and SLN. It unifies equipment booking, hardware access interlocks, staff support billing, embedded training/certification, grant-funded cost allocation, and financial reporting.

**Who it serves:** Standard Users (`standard_user` — PhD/postdoc/external researchers), Super Users (`super_user` — technicians/supervisors), and Super Admins (`admin` — facility managers), per `02_SCHEMA.sql`'s `user_role` enum.

**The problem:** A researcher's eligibility to use an instrument depends on identity, training, certification (theory *and* practical), grant funding, equipment operational status, and support availability — none of which are currently validated or explained together. Even after booking, there is no visible guarantee that a confirmed reservation means the physical equipment will actually be usable. Facility staff have no consolidated way to see what's blocking a given user or what needs their attention. (See `00_RESEARCH_SYNTHESIS.md` §1, §6; confirmed by the current build's absence of a practical-certification queue and equipment-status booking gate.)

**Product approach:** Treat booking as one validated, multi-constraint transaction (Pillar 2 of `PRODUCT_STRATEGY.md`); make every access gate explainable with a concrete next action (Pillar 1); make cost and funding visible before commitment (Pillar 3); make the digital-to-physical access boundary explicit (Pillar 4); give facility staff exception-centric tools instead of generic CRUD (Pillar 5); and give less-familiar and external users a guided, discoverable path (Pillar 6).

**Expected outcome:** Standard bookings are self-service end-to-end without staff mediation for eligibility checks; zero bookings are confirmed against non-operational equipment or insufficient funds; every gate a user hits states what's missing and what to do next; every financial and access-control event is auditable.

---

## 2. Problem Statement

**Current problem:** Booking eligibility is a function of at least six independent conditions — identity/role, theory certification, practical sign-off, grant balance, equipment operational status, and support-tier availability — that are not validated or surfaced together anywhere in the product today.

**Affected users:** Primarily Standard Users, who hit this fragmentation directly; secondarily Super Users, who become the fallback resolution path for anything the product doesn't explain; secondarily Finance/grant stakeholders, who inherit reconciliation risk if funding checks are incomplete.

**Current workflow:** Presumed to be staff-mediated for anything the app doesn't resolve (asserted in the supplied research, not independently confirmed — **weak inference**).

**Root causes (confirmed in the current build, per `CLAUDE.md`):**
- Certification is modeled as two independent stages (`theoretical_passed`, `practical_signed_off`, `02_SCHEMA.sql`), but only the theory stage has any UI (`TrainingGateModal`). Passing the quiz leads nowhere.
- `equipment.is_operational` exists in the schema but is not checked by the booking gate — only certification is.
- The API/schema already provision a physical-interlock mechanism (`interlock_ip`, `interlock_mqtt_topic`, `WS /ws/interlock/:equipment_id`), but no frontend UI consumes it — there is no way for a user to see "digital booking confirmed" vs. "equipment physically ready."
- `/login` exists but is not linked from any navigation — external/guest users cannot discover it without already having the URL.

**Consequences:** Certified-in-theory users cannot book (dead end); equipment under maintenance can theoretically be booked; users have no way to confirm physical access matches their booking; external users are effectively blocked from onboarding through the product itself.

**Evidence:** `00_RESEARCH_SYNTHESIS.md` §1, §2, §6, §10 (confirmed-fact rows); `PRODUCT_STRATEGY.md` §1, §9. Persona-level framing (e.g., "researchers feel anxious about hidden fees") is sourced only to the illustrative research document and is **not** independently evidenced — it motivates prioritization, not certainty.

---

## 3. Product Vision

A researcher opens MOSAIC, finds the right instrument in seconds, and immediately sees what's required to use it. Any outstanding requirement — a quiz, a practical assessment, a grant with insufficient balance — is shown as a specific, resolvable status, not a locked door. Configuring a booking shows the real cost and which grant absorbs it before the researcher commits. Arriving at the instrument, the researcher sees explicit confirmation that their digital booking has become physical access — never a guess. When the session ends, cost and usage are recorded automatically, and the researcher's certification and grant-balance state reflect it immediately.

Facility staff see a living operational picture — pending certification sign-offs, equipment in maintenance, active sessions, funding exceptions — instead of reconstructing it from memory, email, or spreadsheets. Every override, tariff change, and role escalation is recorded immutably, satisfying EU grant compliance without extra staff effort.

---

## 4. Goals

| # | Goal | Rationale |
| :--- | :--- | :--- |
| G1 | Standard bookings are completable without staff-mediated eligibility checks | Directly addresses the core problem (§2); Pillar 1/2 |
| G2 | Every certification stage (theory and practical) has a visible status and a next action | Closes the confirmed practical-certification dead end |
| G3 | Zero bookings are confirmed against equipment that is not operational | Closes the confirmed equipment-status gating gap |
| G4 | Zero bookings are confirmed without the user seeing total cost and grant impact first | Addresses the unresolved cost-transparency question by making it a hard requirement |
| G5 | 100% migration off legacy PPMS within 30 days of launch | Carried forward from the platform's original KPI; unchanged by this revision |
| G6 | Every override, tariff change, role escalation, and certification sign-off decision is immutably logged | EU grant compliance; extends the existing audit NFR to certification events |
| G7 | Zero successful double-bookings | Already structurally guaranteed by `EXCLUDE USING gist` — retained as a goal to validate, not a gap to close |

---

## 5. Non-Goals

This release will explicitly **not** solve:
- A general-purpose LMS or course catalog beyond equipment-specific SOP + quiz + practical sign-off.
- Scientific data, sample, or experiment-result management — no such entities exist in the schema.
- Room or general lab-space booking — the schema models `equipment` only.
- Predictive maintenance or equipment telemetry beyond a binary operational/interlock state.
- Replacing the institution's ERP or ID provider — MOSAIC exports to ERP and delegates identity to Shibboleth/OIDC.
- Resolving `/login`'s navigation-discoverability decision (tracked as an open question, §21) — this PRD defines the requirement but does not mandate the specific nav treatment.
- Keyboard-operable drag-to-book gesture (the confirmation dialog that follows a drag is already keyboard-operable; the gesture itself is a tracked, deliberate gap — see §20).

---

## 6. Success Metrics

Every metric below follows Definition → Measurement method → Target → Time horizon. Where no responsible target exists yet, it is marked **TBD — requires baseline**, per instruction, rather than invented.

### User metrics

| Metric | Definition | Measurement | Target | Horizon |
| :--- | :--- | :--- | :--- | :--- |
| Time to find suitable equipment | Time from search/filter start to equipment-detail view opened with booking intent | `equipment_search_started` → `equipment_selected` analytics events (§18) | TBD — requires baseline | First 30 days post-launch |
| Booking completion rate | % of booking attempts that reach `confirmed` status | `booking_attempted` vs `booking_confirmed` events | TBD — requires baseline | First 30 days post-launch |
| Certification completion rate (practical stage) | % of users who pass the quiz who go on to receive practical sign-off | `quiz_passed` vs `practical_signed_off` events | TBD — requires baseline; this stage has no data today since the UI doesn't exist yet | First 60 days after the practical-certification flow ships |
| Gate-blocked abandonment | % of `gate_blocked` events (any condition) with no resolution in the same session | `gate_blocked` vs subsequent `booking_confirmed`/`training_started` in-session | Directionally decreasing; TBD numeric target | Ongoing, reviewed monthly |
| Eligibility-related support contacts | Count of staff-directed contact tagged "why can't I book" | **Not currently measurable** — no support-ticket tagging system is specified anywhere in the API/schema; instrumenting this is a prerequisite, not assumed to exist | TBD — requires instrumentation first | N/A until instrumented |
| Repeat usage | % of certified users completing a second booking within 90 days | Booking history per user (`bookings` table) | TBD — requires baseline | 90-day rolling, first measured 90 days post-launch |

### Operational metrics

| Metric | Definition | Measurement | Target | Horizon |
| :--- | :--- | :--- | :--- | :--- |
| Facility utilization | Booked hours ÷ bookable hours per instrument per period | `gold.fact_facility_usage.booked_hours` | TBD — requires baseline | Monthly, starting after first full month of data |
| Certification processing time | Time from quiz pass to practical sign-off | **Currently not measurable — data-model gap.** `user_certifications` has no timestamp for when `theoretical_passed`/`practical_signed_off` were set, only `expires_at`. Adding those timestamp columns is a prerequisite for this metric | TBD | N/A until schema change ships |
| Administrative workload | Staff-hours spent on manual certification/billing reconciliation | Not currently instrumented in-product; would require a survey or external time-tracking, since MOSAIC doesn't log staff time-on-task | TBD | N/A until an instrumentation decision is made |
| Equipment downtime visibility | % of maintenance/offline periods reflected in real time in the booking calendar | Compare `equipment.is_operational`/status transitions to calendar render latency | Near-100% once equipment-status gating ships (G3) | Immediately post-launch of G3 |
| Booking conflicts | Count of attempted double-bookings rejected by the DB exclusion constraint | Postgres constraint-violation logging | This validates an existing guarantee (G7) rather than being a target to move — expected near-zero *successful* conflicts by construction | Ongoing |

### Business / funding metrics

| Metric | Definition | Measurement | Target | Horizon |
| :--- | :--- | :--- | :--- | :--- |
| Funding validation success rate | % of bookings where grant-balance check passes without manual override | Booking creation events with `grant_id` vs. insufficient-balance rejections | TBD — requires baseline | First 30 days post-launch |
| Cost-allocation accuracy | % of bookings where `calculated_base_cost + calculated_support_cost` matches actual session duration × rate | Compare booked vs. `actual_run_hours` (`gold.fact_facility_usage`) | TBD | Monthly |
| Grant utilization | `remaining_balance ÷ allocated_budget` trend per grant per period | `grants` table snapshots over time | Informational; no pass/fail target established — **TBD whether facility management wants a target band** | Quarterly, aligned to grant reporting cycles |

---

## 7. Personas

The personas below are carried forward from the supplied research synthesis. **They are working personas, not validated ones** — no interview, survey, or usage data ties them to actual ICFO researchers or staff (`00_RESEARCH_SYNTHESIS.md` §10). They are used here to keep design and engineering decisions concrete and consistent, not as settled fact. Each is mapped to the schema's actual 3-tier role.

| Persona | Role (schema) | Facility | Core need |
| :--- | :--- | :--- | :--- |
| Anna — PhD researcher, intermediate technical experience, 2–4 sessions/week | `standard_user` | NFL | Shortest path from research objective to confirmed session; no administrative-structure learning curve |
| Daniel — external academic researcher, occasional use | `standard_user` (via guest/magic-link) | NCL | A guided, terminology-light onboarding path he can discover and follow without ICFO-internal knowledge |
| Marc — technical specialist, daily use | `super_user` | NFL | Exception-first tooling: certify users, manage maintenance, resolve problems fast |
| Laura — facility manager, daily use, cross-facility | `admin` | NFL + NCL + SLN | Portfolio-wide operational and financial visibility, not a conventional booking UI |
| Javier — financial controller | `admin` (no distinct schema role today — see §21 Q5) | Cross-facility | Traceable, auditable financial records; ERP-consistent exports |
| Sofia — facility administrator (user/schedule/comms coordination) | `admin` (no distinct schema role today — see §21 Q5) | Cross-facility | Automation of repetitive administrative tasks |

---

## 8. End-to-End User Journey

Discover → Access → Train → Check availability → Configure → Fund → Book → Prepare → Use → Complete.

| Stage | User goal | Current status | Key moment / failure point |
| :--- | :--- | :--- | :--- |
| Discover | Find a suitable instrument | Built (equipment discovery UI) | RD asserts "too many instruments" is a friction point — unverified |
| Access | Understand what's required | Partially built — requirements are surfaced reactively inside the booking-gate modal, not as a standalone view | No standalone "what do I need" view exists yet (§11 Certification) |
| Train | Complete SOP + quiz | Built (`TrainingGateModal`) | Failure point: a failed quiz must explain score, threshold, and retry path (already true per current implementation) |
| — (practical) | Complete practical assessment | **Not built** | **Critical failure point** — quiz-passed users have no way to see or request a practical assessment; this is a confirmed dead end |
| Check availability | See open slots | Built (Equipment Calendar) | — |
| Configure | Choose duration and support tier | Built (drag-to-book, support-tier selection per schema) | — |
| Fund | Select grant, confirm balance | Grant model exists (`grants`, `BookingSlot.grantId`); whether live balance validation surfaces at this step is **unresolved** | If unresolved and missing: booking could proceed against insufficient funds without warning |
| Book | Confirm reservation | Built; DB-guaranteed conflict-free | Equipment operational status is **not** checked here — confirmed gap |
| Prepare | Arrive, authorize physical access | **Not built** — no interlock/session UI | Failure point: user has no way to know if the digital booking became physical access |
| Use | Run the session | **Not built** | — |
| Complete | Session ends, cost/grant update automatically | **Not built** | — |

---

## 9. Information Architecture

Two candidate structures exist in the source material and disagree with each other: the supplied research recommends nesting Equipment under Facilities (NFL/NCL/SLN) as the top-level branch (`00_RESEARCH_SYNTHESIS.md` §23), while that same research's own persona Anna explicitly rejects needing to "navigate the facility's administrative structure" — an internal contradiction the research does not resolve (§7 of the synthesis).

**Decision for this PRD:** primary navigation is task/equipment-first, with facility used as a filter on equipment discovery rather than a top-level branch. Rationale: it directly serves the stated user goal (shortest path from research objective to booking) without contradicting it. This is a PRD decision, not a rediscovered fact — flag for stakeholder confirmation (§21 Q8).

**V2 IA** (`08` §3): four role applications instead of one Administration branch.

```
Researcher (standard_user, and staff for their own work)
  Home · Equipment (facility filter) · Calendar · My Bookings · Training & Certifications · Grants & Billing · Support · Notifications
Operations (super_user, admin)
  Operations Dashboard · Certification Queue · Active Sessions · Equipment Status · Maintenance
Administration (admin)
  Overview · People (Internal / External / Groups) · Equipment · Grants & Funding · Tariffs · Administrative Audit
Analytics (auditor — read-only)
  Overview · Sessions · Revenue · People · Equipment · Funding · Audit Log
```

`/login` is linked as the unauthenticated entry point; its external-collaborator path (magic link) waits on email approval (`09` §9).

---

## 10. Functional Requirements

### 10.1 Access & Identity

- **Objective:** Authenticate users and establish role/session context.
- **User story:** As a researcher, I want to log in with my institutional credentials so I don't need a separate MOSAIC account.
- **Functional behavior:** Institutional SSO (Shibboleth/OIDC) as primary path; magic-link guest access for external collaborators (`03_API_SPEC.md` `GET /auth/shibboleth`, `GET /auth/me`).
- **Business rules:** Role defaults to `standard_user` on first login (`02_SCHEMA.sql`); role elevation is an explicit `admin` action, audit-logged (§16).
- **Permissions:** All roles authenticate the same way; role determines everything downstream.
- **Dependencies:** Institutional SSO availability; PIN fallback for Super Users during SSO outages (existing NFR).
- **Success state:** Session established, `/auth/me` returns role, certifications, and grants.
- **Error state:** SSO failure → explicit message distinguishing "institution SSO is down" (with PIN fallback for Super Users) from "your account isn't recognized."
- **Empty state:** New guest account with no certifications/grants yet — should not look broken, should show onboarding next steps.
- **Loading state:** Session-check spinner, not a blank shell.
- **Edge cases:** Expired session mid-booking; SSO outage during an active session (must not revoke physical access already granted — see §10.4).

### 10.2 Certification & Training

- **Objective:** Gate equipment access on demonstrated competence, with every stage explainable.
- **User story:** As a researcher, I want to know exactly what training I still need for an instrument, and how to complete it, without contacting staff.
- **Functional behavior:** Theory stage (SOP + quiz, 80%+ to pass) is built (`TrainingGateModal`). Practical stage must be added: a status view showing "practical assessment pending," a request action, and a Super User-facing queue to action it.
- **Business rules:** Both `theoretical_passed` and `practical_signed_off` must be true to book (`02_SCHEMA.sql`); certification can expire (`expires_at`) and must re-gate booking on expiry.
- **Permissions:** Standard Users self-serve the theory stage and request practical assessment; only `super_user`/`admin` can set `practical_signed_off`.
- **Dependencies:** `training_modules`, `user_certifications` tables; new UI for practical-stage status and staff queue.
- **Success state:** Certification dashboard shows both stages as complete; booking gate passes.
- **Error state:** Quiz failed below 80% → show score, threshold, retry path, and link back to SOP (already implemented for theory).
- **Empty state:** User with no certification attempts yet on a given instrument → clear "get started" state, not a blocked screen.
- **Loading state:** Quiz auto-grading in progress.
- **Edge cases:** Certification expires mid-active-booking (should not revoke an already-authorized session — new rule, see §12); user requests practical assessment for an instrument later marked non-operational.

### 10.3 Scheduling & Booking

- **Objective:** Make booking a single, atomically-validated transaction.
- **User story:** As a researcher, I want my booking to check everything at once — training, funding, availability, equipment status — so a "confirmed" booking is one I can trust.
- **Functional behavior:** Drag-to-book on the Equipment Calendar (built), gated today only on certification. Must be extended to also gate on equipment operational status and (pending §21 Q1) grant balance.
- **Business rules:** No overlapping bookings per instrument (DB-enforced, `EXCLUDE USING gist`); automatic pre/post-session technical buffers (`Equipment.bufferMinutes`); booking blocked if equipment is not operational (**new rule**, closes confirmed gap).
- **Permissions:** Standard Users book for themselves; Super Users can proxy-book for trainees; Super Admins hold global calendar locks.
- **Dependencies:** `bookings` table/constraint; certification state; grant state; equipment status.
- **Success state:** Booking `confirmed`, cost and grant impact shown.
- **Error state:** Each blocking condition (certification, funding, equipment status, conflict) shown individually and specifically — never a generic rejection.
- **Empty state:** No available slots for the selected window — show next available time, not a dead calendar.
- **Loading state:** Optimistic UI while the server validates the multi-condition gate.
- **Edge cases:** Equipment goes into maintenance between slot selection and confirmation; grant balance changes concurrently (another booking against the same grant); support tier requested but no support staff available (see §11 Support selection).

### 10.4 Physical Access Control

- **Objective:** Make the digital-to-physical access boundary explicit and never ambiguous.
- **User story:** As a researcher arriving at the instrument, I want to know for certain whether the equipment is actually unlocked, not just that my booking exists.
- **Functional behavior:** **Not built.** Must consume the existing WebSocket contract (`WS /ws/interlock/:equipment_id`) to show explicit states: Authorized → Waiting for hardware → Active/Powered → Fault.
- **Business rules:** On network disconnect, relay holds its current state (existing NFR) — the UI must reflect "state unknown, holding last known" rather than imply success or failure.
- **Permissions:** Standard Users trigger unlock within their active booking window; Super Users get a local PIN override during SSO outages (existing NFR).
- **Dependencies:** MQTT/WebSocket infrastructure; booking state.
- **Success state:** "Equipment powered and session active."
- **Error state:** "Hardware controller unavailable — equipment state has not changed" (never imply a state change that didn't happen).
- **Empty state:** N/A — this only appears within an active booking window.
- **Loading state:** "Waiting for hardware controller" (explicit, not a silent spinner).
- **Edge cases:** User arrives before their slot's buffer window opens; relay reports a state inconsistent with the booking record (must surface the fault, not paper over it).

### 10.5 Funding & Billing

- **Objective:** Make cost and funding source visible before commitment, and every financial event traceable.
- **User story:** As a researcher, I want to see the total cost and which grant will pay for it before I confirm my booking.
- **Functional behavior:** Tariff formula (`Total = Base Rate × Hours + Support Rate × Hours`) is schema-backed; whether it's surfaced pre-commit in the UI is **unresolved** and must be verified/closed as part of this release (G4).
- **Business rules:** Booking blocked if `grant.remaining_balance < total_cost` or `grant.expiration_date` has passed (**new explicit rule** — not previously documented; see §12).
- **Permissions:** Standard Users select from their own grants; Super Admins configure base rates and tariffs.
- **Dependencies:** `grants`, `support_tariffs`, `equipment.base_rate_hourly`.
- **Success state:** Cost breakdown and post-booking remaining balance shown before confirmation.
- **Error state:** "Insufficient grant balance — you need €X more, or select a different grant" (specific, not generic).
- **Empty state:** User with no assigned grants — must be a clear, actionable state (contact PI), not a silent block.
- **Loading state:** Live cost recalculation as duration/support tier change.
- **Edge cases:** Grant expires between quote and confirmation; support tier changes cost after initial estimate; multiple simultaneous bookings racing against the same grant balance.

### 10.6 Staff Operations

- **Objective:** Give Super Users and Super Admins exception-first tools, not just CRUD forms.
- **User story:** As a Super User, I want to see everything needing my attention today — pending sign-offs, maintenance, active sessions — in one place.
- **Functional behavior:** **Not built beyond the existing Admin Sheet** (equipment CRUD, tariffs). Must add a certification-sign-off queue at minimum (Pillar 5, must-have per `PRODUCT_STRATEGY.md`).
- **Business rules:** Only `super_user`/`admin` can sign off practical certification, override interlocks, or change equipment status.
- **Permissions:** See §13 matrix.
- **Dependencies:** `user_certifications`, `equipment.is_operational` (or its future richer status field — see §21 Q9), `bookings`.
- **Success state:** Queue shows pending items with enough context to act (which user, which instrument, when requested).
- **Error state:** Sign-off action fails — must not silently drop the request.
- **Empty state:** "Nothing pending" is itself a meaningful, positive state — should be shown explicitly, not as an empty error-adjacent screen.
- **Loading state:** Queue refresh indicator.
- **Edge cases:** Two Super Users act on the same pending item simultaneously; a sign-off request outlives the requester's session.

---

## 11. Detailed Feature Requirements

Only areas supported by `PRODUCT_STRATEGY.md`'s pillars/MVP are included.

**Equipment discovery** — Browse/filter equipment by facility, capability, and availability window. *(Built.)*

**Equipment details** — Capability description, base rate, buffer time, training requirements, current operational status shown up front, before a user invests time in training for something unavailable. *(Built; operational-status prominence is a should-have refinement.)*

**Certification** — Two independent, visibly-tracked stages (theory, practical), each with its own status and next action; expiry re-triggers the gate. *(Theory built; practical is the release's top must-have gap.)*

**Training** — SOP viewer + auto-graded quiz, 80%+ threshold, explicit retry path on failure. *(Built.)*

**Availability** — Calendar view with real-time conflict awareness, and — once G3 ships — real-time reflection of equipment operational status. *(Calendar built; status-awareness not yet.)*

**Booking** — Drag-to-select, multi-condition gate (certification + funding + availability + equipment status), atomic confirmation. *(Partially built — see §10.3.)*

**Support selection** — Choose Autonomous/Technician/Supervisor tier; cost stacks additively; availability of the requested support tier at the requested time is **not currently modeled** (no staff-scheduling table exists) — flagged as an open question (§21 Q6), not assumed solved.

**Funding / grants** — Select grant, see live balance and post-booking remaining balance before confirming. *(Schema supports it; UI surfacing is unresolved — must-have to close, G4.)*

**Confirmation** — Final review of cost, grant, duration, support tier before submission; success state includes a booking record and explicit next step ("arrive within your buffer window").

**My bookings** — Upcoming/past bookings, cancellation (see §12 for the currently-undefined cancellation flow), and links back into certification/funding status if a future booking is at risk (e.g., grant expiring before the session date).

**Active sessions** — Real-time interlock/session state (Authorized → Waiting → Active → Fault). *(Not built — should-have, sequenced after the core software loop per `PRODUCT_STRATEGY.md`'s own sequencing question, §21 Q6.)*

**Support** — In-session contact path to assigned Technician/Supervisor when a paid support tier was booked; general help/contact path for unresolved issues.

**Super User operations** — Certification sign-off queue (must-have gap), equipment status/maintenance management (partially built via the Admin Sheet's Outage action), proxy booking for trainees.

---

## 12. Business Rules

- **Certification eligibility:** Both `theoretical_passed = true` and `practical_signed_off = true` required to book; either becoming false (e.g., on expiry) blocks future bookings but must **not** revoke an already-confirmed, in-progress session (edge case, §10.2/§10.4).
- **Booking eligibility (combined gate):** A booking may only be confirmed if identity/role permits, certification (both stages) is current, the equipment is operational, no scheduling conflict exists, and (pending G4) sufficient grant balance exists. All conditions are evaluated together, not sequentially with early silent failure.
- **Grant eligibility (V2):** a booking consumes one *group allocation* of a grant. It is valid only if the allocation and its group are active, the beneficiary is an active member of that group, the grant has not expired (`expiration_date` on or after the booking date), and the allocation's `remaining_balance >= total_cost`. Booking decrements the allocation and grant balances in one transaction; pre-start cancellation restores both (`09_ARCHITECTURE.md` D7). Partial funding across several allocations is out of scope (§21 Q6 remains open for Finance).
- **Equipment unavailable/maintenance:** A non-operational instrument cannot be booked. **This closes a confirmed gap** — today, certification is the only check.
- **Booking conflicts:** No two bookings may overlap for the same instrument — enforced at the database level (`EXCLUDE USING gist`), not just in application logic.
- **Cancellation (resolved):** A booking may be cancelled by its own user or by a `super_user`/`admin` on their behalf, at any time before the slot's start — not after, since an in-progress/attended session is a different, separately-specified early-termination flow. Cancelling before the cutoff fully restores the grant balance that was deducted at confirmation. Staff-initiated cancellation requires a reason and is audit-logged; self-cancellation is not. Partial refunds or no-show fees for a booking left unused past its start are an explicit, out-of-scope facility billing-policy decision — this rule does not invent one. See `05_FUNCTIONAL_SPEC.md` §2 Rule 11 and §3 `03_API_SPEC.md`'s `PATCH /bookings/:id/cancel`.
- **Equipment-status override (resolved):** A `super_user`/`admin` may bypass the equipment-operational-status gate (only that gate — never certification or funding) by setting `force_override` on a booking request, for supervised use during minor maintenance. Every use is unconditionally audit-logged, capturing the equipment's actual status at the time. See `05_FUNCTIONAL_SPEC.md` §2 Rule 2.
- **Support requirements:** Support tier surcharge stacks additively on top of the base instrument rate; `none` costs €0.00/h.

---

## 13. Permissions

| Capability | `standard_user` | `super_user` | `admin` | `auditor` |
| :--- | :--- | :--- | :--- | :--- |
| View equipment & availability | ✓ | ✓ | ✓ | — (analytics views only) |
| Book / cancel for self | ✓ | ✓ | ✓ | — |
| Proxy-book, `force_override` | — | ✓ | ✓ | — |
| Own training, quiz, practical request | ✓ | ✓ | ✓ | — |
| Sign off / reject practical certification | — | ✓ | ✓ | — |
| Start/end own session | ✓ | ✓ | ✓ | — |
| Set equipment operational status | — | ✓ | ✓ | — |
| Equipment CRUD, pricing, availability windows, training modules | — | — | ✓ | — |
| Tariffs | — | — | ✓ | — |
| People: internal/external users, roles, activation, sponsors | — | — | ✓ | — |
| Groups & memberships | — | — | ✓ | — |
| Grants & group allocations | — | — | ✓ | — |
| View own funding (usable allocations) | ✓ | ✓ | ✓ | — |
| Administrative audit (`/admin/audit`) | — | — | ✓ | — |
| Facility-wide analytics, revenue, people/equipment/funding statistics, exports | — | — | — | ✓ |
| Full audit log (`/analytics/audit`) | — | — | — | ✓ |

The auditor has no mutation capability of any kind. `internal`/`external` (`user_type`) is independent of role: externals are always `standard_user` and have one internal sponsor. The earlier §21 Q5 (a distinct finance role) is answered for reporting by `auditor`; grant *management* stays with `admin`.

---

## 14. System States

State names reflect the **actual schema enums**, not the more elaborate state model the supplied research proposed (e.g., it suggested a `DRAFT → VALIDATING → CONFIRMED → ACTIVE → COMPLETED → BILLED` booking lifecycle; the real schema's `booking_status` enum is only `confirmed | active | completed | cancelled`, with no persisted draft/validating state and no separate "billed" step — cost is a generated column, not a billing event). This PRD uses the real enum, not the aspirational one.

| Workflow | Idle | Loading | Available | Restricted | Error | Success | Expired/Cancelled |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Certification | Not started | Quiz submitting/auto-grading | Theory passed, practical open | Blocked pending practical sign-off | Quiz failed <80% | Both stages complete | Certification expired (`expires_at` passed) |
| Booking | Calendar browsing | Gate validating (cert + funds + status + conflict) | Slot open | Blocked (any single gate condition named explicitly) | Validation failed (conflict, funds, status) | `confirmed` | `cancelled` (defined — §12; only before slot start) |
| Session/Interlock | Pre-arrival | "Waiting for hardware controller" | Authorized, ready | N/A (booking gate already restricted this) | "Hardware controller unavailable — state unchanged" | `active` → `completed` | N/A |
| Grant funding | Not yet selected | Balance check in progress | Sufficient balance | Insufficient balance (specific shortfall shown) | Grant expired mid-flow | Booking confirmed against grant | Grant expired |

---

## 15. Notifications

| When | What the user needs to know |
| :--- | :--- |
| **Before** | Upcoming booking reminder with buffer-window start time; certification nearing expiry ahead of a scheduled booking |
| **During** | Session active confirmation; interlock fault if hardware state can't be confirmed |
| **After** | Session completed — cost, duration, updated grant balance |
| **When something changes** | Equipment they've booked is moved to maintenance; a certification they hold is about to expire; a practical-assessment request has been actioned |
| **When something fails** | Quiz failed (with score/threshold/retry path); grant balance insufficient at confirmation time; interlock fault during an active session |

**Gap to flag explicitly:** no notification mechanism (email, in-app, push) exists anywhere in the current schema or API spec. This entire section is a **new requirement area**, not an extension of something already built, and needs its own schema/API design before implementation.

---

## 16. Auditability

Events that must be immutably recorded (extends the existing "admin overrides, tariff changes, role escalations" NFR):
- Role elevation/demotion.
- Base rate / tariff changes.
- Manual interlock overrides (maintenance/emergency).
- Equipment operational-status changes (new — becomes safety/booking-relevant once G3 ships).
- Practical-certification sign-off decisions, including who signed off whom.
- Booking cancellations initiated by staff on a user's behalf (once §12's cancellation flow is defined).
- Grant balance adjustments outside the normal booking-cost deduction path.

---

## 17. Non-Functional Requirements

- **Security:** Bearer JWT derived from Shibboleth SSO (`03_API_SPEC.md`); role checks must be enforced server-side, not just hidden in the UI.
- **Accessibility:** The drag-to-book gesture is pointer-only with no keyboard equivalent — a known, confirmed, currently-unresolved gap (§20). No WCAG conformance target has been set anywhere in the source material; **TBD — requires an institutional accessibility policy decision** before this can be a measurable requirement rather than a known gap.
- **Performance:** Hardware relay actuation <150ms latency (existing KPI, carried forward). Page-load/interaction performance targets for the web app itself: **TBD — requires baseline**, no prior target exists.
- **Reliability:** 99.9% uptime target for interlock relays (existing KPI); fail-safe hold-current-state behavior on network disconnect (existing NFR, extended to the UI in §10.4).
- **Privacy:** Grant balances and personal certification records must not be visible outside the roles in §13's matrix.
- **Auditability:** See §16 — immutable logging is a hard requirement, not best-effort.
- **Scalability:** No evidence in any source material suggests high-traffic/high-concurrency scale beyond three facilities' researcher populations — **TBD, low evidenced priority**; do not over-engineer for scale this PRD has no basis to assume.

---

## 18. Analytics

Events required to measure §6's metrics and observe the funnel:

`equipment_search_started`, `equipment_selected`, `training_started`, `quiz_submitted`, `quiz_passed` / `quiz_failed`, `practical_requested`, `practical_signed_off`, `booking_attempted`, `gate_blocked` (with the specific failing condition as a property), `booking_confirmed`, `booking_cancelled`, `cost_estimate_viewed`, `grant_balance_checked`, `session_authorized`, `session_active`, `session_completed`.

Each must carry `user_id`, `role`, `equipment_id`/`facility` where applicable, and a timestamp — none of this event schema exists today and must be designed alongside the notifications gap in §15.

---

## 19. MVP vs. Later

**MVP** (the core journey is broken without these):
- Practical-certification status + request flow, and a minimal Super User sign-off queue (closes the confirmed dead end).
- Equipment-operational-status as a real booking gate condition.
- Verified (and, if missing, newly built) pre-commit cost and grant-balance visibility.
- Immutable audit logging extended to certification and equipment-status events.

**Phase 2:**
- Standalone "My Certifications" status view (currently only reactive).
- Session/interlock state UI for the digital-physical boundary.
- A minimal Super User exceptions dashboard beyond the sign-off queue.
- Notifications infrastructure (§15) — scoped to in-app only for this phase; email/push are a later extension if needed.
- Cancellation flow (§12) — rules are now resolved and specified (`05_FUNCTIONAL_SPEC.md` §2 Rule 11); implementation is unblocked.

**Future:**
- Facility Manager analytics/command-center (`gold` schema reporting, utilization, revenue).
- ERP export automation, scheduled email KPI reports.
- Support-tier staff-availability modeling (§11).
- Any predictive/advanced maintenance tooling.

---

## 20. Risks

- **Product risk:** Prioritization here rests partly on unvalidated personas (§7); real user input could redirect effort.
- **UX risk:** Closing the practical-certification gap with another dead-end-shaped fix (e.g., a queue nobody actions) repeats the same failure mode it's meant to solve.
- **Operational risk:** Adding equipment-status gating without a Super User override path could block legitimate supervised use during minor maintenance — this exact question is still open (§21 Q1).
- **Technical risk (partially retired):** Notifications and cancellation now have an approved schema/API surface (`02_SCHEMA.sql`, `03_API_SPEC.md`); remaining risk is implementation, not design.
- **Adoption risk:** External/guest users cannot discover `/login` at all today; if unresolved before broader rollout, external adoption is zero by construction, not by user choice.
- **Data risk:** No timestamp fields exist for certification-stage transitions, blocking the processing-time metric (§6) until a schema change ships.
- **Accessibility risk:** Keyboard-only booking is unaddressed by both the research and the build; if an institutional accessibility policy applies, this is a compliance risk, not just a UX gap.

---

## 21. Open Questions

**Resolved since v2.0** (see `05_FUNCTIONAL_SPEC.md` §7 for full detail): equipment-status override (Q1 → `force_override`, always audited), the `is_operational` boolean-vs-three-state mismatch (Q9 → replaced with an `equipment_status` enum), and cancellation rules (Q10 → self/staff before slot start, full grant restoration, staff-initiated audited). `02_SCHEMA.sql` and `03_API_SPEC.md` have been updated accordingly.

**Still open:**

1. Who operationally owns the practical-certification sign-off queue — per-instrument Super Users, or a centralized reviewer?
2. Is `/login` staying nav-hidden through this release, or does its discoverability need resolving now?
3. Is real user research (actual ICFO researchers/staff) planned before further investment, given the current persona base is illustrative?
4. Does Finance/grant administration (Javier, Sofia personas) warrant a distinct system role beyond `admin`, or are scoped `admin` views sufficient?
5. Should hardware/interlock integration and support-tier staff-availability modeling be sequenced strictly after the software-only booking-to-billing loop is validated, or built in parallel?
6. Is the grant-eligibility rule in §12 (`remaining_balance >= total_cost`, `expiration_date` check) correct as written, or does Finance have additional rules (partial funding across multiple grants, reserved balances)?
7. Does the task/equipment-first navigation decision in §9 hold, or should facility-first nesting be reconsidered?
8. Support-tier staff availability is still unmodeled — nothing checks whether a requested Technician/Supervisor tier is actually staffable at the requested time.
9. Early termination of an *active* session (e.g. equipment fault mid-session) is explicitly out of scope for the now-resolved cancellation rule, which only covers pre-start cancellation — this still has no defined rule or endpoint.

---

## 22. Acceptance Criteria

**AC1 — Practical certification is visible and actionable.**
*Given* a user has passed the theory quiz for an instrument, *when* they view that instrument's certification status, *then* they see "practical assessment pending" with a request action, not a dead end.

**AC2 — Equipment status blocks booking.**
*Given* an instrument's operational status is not operational, *when* a user attempts to book it, *then* the booking is blocked with an explicit reason, regardless of the user's certification status.

**AC3 — Cost is visible before commitment.**
*Given* a user is configuring a booking, *when* they select a duration and support tier, *then* the total cost and the grant that will absorb it are shown before they can confirm.

**AC4 — Insufficient funds block booking with a specific reason.**
*Given* a selected grant's `remaining_balance` is less than the computed `total_cost`, *when* the user attempts to confirm, *then* the booking is blocked and the specific shortfall amount is shown.

**AC5 — No double-booking is possible.**
*Given* an instrument already has a confirmed booking overlapping a requested slot, *when* a second user attempts to book that slot, *then* the database rejects it and the UI surfaces a specific conflict message (validates an existing guarantee).

**AC6 — Certification expiry re-gates booking without revoking an active session.**
*Given* a user's certification expires, *when* they attempt a *new* booking on that instrument, *then* they are blocked; *but given* they already have an active, in-progress session on that instrument, *then* that session is not interrupted.

**AC7 — Interlock faults never imply success.**
*Given* a hardware controller is unreachable during an authorization attempt, *when* the system cannot confirm relay state, *then* the UI shows "state unchanged / unavailable," never an implied success or failure.

**AC8 — Every certification sign-off is audit-logged.**
*Given* a Super User signs off a user's practical certification, *when* that action completes, *then* an immutable audit record captures who signed off whom, when, and for which instrument.

---

## 23. Traceability Matrix

| Research insight | Product requirement | Feature | UX implication | Success metric |
| :--- | :--- | :--- | :--- | :--- |
| Practical certification is a confirmed dead end past the quiz | G2 | §11 Certification; §10.2; §10.6 | Status + next action must exist for every stage, not just theory | Certification completion rate (practical stage), §6 |
| Equipment status doesn't gate booking despite schema support | G3 | §11 Booking; §10.3 | Booking gate must check operational status explicitly | Equipment downtime visibility, §6 |
| Cost/funding visibility before commit is unresolved | G4 | §11 Funding/grants; §10.5 | Live cost breakdown at configuration step, not just post-booking | Funding validation success rate, cost-allocation accuracy, §6 |
| No frontend consumes the interlock/session contract despite it existing in schema/API | Pillar 4, Phase 2 | §11 Active sessions; §10.4 | Explicit Authorized/Waiting/Active/Fault states | Not yet measurable — flagged in §6/§20 as a data risk |
| `/login` is built but undiscoverable | Adoption risk, §20 | §9 IA; §21 Q3 | Nav-linking decision needed before external adoption can be nonzero | Repeat usage (indirectly, once external users can even start), §6 |
| No staff exceptions/triage tooling exists | Pillar 5, MVP (sign-off queue) | §11 Super User operations; §10.6 | Queue-first design, not generic CRUD | Administrative workload (currently unmeasurable — flagged), §6 |
| Double-booking prevention already structurally guaranteed | G7 | §11 Booking | Validate, don't rebuild | Booking conflicts, §6 |
| Audit trail required for compliance | G6 | §16 | Every override/sign-off/status change logged immutably | Not a funnel metric — compliance requirement, verified by audit, not analytics |

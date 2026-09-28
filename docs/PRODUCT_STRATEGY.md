# MOSAIC — Product Strategy

> **V2 note (2026-09-28):** background research and strategy, still valid. Where it conflicts with `08_IMPLEMENTATION_CONTRACT.md` (roles, IA, funding model), the contract wins.

Built on `docs/00_RESEARCH_SYNTHESIS.md`. That synthesis draws on a supplied research document that is **not primary research** (illustrative personas, no interviews/measurements) plus the real schema/API/shipped frontend. Every claim below inherits that same confidence discipline: where a strategic choice rests only on the illustrative research, it's marked as a hypothesis, not a fact. No screens are designed here — this defines the model the PRD and prototype must follow.

---

## 1. Product problem

Researchers cannot determine, in one place, whether they are actually allowed to use a given instrument right now — because eligibility depends on identity, training completion, certification (both theory and practical), grant funding availability, and the instrument's own operational state, none of which are currently validated together — and even after booking, they cannot be certain that a confirmed reservation will translate into working physical access; meanwhile facility staff have no consolidated way to see which of these conditions is blocking a given user, forcing what should be a self-service, system-validated transaction to depend on manual, staff-mediated resolution.

---

## 2. Product promise

MOSAIC should make:
- **Easier** — self-serve resolution of "can I book this, and if not, what exactly do I need to do" without contacting facility staff.
- **Clearer** — every blocking condition (training, certification stage, funding, equipment status) stated explicitly, with a next action, never a bare denial.
- **Safer** — equipment operational status and certification actually gate physical/financial access, rather than existing only as unread metadata.
- **More transparent** — cost, funding source, and remaining grant balance visible *before* commitment, and the boundary between "booked" and "physically accessible" always explicit.

---

## 3. Target users

**Primary:** Standard User — the researcher booking and running equipment sessions. Spans new users (need more guidance, are mid-certification) and experienced users (need speed, minimal friction), and internal vs. external/guest researchers (external users need a discoverable, guided entry point that does not assume ICFO institutional knowledge).

**Secondary:** Super User (technician/supervisor — certifies users, manages maintenance, provides paid support during sessions); Super Admin/Facility Manager (owns equipment portfolio, tariffs, role elevation, ERP billing exports, cross-facility oversight); Finance/grant administrator or PI (consumes financial/audit records; not necessarily a distinct system role — see §10).

---

## 4. Core user journey

**Discover → Understand → Verify access → Complete requirements → Check availability → Configure session → Validate funding → Book → Attend/use equipment → Complete session → Review history.**

This is the one continuous loop MOSAIC exists to support end-to-end. Every pillar below exists to remove friction or ambiguity from a specific step in this journey, not to add adjacent functionality.

---

## 5. Product pillars

### Pillar 1 — Explainable Access
- **Principle:** No gate (training, certification, funding, equipment status) ever presents as a bare denial; each states the specific unmet condition and the next action.
- **User value:** No dead ends; self-serve resolution instead of tracking down staff.
- **Business/facility value:** Fewer support interruptions for Super Users.
- **Design implications:** Every blocking condition needs a visible status *and* a defined next action — including the practical-certification stage, which currently has neither (confirmed gap, `00_RESEARCH_SYNTHESIS.md` §1/§6).

### Pillar 2 — Booking as One Validated Transaction
- **Principle:** A booking is confirmed only when identity, certification, funding, availability, support requirement, *and* equipment operational status are all validated together, atomically.
- **User value:** "Confirmed" can be trusted to mean actually usable.
- **Business/facility value:** No invalid bookings, no billing on unusable slots, no double-booking (already DB-guaranteed).
- **Design implications:** Gate logic must be centralized, not scattered per-screen checks. Equipment status must be added to the gate — the schema already has `is_operational`; the UI doesn't check it yet.

### Pillar 3 — Transparent Financials
- **Principle:** Cost and funding source are visible before commitment, and every financial event is traceable to a grant and auditable.
- **User value:** No billing surprises.
- **Business/facility value:** Accurate grant reconciliation; audit-ready for EU compliance.
- **Design implications:** A live cost estimate must appear at the booking-configuration step, not only in the post-creation response. (Whether this already exists is unresolved — verify before building.) Tariff/grant changes need immutable audit logging by default.

### Pillar 4 — Digital–Physical Parity
- **Principle:** The user is never unsure whether a digital booking state matches the instrument's real physical state.
- **User value:** Confidence at the moment of use; no wasted session time troubleshooting access.
- **Business/facility value:** Reduces safety risk and support load from confused users at the bench.
- **Design implications:** Needs an explicit session/interlock state UI consuming the already-specified WebSocket contract (`WS /ws/interlock/:equipment_id`) — currently unbuilt, not just unpolished.

### Pillar 5 — Exception-Centric Staff Operations
- **Principle:** Facility-staff tools are organized around what needs attention (pending sign-offs, maintenance, conflicts), not generic record CRUD.
- **User value (staff):** Faster resolution of the exceptions that dominate their actual workload.
- **Business/facility value:** Less downtime, less manual tracking of certifications and support hours.
- **Design implications:** Should be sequenced after the core booking loop is trustworthy, and only invested in heavily once real Super User/Facility Manager input confirms the illustrative research's framing (unverified — see §9).

### Pillar 6 — Guided Onboarding for Every User Type
- **Principle:** Less-familiar users (new researchers, external/guest collaborators) get more guidance, not more complexity — the same flows, with clearer scaffolding.
- **User value:** External users can self-serve without knowing ICFO's internal structure or terminology.
- **Business/facility value:** Expands usable capacity to external/industrial researchers without proportional staff overhead.
- **Design implications:** Requires resolving the already-logged, deliberately-deferred decision on how `/login` becomes discoverable (currently unlinked from navigation by design, not oversight).

---

## 6. Value exchange

| Participant | Gets from MOSAIC | Gives to MOSAIC |
| :--- | :--- | :--- |
| Standard User (researcher) | Self-service access without staff mediation; explicit certification/funding/cost status; confidence that booking = usable access | Accurate usage data; adherence to training/safety requirements |
| Super User (technician/supervisor) | Consolidated view of pending sign-offs, maintenance, and support assignments instead of ad hoc contact | Certification sign-off decisions; hands-on exception handling |
| Super Admin / Facility Manager | Portfolio-wide visibility (utilization, revenue, compliance); automated billing/ERP export | Tariff and policy configuration; role-elevation decisions |
| Finance / grant owner (PI) | Traceable, audit-ready financial records tied to specific grants | Budget ceilings that gate what can actually be booked |
| ICFO (institution) | Legacy-system replacement, EU-grant-compliant audit trail, reduced administrative overhead | SSO/identity integration, hosting, policy authority |

---

## 7. Product boundaries

MOSAIC is **not** responsible for:
- A general-purpose LMS or course catalog — only equipment-specific SOP + quiz + practical sign-off.
- Scientific data management, sample tracking, or experiment results — no such entities exist in the schema; out of scope by design, not omission.
- Being the institution's ERP/accounting system — MOSAIC exports to it, and does not replace it.
- Institutional safety/EHS compliance systems beyond the equipment-specific training gate defined here.
- Booking non-equipment resources (rooms, general lab space) — the schema models `equipment` only.
- Equipment telemetry, predictive maintenance, or sensor monitoring beyond a binary interlock power state.
- Being an identity provider — authentication is delegated entirely to Shibboleth/OIDC SSO.

---

## 8. MVP

Prioritized by user value + workflow dependency + operational necessity + evidence — not visual appeal.

**Must-have** (the core journey is broken without these):
- SSO + guest magic-link login (already built).
- Equipment discovery and detail views (already built).
- Theory certification gating (already built) **and** practical-certification status + request flow (confirmed critical gap — the journey currently dead-ends here).
- Booking with DB-enforced conflict prevention (already built) **and** equipment-operational-status as a real gate condition (confirmed gap — schema field exists, UI doesn't check it).
- Cost and grant-balance visibility before commit (status unresolved — verify, then close if missing; this cannot ship unresolved).
- Immutable audit logging for overrides, tariff changes, and role escalations (non-negotiable per existing compliance requirements).

**Should-have** (high value, not blocking the first working loop):
- Standalone "My Certifications" status view (currently only surfaced reactively inside the booking gate).
- Session/interlock state UI for the digital-physical boundary (real gap, but the illustrative research itself recommends sequencing hardware integration after the software loop is proven).
- A minimal Super User exceptions view (pending sign-offs, active sessions, alerts).

**Later:**
- Facility Manager analytics/command-center (utilization, revenue, `gold` schema reporting).
- ERP export automation and scheduled/automated email KPI reports.
- Any predictive or advanced maintenance tooling.

**Explicitly out of scope** (for MVP, and likely permanently per §7):
- General LMS features beyond equipment SOPs.
- Sample/experiment data management.
- Non-equipment resource booking.
- Telemetry/predictive maintenance.
- Keyboard-operable drag-to-book gesture — a real, currently unaddressed gap in both the research and the build, but not workflow-blocking since the confirmation dialog that follows a drag is already fully keyboard-operable.

---

## 9. Critical product assumptions

Any of these being wrong would invalidate part of this strategy:
- That real ICFO researchers actually experience the fragmentation the supplied research describes — currently unverified; the research is illustrative, not empirical.
- That practical-certification sign-off happens often enough to justify a dedicated staff-facing queue as a must-have, not a should-have.
- That pre-commit cost visibility is actually missing today — if the existing booking flow already shows it, that must-have item is moot.
- That external/guest user volume is high enough to justify onboarding investment ahead of internal-user needs.
- That facilities want equipment-status to hard-block booking in software, rather than allowing supervised override during minor maintenance — this has been left deliberately undecided, not accidentally.
- That the current 3-tier RBAC (`standard_user`/`super_user`/`admin`) is sufficient to represent Finance/grant-admin needs, rather than requiring a distinct role.

---

## 10. Strategic questions

Decisions stakeholders must resolve before implementation proceeds past MVP:
1. Should equipment operational status hard-block bookings unconditionally, or should Super Users be able to override it for supervised use during minor maintenance?
2. Who owns the practical-certification sign-off queue operationally — a per-instrument Super User, or a centralized review team?
3. Is `/login` staying nav-hidden through the MVP, or does a target sub-project need to resolve its discoverability and interaction with the dev-only role switcher?
4. Is real user research (actual ICFO researchers, technicians, facility managers) planned before further strategic investment, given the current evidence base is illustrative rather than empirical?
5. Does Finance/grant administration warrant a distinct system role, or can it be served by scoped views within the existing `admin` role?
6. Should hardware/interlock integration be sequenced *after* the full software-only booking-to-billing loop is validated, as the supplied research itself recommends — or built in parallel?
7. Is keyboard-operable booking an institutional accessibility requirement (making it must-have) or a lower-priority gap — this determines whether it moves out of "later."

---

## MOSAIC Product Strategy — One-Page Summary

**Problem:** Researchers can't tell, in one place, whether they're actually allowed to use an instrument right now (identity + training + certification + funding + equipment status), and can't trust that a confirmed booking means usable physical access; staff have no consolidated way to see what's blocking a user.

**Promise:** Make eligibility explainable, booking a single validated transaction, cost transparent before commitment, and the digital/physical access boundary explicit.

**Users:** Primary — Standard User (new, experienced, internal, external/guest). Secondary — Super User, Super Admin/Facility Manager, Finance/grant admin.

**Journey:** Discover → Understand → Verify access → Complete requirements → Check availability → Configure session → Validate funding → Book → Attend/use → Complete session → Review history.

**Pillars:** Explainable Access · Booking as One Validated Transaction · Transparent Financials · Digital–Physical Parity · Exception-Centric Staff Operations · Guided Onboarding for Every User Type.

**Value exchange:** Researchers get self-service access and cost certainty; staff get consolidated exception handling; the facility gets audit-ready billing and reduced administrative load; ICFO gets a compliant legacy-system replacement.

**Boundaries:** Not an LMS, not a data/sample manager, not the ERP itself, not an EHS system, not a room-booking tool, not telemetry/predictive maintenance, not an identity provider.

**MVP must-haves:** practical-certification status/request flow; equipment-status as a real booking gate; verified pre-commit cost/funding visibility; immutable audit logging. Everything else (staff dashboards, interlock UI, analytics, ERP automation) is should-have or later.

**Biggest open risk:** the evidence base behind personas and pain points is illustrative, not from real ICFO users — prioritization here should be validated, not treated as settled, before heavy investment.

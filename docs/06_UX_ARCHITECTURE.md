# MOSAIC — Information Architecture & UX Architecture

Behavior and structure only — no visual styling. **V2:** `08_IMPLEMENTATION_CONTRACT.md` overrides this document where they differ. Built on `01_PRD.md` v2.0 (and, through it, `00_RESEARCH_SYNTHESIS.md`, `PRODUCT_STRATEGY.md`, `05_FUNCTIONAL_SPEC.md`). Visual system (`04_DESIGN_SYSTEM.md`) is a separate, later layer that skins what's defined here — it does not change any of it.

---

## 1. Primary Navigation

The PRD (§9) already resolved a contradiction in the source research between facility-first and task-first navigation, in favor of task/equipment-first with facility as a filter. This document builds directly on that decision rather than re-opening it.

```
Researcher      Home · Equipment · Calendar · My Bookings · Training & Certifications · Grants & Billing · Support · Notifications
Operations      Dashboard · Certification Queue · Active Sessions · Equipment Status · Maintenance      (super_user, admin)
Administration  Overview · People (Internal / External / Groups) · Equipment · Grants & Funding · Tariffs · Audit   (admin)
Analytics       Overview · Sessions · Revenue · People · Equipment · Funding · Audit Log                (auditor only, read-only)
```

> **V2 note (2026-09-28):** this navigation follows `08_IMPLEMENTATION_CONTRACT.md` §3/§55–58. The former single "Administration" branch is split into Operations (exceptions, "what needs attention now"), Administration (configuration and resources) and Analytics (auditor). The shell is the navy sidebar in `04_DESIGN_SYSTEM.md` v3 §3, not the V1 TopNav. The route matrix is `08` §55.

`/login` remains a separate, deliberately unlinked entry point (`CLAUDE.md`) pending PRD §21's still-open discoverability decision. This IA is designed so that resolving it later means adding a link, not restructuring anything — `/login` is not assumed absent by any workflow below.

**Two densities, one shell.** `04_DESIGN_SYSTEM.md` §15 formalizes this: every section above except Administration renders at a calm "Researcher" density (whitespace-first, one clear next step per screen); Administration renders at a denser, table/filter-first "Super User/Admin" density. Both share the same TopNav shell, tokens, and primitives — this is a density variation, not a second application.

**Why each section exists:**

- **Dashboard** — the single place that answers "what needs my attention right now," per Pillar 1 (Explainable Access) and Pillar 5 (Exception-Centric Staff Operations). Its content differs sharply by role (a Standard User's upcoming bookings/certification status vs. a Super User's pending queue/alerts) — this is one navigation entry with role-conditional content, not two nav items, because both answer the same question for their respective role.
- **Equipment** — the primary discovery path, task-first per §9. Facility is a filter here, not a top-level branch, because the research's own persona explicitly rejected needing to learn facility structure to find an instrument.
- **Calendar / My Bookings** — the booking workflow's home and the record of past/upcoming sessions, including cancellation (PRD §12, now resolved).
- **My Training & Certifications** — a standalone status view. This closes a confirmed PRD gap: certification status today is only ever surfaced reactively inside a booking attempt. Existing as its own nav item lets a user check "what do I still need" *before* trying to book, which is the core promise of Pillar 1.
- **Grants & Billing** — funding transparency (Pillar 3) as a first-class, browsable area, not something only glimpsed mid-booking.
- **Support** — the in-session contact path (PRD §11), kept separate from Administration because it's a Standard User-facing capability, not a staff tool.
- **Administration** — exists only for `super_user`/`admin`, and is itself organized around exceptions (Certification Queue first) rather than generic CRUD, per Pillar 5. `Users & Roles`, `Tariffs`, and `Reporting & Audit` are `admin`-only subsections within it — a `super_user` sees a narrower Administration menu than an `admin` does, not a separate section.

---

## 2. Screen Inventory

### Discovery & Equipment

| Screen | Purpose | Primary user | Entry points | Exit points | Required info | Primary action | Secondary actions | Key states |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Equipment Discovery | Browse/filter equipment | Standard User (all roles can view) | Nav, Dashboard shortcut | Equipment Detail | Facility, status, capability per item | Select an instrument | Filter by facility/status | Default, loading, empty (e.g. NCL/SLN unseeded), error |
| Equipment Detail | Evaluate suitability, see requirements | Standard User | Equipment Discovery, deep link | Availability, Certification Status | Rate, buffer time, operational status, own certification status | "Check availability" / "Book" | "View SOP," "Request practical assessment" (if theory passed) | Default, loading, unavailable (non-operational), restricted (certification incomplete — CTA disabled with reason), error — **now a tabbed object page (Overview/Availability/Requirements/Pricing/Maintenance/Usage History/Documentation), full anatomy in `04_DESIGN_SYSTEM.md` §16** |

### Training & Certification

| Screen | Purpose | Primary user | Entry points | Exit points | Required info | Primary action | Secondary actions | Key states |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| SOP Viewer | Review theory material | Standard User | Equipment Detail, Certification Status | Quiz | SOP document | "Start quiz" | — | Default, loading, error |
| Quiz | Demonstrate theory competence | Standard User | SOP Viewer | Certification Status | Questions, selected answers | Submit | Retry (on failure) | Loading (grading), error (failed <80%, with score/threshold shown), success |
| Certification Status ("My Training & Certifications") | Standalone view of every instrument's certification progress | Standard User | Nav, Dashboard | Equipment Detail, Quiz, request action | Theory/practical status per instrument, expiry | "Request practical assessment" (when eligible) | "Retake quiz" | Default, empty (no certifications yet), restricted (practical locked until theory passes), expired |
| Certification Queue | Triage pending practical requests | Super User/Admin | Administration nav, Dashboard alert | Certification Review | Requester, equipment, requested-at | Open a request | Filter by equipment/facility | Default, empty ("nothing pending" — a positive state, not an error look), loading |
| Certification Review | Sign off or reject a request | Super User/Admin | Certification Queue | Back to queue | Requester's training history | "Sign off" / "Reject" (reason required) | — | Loading (submitting), error (already actioned by another reviewer), success |

### Booking & Funding

| Screen | Purpose | Primary user | Entry points | Exit points | Required info | Primary action | Secondary actions | Key states |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Availability / Calendar | Browse open slots for an instrument | Standard User, Super User (proxy) | Equipment Detail, Calendar nav | Booking Configuration | Existing bookings, buffers, status-blocked periods | Select a time range | Switch instrument/date range | Default, loading, empty (no open slots), unavailable (equipment non-operational) |
| Booking Configuration | Choose duration/support tier | Standard User, Super User (proxy) | Availability/Calendar | Funding Selection | Duration, support tier, (proxy) beneficiary | Continue | Change slot | Default, restricted (tier unavailable — flagged open, §7), error |
| Funding Selection | Choose grant, see live balance | Standard User, Super User (proxy, chooses on the trainee's behalf) | Booking Configuration | Booking Confirmation | Eligible grants, remaining balance, expiry | Select grant | — | Default, empty (no eligible grants), restricted (insufficient balance / expired, shortfall shown) |
| Booking Confirmation | Final review before commit | Standard User, Super User (proxy) | Funding Selection | Booking Success, back to any prior step | Full cost breakdown, post-booking balance, equipment/certification status | Confirm | Edit any prior choice | Loading (re-validating), error (any condition changed since preview, named specifically), success |
| Booking Success | Confirm the transaction completed | Standard User | Booking Confirmation | My Bookings, Dashboard | Booking ID, cost, next-step guidance | "View booking" | — | Success only (this screen doesn't have failure states — failures never leave Booking Confirmation). **Stripe-style drill-down anatomy** (ID, status badge, then structured cost/grant breakdown) specified in `04_DESIGN_SYSTEM.md` §16 |

### Sessions, History & Support

| Screen | Purpose | Primary user | Entry points | Exit points | Required info | Primary action | Secondary actions | Key states |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| My Bookings | View upcoming/past bookings | Standard User (own), Super User/Admin (broader) | Nav, Dashboard | Booking Detail | Status per booking | Open a booking | Filter by status | Default, loading, empty (no bookings yet) |
| Booking Detail | View one booking; cancel if upcoming | Standard User, Super User/Admin | My Bookings | Active Session (if within window), Support | Full booking record, cancellation eligibility | "Cancel" (if before slot start) | "Contact support" | Default, restricted (cancellation window closed — `409 slot_already_started`), cancelled, error |
| Active Session | Show live interlock/session state during a booking | Standard User | Booking Detail (within buffer window) | Support, Completion | Authorized/Waiting/Active/Fault state | "Unlock equipment" → "End session" (once active) | "Contact support" | Loading (waiting for hardware), unavailable (fault — "state unchanged"), success (active), success (completed). **The program's signature screen** — mission-control anatomy (session timer, Authorization/Interlock/Power tiles, live cost) specified in `04_DESIGN_SYSTEM.md` §16; renders at Operations density, a deliberate switch from the Researcher density everywhere else in this workflow |
| Support Contact | Reach assigned staff during a paid-support session | Standard User | Active Session, Booking Detail | Back to session | Assigned tier/staff (if modeled — currently open, §7) | Send contact request | — | Default, error (no staff assigned — open gap) |
| Grants & Billing | Browse grant balances and usage history | Standard User (own), Admin (all) | Nav | Booking Detail (drill-in) | Balance, allocation, usage per grant | — (mostly read) | Export (Admin) | Default, empty (no grants assigned) |
| Notifications | See status changes and alerts | All roles | Nav/bell icon | Relevant source screen (e.g. Booking Detail) | Type, payload, read state | Mark as read | Open source item | Default, empty, loading |

### Staff & Administration

| Screen | Purpose | Primary user | Entry points | Exit points | Required info | Primary action | Secondary actions | Key states |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Equipment & Maintenance | Manage instrument operational status | Super User/Admin | Administration nav | Equipment Detail, Availability | Current status, reason history (`equipment_status_events`) | Change status (reason required) | View affected bookings | Default, restricted (reason missing — blocked client-side), success |
| Users & Roles | Manage accounts and role elevation | Admin | Administration nav | — | User list, current role | Elevate/demote role | — | Default, restricted (admin-only), error |
| Tariffs | Configure base rates and support tiers | Admin | Administration nav | — | Current rates | Edit rate | — | Default, error |
| Reporting & Audit | Export analytics, review audit log | Admin | Administration nav, Reporting Toolbar | — | KPI data, audit entries | Export (CSV/XLSX/JSON), filter audit log | Schedule email report | Default, loading, empty |

### Account & Access

| Screen | Purpose | Primary user | Entry points | Exit points | Required info | Primary action | Secondary actions | Key states |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| SSO Login | Institutional authentication | Standard User, Super User, Admin | Direct URL only (unlinked — PRD §21) | Dashboard | — | "Sign in with institution" | "Request guest access" | Default, error (SSO down — Super User PIN fallback offered), loading |
| Guest Access Request | Onboard an external collaborator | External Standard User | SSO Login | Magic-link email sent | Name, institution, purpose | Submit request | — | Default, loading, success (check your email), error |

---

## 3. Core Workflows

### Workflow A — Discover equipment → equipment detail → availability → booking

1. **Equipment Discovery**: browse/filter by facility, capability, status.
2. **Equipment Detail**: see rate, buffer, operational status, and own certification status together (not sequentially discovered — UX Principle 7, §6).
   - If not certified → CTA reads "Complete requirements" instead of "Book," linking into Workflow B.
   - If equipment non-operational → CTA disabled, reason shown; no path forward except waiting or (staff-only) override, which lives in Workflow C, not here.
3. **Availability/Calendar**: browse open slots for the instrument.
4. Select a slot → hands off into **Workflow C** (Booking Configuration onward). This workflow's job ends at slot selection; it never itself creates a booking.

### Workflow B — Equipment → training → quiz → assessment → certification

1. **Equipment Detail** or **Certification Status**: see "Theory: not started."
2. **SOP Viewer** → **Quiz**: submit; server grades.
   - Fail (<80%) → back to SOP Viewer with score/threshold shown, retry allowed. No dead end.
   - Pass → `theoretical_passed = true`; **Certification Status** now offers "Request practical assessment."
3. Request → **Certification Status** shows "Practical assessment pending" (this state did not exist before this program's schema changes — see `05_FUNCTIONAL_SPEC.md`).
4. **Certification Queue** (Super User/Admin): the request appears. Reviewer opens **Certification Review**.
   - Sign off → requester's **Certification Status** flips to "Certified"; **Notifications** informs them.
   - Reject (reason required) → requester's status returns to a re-requestable state; **Notifications** informs them with the reason.
5. Certified user can now proceed through **Workflow A/C**.

### Workflow C — Equipment → booking → funding → confirmation

1. Entry from Workflow A (slot already selected) or directly via Calendar.
2. **Booking Configuration**: duration, support tier.
3. **Funding Selection**: choose grant; live balance and post-booking remaining balance shown *before* proceeding (closes the PRD's flagged cost-transparency gap).
   - Insufficient balance → blocked here, exact shortfall shown, user can pick a different grant.
4. **Booking Confirmation**: full re-validation (certification, equipment status, funding, conflict) — state may have changed since step 2/3.
   - Any condition now fails → named specifically, user returned to the relevant earlier step, not a dead end.
   - Super User/Admin proxy path: the same three screens, with a beneficiary selector; every check runs against the beneficiary, not the actor.
5. **Booking Success** → **My Bookings**.

### Workflow D — Booking → active session → completion

1. **My Bookings** / **Booking Detail**: booking is `confirmed`, pre-arrival.
2. Within the buffer window, **Booking Detail** offers entry to **Active Session**.
3. **Active Session**: "Unlock equipment" → Authorizing → Active (or Fault, if the relay can't confirm — never an implied success). This is the exact moment the UI switches from Researcher/calm density to the Operations-density "mission control" layout (`04_DESIGN_SYSTEM.md` §16) — Planning becomes Operations.
4. Session ends (user action or window expiry) → status `completed`, cost/grant finalized, visible immediately in **Booking Detail** and **Grants & Billing**.
5. **Alternate path**: before step 2, the user (or staff) can cancel from **Booking Detail** — full refund, no reason required for self-cancellation. Once inside step 3 (session started), cancellation is no longer offered; only the not-yet-specified early-termination flow would apply (PRD §21, still open).

### Workflow E — Super User → certification request → approval

*(Shares steps 4 of Workflow B — presented separately here from the reviewer's vantage point.)*
1. **Certification Queue**: pending items listed oldest-first.
2. Open **Certification Review**: see requester's theory result.
3. Decide: sign off or reject (reason required either way is not true — reason required only for rejection, per `03_API_SPEC.md`).
4. Submit → conditional update (fails with `409` if another reviewer already actioned it — prevents double sign-off) → **audit_log** entry written unconditionally.
5. Requester notified; queue item disappears from the pending list.

### Workflow F — Super User → equipment issue → maintenance → restored

1. **Equipment & Maintenance**: select an instrument, currently `operational`.
2. Change status to `maintenance`, reason required.
3. System writes `equipment_status_events`, reflects the new status immediately in **Equipment Discovery**, **Equipment Detail**, and **Availability**; any user with an existing confirmed booking on that instrument gets a **Notifications** entry — the booking itself is *not* auto-cancelled (their choice via **Booking Detail**).
4. New booking attempts against the instrument are blocked (Workflow C step 4) unless a Super User/Admin explicitly uses `force_override` — which is always audit-logged.
5. Issue resolved → status changed back to `operational` (reason required again, e.g. "pump serviced, back online"). Availability recalculates; affected users optionally notified of restoration.

---

## 4. State Architecture

| Workflow | Default | Loading | Empty | Unavailable | Restricted | Error | Success | Cancelled | Expired |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| A — Discover→Detail→Availability | Unfiltered equipment list | Skeleton list/detail/calendar | No results for filter; no open slots | Equipment `maintenance`/`offline` | Certification incomplete (CTA disabled + reason) | Fetch failure | Slot selected, hands off to C | N/A | N/A |
| B — Training→Certification | "Not started" | Quiz grading; queue refresh | No training content configured (edge case) | N/A | Practical locked until theory passes | Quiz failed <80%; sign-off already actioned | Certified (both stages) | N/A (closest analog: "rejected," a distinct outcome, not a cancellation) | `expires_at` reached — re-gates future bookings, not active sessions |
| C — Booking→Funding→Confirmation | Configuring, nothing chosen yet | Gate validating server-side | No eligible grants | Equipment became non-operational since Workflow A | Insufficient balance / grant expired / certification lapsed mid-flow | Conflict (`409`); generic submit failure | `confirmed`, cost breakdown shown | N/A at this stage (abandoning mid-flow creates nothing to cancel) | Grant expires between quote and submit |
| D — Active session→Completion | `confirmed`, pre-arrival | "Waiting for hardware controller" | N/A | Interlock fault ("state unchanged") | Unlock attempted before buffer window opens | Relay state inconsistent with booking record | `active` → `completed` | Cancelled before slot start (full refund) | N/A (a booking left unused past its start simply completes at zero usage — billing policy for that is explicitly out of scope) |
| E — Certification approval | Queue item pending | Queue refresh; sign-off submitting | "Nothing pending" (positive state) | N/A | Queue/Review restricted to Super User/Admin | Already-actioned conflict | Signed off, requester certified | N/A | N/A |
| F — Equipment issue→restored | `operational` | Status update submitting | N/A | Instrument shown non-operational everywhere it appears | Status change restricted to Super User/Admin | Reason missing (blocked client-side) | Restored to `operational`, notifications sent | N/A | N/A |

---

## 5. Cross-Workflow Dependencies

- **Certification (B) → Booking eligibility (C).** No booking without both certification stages current and unexpired.
- **Equipment status (F) → Availability (A) and Booking eligibility (C).** A non-operational instrument blocks new bookings unless an audited `force_override` is used; it does not touch existing confirmed bookings.
- **Funding balance (C) → Booking confirmation (C) itself.** Insufficient balance blocks confirmation regardless of certification/availability being satisfied.
- **Booking (C) → Active Session (D).** No session exists without a prior confirmed booking; there is no "walk-up" path.
- **Certification expiry (B) → future Booking attempts (C) only — explicitly not (D).** An already-confirmed or already-active session is never revoked by an expiry that occurs after confirmation.
- **Equipment status change (F) → existing bookings in (D)'s pre-arrival stage.** Informational only (a notification), never a blocking or destructive side effect.
- **Cancellation (an alternate path inside D) → Funding (C).** Restores the grant balance that a future booking attempt in Workflow C will check.
- **Certification approval (E) → Certification status (B) → Booking eligibility (C).** E is the mechanism that resolves B's "pending" state, which is what C's gate actually checks.
- **Proxy booking (a Super User path within C) → still fully depends on (B) and (C)'s checks — evaluated against the beneficiary, never the acting Super User.**

---

## 6. UX Principles

1. **Every disabled action states why and links to the fix.** A "Book" button that's disabled because of certification, funding, or equipment status must say which, specifically — never a bare disabled state.
2. **Never imply a state the server hasn't confirmed.** This applies most strongly to Active Session (never show "active" without relay confirmation) and to cost (never show a number that hasn't been recomputed server-side at the current step).
3. **Gate conditions are evaluated together and reported individually.** A booking attempt failing on three conditions at once must surface all three, not just the first one found.
4. **Positive empty states are visually and textually distinct from loading or error.** "Nothing pending" in the Certification Queue is good news — it must not look like a broken or empty-by-failure screen.
5. **Actions that require a reason (status change, staff-initiated cancellation, practical rejection) never submit without one**, enforced before the request leaves the client, not just server-side.
6. **Staff-facing screens default to what needs attention**, not a full record list — the Certification Queue and Dashboard alerts lead with pending/urgent items.
7. **Certification, funding, and equipment status are always shown together at the point of decision** (Equipment Detail, Booking Confirmation) — never something the user has to discover by attempting the action and getting rejected.
8. **Proxy/override actions are never visually identical to the equivalent self-service action.** A Super User booking for a trainee, or overriding an equipment-status block, must look distinctly different from an ordinary booking — the audit trail exists because the UI made the distinction unmissable, not despite it being invisible.

---

## 7. Usability Risks

- **"Confirmed" vs. "physically ready" confusion.** Until Active Session ships, a confirmed booking has no visible signal distinguishing it from one where the equipment will actually respond — this is the single highest-risk gap identified across the whole program.
- **Two-stage certification vs. a one-stage mental model.** Users are likely to think of certification as binary ("I'm trained" / "I'm not"); a user who passed the quiz but sees "not certified" needs the practical-pending state to be unmistakable, or they will read it as a bug.
- **`force_override` visibility.** If this control is even slightly discoverable to a Standard User, or insufficiently deliberate for a Super User, it undermines the entire equipment-status gate it exists to make safe. Must be role-gated at render time, not just permission-checked on submit.
- **Proxy booking ambiguity.** Reusing the booking screens for proxy bookings risks a Super User being unsure whose certification/funding is actually being checked unless the beneficiary selector is persistently visible throughout all three steps.
- **Stale-looking grant balances.** The balance appears at Equipment Detail (preview), Funding Selection, and Booking Confirmation — if any of these caches rather than re-fetches, users will see inconsistent numbers and lose trust in the whole cost-transparency promise.
- **Missed maintenance notifications.** A user with a confirmed booking on an instrument that later goes into maintenance will still see "confirmed" everywhere except their notifications — if they don't check notifications, they arrive to blocked equipment with no on-screen warning at the booking itself.
- **Cancellation cutoff surprise.** Users accustomed to more flexible cancellation elsewhere may not expect "no cancellation once the slot starts" — this needs to be visible *before* they try to cancel, not discovered as a rejected request.
- **Terminology for external/guest users.** "Grant," "PI," "support tier" are all ICFO-internal concepts; an external researcher's first booking attempt is the highest-risk point for this confusion.

---

## 8. Prototype Priority

The smallest set of screens that tests MOSAIC's core mental model — *booking is one validated, multi-condition transaction with explainable gates, not a calendar with a lock on it* — not the smallest set by count.

**Priority set (5 screens, tested across their failure states, not just their happy path):**

1. **Equipment Detail** — tests whether showing rate, status, and certification together (vs. sequentially) actually changes how users evaluate an instrument.
2. **Certification Status**, specifically in its "practical assessment pending" state — tests whether the explainable-access pattern (a specific status + a next action) actually resolves the confusion a bare "access denied" would cause. This is the single most important state to test, because it's the concrete answer to the core research problem.
3. **Booking Configuration + Funding Selection** (tested as one continuous flow) — tests whether seeing cost and grant impact *before* committing changes booking confidence.
4. **Booking Confirmation, deliberately shown in a blocked state** (e.g. insufficient funds, or equipment gone non-operational since selection) — tests whether users understand *why* and *what to do next*, rather than feeling stuck. This is more diagnostic than testing the success path, which is comparatively low-risk.
5. **Booking Detail with the cancellation cutoff** — tests whether the "no cancellation after slot start" rule is discoverable and intuitive *before* someone hits it as a rejection.

**Deliberately excluded from this set**, not because they're unimportant, but because they don't test the *core* mental model: Active Session/interlock UI (tests a different, hardware-trust mental model, sequenced later per the product strategy's own recommendation), the Certification Queue and other staff-facing screens (test an operational-efficiency mental model, not the researcher's), and all Administration/analytics screens.

# MOSAIC — Product Research Synthesis

> **V2 note (2026-09-28):** background research and strategy, still valid. Where it conflicts with `08_IMPLEMENTATION_CONTRACT.md` (roles, IA, funding model), the contract wins.

**Purpose:** Extract decision-relevant findings from the supplied research material and cross-check every claim against what MOSAIC's actual specs and shipped frontend already establish. This precedes and informs `01_PRD.md`.

## Evidence key

| Tag | Source | Nature |
| :--- | :--- | :--- |
| `[RD]` | "MOSAIC Core: Research Synthesis, User Personas & Journey Maps" (supplied this session) | **Not primary research.** No interview transcripts, quotes, dates, sample sizes, or ticket references — its six personas (Anna, Daniel, Marc, Laura, Javier, Sofia) are illustrative constructs, not documented individuals. Treated below as **design hypothesis / synthesized rationale**, not validated user evidence. |
| `[SCHEMA]` | `docs/02_SCHEMA.sql` | Real, current data model. Confirmed fact. |
| `[API]` | `docs/03_API_SPEC.md` | Real, current contract. Confirmed fact. |
| `[PRD]` | `docs/01_PRD.md` | Current product spec (prose, not verified against users either). |
| `[DESIGN]` | `docs/04_DESIGN_SYSTEM.md` | Real, current visual system. |
| `[BUILT]` | `CLAUDE.md`'s decision log + shipped `/frontend` code | What is **actually implemented today**, including explicitly deferred scope. Confirmed fact. |

Every finding below is labeled with a confidence level: **Confirmed** (verifiable in code/spec), **Strong inference** (consistent across multiple independent sources), **Weak inference** (asserted once, unverified), or **Assumption** (no evidence either way).

---

## 1. Executive synthesis

- `[RD]`'s central thesis — *a booking is not an isolated transaction but the intersection of identity, certification, funding, support, and physical access* — is **structurally confirmed** by `[SCHEMA]`: `bookings` foreign-keys `equipment_id`, `user_id`, and `grant_id` simultaneously, and cost is a generated column combining two rate sources. The multi-constraint nature of booking is real, not just a narrative framing. **Confirmed.**
- `[RD]`'s claim that training is currently "disconnected" from booking is **already partially addressed** in the shipped product: `TrainingGateModal` gates the calendar's drag-to-book flow on certification and walks the user through SOP + quiz `[BUILT]`. What `[RD]` calls for (Principle 1: explain *why* access is blocked, and what's next) is real for the theory stage, but **not for the practical stage** — there is no Super User review-queue UI anywhere in the app, so a user who passes the quiz has no way to see "practical assessment pending" or request one `[BUILT]`. This is the single clearest gap between the research vision and the current build.
- `[RD]`'s assumption that equipment *operational status* (maintenance/offline) participates in the booking gate is **contradicted by the current implementation**: only certification is checked; equipment `status` is not `[BUILT]`. This is a genuine, confirmed contradiction between the research's mental model and the shipped system (see §7).
- `[RD]` never once mentions accessibility, disability, or non-pointer interaction — a real gap in the supplied research, surfaced by the fact that the shipped drag-to-book gesture is pointer-only with no keyboard equivalent `[BUILT]`. Neither the research nor the current build resolves this; it's an open item, not a solved one.
- `[RD]`'s digital/physical duality problem (§5 in that doc) describes exactly the interlock/session state model the schema and API already provision for (`interlock_ip`, `interlock_mqtt_topic`, `WS /ws/interlock/:equipment_id`) — but **no frontend UI for session/interlock state exists yet** `[BUILT]`. The problem is real at the spec level; whether it's felt by actual users is unverified.
- Overall: `[RD]` is a coherent, useful *hypothesis set* about where MOSAIC's UX risk concentrates. It should not be cited later as validated user research — several of its claims are already outdated by what's been built, and none of it derives from an ICFO researcher, technician, or facility manager.

---

## 2. User problems

| Problem | Affected user | Evidence | Current workaround | Consequence | Frequency/severity | Confidence |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Booking eligibility requires knowing status across training, certification, funding, and equipment state, spread across concepts a user has to hold in their head at once | Standard User (researcher) | `[RD]` §3 Problem 1; structurally corroborated by `[SCHEMA]`'s joins across `users`/`user_certifications`/`grants`/`equipment` | Presumed staff contact (not documented anywhere) | Delay, dependency on staff availability | `[RD]` asserts "regularly," no number given | Weak inference |
| Failing/incomplete certification is a dead end once the theory stage passes — no visibility into practical sign-off status, no way to request it | Standard User, especially first-time equipment users | `[RD]` §3 Problem 2, §21 Principle 1; **confirmed gap**: no Super User review-queue UI exists `[BUILT]` | None — the flow simply has no next step in the UI today | User certified on paper (quiz passed) but cannot book; must find a Super User outside the app | Affects every user needing practical sign-off, i.e. every new-to-instrument booking | **Strong inference** (RD's hypothesis + confirmed current absence of the UI it calls for) |
| Equipment operational status (maintenance/offline) does not block booking in the current build, even though it conceptually should | Standard User | `[BUILT]` CLAUDE.md's documented demo-data quirk: the only certified-by-default instrument is fixture-status `'maintenance'` | None; this is a known, undecided gap | A user could book equipment that's down for maintenance | Currently 100% of the seeded demo state, real-world frequency unknown | **Confirmed** (as a system gap) / severity to real users is an assumption |
| External/guest users cannot reach the login/onboarding flow through normal navigation | External Researcher persona (`Daniel` in `[RD]`) | `[RD]` §9, §20; **confirmed**: `/login` exists but is deliberately not linked from `TopNav` or anywhere else `[BUILT]` | Direct URL only — requires the user already know the link | External users effectively cannot self-serve onboarding today | Affects 100% of external/guest users until nav-gating is decided | **Confirmed** (as current state); RD's "terminology confusion" framing is unverified |
| Cost of a session is not confirmed as visible to the user *before* they commit to a booking | Standard User, PI/grant owner | `[RD]` §4; `[API]`'s `POST /bookings` response returns cost only after creation, not as a pre-commit estimate — whether the frontend surfaces a live estimate before submit is not confirmed either way | Unknown | Potential billing surprise if unconfirmed | Unknown | **Unresolved** — needs verification against the calendar-booking implementation, not assumed either way |
| Facility staff (Super User / Facility Manager) have no dashboard; only Equipment Calendar, Reporting Toolbar, and Admin Sheet exist in the shipped shell | Super User, Facility Manager (`Marc`, `Laura` in `[RD]`) | `[RD]` §10–§11, §18–§19; `[BUILT]` frontend shell scope (per CLAUDE.md) does not include an exceptions/triage dashboard | Presumably manual, outside the app | Staff must piece together "what needs attention today" from multiple views | Daily, per `[RD]`'s stated persona frequency (unverified) | Weak inference |
| Drag-to-book calendar gesture has no keyboard equivalent | Standard User relying on keyboard/assistive tech | `[BUILT]` — documented as a deliberate scope boundary, not a research finding | None | Cannot complete a booking without a pointer device | Unknown; not addressed by `[RD]` at all | **Confirmed** (as a gap) — real-world impact is an assumption since neither source measures it |

---

## 3. User goals

**Functional** — know what equipment exists, whether it's available, what it costs, and what's required to use it (`[RD]` §7.1; consistent with `[PRD]` §3.1–3.4).

**Workflow** — complete discovery → training → booking without switching systems or contacting staff (`[RD]` §7.2–7.3); for staff, triage "what needs attention" without manually cross-referencing certifications, maintenance, and bookings (`[RD]` §18).

**Emotional/confidence** — certainty a booking won't be silently rejected; certainty that "booked" means the equipment will actually be usable when the user arrives; certainty no hidden cost will appear later (`[RD]` §17, "Emotional Journey"). Note: the "booking won't be silently rejected" goal is **already structurally guaranteed** for the double-booking case specifically — `[SCHEMA]`'s `EXCLUDE USING gist` constraint makes conflicting bookings impossible at the database level, independent of any UI work. **Confirmed**, and worth stating in the PRD as an already-met goal rather than an open risk.

**Operational** (facility staff) — minimize manual certification tracking, avoid billing reconciliation by spreadsheet, get real-time equipment health visibility (`[RD]` §11–§12).

All of the above are `[RD]`-sourced hypotheses about what users want, not confirmed by independent user contact — except where noted as structurally guaranteed by the schema.

---

## 4. Jobs to be done

*All statements below are synthesis — my translation of `[RD]`'s persona goals into JTBD form. None are direct quotes from real users; `[RD]` itself contains no JTBD-formatted statements.*

- When I want to use an instrument I'm not yet certified on, I want to see exactly which requirement (theory, practical, or both) is outstanding and how to complete it, so I can plan my timeline without contacting facility staff. *(derived from `[RD]` §3 Problem 2, §21)*
- When I'm about to confirm a booking, I want to see the total cost and which grant will cover it before I commit, so I don't get a billing surprise afterward. *(derived from `[RD]` §4)*
- When I arrive at the instrument, I want confirmation that my digital booking actually unlocked the physical equipment, so I don't waste session time troubleshooting access. *(derived from `[RD]` §5, §24)*
- When a researcher has passed the quiz but not the practical assessment, I want the system to show me that as a pending task, so I don't have to be personally tracked down to schedule it. *(derived from `[RD]` §10, Marc persona — staff-side JTBD)*
- When equipment goes into maintenance, I want that reflected immediately in what can be booked, so I don't have to field avoidable questions about failed bookings. *(synthesis — combines `[RD]`'s exception-management framing with the confirmed current gap that equipment status doesn't gate booking yet)*
- When I'm an external collaborator with no ICFO account, I want a guided path to request access without knowing ICFO's internal terminology, so uncertainty doesn't stop me from starting. *(derived from `[RD]` §9, Daniel persona)*

---

## 5. Workflow reconstruction

| Stage | `[RD]`'s description | Current actual state | Friction |
| :--- | :--- | :--- | :--- |
| Trigger | Researcher has an experiment needing an instrument | Not modeled in-app; starts outside MOSAIC | N/A |
| Discovery | Browse/search equipment across facilities | Equipment discovery UI exists in frontend shell `[BUILT]` | `[RD]` asserts "too many instruments" as friction — unverified |
| Decision | Evaluate suitability, rates, requirements | Equipment detail views exist `[BUILT]` | Unconfirmed whether requirements are shown pre-decision or only at booking time |
| Access requirements | Check training/certification status | `TrainingGateModal` surfaces this **only when a drag-to-book is attempted**, not as a standalone "my certifications" view `[BUILT]` — `[RD]`'s §21 Principle 3 "certification dashboard" mockup does not exist yet | Certification status isn't browsable ahead of trying to book |
| Booking | Reserve a slot | Drag-to-book on the Equipment Calendar, gated on certification, conflict-checked at the DB level `[BUILT]`/`[SCHEMA]` | Equipment operational status not part of the gate (confirmed gap) |
| Funding | Select grant, confirm balance | `grants` table and `BookingSlot.grantId` exist `[SCHEMA]`; whether the booking dialog surfaces live grant-balance validation is unconfirmed | Unresolved — needs verification |
| Preparation | Complete SOP + quiz, await practical sign-off | Theory stage fully built; practical stage has no UI at all `[BUILT]` | Confirmed dead end past the quiz |
| Equipment use | Badge/app unlock, run session | No frontend interlock/session UI exists yet `[BUILT]` | Entire stage is currently unimplemented, not just imperfect |
| Completion | End session, cost finalized | Not built yet | N/A |
| Follow-up | Review spend/history | `My bookings`/history not confirmed in current scope | Unresolved |

---

## 6. Pain-point hierarchy

**Critical** (confirmed system gap, central to the trust model both sources describe):
- Practical certification has no visible status or request path — a genuine dead end, not just a UX rough edge. Evidence: `[BUILT]` (no review-queue UI) directly contradicting `[RD]`'s own stated Principle 1.
- Equipment operational status doesn't gate booking. Evidence: `[BUILT]` demo-data quirk, contradicting `[RD]`'s Moment 3 requirement list.
- No frontend UI exists for the digital→physical access moment (interlock/session state) that both `[RD]` and `[API]`/`[SCHEMA]` treat as central to trust. Evidence: absence confirmed in `[BUILT]`; severity claim ("very high impact," `[RD]` §26) is asserted, not measured.

**High** (confirmed current limitation, impact plausible but unmeasured):
- External users have no discoverable path into the app (`/login` unlinked). Evidence: `[BUILT]`, confirmed as current state; RD's "terminology confusion" narrative is unverified.
- Pre-commit cost visibility is unresolved — could be High or could already be handled; flagged here because if it's *not* handled, `[RD]`'s "billing surprise" concern (§4) applies directly.

**Medium** (plausible, weakly evidenced):
- No staff-facing exceptions/triage dashboard. `[RD]` treats this as daily-frequency pain for Super User/Facility Manager personas, but those personas are illustrative, and the frontend shell's Admin Sheet scope hasn't been checked against this specific need.
- No standalone certification-status view (only surfaced reactively inside the booking-gate modal).

**Low**:
- Language/i18n barriers — `[RD]` rates this Medium impact, but EN/ES/CA is already substantially implemented `[BUILT]`, so residual risk is low.
- Keyboard-only drag booking — real confirmed gap, but neither source provides evidence of actual user impact, and it's already documented as a deliberate, revisitable scope boundary rather than an unknown risk.

---

## 7. User mental model

Concepts users are expected to think in, per `[RD]`: equipment, facility, certification, availability, booking, funding/grant, support, session, cost.

**Contradiction 1 (confirmed):** `[RD]`'s own Moment 3 (§22) lists equipment availability *and maintenance state* as things validated together at booking time — i.e., `[RD]`'s model assumes a maintenance instrument can't be booked. The actual system does not enforce this `[BUILT]`. This is a real, current mismatch between the research's mental model and the shipped system, not a research error to silently fix — it should be flagged as a decision point in the PRD (see `00_RESEARCH_SYNTHESIS.md` §1 and the PRD's existing "Known Scope Boundaries" material in CLAUDE.md).

**Contradiction 2 (internal to `[RD]`, preserved as-is):** `[RD]`'s persona `Anna` explicitly does not want to "navigate the facility's administrative structure" (§8), yet `[RD]`'s own recommended information architecture (§23) nests Equipment *under* Facilities (NFL/NCL/SLN) as the top-level navigation branch — a facility-first structure, not an equipment/task-first one. This tension exists within the supplied research itself and is not resolved there.

**Consistency (no contradiction):** `[RD]`'s certification dashboard mockup (§21 Principle 3, partial progress bars per instrument) already matches the schema's two-stage certification model (`theoretical_passed` + `practical_signed_off` as independent flags, `[SCHEMA]`) rather than treating certification as one binary gate. This is a case where the research and the data model agree — worth preserving as a design constraint rather than re-deriving it.

---

## 8. Product opportunities

| Problem | Evidence | Opportunity | Potential product response | Open question |
| :--- | :--- | :--- | :--- | :--- |
| Practical certification is a dead end past the quiz | `[BUILT]` confirmed absence of review-queue UI; `[RD]` §21 Principle 1 | Extend the existing granular-status pattern already proven in `TrainingGateModal` to the practical stage | A "practical assessment pending / request assessment" state + a minimal Super User review queue | Who owns triaging these requests — is this in scope for the next sub-project, or deferred again? |
| Equipment status doesn't gate booking | `[BUILT]` confirmed | Close the gap between schema (`is_operational`) and the booking gate | Add equipment status as a second, independent gate condition alongside certification | Should this reuse fixture re-seeding, or add real status-gating logic — CLAUDE.md already flags this exact choice as undecided |
| No standalone certification-status view | `[BUILT]` absence; `[RD]` §21 mockup | Give users a "My Certifications" view they can check *before* attempting to book | Reuse `TrainingGateModal`'s data (already tracked in `useUserPassportStore`) in a dedicated view | Is this part of the frontend shell's existing IA, or a new nav item? |
| External users can't discover onboarding | `[BUILT]` confirmed (`/login` unlinked, by design) | Resolve the deferred nav-linking decision `[BUILT]` already flagged as needing an explicit call | Decide how `/login` interacts with the dev-only role switcher and whether it shows conditionally | This is explicitly logged in CLAUDE.md as a decision owed to a future session — this synthesis doesn't resolve it, just surfaces it again with research backing |
| No visible pre-commit cost estimate (status unconfirmed) | Unresolved evidence | If missing, add a live cost breakdown to the booking confirmation step | Surface `base_rate_hourly * hours + support_tariff * hours` before submit, not just in the `POST /bookings` response | Does the current booking dialog already do this? Needs a direct check against the calendar-booking implementation before treating this as a real gap |
| No staff exceptions dashboard | Weak inference (`[RD]` personas, unverified) | If validated by real Super User/Facility Manager input, prioritize a triage view over more CRUD screens | "Today / Pending / Alerts" style view per `[RD]` §18–19, but only after confirming real staff actually work this way | This entire opportunity rests on unverified personas — recommend validating with a real Super User before building |

---

## 9. Requirements implied by research

- **Functional:** booking must jointly validate identity, certification (both stages), funding/grant balance, availability/conflict, support requirement, and equipment operational status — the last of which is not yet enforced (`[RD]`; `[SCHEMA]`; `[BUILT]`).
- **UX:** every access denial must state the specific unmet condition and the next action, not a generic blocked state (`[RD]` §21 Principle 1) — already the pattern for theory certification, not yet for practical.
- **Information:** certification status must be visible independent of a booking attempt (not yet true — currently only surfaced reactively) (`[RD]` §21; `[BUILT]`).
- **Operational:** facility staff need a way to see pending practical-assessment requests; none exists (`[RD]` §10; `[BUILT]`).
- **Trust:** the boundary between "booking confirmed" and "equipment physically accessible" must be explicit and never implied (`[RD]` §5, §24; `[API]`'s WS interlock contract already provisions the mechanism, but no UI consumes it yet).
- **Safety:** equipment operational status should participate in access control, matching the schema's `is_operational` field and NFL/NCL's stated safety-sensitivity (`[RD]` §2.1; `[SCHEMA]`; currently unenforced).
- **Financial:** cost must be knowable before commitment, not only after (`[RD]` §4) — status in the current build unconfirmed, flagged as open rather than assumed broken.

---

## 10. Unknowns and assumptions

**Confirmed facts:**
- Schema enforces overlap-proof bookings via `EXCLUDE USING gist` `[SCHEMA]`.
- Certification is modeled as two independent flags (`theoretical_passed`, `practical_signed_off`) `[SCHEMA]`.
- No Super User review-queue UI exists anywhere in the app `[BUILT]`.
- Equipment operational status does not currently gate booking `[BUILT]`.
- `/login` is built but deliberately unlinked from navigation `[BUILT]`.
- Drag-to-book is pointer-only; the confirmation dialog that follows is fully keyboard-operable `[BUILT]`.

**Strong inference:**
- The theory-certification gating pattern (`TrainingGateModal`) is a template the practical stage should likely follow, since it already solves the "explain why + what's next" problem `[RD]` calls for.

**Weak inference:**
- That real ICFO researchers experience the fragmentation `[RD]` describes at all — asserted, not measured.
- All frequency/severity labels in `[RD]`'s §26 Opportunity Matrix ("High," "Very high") — asserted with no stated methodology.

**Unresolved questions:**
- Does the current booking confirmation flow show cost before commit, or only after? (Needs direct verification against the calendar-booking implementation, not assumed.)
- Does the frontend shell's Admin Sheet already partially cover the "staff triage dashboard" need, or is that fully unaddressed scope?
- Should equipment status gating be added by re-seeding demo certifications, or by adding real gate logic — CLAUDE.md already flags this exact fork as undecided.

**Assumptions requiring validation:**
- That `[RD]`'s six personas represent real ICFO user segments rather than generic facility-management archetypes — no evidence ties them to actual ICFO researchers, technicians, or facility managers.
- That the severity ranking in §6 above (Critical/High/Medium/Low) reflects real-world impact rather than internal-logic importance to the system design — it is reasoned from confirmed gaps and `[RD]`'s narrative emphasis, not from measured user cost.

---

## What MOSAIC must get right

1. **Never present a bare "access denied."** Every certification, funding, or availability gate must name the specific unmet condition and the next action. Confirmed gap today: the practical-certification stage has no such treatment at all — the theory stage does.
2. **Booking must validate every constraint together — including equipment status.** The schema already models `is_operational`; the booking gate does not check it. Closing this gap is not new scope, it's aligning the UI to a field that already exists.
3. **Certification status must be visible on its own, not just when a booking is attempted.** Both the research and the current implementation agree this hasn't been built yet.
4. **The line between "booking confirmed" and "equipment physically accessible" must be explicit at every step.** The schema/API already provision the mechanism (MQTT/WebSocket interlock states); no frontend consumes it yet, so this is a real, unaddressed product risk rather than a solved problem being second-guessed.
5. **External/guest users need a discoverable path, not just a working one.** `/login` works; nothing points to it. This is a logged, deliberate decision still owed to a future session.
6. **Treat every persona and severity claim in the supplied research as a hypothesis, not a finding.** None of it derives from contact with a real ICFO researcher, technician, or facility manager — it should inform prioritization, not be cited later as validated evidence.
7. **Resolve — don't silently assume — whether cost is visible before commitment.** This is the one requirement in the supplied research whose current status is genuinely unknown; verify against the actual booking dialog before treating it as either solved or broken.
8. **Keyboard/non-pointer operation of booking is an unaddressed gap in both the research and the build.** Neither source resolves it; it should be tracked as open, not forgotten because neither document raised it.

# MOSAIC V2 — Engineering Architecture & Decisions

**Status:** authoritative engineering design for the V2 build. It sits below `08_IMPLEMENTATION_CONTRACT.md` (the product/implementation contract) and above code. When code and this document disagree, fix one of them in the same change.

---

## 1. Decision log

These resolve the conflicts found between the V1 docs and the V2 contract (`08`). The contract is the source of truth; each row records what changed and why.

| # | Topic | Decision | Source |
| --- | --- | --- | --- |
| D1 | Frontend stack | Vite + React 19 + React Router 7 SPA (not Next.js). Matches `08` §49 and the Figma Make prototype. | `08` |
| D2 | Error codes | `UPPER_SNAKE` machine codes in one envelope (§5). They replace V1's lowercase `reason` strings. HTTP statuses follow V1 `03_API_SPEC.md` where one existed. | `08` §5 |
| D3 | Audit log access | Auditor: full read at `/analytics/audit`. Admin: administrative read at `/admin/audit`. Both use the same endpoint implementation with different role guards. Nobody can mutate. | `08` §27, §39 |
| D4 | Analytics source | `gold.*` OLAP tables are **removed**. KPIs are computed from `bookings`, `equipment_status_events`, `session_events`, `users`, `grant_group_allocations`. Materialized views are added only when measurements justify them. | `08` §29 |
| D5 | Charging model | Funding is charged at booking confirmation (full `total_cost`) and refunded in full on pre-start cancellation. The "final session cost" is the booked `total_cost`: MOSAIC bills the reserved slot. Early-termination billing remains an open policy question and is not invented. | `03` V1 + `08` §43 |
| D6 | Dev authentication | `POST /auth/dev-login` issues a real session for an existing DB user. It is registered only when `AUTH_DEV_LOGIN=true`, and the process refuses to start if that is set with `NODE_ENV=production`. Shibboleth/OIDC plugs in behind the same session interface. | User decision 2026-09-28 |
| D7 | Accounting | `bookings.allocation_id` is **NOT NULL**. A booking decrements `grant_group_allocations.remaining_balance` **and** `grants.remaining_balance` in one transaction; cancellation restores both. Invariant: `grants.remaining_balance = allocated_budget − Σ consumed`. | User decision |
| D8 | Capacity | New `equipment_availability_windows` table (weekly local-time windows). Bookings must fall inside a window. Available hours = window hours − non-operational intervals. | User decision |
| D9 | External users | `external_user_sponsors` (one internal sponsor per external user, enforced by trigger). Magic-link login is deferred; externals authenticate through the same session mechanism. | User decision |
| D10 | Fonts | The licensed stack from `04_DESIGN_SYSTEM.md` wins over the prototype's Google fonts (Barlow Condensed / Inter). Eurostile = headings, Aptos = body, Arkibal Display = wordmark only, IBM Plex Mono (self-hosted, OFL) = data. | `08` §45 precedence |
| D11 | Status colours | Prototype `#10B981` / `#EF4444` fail WCAG AA as text on white (2.54 : 1 and 3.76 : 1). We use `#198038` (5.02) and `#C0362C` (5.52). Amber text uses `#8A6100` (5.54) with the `#FFCD01` fill. | `08` §47 |
| D12 | Buffer time | `equipment.buffer_time_minutes` is enforced in the booking service under an equipment row lock. The GiST exclusion constraint on `slot_range` stays as the database backstop. | Schema + `08` §43 |
| D13 | Interlock | There is no relay hardware or broker in scope. Sessions are started and ended by the user (`session_events.source = 'user'`). Equipment without `interlock_mqtt_topic` is shown as **Manual access**, never as a simulated relay. The relay adapter is a reported blocker (§9). | `08` §54 |
| D14 | UI language | Equipment `name`/`description` are served in the requested locale (`en`/`es`/`ca`, falling back to `en`). UI chrome strings are English-only for now. Full UI i18n is a later dedicated slice, not scattered through feature work. **Approved 2026-09-28.** | User approval |
| D15 | Booking time rules | Start and end on 15-minute boundaries; minimum duration 30 minutes; start must be in the future; the slot must fit inside one availability window. A session can be started from 15 minutes before slot start until slot end. **Approved 2026-09-28.** | User approval |
| D16 | Certification validity | Per instrument: `equipment.certification_validity_months`. NULL = never expires. On practical sign-off, `expires_at = signed_off_at + validity`. No global default is invented. **Approved 2026-09-28.** | User approval |
| D17 | Lint & compiler | ESLint (flat config, `typescript-eslint` type-aware + `react-hooks`) enforces async correctness (`no-floating-promises`, `no-misused-promises`), exhaustive switches and typed `pg` rows. TypeScript is pinned to `~6.0` because `typescript-eslint` does not support the TS 7 native compiler yet; revisit when it does. **Approved 2026-09-28.** | User approval |
| D18 | Certification rules | (a) Passing the quiz is permanent: failed retakes never revoke it, and the passing score is kept. (b) An expired certification is renewed with a new practical assessment; the quiz stays passed. (c) Nobody can assess their own practical request (`FORBIDDEN`). (d) Replacing a quiz does not revoke existing passes. (e) Sign-off sets `expires_at = now + equipment.certification_validity_months` (NULL = never expires, D16). | Decided in Slice 5 to fill documentation gaps |
| D19 | Notification recipients | Notifications go to the roles that book (standard, super, admin). Auditors receive none, see no bell, and every `/notifications` route excludes them, so the strict read-only rule has no exception. Group notifications skip inactive members, inactive accounts and auditors. Every notification is written by `notify()` / `notifyGroupMembers()` with a payload typed per type. Notifications UI pulled forward from Slice 9 to before booking. | Decided before Slice 6 so booking changes have somewhere to surface |
| D20 | Booking rules | (a) **Buffer:** a booking blocks `[start − buffer, end + buffer)`; a new slot may not overlap any blocked range, so bookings are at least one buffer apart. Availability `busy` ranges are the blocked ranges. (b) **Certification** is `accessState()` evaluated at slot end: it must be valid for the whole session. (c) **Grant** must not expire before the slot's local date. (d) **Proxy:** the beneficiary must be an active standard/super/admin user (else `NOT_FOUND user`); `force_override` bypasses only the operational gate and is stored only when it did. Proxy and override bookings are audited (`booking.created`). (e) **Cancel:** the owner cancels without a reason (not audited; the row records who and when); staff cancelling someone else's booking must give a reason, which is audited and notifies the owner (`booking_cancelled_by_staff`). (f) **Low balance:** a booking that takes an allocation below 10 % of its amount notifies the group once (`allocation_low_balance`, the contract's "grant approaching exhaustion"). (g) `BOOKING_CONFLICT.next_available` is the earliest slot of the same length within 14 days. (h) The quote runs every gate with the same locks and writes nothing. (i) Allocation adjustment locks allocation → grant, matching booking, so they cannot deadlock (previously grant → allocation). (j) The facility timezone is one constant in contracts, shared with the web, which renders all instants in facility time. | Decided in Slice 6 to fill documentation gaps |

---

## 2. Repository layout

A pnpm workspace with three packages. There are no other build tools.

```
apps/
  api/                    Fastify + TypeScript backend
    migrations/           NNNN_name.up.sql / NNNN_name.down.sql (authoritative schema)
    src/
      app.ts              buildApp(): registers plugins + modules (used by server and tests)
      server.ts           process entrypoint
      config.ts           env parsing (zod) — fails fast on invalid config
      db/                 pg Pool, transaction helper, migration runner
      http/               error envelope, request-id, auth + role guard plugins
      modules/<domain>/   routes.ts · service.ts · repository.ts · schemas.ts · *.test.ts
    test/                 test harness: DB reset, fixtures builders, app factory
  web/                    Vite + React SPA
    src/
      app/                router, providers, shell, route guards
      components/ui/      design-system primitives (shadcn-derived, owned code)
      features/<domain>/  api.ts (TanStack Query hooks) · pages · components
      lib/                api client, formatting (money, time), errors → UI mapping
packages/
  contracts/              zod schemas + TS types + error-code catalog shared by api and web
docs/                     product + engineering docs (this folder)
prototype-ref/            unzipped Figma Make prototype — visual reference only, never imported
```

Domain modules (API): `auth`, `users`, `groups`, `grants`, `equipment`, `tariffs`, `training`, `certifications`, `bookings`, `sessions`, `operations`, `analytics`, `audit`, `notifications`, `health`.

## 3. Stack (deliberately small)

| Concern | Choice | Why |
| --- | --- | --- |
| Runtime | Node ≥ 22, TypeScript strict | Contract |
| HTTP | Fastify 5 + `fastify-type-provider-zod` | Contract; zod schemas from `packages/contracts` validate at the edge and type the handlers |
| DB access | `pg` + hand-written SQL in repositories | No ORM: the domain relies on Postgres features (ranges, GiST, `FOR UPDATE`, generated columns) that ORMs obscure |
| Migrations | ~80-line in-repo runner over plain SQL `up`/`down` files, recorded in `schema_migrations` | Boring and reversible, with no dependency |
| Auth session | `@fastify/jwt` in an httpOnly, SameSite=Lax cookie (`mosaic_session`), 8 h expiry | Contract (JWT); the cookie avoids token handling in JS |
| Tests | Vitest (unit + integration against real Postgres 16 in Docker), Playwright (E2E) | Integration tests must exercise real constraints and locks |
| Lint | ESLint + typescript-eslint (type-aware) + react-hooks; TypeScript ~6.0 (D17) | Catches unawaited promises and untyped rows |
| Web | React 19, React Router 7, TanStack Query 5, React Hook Form + zod, Tailwind v4, Radix primitives via shadcn-style owned components, lucide-react, recharts (analytics only) | Contract + prototype |

## 4. Backend layering and request lifecycle

```
request → request-id → auth (decode cookie, load user, reject inactive) → route guard (role)
        → zod validation → service (business rules, transaction) → repository (SQL) → response
                                                         ↘ audit.record(tx, …) in the same tx
```

- **Routes** declare path, schema, required role(s) and call exactly one service function. They contain no logic.
- **Services** own business rules and transactions. They receive an `Actor` (`{ userId, role, userType }`) explicitly. Authorization rules that depend on data (e.g. "own booking or staff") live here, not in routes.
- **Repositories** are plain functions taking a `Queryable` (pool or transaction client). Callers always pass the transaction client inside a transaction.
- **Audit** is written through `audit.record(tx, { actor, action, entityType, entityId, before, after })` inside the mutating transaction. If the mutation commits, its audit row commits; if it rolls back, neither exists.
- **Errors** are thrown as `DomainError(code, details?)`. A single Fastify error handler maps codes to HTTP status and envelope. Unknown errors become `INTERNAL_ERROR` (500), are logged with the request id, and never leak internals.

### Authorization

Role guard per route (`requireRole('admin')`, etc.) plus service-level ownership checks. The UI hides navigation per role but is never the enforcement point. Role → capability matrix: `08` §2. Summary:

| Area | standard_user | super_user | admin | auditor |
| --- | --- | --- | --- | --- |
| Own bookings, training, certs, funding | ✓ | ✓ | ✓ | ✗ |
| `/operations/*` (queue, sessions, equipment status) | ✗ | ✓ | ✓ | ✗ |
| Proxy booking, `force_override` | ✗ | ✓ | ✓ | ✗ |
| `/admin/*` (people, groups, grants, equipment, tariffs, audit) | ✗ | ✗ | ✓ | ✗ |
| `/analytics/*` incl. full audit log, exports | ✗ | ✗ | ✗ | ✓ |

Auditors have no write endpoints. Every `POST/PATCH/PUT/DELETE` route explicitly excludes `auditor`, and a test enumerates all mutating routes to assert this (§8).

### Transactions and locking

| Operation | Lock order | Notes |
| --- | --- | --- |
| Create booking | `equipment` row `FOR UPDATE` → `grant_group_allocations` row `FOR UPDATE` → `grants` row `FOR UPDATE` | Equipment lock serialises bookings per instrument (buffer check). A fixed lock order prevents deadlocks. |
| Cancel booking | `bookings` `FOR UPDATE` → allocation → grant | Refund restores both balances. |
| Create allocation | `grants` `FOR UPDATE` | Verifies Σ allocations ≤ budget. |
| Adjust allocation | allocation `FOR UPDATE` → `grants` `FOR UPDATE` | Same order as booking, so they cannot deadlock (D20). Verifies Σ allocations ≤ budget and new amount ≥ consumed. |
| Equipment status change | `equipment` `FOR UPDATE` | Writes status event, audit and notifications for affected upcoming bookings. |
| Certification sign-off | `UPDATE … WHERE practical_status = 'pending' RETURNING` | Conditional update; zero rows → `ALREADY_ACTIONED`. |

All use `READ COMMITTED` with explicit row locks. Database `CHECK` constraints (non-negative balances, remaining ≤ allocated) and the exclusion constraint are the last line of defence; a constraint violation that escapes the service is a bug and surfaces as 500.

### Money

Money is `NUMERIC(…, 2)` in Postgres and **integer cents** in TypeScript (`packages/contracts/money.ts`). It crosses the API as a decimal string (`"313.50"`) so no float ever carries a balance. Cost = `round_half_up(rate_cents × minutes / 60)` per component; `total_cost` is the generated column.

### Time

All instants are `TIMESTAMPTZ`, UTC on the wire (ISO-8601). Facility-local rules (availability windows, reporting days) use `FACILITY_TIMEZONE` (`Europe/Madrid`, a constant in `packages/contracts/time.ts` shared by API and web, D20). Bookings use 15-minute boundaries, a minimum 30-minute duration, must start in the future, and must fit inside one availability window.

## 5. Error model

Every non-2xx response:

```json
{ "error": { "code": "INSUFFICIENT_GRANT_BALANCE", "message": "Human-readable summary", "details": { "shortfall": "30.00" } },
  "request_id": "…" }
```

The catalog lives in `packages/contracts/errors.ts` (code → HTTP status). The web app maps each code to a specific actionable UI state (`apps/web/src/lib/errors.ts`), never "Booking failed". Full list: `03_API_SPEC.md` §0.3.

## 6. Frontend architecture

- **Route tree** mirrors `08` §55. Each role area is a lazily loaded route subtree wrapped in `<RequireRole roles=[…]>`. That guard renders the permission-denied state; it never renders data and then disables controls.
- **Data**: one typed `apiFetch` (cookie credentials, envelope parsing into `ApiError { code, details }`) and per-feature TanStack Query hooks. There is no global client state beyond the session query (`/auth/me`).
- **Every page** handles, via shared primitives: loading (`Skeleton` shaped like the content), empty (`EmptyState` with the next action), error (`ErrorState` with retry and a staleness hint), permission (`PermissionDenied`), not found (`NotFound`).
- **Mutations** are server-confirmed. Optimistic updates are used only for idempotent toggles (e.g. marking a notification read).
- The shell layout follows the prototype: navy sidebar with a yellow active bar and a 56 px top bar (see `04_DESIGN_SYSTEM.md` §3).

## 7. Observability & health

Fastify's pino logger emits JSON with `request_id` (taken from the `x-request-id` header or generated) and response time. Auth cookies and JWTs are redacted. `GET /health` returns 200 while the process is up. `GET /ready` returns 200 only if `SELECT 1` succeeds and migrations are current, otherwise 503.

## 8. Testing strategy (TDD)

Each slice is written test-first: failing test → minimal code → refactor.

| Layer | Tool | What |
| --- | --- | --- |
| Unit | Vitest | Pure functions: cost, duration and window validation, KPI arithmetic, money, error mapping |
| Integration / API | Vitest + `app.inject()` + real Postgres | Every endpoint: happy path, each error code, each role (including the auditor-mutation sweep), concurrency (parallel bookings, parallel allocation) |
| Migrations | Vitest | `up` from empty → `down` to empty → `up` again; constraint behaviour |
| Web components | Vitest + Testing Library | State rendering (loading, empty, error, permission) and error-code → UI mapping |
| E2E | Playwright against the real API + DB | The journeys in `08` §63 |

The test DB is a dedicated database (`mosaic_test`) in the compose Postgres. Each test file truncates the domain tables in `beforeEach`. Fixtures come from builder functions in `apps/api/test/fixtures.ts`, the only place synthetic data exists. Dev seed data (`pnpm db:seed`) is gated to non-production and uses the same builders.

## 9. Known blockers (reported, not faked)

These stay blocked by approved decision (2026-09-28). Nothing below may be simulated. Each is unblocked only by the external input it names.

1. **Interlock relay protocol and broker.** `WS /ws/interlock/:id` and the MQTT adapter need the hardware contract (message format, broker, auth). Until then sessions are manual (D13).
2. **Shibboleth/OIDC.** This needs an IdP registration (metadata, attribute release for `sso_identifier` and email).
3. **Email** (magic links, `/reports/email`). This needs approval for mail infrastructure (`08` §28).

## 10. Delivery slices

Each slice ships tested backend and UI with all states, and is usable on its own.

| # | Slice | Delivers |
| --- | --- | --- |
| 0 | Foundation | Workspace, compose Postgres, migration runner, full schema migration + tests, `/health` `/ready`, error envelope, contracts package |
| 1 | Identity & access | Dev login, `/auth/me`, role guards, web shell with per-role nav, login page, permission/not-found states |
| 2 | Admin people & groups | Users (internal/external, role, activation, sponsor), groups, memberships, audit |
| 3 | Grants & allocations | Grants CRUD, group allocations with over-allocation protection, spending views |
| 4 | Equipment & tariffs | Discovery, detail (localized), admin CRUD, pricing, availability windows, status changes + events + notifications |
| 5 | Training & certification | SOP + quiz, practical request, operations queue sign-off/reject |
| 6 | Booking | Availability, stepper, gate validation, cost, funding, confirm, cancel, proxy/override (API); researcher booking UI and My bookings |
| 6b | Staff booking tools | Proxy/override booking UI (beneficiary search), all-bookings view with staff cancellation |
| 7 | Sessions | Start/end, session events, active session monitor, final cost |
| 8 | Analytics & audit | KPIs, drill-downs, exports, audit log views |
| 5b | Notifications | Notification list, unread bell, mark read / all read (pulled forward from 9, D19) |
| 9 | Hardening | E2E suite, security tests, performance review |

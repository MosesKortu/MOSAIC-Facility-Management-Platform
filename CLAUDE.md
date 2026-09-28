# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

MOSAIC (Management & Operational System for Advanced ICFO Cores) is a facility-management platform for ICFO's NFL, NCL and SLN core facilities. The product name is spelled **MOSAIC**, even though this directory is named `MOSIAC_V2`, and "PIXEurope" is never a product name. It is a greenfield V2 build, delivered in the slices listed in `docs/09_ARCHITECTURE.md` §10.

## Commands

Requirements: Node ≥ 24 (TypeScript runs natively through type stripping, with no build step for the API), pnpm, and Docker. TypeScript is pinned to `~6.0` for `typescript-eslint` compatibility (D17); don't upgrade to 7 until it's supported.

```bash
pnpm install
pnpm db:up                 # Postgres 16 in Docker on :54329 (dev db "mosaic" + "mosaic_test")
cp .env.example apps/api/.env   # then set JWT_SECRET
pnpm db:migrate            # apply migrations to the dev db;  pnpm db:rollback  reverts one
pnpm db:seed               # dev-only accounts: researcher@ superuser@ admin@ auditor@icfo.test, external@partner.test
pnpm dev:api               # API on :3100 (port 3000 is taken on this machine)
pnpm dev:web               # web on :5173, proxies /api → :3100
pnpm test                  # all packages (API tests need `pnpm db:up`)
pnpm typecheck
pnpm lint                  # ESLint, type-aware; must be clean
pnpm schema:doc            # regenerate docs/02_SCHEMA.sql after changing migrations
pnpm --filter @mosaic/web brand:assets   # regenerate favicon/app icons after changing src/brand/geometry.ts
```

To run a single test file or test: `pnpm --filter @mosaic/api exec vitest run src/modules/auth/auth.test.ts -t "dev-login"`. The same works with `@mosaic/web` or `@mosaic/contracts`.

## Source of truth

`docs/08_IMPLEMENTATION_CONTRACT.md` overrides every other doc. Next in line are `docs/09_ARCHITECTURE.md` (the decision log D1–D14, layering, locking, testing, slices), then `03_API_SPEC.md` (V2 contract and error catalog), `10_KPI_DEFINITIONS.md` and `04_DESIGN_SYSTEM.md` v3. The PRD, functional spec and UX docs carry "V2 note" banners where the contract superseded them. **If two authoritative artifacts conflict, stop and ask. Do not silently pick one.** A change to the schema, API contract, roles, money rules, booking or certification rules, or audit behaviour updates the docs, migration and tests in the same change.

`prototype-ref/` (unzipped from `MOSAICInteractivePrototype-main.zip`, gitignored) is the Figma Make prototype. Treat it as a **visual reference only**: never import from it, and never copy its hard-coded data or its fonts/colours where `04_DESIGN_SYSTEM.md` §9 records a deliberate deviation.

## Architecture

The pnpm workspace has three packages:

- **`packages/contracts`**: shared TS source (no build step). It holds the error catalog (`errors.ts`: code → HTTP status), integer-cent money helpers (`money.ts`) and the shared types (`Role`, `SessionUser`). The API and web import it as `@mosaic/contracts`.
- **`apps/api`**: Fastify 5, `pg` with hand-written SQL, and zod. There is no ORM.
  - `app.ts` `buildApp()` is used by both `server.ts` and the tests (`app.inject`).
  - Modules live in `src/modules/<domain>/`, each with `routes.ts` (edge validation plus one service call), `service.ts` (rules and transactions) and `repository.ts` (SQL taking a `Queryable`).
- **`apps/web`**: Vite, React 19, React Router, TanStack Query and Tailwind v4.
  - Tokens are in `src/styles/tokens.css`, primitives in `src/components/ui/`, and feature code in `src/features/<domain>/`.
  - Route titles come from `handle: { title }`, and navigation per role from `src/app/nav.ts`. Add nav items only when their routes exist.

### Cross-cutting rules

These rules are enforced in code; don't bypass them.

- **Access is default-deny.** Every `/api` route must declare `config: { access: 'public' | 'authenticated' | Role[] }`, or the app refuses to start (`src/http/access.ts`).
  - The root-level `onRequest` hook authenticates the `mosaic_session` JWT cookie, reloads the user from the DB on every request (so deactivation and role changes apply immediately), and checks the role.
  - Rules that depend on data ("own booking or staff") belong in services.
  - Use the role sets `RESEARCHERS`, `STAFF`, `ADMIN` and `AUDITOR`. `src/http/route-policy.test.ts` fails if any mutating route admits `auditor`.
- **Errors.** Services throw `DomainError(code, message, details)` with catalog codes. `registerErrorHandling` produces `{ error: {code, message, details}, request_id }`. Validate input with `parseWith(schema, input)`, which yields `VALIDATION_FAILED` with field paths. On the web side, `apiFetch` turns failures into `ApiError`. Map each code to a specific, actionable UI state, never a generic "failed".
- **Money** is `NUMERIC` in Postgres (the pg driver returns it as a string), integer cents in TS, and a `"313.50"` string on the wire. Use `costForDuration` (half-up rounding). `total_cost` is a generated column; there must be no second cost calculation.
- **Transactions.** Use `withTransaction(pool, tx => …)` and write audit rows with the same `tx`. Lock order for booking: equipment → allocation → grant (`09` §4). DB constraints are the backstop: the exclusion constraint on overlapping slots, balance CHECKs, the allocation ≤ budget trigger, the allocation↔grant composite FK, the external-sponsor trigger, and the append-only `audit_log` trigger.
- **Admin mutations** follow one pattern (see `modules/admin-users`, `modules/groups`):
  1. Lock the row (`FOR UPDATE`).
  2. Compute which fields actually change, and apply only those.
  3. Write one audit event per changed field, through `recordAudit(tx, …)`.
  4. Map unique violations with `.catch(rethrowUniqueViolation)` → `DUPLICATE {field}`.

  Order audit reads by `audit_log.seq`, because `created_at` is shared within a transaction.
- List endpoints take `PageQuery` params and return `Page<T>`; the web uses `ListParams<typeof Schema>`. Filters and paging live in the URL (`useSearchParams`).
- **Schema** lives in `apps/api/migrations/NNNN_name.{up,down}.sql`. Each file is checksummed, so never edit an applied migration; add a new one. `docs/02_SCHEMA.sql` is generated, and a test fails if it is stale.
- **Frontend states.** Every page handles loading (`PageLoading`/`Skeleton`), empty (`EmptyState`), error (`ErrorState` with retry), permission (`RequireRole` → `PermissionDenied`, which never renders protected content) and not-found (`NotFound`).

## Domain invariants (from 08/09)

- `user_role` (standard_user / super_user / admin / auditor) is independent of `user_type` (internal / external). Externals are always `standard_user` and have one internal sponsor. The auditor role is strictly read-only.
- Booking is a single server-side transaction. Gate order, from `03` §3.1: permission → equipment → duration/past/availability window → operational (`force_override` is staff-only and audited) → support tier → theory → practical → expiry → allocation membership → grant expiry → slot free including buffer → balance.
  - A booking must reference an allocation (`allocation_id NOT NULL`).
  - Booking decrements **both** the allocation balance and the grant balance, and pre-start cancellation restores both (D7). There is no refund once the slot has started (D5).
- A user's access to an instrument has **one** definition: `accessState()` in `apps/api/src/modules/certifications/access.ts` (`AccessState` in contracts). Equipment pages show it and the booking gate must enforce it; never re-derive it elsewhere.
- `practical_status` follows `not_requested → pending → signed_off | rejected`. Only staff sign off, and only while the request is `pending`.
- Equipment `status` changes only via `PATCH /equipment/:id/status` (the admin PATCH is strict and rejects it). Localized fields are resolved with `pickLocale(Accept-Language)` + `localize()`; admin endpoints return the full `{en, es, ca}`.
- An equipment status change always writes an `equipment_status_events` row, an audit row and notifications. It never auto-cancels bookings.
- Analytics are computed live from transactional tables using `10_KPI_DEFINITIONS.md`. There are no stored KPI counters and no `gold.*` tables.
- There is no fake data in production paths. Fixtures exist only in `apps/api/test/fixtures.ts`, which the dev seed reuses. Blocked integrations (Shibboleth, the interlock relay, email) are reported, never simulated (`09` §9).

## Approved rules to implement against

- **D15 booking time rules:** 15-minute boundaries, 30-minute minimum, future start, and the slot must fit one availability window. A session may start from 15 minutes before the slot until its end.
- **D16 certification expiry** is per instrument, from `certification_validity_months`; NULL means it never expires.
- **D14:** the UI is English-only until a dedicated i18n slice.
- Keep lint clean. Intentionally fire-and-forget promises are written `void promise`. Type `pg` queries with `query<Row>()` outside tests.

## Testing conventions

TDD: write the failing test first. API integration tests run against real Postgres (`mosaic_test`, rebuilt from migrations in `test/global-setup.ts`, with files run sequentially). Call `resetDatabase()` in `beforeEach`, and use `createTestApp()`, `loginAs()` and `as()` from `test/app.ts`. Tests that need their own schema use `createScratchDatabase()`. Web tests use `stubApi({ 'GET /path': [status, body] })` from `src/test/render.tsx`; a route may be a function `(body) => [status, body]` to model changing server state. They also use `apiCalls(fetchMock)` to assert requests and `renderRoutes()` to render. Query keys are sorted by `toQueryString`, so stub URLs list params alphabetically.

## Design conventions

Follow `docs/04_DESIGN_SYSTEM.md` v3:
- Navy sidebar shell, `canvas` warm-grey page, white cards with hairline `line` borders. Shadows only on floating surfaces.
- Fonts: Eurostile (`font-title`, weight 400 only, no synthetic bold) for titles; Aptos for body; IBM Plex Mono for money, codes and times; Arkibal Display Bold for the wordmark only.
- **Logo:** use `<Logo>` / `<LogoMark>` from `src/brand/Logo.tsx`; never hand-draw the mark or crop the raster board. The mark's geometry lives only in `src/brand/geometry.ts`. Variant rules and what's intentionally excluded are in `04_DESIGN_SYSTEM.md` §3.1.
- Colour meaning: blue = can do, green = okay, yellow = attention, red = blocked. Never colour-only.
- The AA-safe status text colours come from the tokens. Never use yellow text on white.

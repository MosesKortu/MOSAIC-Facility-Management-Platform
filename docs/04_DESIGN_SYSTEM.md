# MOSAIC Design System — v3 (V2 build)

**Supersedes v2**, which reconciled against a V1 Next.js codebase that is not part of V2 (its audit is in `archive/07_V1_DESIGN_SYSTEM_AS_BUILT.md`). v3 combines:

1. The brand and token decisions from v2 (licensed fonts, the colour-meaning rule, "shadows only on overlays").
2. The layout and component patterns of the Figma Make prototype (`prototype-ref/`, "what good looks like"): navy sidebar shell, section eyebrows, KPI tiles, radio cards, steppers and a mission-control active session.
3. The WCAG 2.2 AA requirements in `08_IMPLEMENTATION_CONTRACT.md` §47.

Where the prototype and the brand rules disagree, the brand/accessibility rule wins, and the table in §9 records every such case.

**Anti-drift rule:** the tokens in §2 live in `apps/web/src/styles/tokens.css` (Tailwind v4 `@theme`). Primitives live in `apps/web/src/components/ui/`. Any change to either updates this document in the same change.

---

## 1. Principles

MOSAIC is a **scientific operations tool**: calm, precise, state-first, information-dense but readable. The interface is predominantly white and warm grey, and colour is reserved for actions and states. It must never look like a generic SaaS dashboard. Every screen answers its role's question:

- Researcher: "Can I use this instrument?"
- Super user: "What needs attention right now?"
- Admin: "How do I manage the facility?"
- Auditor: "What happened, and can I verify it?"

**Colour meaning rule:** blue answers "what can I do?" Green answers "what is okay?" Yellow answers "what needs my attention?" Red answers "what prevents me from proceeding?" State is **never** conveyed by colour alone; it is always shown with text, and with an icon where the state is safety-relevant.

## 2. Tokens

### 2.1 Colour

| Token | Value | Use |
| --- | --- | --- |
| `pix-blue` | `#032F9B` | Primary actions, links, selection, focus ring, sidebar |
| `pix-blue-75/50/25/10` | `#4263B4` `#8197CD` `#C0CBE6` `#E6EBF5` | Hover, chart series, borders on navy, info surface |
| `pix-yellow` | `#FFCD01` | Attention fills, sidebar active bar, current step, avatar. **Never as text on white** |
| `pix-yellow-25/10` | `#FFF3BF` `#FFF9E6` | Warning surface |
| `ink` | `#333333` | Body text |
| `ink-muted` | `#666666` | Secondary text, eyebrows (5.3 : 1 on warm grey) |
| `canvas` | `#F8F6F1` | App background (warm grey) |
| `surface` | `#FFFFFF` | Cards, tables, dialogs |
| `surface-sunken` | `#F0EEE9` | Table header rows, nested panels, progress tracks |
| `line` | `#E6E3DC` | Hairline borders and dividers (decorative, 1 px) |
| `success` / `success-surface` | `#146C2E` / `#E7F4EA` | "Okay" (6.5 : 1 on white) |
| `warning-ink` / `warning-surface` | `#7A5600` / `#FFF3BF` | "Needs attention" text on a warning tint (6.0 : 1); the dot or fill is `pix-yellow` |
| `danger` / `danger-surface` | `#A32A21` / `#FBE9E7` | "Blocks you", destructive actions (6.2 : 1 on its tint) |
| `status-operational` | `#198038` | Dot or fill only |
| `status-maintenance` | `#FFCD01` | Dot or fill only |
| `status-offline` | `#C0362C` | Dot or fill only |

There is no dark mode. The prototype's purple ("in use", "assessment") and indigo are **not adopted**: they add meanings outside the four-colour rule. "In use" uses info blue; "assessment pending" uses warning.

### 2.2 Typography

| Utility | Family | Files | Use |
| --- | --- | --- | --- |
| `font-display` | Arkibal Display | Bold (700) OTF | The **MOSAIC wordmark only** (Bold matches the brand board; see §3.1) |
| `font-title` | Eurostile | `eurostile.TTF` (Regular only) | Page titles, card titles, instrument names, large KPI values. Always weight 400: no bold face exists, so synthetic bold is forbidden (`font-synthesis: none`) |
| `font-sans` | Aptos | 400 / 600 / 700 TTF | All body and UI text (the default) |
| `font-mono` | IBM Plex Mono (OFL, self-hosted) | 400 / 500 | Money, times, durations, booking refs, equipment codes, percentages in tables |

The prototype's Barlow Condensed and Inter map to `font-title` and `font-sans`.

| Token | Size / line | Weight | Use |
| --- | --- | --- | --- |
| `text-display` | 32 / 38 | title 400 | Hero numbers (session timer, confirmation) |
| `text-title-lg` | 28 / 34 | title 400 | Page title (one per screen) |
| `text-title-md` | 22 / 28 | title 400 | Section or card header |
| `text-title-sm` | 18 / 24 | title 400 | Item title (instrument name in a row) |
| `text-body` | 14 / 21 | sans 400 | Default text |
| `text-body-sm` | 13 / 19 | sans 400 | Table cells, meta |
| `text-caption` | 12 / 16 | sans 400 | Timestamps, hints |
| `eyebrow` | 11 / 16 | sans 700, uppercase, `tracking-[0.08em]`, `ink-muted` | Section labels ("YOUR ACCESS", "RESEARCH GRANTS"), table headers, KPI labels |

### 2.3 Spacing, radius, elevation

- **Spacing** uses the stock Tailwind 4 px scale.
  - Page padding: `p-6` desktop, `p-4` mobile. Vertical rhythm between page sections: `gap-6`. Inside cards: `p-5` (dense tables `px-4 py-3`).
  - Prefer `gap-*` on flex/grid over margins.
- **Radius:** controls `rounded-lg` (8 px); cards, tables and dialogs `rounded-xl` (12 px); hero/navy header cards `rounded-2xl` (16 px); pills and chips `rounded-full`.
- **Elevation:** hairline `line` borders everywhere. Shadows only on truly floating surfaces: popovers and menus (`shadow-lg`), dialogs and drawers (`shadow-2xl`), the floating export toolbar (`shadow-xl`). Hover on interactive cards changes the border colour to `pix-blue`, never adds a shadow.
- **Width:** researcher pages sit in a centred column (`max-w-5xl`; forms and booking steps `max-w-2xl`). Admin, operations and analytics pages use the full content width.

## 3. Application shell

```
┌────────────┬──────────────────────────────────────────────────────────┐
│ ▣ MOSAIC   │ Breadcrumb / Title            [facility] ● status 🔔 (AB) │  56 px, white, bottom hairline
│ CORE FAC.  ├──────────────────────────────────────────────────────────┤
│            │                                                          │
│ nav group  │   page content on `canvas`                               │
│ nav group  │                                                          │
│ ─────────  │                                                          │
│ Support    │                                                          │
│ [user card]│                                                          │
└────────────┴──────────────────────────────────────────────────────────┘
  224 px navy (`pix-blue`); collapses to 64 px icon rail; < 768 px → top bar + slide-over menu
```

- **Sidebar:** `pix-blue` background.
  - Logo: the horizontal lockup in inverse (all white), 56 px tall to line up with the top bar, linking to Home (§3.1).
  - Nav item: `text-body`, 70 % white. Active item: 14 % white fill, **2 px `pix-yellow` left bar**, white 600 weight, and `aria-current="page"`.
  - Groups are shown only for roles that have them (§3.1). Each group has an eyebrow label.
  - The user card at the bottom shows avatar, name, **role label** and Sign out.
- **Top bar:** breadcrumb (last crumb in `ink` 600), notification bell with an unread count (the count is text, not only a dot), and avatar.
- **Nav per role** (`08` §56–58), hidden and route-guarded per role:
  - Researcher (all non-auditor roles): Home · Equipment · Calendar · My Bookings · Training · Grants · Support
  - Operations (super_user, admin): Dashboard · Certification Queue · Active Sessions · Equipment Status · Maintenance
  - Administration (admin): Overview · People · Groups · Equipment · Grants & Funding · Tariffs · Audit
  - Analytics (auditor, the only group): Overview · Sessions · Revenue · People · Equipment · Funding · Audit Log

### 3.1 Logo

Source: the brand board `docs/brand/MOSAIC_logo_system_v2.png` (Logo System v2). The board is a soft raster, so nothing is cropped from it. The logomark is redrawn as exact vectors in `apps/web/src/brand/geometry.ts`, which is the single source for the React components and every generated icon.

- **Mark:** a 48-unit grid. Two mirrored isometric halves form the M: the outer leg is 12 wide, the inner panel reaches x = 22, and a 4-unit centre channel separates the halves. Every diagonal has slope 0.7. A rounded diamond (radius 1.6) sits above the channel.
- **Wordmark:** "MOSAIC" is live text in Arkibal Display Bold with 0.06 em tracking, never an image, so it stays crisp and reads correctly to assistive technology.
- **Tagline:** "Unified access to research facilities", preceded by a yellow dot. Use it only where it stays legible (not in the sidebar).

| Board variant | Where MOSAIC uses it | Component |
| --- | --- | --- |
| Horizontal, inverse (all white) | Sidebar | `<Logo layout="horizontal" tone="inverse" size="sm" />` |
| Primary stacked, inverse + tagline | Login brand panel | `<Logo layout="stacked" tone="inverse" size="lg" tagline align="start" />` |
| Horizontal, full colour + tagline | Login on small screens | `<Logo layout="horizontal" size="md" tagline />` |
| Logomark | Wherever the mark stands alone (give it a `title`) | `<LogoMark />` |
| Favicon & app icon (white M, yellow diamond, blue tile) | Browser tab, home screen, PWA manifest | Generated into `apps/web/public/` by `pnpm --filter @mosaic/web brand:assets` |

**Tones:** full colour on white or light backgrounds (blue M, yellow diamond); inverse on Mosaic Blue (all white, as on the board). The yellow diamond on a blue tile belongs to the app icon only.

**Minimum size:** 24 px digital (board). Keep the board's clear space around the lockup, and never recolour, stretch or re-letter the mark.

**Not used by the web app:** motion mark (MP4/Lottie), social-media kit, print formats (PDF/EPS/AI/JPG), specialty production, and the greyscale and black monochrome variants. They are for marketing and print, and belong with the brand files rather than in this codebase. Add them only if a feature needs them, such as printable reports.

## 4. Components (`apps/web/src/components/ui`)

Each primitive lists its variants and required states. They are built on Radix primitives where interaction semantics are non-trivial (Dialog, Tabs, Select, Dropdown, Tooltip). Every primitive is keyboard-operable with a visible focus ring (`ring-2 ring-pix-blue ring-offset-2`).

| Component | Variants | States / rules |
| --- | --- | --- |
| **Button** | `primary` (blue), `secondary` (2 px blue outline), `ghost`, `attention` (yellow fill, ink text: "complete training", "request assessment"), `danger` (outline in list rows, solid in confirmation dialogs), `link` | hover, focus, disabled, **`loading` prop** (spinner + `aria-busy`, keeps its width). Sizes `sm` 32 px, `md` 40 px, `lg` 48 px (full-width flow CTA). Icon-only buttons are 40 × 40 with an `aria-label` |
| **Card** | `default` (white + line), `sunken`, `navy-header` (blue band with white title, then white body: review and summary cards) | `interactive` adds a hover border and a whole-card link target |
| **KpiCard** | — | Eyebrow label · `font-title` value · **context line** (period · scope, e.g. "Sep 2026 · All facilities") · optional delta (arrow + text) · optional drill-down link. Never a bare number |
| **StatusBadge** | tones `neutral` `info` `success` `warning` `danger` | `rounded-full px-2 py-0.5 text-caption font-semibold`, tone surface plus tone ink, optional leading dot. Text is always present. Domain wrappers: `EquipmentStatusBadge`, `CertificationBadge`, `BookingStatusBadge` |
| **Alert** | `info` `success` `warning` `danger` | Title + body + optional action. `danger` uses `role="alert"`; the others `role="status"` |
| **Tabs** | segmented (researcher: pill track, active = blue fill) and underline (admin/analytics dense) | Peer views only, never sequential steps. Tab state is kept in the URL (`?tab=`) for deep links |
| **Stepper** | horizontal, vertical-checklist | Steps: upcoming (muted), current (yellow fill, blue text, "Next step"), complete (success check), error (danger). `aria-current="step"` |
| **RadioCard** | — | The whole card is the label. Selected: 2 px blue border + sunken fill. Disabled cards show the reason ("Insufficient funds: €90 available"). Used for support tier and funding selection |
| **Input / Select / Textarea / Checkbox** | — | Labels are always visible. Errors are wired through `aria-invalid` + `aria-describedby`. `h-10 rounded-lg border-line`, focus border blue |
| **SearchInput** | — | Input with a leading icon. Debounced; the value is kept in the URL (`?q=`) |
| **FilterChips** | single / multi | For facility (All/NFL/NCL/SLN), roles and similar. Selected = blue fill |
| **DataTable** | — | Sunken header row with eyebrow text. Rows `text-body-sm` with hairline dividers. Server-side sort/pagination controls. `overflow-x-auto` wrapper with a sticky first column. On narrow screens, low-priority columns hide and rows expand into a detail view. `<caption>` for screen readers |
| **ProgressBar** | primary, success, warning, danger | Always paired with the exact textual value |
| **CostBreakdown** | estimated, confirmed | Mono amounts, right-aligned. The total sits above a 2 px blue rule. Shows the remaining balance after booking |
| **Dialog / Drawer** | — | Radix. Title required, focus trap, Esc to close. Destructive confirmations name the object and the consequence |
| **Skeleton** | — | Shaped like the content it replaces. `role="status"` + `aria-busy` |
| **EmptyState** | — | Icon, title, one-sentence explanation, next action |
| **ErrorState** | — | What failed, "data shown may be out of date" when cached data is displayed, Retry, request id for support |
| **PermissionDenied / NotFound** | — | Full-panel states. They never render the protected data underneath |
| **Toast** | success, info | Transient confirmation only. Errors never appear only in a toast |

### Charts (analytics only)

These use recharts and follow the prototype's restraint:
- no vertical grid; dashed horizontal grid in `line`; no axis lines
- 12 px `ink-muted` ticks; single-series `pix-blue`; second series `pix-yellow`
- a legend is always shown as text

Every chart has a heading stating metric, unit and period, plus a visually hidden (`sr-only`) table of the same data or a "View as table" toggle.

## 5. Domain state language

Labels are tied to the persisted fields that produce them. The UI never invents a state.

| Domain | Persisted source | Label → tone |
| --- | --- | --- |
| Equipment | `equipment.status` | operational → "Operational" success · maintenance → "Maintenance" warning · offline → "Offline" danger |
| Access (per user and instrument) | `user_certifications` | no row or theory not passed → "Training required" warning · practical `not_requested` → "Request assessment" warning · `pending` → "Assessment pending" warning · `rejected` → "Reassessment needed" danger · `signed_off` and not expired → "Certified" success · expired → "Certification expired" danger |
| Booking | `bookings.status` | confirmed → info · active → "In session" info · completed → success · cancelled → neutral |
| Session | latest `session_events.state` | authorizing → info · active → success · fault → danger · completed → neutral. No interlock topic → "Manual access" neutral (D13) |
| Funding (per attempt) | `/funding/me`, `/bookings/quote` | usable → success · insufficient → danger with the shortfall · expired / not a member → danger with the reason |
| User | `users.is_active`, `role`, `user_type` | Active success / Inactive neutral. Role and type are shown as text badges, never colour-only |

## 6. Signature screens

- **Equipment detail:** a hero card (name, facility, status badge, one-line description, mono rate) with a **Your access** checklist beside it. Tabs: Overview · Availability · Requirements · Pricing · Maintenance. There is one contextual primary action: "Check availability" (certified), "Continue training" (not certified), or a disabled "Booking unavailable" with the reason (equipment not operational).
- **Booking flow** (a stepper across routes, state kept in the URL):
  1. Time: the day grid shows availability windows, busy blocks and buffers as distinct patterns. Selection is made with click or keyboard, never drag-only.
  2. Support: radio cards.
  3. Funding: radio cards with usable/unusable reasons.
  4. Review: a navy-header card with the cost breakdown and the remaining balance after booking, plus the server quote.
  5. Confirmation: a success panel with the booking ref, a checklist of the validated gates, and "When you arrive".

  Any gate failure appears as an Alert mapped from its error code, with the fix action.
- **Active session ("mission control"):** a navy header with the instrument and a "Session active" badge. The **timer is the largest element**. Three state tiles (Authorization · Access · Session), each with icon + text. The booked cost is shown in mono. The primary "End session" button is **not** the danger variant, because it is the happy path.
- **Operations dashboard:** exception list first (pending certifications oldest first, faults, equipment down with affected bookings), then today's sessions. No revenue charts.
- **Analytics overview:** a filter bar (period, facility, dimensions) that stays in view while scrolling. KPI grid (Sessions · Session hours · Available hours · Utilization · Revenue · Avg cost/session), each card with a context line and a drill-down. Trend charts. The floating export toolbar (CSV · JSON) uses the current filters. "Generated at" is shown.

## 7. Responsive

Desktop is primary for admin, operations and analytics. The researcher booking flow, active session, notifications, certification and operational status must work at 360 px: single column, a full-width `lg` primary CTA, and the sidebar collapsed into a menu. Tables follow the DataTable rules (§4) and are never shrunk until illegible.

## 8. Accessibility (WCAG 2.2 AA)

- Contrast is verified for every text token pair (§2.1). Yellow is never used as text on white.
- Everything is reachable by keyboard: visible focus, logical order, a skip link, no drag-only interactions, and dialogs that trap and restore focus.
- Semantic landmarks and one `h1` per page. Tables have headers and captions.
- Form errors are announced and linked to their fields.
- Charts have text alternatives. Status is always shown with text.
- Touch targets are ≥ 24 × 24 px (2.5.8), with 40 px preferred for primary controls.
- Motion respects `prefers-reduced-motion`.

## 9. Prototype deviations (intentional)

| Prototype | v3 | Why |
| --- | --- | --- |
| Barlow Condensed / Inter / JetBrains Mono via Google Fonts | Eurostile / Aptos / IBM Plex Mono, self-hosted | Licensed brand stack, no third-party font CDN |
| Status `#10B981` / `#EF4444` as text | `#146C2E` / `#A32A21` text, bright colours as dots only | WCAG AA (2.54 : 1 and 3.76 : 1 fail) |
| Purple "in use / assessment", indigo quiz | Info blue / warning | Four-colour meaning rule |
| Page background `#F4F5F7` | `canvas` `#F8F6F1` | Brand warm grey |
| Emoji empty states | lucide icons | Consistent iconography; emoji rendering varies by platform |
| Role picked on the login screen with demo buttons | Role comes from the server session | No client-side roles |
| Yellow “M” letter tile as the sidebar logo | Brand-board logomark and wordmark (§3.1) | The brand system supersedes the prototype’s placeholder |
| Hard-coded data, `alert()` stubs, live-ticking cost, interlock toggle | Server data only; cost = booked `total_cost`; no simulated relay | `08` §53–54, D5, D13 |

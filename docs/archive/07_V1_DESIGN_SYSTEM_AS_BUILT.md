# MOSAIC — Design System (As Built)

Extracted directly from `/frontend` source (Tailwind config, `globals.css`, `next/font` setup, and every component under `frontend/src/components/`), not from `docs/04_DESIGN_SYSTEM.md`'s stated intent. Where the two disagree, this document says so explicitly and defers to the code — §6 lists every confirmed divergence. If a future session updates the intent doc or the code to reconcile them, this document should be re-verified against source again rather than trusted as permanently accurate.

---

## 1. Color Palette

**Brand tokens** (`tailwind.config.ts:9-13`) — used directly by feature components:

| Token | Value | Tints (75/50/25/10) |
| :--- | :--- | :--- |
| `pix-blue` | `#032F9B` | `#4263B4` / `#8197CD` / `#C0CBE6` / `#E6EBF5` |
| `pix-yellow` | `#FFCD01` | `#FFDA41` / `#FFE680` / `#FFF3BF` / `#FFF9E6` |
| `pix-black` | `#333333` | (no tint scale) |
| `pix-warmgrey` | `#F8F6F1` | (no tint scale) |

**Status tokens** (`tailwind.config.ts:29-33`) — the `EquipmentStatus` type maps 1:1 to these:

| Token | Value |
| :--- | :--- |
| `status-operational` | `#198038` |
| `status-maintenance` | `#FFCD01` |
| `status-offline` | `#C0362C` |

**Semantic/shadcn-bridge tokens** (`tailwind.config.ts:34-51`) — consumed *only* by the six `ui/` primitives, never directly by feature components:

`primary` `#032F9B` (=`pix-blue`) · `primary-foreground` `#FFFFFF` · `secondary` `#F8F6F1` (=`pix-warmgrey`) · `secondary-foreground` `#333333` · `muted` `#F8F6F1` · `muted-foreground` `#666666` · `accent` `#E6EBF5` (=`pix-blue-10`) · `accent-foreground` `#032F9B` · `destructive` `#C0362C` (=`status-offline`) · `destructive-foreground` `#FFFFFF` · `border` `#E2E8F0` · `input` `#E2E8F0` · `ring` `#032F9B` · `card`/`popover` `#FFFFFF` · `card-foreground`/`popover-foreground` `#333333` · `background` `#FFFFFF` · `foreground` `#333333`.

**How the two layers bridge:** feature components (ScheduleBoard, StatusBadge, TopNav, etc.) use `pix-*`/`status-*` tokens directly. The six `ui/` primitives (Button, Dialog, Sheet, Input, ErrorBanner*, Skeleton) use the semantic tokens, which are hard-coded hex restatements of the brand palette — e.g. `primary` is just `pix-blue` under a different name. This means the brand and the shadcn-style primitive layer are visually consistent today, but only because someone kept the two token sets in sync by hand — there's no single source (no CSS variable) enforcing that.

**Dark mode: configured, not implemented.** `tailwind.config.ts:4` sets `darkMode: 'class'`, and `components.json` sets `cssVariables: true` (the shadcn convention for HSL CSS-variable theming) — but there are **zero** `dark:` utility usages anywhere in the codebase, and `globals.css` defines no `:root` CSS variables at all (colors are hard-coded hex directly in the Tailwind config). This is a real gap, not a stylistic choice: either build dark mode out, or remove the config that implies it exists, so a future session doesn't assume theming infrastructure that isn't there.

---

## 2. Typography Scale

Four font families, all loaded via `frontend/src/fonts/index.ts`:

| Utility | Family | Loading | Weights available | Where it's actually used |
| :--- | :--- | :--- | :--- | :--- |
| `font-display` | Arkibal Display | `next/font/local` | 300/400/700 | **One place only**: the "MOSAIC" wordmark in `TopNav`. Not a general heading font. |
| `font-title` | Eurostile | `next/font/local` | **400 only** — no bold face file exists; "bold" headings rely on browser-synthetic bold | Page headings (`equipment/page.tsx`, `admin/page.tsx`, `SsoPanel`, etc.) |
| `font-body` | Aptos | `next/font/local` | 400/600/700 | Default body font (set on `<body>`), plus explicit use in `TopNav`, `RateCalculator`, `StatusBadge` |
| `font-mono` | IBM Plex Mono | `next/font/**google**` — not a local licensed asset like the other three | 400/500 | Consistently used for numeric/data values: equipment codes, prices, timestamps (`EquipmentSheet`, `ScheduleBoard`, `RateCalculator`, `TrainingGateModal`, `BookingConfirmationDialog`) — functions as a "data font" in practice, even though there's no separate `font-data` alias |

**Font size scale:** not customized anywhere in `tailwind.config.ts` — the stock Tailwind default scale (`text-xs` through `text-9xl`) is used as-is. There is no bespoke MOSAIC type scale to document beyond "Tailwind defaults"; if a future design pass wants one, it doesn't exist yet and would be new work, not a reconciliation.

**Usage rule:** `font-title` for section/page headings, `font-body` (inherited by default) for everything else, `font-mono` for any numeric or code-like value a user might need to scan precisely (price, equipment code, timestamp) — apply it every time a new such value is added, since the existing pattern is consistent enough to be a real convention, not incidental. `font-display` is reserved for the wordmark; do not reach for it for emphasis or hero text elsewhere, since nothing in the current app does that and Arkibal Display was licensed specifically as the brand mark.

---

## 3. Spacing Scale

Not customized — the stock Tailwind 4px-based scale applies throughout (`1`=4px, `2`=8px, `3`=12px, `4`=16px, `6`=24px, `8`=32px). Confirmed real usage pattern, by frequency across `frontend/src/components/**/*.tsx`:

- **Gap-first layout**: `gap-*` (on flex containers) is used far more than margin for spacing between elements — `gap-1`/`gap-2` most common, `gap-3`/`gap-4` next. Margin utilities are almost never used for layout (`mt-4` appears exactly once in the whole component tree).
- **Padding**: `px-2`/`py-1`/`py-2` most common for compact controls (nav items, badges); `p-6` specifically for Dialog content (`ui/dialog.tsx:41`); `p-2` for the floating toolbar's pill container.
- **One deliberate outlier**: `py-0.5` (2px) on `StatusBadge` for a tight status pill — the only sub-4px spacing value found anywhere.

**Usage rule:** prefer `gap-*` on a flex/grid container over `space-y-*`/margin utilities for spacing between siblings — this is the dominant, consistent pattern in the real codebase, not a style preference being introduced here. Reserve `p-6` for true modal/dialog content padding; use `p-2`–`p-4` for everything else, matching what's already there rather than introducing a new step in the scale.

**Border radius** (`tailwind.config.ts:60-66`): `DEFAULT`/`md`/`lg` are all `8px`, `sm` is `6px`, `full` is `9999px` (pill). Note `DEFAULT`/`md`/`lg` being identical is redundant — it doesn't create three real tiers, it just restates Tailwind's own default `lg` (≈8px) three times. Harmless as shipped, but not something to treat as a meaningful 3-step scale if extending it.

**Elevation/shadow:** no bespoke shadow tokens exist — stock `shadow-lg` (Dialog, Sheet) and `shadow-xl` + a custom `shadow-pix-black/10` tint (the floating reporting toolbar) are the only shadow usages in the entire codebase. This confirms a real, consistently-followed rule: **shadows are reserved for true floating/overlay surfaces (Dialog, Sheet, the reporting toolbar) — everywhere else, elevation is a hairline border** (`border-pix-black/10`-style), never a shadow. This rule's authoritative source is `docs/superpowers/specs/2026-09-18-mosaic-frontend-shell-design.md`, not `04_DESIGN_SYSTEM.md` (which doesn't actually state it) — cite the shell spec, not the design-system doc, if referencing where this rule comes from.

---

## 4. Component Library

The entire `ui/` folder — the actual design-system primitive layer — is **six components**: Button, Dialog, ErrorBanner, Input, Sheet, Skeleton. There is no Badge, Select, Calendar, Card, or Toast wrapper primitive, despite `04_DESIGN_SYSTEM.md` implying a fuller shadcn/Radix set. Radix usage itself is minimal: only `@radix-ui/react-dialog` and `@radix-ui/react-slot` are installed — `Sheet` is built on the *same* Dialog primitive as `Dialog`, just with a different slide-direction variant, not a distinct Radix component.

### Button — `ui/button.tsx`

- **Variants**: `default` / `destructive` / `outline` / `secondary` / `ghost` / `link`.
- **Sizes**: `default` / `sm` / `lg` / `icon`.
- **States**: hover (per-variant background shift), `focus-visible` (ring), `disabled` (50% opacity, pointer-events none). **No built-in loading state** — every caller that needs one passes `disabled={mutation.isPending}` and manually swaps the label text (confirmed in `TrainingGateModal`, `SsoPanel`, `AccountRequestDialog`). This is a real, live inconsistency risk: there's no enforced pattern, just three call sites independently reimplementing the same idea.
- **Polymorphism**: `asChild` (via Radix `Slot`) lets it render as a different element — used by `SheetTrigger asChild` in `EquipmentSheet`.
- **A11y**: relies entirely on native `<button>` semantics; adds nothing itself (callers must add e.g. `aria-pressed` themselves, as `TopNav`'s language switcher does — without using `Button` at all, notably).
- **Usage rule**: `default` for the primary action in a given context (confirm, submit); `destructive` for irreversible/damaging actions; `outline`/`secondary` for secondary actions alongside a primary one; `ghost` for low-emphasis inline actions; `link` for text-only actions. Until a shared loading affordance is built, new call sites should follow the existing disable+relabel pattern rather than inventing a fourth variant of it.

### Dialog — `ui/dialog.tsx`

- **Composition**: thin wrapper over `@radix-ui/react-dialog` — `Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription`, `DialogClose`. No `cva`, no variants.
- **States**: open/closed driven entirely by Radix `data-state` attributes with Tailwind `animate-in`/`animate-out` utilities.
- **A11y**: inherits Radix's focus trap, `Escape`-to-close, `aria-modal`, and title/description labelling; the close button carries a `sr-only` "Close" label.
- **Print behavior**: both `DialogOverlay` and `DialogContent` carry a `no-print` class, so open dialogs never appear in the print-to-PDF report — a deliberate, working integration with the reporting toolbar's print flow.
- **Usage rule**: use for focused, blocking decisions the user must resolve before returning to the main flow (confirmations, the training-gate quiz, the account-request wizard). Always supply `DialogTitle` — Radix expects it for correct a11y labelling.

### Sheet — `ui/sheet.tsx`

- **Variant**: `side` — `top`/`bottom`/`left`/`right`, default `right`. `left`/`right` render at `w-3/4 sm:max-w-sm`; `top`/`bottom` render full-width.
- **States/a11y**: identical to Dialog — it's the same Radix primitive underneath with a different slide animation per side.
- **Current usage**: exactly one consumer in the whole app — the Admin Equipment editor panel, always `side="right"`.
- **Usage rule**: reserve `Sheet` for longer-form editing that should feel like an extension of the page (keeping list context peripherally visible); reserve `Dialog` for short, focused confirmations. Don't reach for `Sheet` just for variety — right now its one real differentiator from `Dialog` in this codebase is the slide-in panel feel for editing a record in place.

### Input — `ui/input.tsx`

- **Variants**: none — a single visual style for all text/number/file inputs.
- **States**: `focus-visible` ring, `disabled` (reduced opacity, `cursor-not-allowed`), plus built-in file-input styling. **No error/invalid state** — validation errors are rendered as a separate sibling `<p className="text-sm text-status-offline">`, not wired via `aria-invalid`/`aria-describedby` to the input itself.
- **Confirmed inconsistency**: not every form actually uses it. `EquipmentForm` uses `Input` correctly for every field, but `RateCalculator`, `BookingConfirmationDialog`, `TopNav`'s role switcher, and `AccountRequestDialog`'s facility field all hand-roll a raw `<select>` with the literal duplicated class string `"rounded border border-pix-black/20 px-2 py-1"` — the same string, copy-pasted across at least five call sites in four files, with **no shared `Select` primitive existing at all**. This is a live maintenance risk, not a hypothetical one: a single visual tweak requires editing five places by hand today.
- **Usage rule**: use `Input` for every free-text/numeric field, full stop — no exceptions, since the inconsistency above is already a real problem, not a future risk. For any dropdown/select control, there is currently no primitive to reuse; new dropdown UI should either match the existing hand-rolled class string exactly (to avoid a sixth divergent copy) or — better — this is the strongest concrete candidate in the whole codebase for a new `ui/select.tsx` primitive (see §5).

### ErrorBanner — `ui/error-banner.tsx`

- **Props**: `message: string` only — no variants despite the generic name.
- **A11y**: `role="alert"`.
- **Styling**: hard-coded to `status-offline` (red) — it can only ever look like an error.
- **Usage rule**: use for page/section-level errors that must be announced immediately to assistive tech (`role="alert"` interrupts). Do not use it for inline field validation (that's the separate ad hoc `<p>` pattern under Input, above) and do not use it for non-error info/warning banners — no variant exists for those, and reusing it for a warning would be actively misleading (red styling + `role="alert"` both signal "error" to sighted and assistive-tech users alike). If a warning/info banner is ever needed, that's new work, not a variant flip.

### Skeleton — `ui/skeleton.tsx`

- **Props**: `className` only — sized entirely by the caller, no built-in shapes.
- **States**: `animate-pulse` is the only visual state.
- **A11y**: `role="status"`, `aria-busy="true"`, `aria-live="polite"` — a correctly-formed loading-indicator pattern.
- **Usage rule**: use for any loading placeholder standing in for content about to load. This is already the established convention (`CLAUDE.md` names `Skeleton`/`ErrorBanner` explicitly as "the established loading/error UI conventions going forward") and is well-implemented as-is — no changes needed, just keep using it rather than inventing a bespoke spinner elsewhere.

### StatusBadge — `equipment/status-badge.tsx` *(feature-local, not in `ui/`, but functions as a primitive)*

- **"Variants"**: a plain object map (not `cva`) keyed by `EquipmentStatus` — `operational: 'bg-status-operational/10 text-status-operational'`, `maintenance: 'bg-status-maintenance/20 text-pix-black'` (falls back to black text for contrast against yellow, not the status color), `offline: 'bg-status-offline/10 text-status-offline'`.
- **States**: none — a static, non-interactive `<span>`.
- **A11y**: none beyond the visible translated text itself; no `aria-label` fallback.
- **Confirmed inconsistency**: `ScheduleBoard` uses it correctly, but the Admin Equipment Sheet's own status column bypasses it entirely and renders the raw, untranslated enum value (`operational`/`maintenance`/`offline`) as plain text — no color, no i18n. This is a one-line-citable bug, not a missing feature: the fix is reusing `StatusBadge`, not building anything new.
- **Usage rule**: use `StatusBadge` everywhere equipment status is shown to a user — no exceptions. The Admin Equipment Sheet should be fixed to match, deliberately, the next time that file is touched.

### Toast — `sonner` (third-party, no local wrapper)

- Mounted once as `<Toaster />` in the root layout; called directly via `import { toast } from 'sonner'` wherever needed (e.g. on booking confirmation).
- **Usage rule**: use for transient, non-blocking confirmation of a completed action. Never use for an error requiring explicit acknowledgment or that blocks further action — a toast auto-dismisses and isn't guaranteed to be read; use `Dialog` or `ErrorBanner` instead for anything that matters that much.

---

## 5. Duplicated Patterns Not Yet Promoted to Primitives

Concrete promotion candidates, ranked by how much current risk each one represents:

1. **Raw `<select>` styling** (`"rounded border border-pix-black/20 px-2 py-1"`) — duplicated verbatim across `RateCalculator` (×2), `TopNav`, `BookingConfirmationDialog`, `AccountRequestDialog`. **Highest-priority candidate** for a new `ui/select.tsx` — this is an active, not theoretical, maintenance cost today.
2. **"Simulate failure" dev/demo checkbox** — identical raw `<label><input type="checkbox">` markup in `TrainingGateModal` and `SsoPanel`. Worth a shared component if a third instance appears; not urgent at two.
3. **No step/progress indicator** despite two multi-step wizards (`TrainingGateModal`'s theory→quiz→result, `AccountRequestDialog`'s 3-step flow) — both just track step state internally and show a plain "step X of 3" string. Candidate for a shared step-indicator if a third wizard is ever added; not urgent at two, and neither current wizard is broken without one.
4. **`StatusBadge` inconsistently applied** (Admin Equipment Sheet bypasses it) — not a missing-primitive problem, a direct-fix problem. Don't build anything new for this; just reuse what exists.

---

## 6. Confirmed Divergences from `docs/04_DESIGN_SYSTEM.md`

1. **Status color hex values differ.** The doc specifies Operational = Emerald `#10B981`, Offline = Crimson `#EF4444`; the actual code (`tailwind.config.ts:30,32`) uses `#198038` and `#C0362C`. Only `maintenance` (`#FFCD01`) matches.
2. **Body font fallback stack differs.** The doc lists `['Aptos', 'Inter', 'sans-serif']`; the code has no `Inter` fallback at all.
3. **Font implementation details absent from the doc**: Eurostile has only a Regular weight file (bold is browser-synthetic), and IBM Plex Mono is a Google Font, not a locally-licensed asset like the other three — both real constraints, neither mentioned in the intent doc.
4. **A full shadcn/Radix primitive set is implied but doesn't exist.** Only 6 primitives exist in `ui/`; there is no Badge, Select, Calendar, Card, or Toast wrapper.
5. **`darkMode`/`cssVariables` theming is configured but entirely unimplemented** — zero `dark:` usages, no `:root` CSS variables.
6. **The "shadows only on overlays" rule is real and correctly followed in code**, but its actual source is the frontend-shell design spec, not `04_DESIGN_SYSTEM.md` (which doesn't state it explicitly).

One thing that *does* match closely: the floating reporting toolbar (`reporting/floating-toolbar.tsx`) is close to a verbatim implementation of the doc's own embedded code sample — worth noting as the one place intent and reality agree almost exactly, rather than treating every divergence as universal.

---

## Recommendation

`04_DESIGN_SYSTEM.md` is currently referenced elsewhere in this repo (`CLAUDE.md`, the frontend-shell spec) as if it were authoritative ground truth, but §6 above shows it has drifted from the real, shipped values and structure. This document doesn't resolve that by itself — deciding whether to update `04_DESIGN_SYSTEM.md` to match reality, or to explicitly relabel it as forward-looking/aspirational rather than current, is a call for a future session to make deliberately, not something to silently overwrite here.

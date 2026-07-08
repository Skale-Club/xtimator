# Stack Research

**Domain:** Incremental UI/UX refresh on an existing production SaaS — v4.18 Estimate Document & Send Experience Refresh (Xtimator)
**Researched:** 2026-07-08
**Confidence:** HIGH (every claim below verified directly against `package.json`, the lockfile, and live source files in this repo — not training-data guesses)

## Bottom Line

**Zero new runtime dependencies are required for any of the 4 target features.** Every capability needed (short unguessable tokens, slug generation, an adaptive popover/bottom-sheet, a flexible per-row settings bag, a command-palette client picker) is either a Node.js built-in already used elsewhere in this codebase, or an npm package already declared in `package.json` and already wrapped as a shadcn/ui primitive in `components/ui/`. This milestone is UI/UX consolidation + one migration, not a new subsystem — treat any proposal to add a package as a red flag requiring justification.

## Recommended Stack

### Core Technologies (all ALREADY INSTALLED — reuse, do not reinstall)

| Technology | Version (from package.json) | Purpose in this milestone | Why Recommended |
|------------|------------------------------|----------------------------|------------------|
| `radix-ui` (unified meta-package) | `^1.4.3` | Backs `components/ui/popover.tsx` (`Popover as PopoverPrimitive`) and `components/ui/sheet.tsx` (`Dialog as SheetPrimitive`) | This project already consolidated onto the single `radix-ui` meta-package instead of per-primitive `@radix-ui/react-*` packages — confirmed by reading both files. Both the desktop-popover and mobile-bottom-sheet needed for the settings panel (feature 1) are 1-import-away, already themed to the app's glass design system. |
| `cmdk` | `^1.1.1` | Powers `components/ui/command.tsx` (shadcn `Command`) | Already the command-palette search-select primitive used in production for a client picker — see `components/workspace/link-client-card.tsx` and `link-client-button.tsx`, both of which combine `Popover` + `Command`/`CommandInput`/`CommandGroup`/`CommandItem` to search & select a client. This is *exactly* the pattern feature 4 needs to consolidate. |
| Node.js built-in `node:crypto` | Runtime (Node ≥20.9, required by Next.js 16.2.6 — [nextjs.org/docs/app/guides/upgrading/version-16](https://nextjs.org/docs/app/guides/upgrading/version-16)) | Short unguessable token suffix for friendly estimate URLs (feature 2) | `crypto.randomUUID()` is already used pervasively client-side (`components/workspace/photos/photo-drop-zone.tsx`, `components/settings/team-section.tsx`, `components/workspace/estimate/use-estimate-reducer.ts`, `components/projects/text-describe.tsx`). Server-side, `crypto.randomBytes(n).toString('base64url')` gives a short, URL-safe, cryptographically-random suffix — `base64url` encoding has been stable in Node since v15.7, far below this project's Node ≥20.9 floor. No new package needed. |
| Existing `slugify()` pattern | N/A (hand-rolled, ~1 line) | `companySlug` / `estimateSlug` generation (feature 2) | `app/admin/blog/actions.ts` already has a proven, dependency-free slugify: `s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')`, used to derive `blog_posts.slug`. Reuse the same one-liner (extract to `lib/utils/slugify.ts` if it needs to be shared) rather than pulling in an npm slug library. |
| Postgres `gen_random_uuid()` (pgcrypto) | Already in use | Precedent for DB-side token generation | The *existing* `estimates.share_token` column is defined as `UUID DEFAULT gen_random_uuid()` (`supabase/migrations/20260409000001_initial_schema.sql:94`) — i.e., today's bearer token is generated entirely DB-side, not in application code. This confirms the project already has both DB-side and (per above) app-side random-token idioms available; for a *short* suffix, app-side `crypto.randomBytes` is the simpler choice since it gives control over length/charset that a raw UUID does not. |

### Supporting Libraries — none new

| Library | Status | Notes |
|---------|--------|-------|
| `zod` | Already `^4.3.6` | Validate the new settings-panel payload / slug+token route params the same way every other server action in this codebase validates input (`lib/schemas/`). No new validation library needed. |
| `react-hook-form` + `@hookform/resolvers` | Already `^7.72.1` / `^5.2.2` | The settings panel's tax/discount/deposit override fields are ordinary form fields — reuse the existing RHF + zod pattern used throughout `components/workspace/`. |
| `date-fns` | Already `^4.1.0` | If any settings-panel UI needs relative/formatted dates, this is already the project's date library — do not add `dayjs` or `luxon`. |

### Development Tools — none needed

No new dev-time tooling is required. Type regeneration (`types/database.types.ts`) will be needed after the new migration for feature 1's settings column and feature 2's `companies.slug`/`estimates.slug` columns, using whatever existing Supabase CLI workflow this repo already uses — that's a process step, not a new dependency.

## Installation

```bash
# No installation required. Zero new packages for this milestone.
# All 4 target features are satisfied by dependencies already declared in package.json:
#   radix-ui, cmdk, zod, react-hook-form — plus Node's built-in `crypto` module.
```

## Answers to the 4 Specific Questions

### (a) Slug generation / short unguessable public tokens

**Node's built-in `crypto` suffices — no new library.**

- Confirmed nothing like `nanoid`, `uuid`, `shortid`, `cuid2`, or `hashids` is a *direct* dependency in `package.json`.
- `nanoid@3.3.12` DOES appear in `pnpm-lock.yaml` / `package-lock.json`, but only as a **transitive** dependency of `postcss` (verified: `pnpm-lock.yaml` shows `postcss@8.4.31`/`8.5.15` → `dependencies: nanoid: 3.3.12`). It is not declared in `package.json`'s `dependencies`, so importing it directly would be fragile (relies on flat-node_modules hoisting, no types guarantee, could silently break on a future postcss bump that changes/drops nanoid). **Do not import it.**
- Use `crypto.randomBytes(6).toString('base64url')` (8 url-safe characters, ~48 bits of entropy — plenty for a share-link secret suffix that isn't the *sole* auth boundary, since RLS + the service-role lookup pattern already used by `app/estimate/[token]/actions.ts` bounds the blast radius) or `crypto.randomBytes(8)` for extra margin. This mirrors the `crypto.randomUUID()` idiom already used in 4+ client components in this repo.
- Slug: reuse the existing regex `slugify()` from `app/admin/blog/actions.ts` — proven in production for `blog_posts.slug`, zero dependencies, trivially extracted to a shared `lib/utils/slugify.ts` if both blog and estimate/company code need it.
- Backward compatibility (old `/estimate/{share_token}` links must keep working) is a routing/lookup concern, not a stack concern — both the legacy UUID `share_token` and the new `{shortToken}` suffix can be looked up the same way `app/estimate/[token]/actions.ts` already does (`eq('share_token', token)` today; add a second lookup path for the new slug+shortToken shape).

### (b) Popover + Sheet/Drawer primitive for a settings panel (desktop-popover / mobile-bottom-sheet)

**Already shipped — `components/ui/popover.tsx` and `components/ui/sheet.tsx` both exist and are both Radix-based via the unified `radix-ui` package. No `vaul` needed.**

- `components/ui/popover.tsx` wraps `Popover as PopoverPrimitive` from `radix-ui` — standard anchored popover, already themed (`bg-popover`, glass tokens elsewhere in the app).
- `components/ui/sheet.tsx` wraps `Dialog as SheetPrimitive` from `radix-ui` and **already supports `side="bottom"`**, styled with the app's glassmorphism tokens and rounded top corners (`inset-x-0 bottom-0 h-auto border-t border-[var(--glass-border)] rounded-t-[var(--radius-lg)]`) — this is functionally a bottom sheet today, just without vaul's drag-to-dismiss gesture/snap-points.
- Confirmed via repo-wide search that `vaul` is **not installed and not imported anywhere** (only unrelated substring false-positives like "vault" turned up).
- For switching between the two based on viewport, this codebase already has a precedent — an ad hoc `window.matchMedia('(max-width: 767px)')` check in `components/workspace/project-workspace.tsx:76` (no dedicated hook library such as `usehooks-ts` or `@uidotdev/usehooks` is installed). Reuse that same breakpoint/pattern (or extract it into a tiny local `useIsMobile()` hook) to decide whether the gear button opens `<Popover>` or `<Sheet side="bottom">`.
- **Optional, explicitly deferrable:** if product wants true swipe-to-dismiss / snap-point gestures on the mobile settings sheet (beyond what Radix Dialog + CSS gives), `vaul` (`^1.x`) is the standard React drawer library and would be a legitimate *future* addition — but it is not required to ship this milestone's stated goal ("bottom sheet on mobile") and should not be added preemptively.

### (c) JSONB vs typed nullable columns for per-estimate presentation settings

**Follow the `companies.tax_config` precedent: a nullable JSONB column + a typed TS interface + a permissive type-guard that degrades to defaults.** This is a stronger, more specific precedent in this codebase than `billing_config` for a *per-row* settings bag.

- `companies.tax_config` (JSONB, nullable) is read in `lib/services/generate-estimate.ts` and modeled in `lib/estimate/compute-totals.ts` as:
  ```ts
  export interface TaxConfig {
    rates: { labor?: number; materials?: number; other?: number }
    default_rate?: number
  }
  function isTaxConfig(value: unknown): value is TaxConfig {
    return typeof value === 'object' && value !== null && 'rates' in value &&
      typeof (value as { rates: unknown }).rates === 'object' && (value as { rates: unknown }).rates !== null
  }
  ```
  A malformed/absent value **degrades to the flat retrocompat path** rather than throwing (GUARD-03 never-throw discipline) — this is the exact resilience shape a per-estimate settings bag needs (missing/malformed settings → sane defaults, never a broken document).
- `lib/billing/billing-config.ts` shows the *singleton* analog of the same idea: one JSONB `metadata` column on `platform_integrations`, read through a server-only typed getter (`getBillingConfig()`) that deep-merges the stored value over a `DEFAULT_BILLING_CONFIG` constant. Mirror this shape for the estimate-level reader (e.g. `getEstimateSettings(estimate)` merging over a `DEFAULT_ESTIMATE_SETTINGS`), just scoped per-row instead of platform-wide.
- **Why JSONB and not typed columns for the section-visibility toggles + overrides bag specifically:** the existing `estimates` table already demonstrates the project's actual convention — fields consumed *directly by the deterministic math engine* or needing to be individually queryable/indexed get **discrete typed nullable columns** (`discount_type`, `discount_value`, `discount_amount`, `tax_rate`, `tax_amount`, `payment_terms`, `timeline`, `warranty_terms`, `notes`, `summary` — confirmed in `types/database.types.ts:765-807`). A document-section-visibility toggle set (summary/sections/payment terms/timeline/warranty/notes/photos shown-or-hidden) is opaque UI preference data with no query/index need and a shape that will keep growing — exactly what `tax_config` JSONB already models successfully. **Do not** add 7+ new boolean columns for section toggles; **do** add one JSONB column (e.g. `estimates.display_settings` or `estimates.presentation_config`) for those, while any NEW tax/discount/deposit *override* value that the math engine must consume directly should extend the existing discrete-column family (or reuse the dormant `deposit_type`/`deposit_value` columns already authored in the Phase 129 pricing-schema migration per PROJECT.md) rather than being buried in JSONB — keep server-math inputs typed/columnar, keep display preferences JSONB.

### (d) Command-palette-style search-select for the client picker

**Already installed and already used exactly this way — `cmdk` (`^1.1.1`) wrapped as `components/ui/command.tsx`, consumed today by 2 of the 3 duplicated client-picker components.**

- `components/workspace/link-client-card.tsx` and `components/workspace/link-client-button.tsx` are near-identical: both render `<Popover><PopoverTrigger>...</PopoverTrigger><PopoverContent><Command><CommandInput .../><CommandGroup>{clients.map(c => <CommandItem .../>)}</CommandGroup></Command></PopoverContent></Popover>`, fetching `/api/clients` client-side and filtering by name/email.
- The third duplicate mentioned in the milestone brief (`LinkClientInline`) was not found under that exact name in the current tree (grep found only `link-client-card.tsx`, `link-client-button.tsx`, `estimate-document.tsx`, `client-tab.tsx`, `overview-tab.tsx` referencing client-linking) — it may be inline logic inside `estimate-document.tsx`/`client-tab.tsx` rather than a separate file; worth a quick look during planning to confirm the exact 3rd implementation, but the *pattern* to consolidate around is unambiguous either way: `Popover` + `Command` (this repo's existing shadcn wrapper), not a new library.
- **Consolidation approach:** extract the shared `ClientList`/search-and-select logic (currently copy-pasted between the two files above) into one component (matching the milestone's stated goal), parameterized by trigger style (card button vs. inline hover-icon vs. pill) and `onSelect` callback — a refactor, not a new dependency.

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|--------------|
| `nanoid` (as a direct dependency) | Only present as a transitive dep of `postcss` today — not in `package.json`, fragile to import directly, no version guarantee across postcss upgrades | `crypto.randomBytes(n).toString('base64url')` (Node built-in, already the project's idiom via `crypto.randomUUID()`) |
| `uuid` (npm package) | Node's built-in `crypto.randomUUID()` already covers every UUID need this codebase has (used in 4+ places already) | `crypto.randomUUID()` |
| `vaul` | Not installed, not needed to meet the stated "bottom sheet on mobile" requirement — the existing `components/ui/sheet.tsx` already renders a bottom sheet via Radix Dialog + `side="bottom"` | `components/ui/sheet.tsx` with `side="bottom"`; revisit only if product explicitly asks for swipe-to-dismiss/snap-point gestures beyond what ships this milestone |
| `slugify` / `speakingurl` / `@sindresorhus/slugify` (npm packages) | This codebase already has a proven zero-dependency `slugify()` one-liner in production use for `blog_posts.slug` | Reuse/extract the existing `app/admin/blog/actions.ts` `slugify()` function |
| `react-select`, `downshift`, or any other combobox/autocomplete library | `cmdk` (already installed) + the existing shadcn `Command` wrapper already implements exactly this UX and is already proven across 2 client-picker components | `components/ui/command.tsx` (`cmdk`) |
| A brand-new "presentation settings" table | Overkill for a per-estimate preference bag; `companies.tax_config`'s JSONB-on-the-owning-row pattern already solves this at the right granularity | A nullable JSONB column directly on `estimates` |
| Adding 7+ new boolean columns to `estimates` for section-visibility toggles | Breaks the established convention (discrete columns reserved for math-engine inputs / queryable fields); adds migration churn every time a new toggle is needed | One JSONB `display_settings`-style column, typed + type-guarded like `TaxConfig` |
| `usehooks-ts` / `@uidotdev/usehooks` (for a `useMediaQuery`/`useIsMobile` hook) | The codebase already has an inline `window.matchMedia('(max-width: 767px)')` precedent (`project-workspace.tsx:76`); a whole utility-hooks package is unjustified for one breakpoint check | Reuse the existing inline `matchMedia` pattern, or extract it locally into a ~10-line hook if reused 3+ times |

## Stack Patterns by Variant

**If the settings-panel trigger needs to work identically across desktop and mobile without a media-query hook:**
- Render both `<Popover>` (wrapping the gear button, desktop breakpoint) and `<Sheet side="bottom">` (mobile breakpoint) behind the same `open` state, gated by Tailwind responsive utility classes on separate trigger/wrapper elements, OR gate which component mounts via the existing `window.matchMedia` check — either is consistent with existing patterns in this repo (both `Sheet`-based mobile nav and Tailwind-responsive conditional rendering already appear elsewhere in `components/workspace/`).
- Because: avoids adding a new "responsive dialog" abstraction/library (e.g. `vaul`+`cmdk`-combo "Credenza" pattern some OSS templates ship) when two already-themed primitives (`Popover`, `Sheet`) cover both cases.

**If the new friendly estimate URL needs the short token to be re-derivable/regenerable (e.g. owner wants to rotate a leaked link):**
- Keep generating the short suffix app-side with `crypto.randomBytes` at write time (not a Postgres `DEFAULT`), since app-side gives you the freedom to regenerate on demand from a server action, whereas the current `share_token`'s `DEFAULT gen_random_uuid()` only fires once at row-insert.
- Because: the milestone requires the OLD `share_token`-only links to keep working forever, so the new short-token column is additive, not a replacement of the DB-default column — no schema change to `share_token` itself, just a new nullable column populated by application code.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|------------------|-------|
| `radix-ui@^1.4.3` | `react@19.2.4` / `react-dom@19.2.4` / `next@16.2.6` | Already proven in production in this exact repo — `Popover` and `Dialog` (Sheet) primitives from the same unified package are already imported and rendering correctly today; no upgrade needed. |
| `cmdk@^1.1.1` | `radix-ui@^1.4.3` (via `components/ui/command.tsx`'s `CommandDialog` which wraps the app's `Dialog`) | Already wired together and shipping in `link-client-card.tsx` / `link-client-button.tsx` — zero compatibility risk since it's already load-bearing production code. |
| Node built-in `crypto.randomBytes(...).toString('base64url')` | Node ≥15.7 (project floor: Node ≥20.9, required by Next.js 16.2.6) | Comfortably within range; no polyfill or package needed. |

## Sources

- `C:\Users\Vanildo\Dev\xtimator\package.json` — full dependency list verified directly (no version guessed)
- `C:\Users\Vanildo\Dev\xtimator\pnpm-lock.yaml` / `package-lock.json` — confirmed `nanoid@3.3.12` is transitive-only (via `postcss`), not a direct dependency
- `C:\Users\Vanildo\Dev\xtimator\components\ui\popover.tsx`, `sheet.tsx`, `command.tsx` — confirmed existing shadcn/Radix/cmdk wrappers and their exact import sources (`radix-ui` unified package, `cmdk`)
- `C:\Users\Vanildo\Dev\xtimator\components\workspace\link-client-card.tsx`, `link-client-button.tsx` — confirmed existing production Popover+Command client-picker pattern (the precedent for feature 4)
- `C:\Users\Vanildo\Dev\xtimator\lib\estimate\compute-totals.ts` — confirmed `TaxConfig` JSONB type + `isTaxConfig` type-guard degrade-to-default pattern (the precedent for feature 1's settings bag)
- `C:\Users\Vanildo\Dev\xtimator\lib\billing\billing-config.ts` — confirmed the singleton JSONB+typed-reader-with-defaults pattern (`billing_config`)
- `C:\Users\Vanildo\Dev\xtimator\types\database.types.ts` (lines 765-891, `estimates` table) — confirmed current discrete-typed-column convention for math-engine-consumed fields
- `C:\Users\Vanildo\Dev\xtimator\app\admin\blog\actions.ts` — confirmed existing dependency-free `slugify()` precedent
- `C:\Users\Vanildo\Dev\xtimator\supabase\migrations\20260409000001_initial_schema.sql` (line 94) — confirmed `share_token UUID DEFAULT gen_random_uuid()` DB-side generation precedent
- `C:\Users\Vanildo\Dev\xtimator\components\workspace\project-workspace.tsx` (line 76) — confirmed existing `window.matchMedia` responsive-breakpoint precedent
- `C:\Users\Vanildo\Dev\xtimator\.planning\PROJECT.md` — v4.18 milestone context and target-feature descriptions
- [nextjs.org/docs/app/guides/upgrading/version-16](https://nextjs.org/docs/app/guides/upgrading/version-16) — verified Next.js 16 minimum Node.js requirement (≥20.9) via WebSearch, confirming `base64url` encoding (stable since Node 15.7) is safely available

---
*Stack research for: v4.18 Estimate Document & Send Experience Refresh (Xtimator)*
*Researched: 2026-07-08*

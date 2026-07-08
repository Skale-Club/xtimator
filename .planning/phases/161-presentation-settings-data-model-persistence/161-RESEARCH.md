# Phase 161: Presentation Settings Data Model & Persistence - Research

**Researched:** 2026-07-08
**Domain:** Supabase Postgres schema (dormant-first JSONB) + a pure TypeScript resolver module, on an existing Next.js 14 App Router / Supabase estimate pipeline
**Confidence:** HIGH — every finding is grounded in direct inspection of the current codebase (files/lines cited throughout), not training-data assumptions.

## Summary

This phase adds exactly one new nullable JSONB column (`estimates.presentation_settings`) and one new pure resolver module (`lib/estimate/presentation-settings.ts`), mirroring a pattern this codebase has already proven twice: `companies.tax_config` + `isTaxConfig()` in `lib/estimate/compute-totals.ts`, and `platform_integrations.metadata` + `getBillingConfig()` in `lib/billing/billing-config.ts`. Both precedents share the same shape — nullable/absent storage, a type guard that never throws, and defaults that degrade to today's behavior. `presentation_settings` follows the same recipe: `NULL` = show everything (byte-identical retrocompat), malformed/partial JSON degrades safely, and the resolver is 100% pure (no DB calls, no side effects).

Tax/Discount/Deposit calculation columns are **already fully built** by Phase 129 (`tax_rate`, `discount_type`/`discount_value`, `deposit_type`/`deposit_value` on `estimates`; `tax_config` on `companies`) and already flow through `computeEstimateTotals`. This phase does **not** add new calculation columns — CONTEXT.md's decision that "Tax Off" must preserve the underlying rate (not mutate `tax_rate = 0`) means the *state* of "is tax off" cannot be represented by the existing `tax_rate` column alone (setting `tax_rate = 0` destroys the original value). That state belongs in the new `presentation_settings` JSONB bag too, as an override-resolution layer that the resolver reads and turns into the exact `taxRate`/`discountType`/`depositType` inputs `computeEstimateTotals` already accepts — the engine itself stays untouched (GUARD-03).

`saveEstimate`'s `SaveEstimateInput` (`lib/actions/estimate.ts:70-97`) needs exactly one new optional field, passed straight to the `estimates` UPDATE payload with zero interaction with the `computeEstimateTotals` call — the engine's own inputs (`taxRate`, `discountType`, `discountValue`, `depositType`, `depositValue`) are unchanged. `use-estimate-reducer.ts` needs one new state field + one new action (`UPDATE_PRESENTATION_SETTINGS`), following the exact shape of the existing `UPDATE_DISCOUNT`/`UPDATE_DEPOSIT` actions (state field + `isDirty: true`, no `recalculate()` call since visibility never touches totals math).

Because every existing read path in `lib/queries/estimate.ts` uses `.select('*')` (`getProjectEstimates`, `getCurrentEstimate`, `getEstimateById`), the new column is automatically included everywhere those functions are used — no query-layer changes needed in this phase. The one exception (WhatsApp's narrow `estimates` select in `lib/whatsapp/send-estimate.ts:46-59`) is explicitly Phase 163's job to widen, per CONTEXT.md's phase boundary.

**Primary recommendation:** One migration (`ALTER TABLE estimates ADD COLUMN IF NOT EXISTS presentation_settings JSONB`), one new pure module exporting `resolvePresentationSettings()` + `isSectionVisible()` + a `PresentationSettings`/`ResolvedPresentationSettings` type pair, a pass-through field in `SaveEstimateInput`, a pass-through state field + action in the reducer, and a focused unit-test suite proving defaulting, round-trip persistence, non-destructive hiding, and NULL retrocompat — nothing more. No renderer files are touched (Phase 163's job); no UI is built (Phase 162's job).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PRESENT-01 | Every estimate has a persisted `presentation_settings` record (dormant-first JSONB, NULL = today's behavior) covering visibility of Summary, Line Sections/Scope Details, Payment Terms, Timeline, Warranty, Notes, Attached Photos | Migration approach section (mirrors `tax_config`'s exact idiom); `PresentationSettings` interface below covers all 7 fields |
| PRESENT-02 | Toggling a section's visibility off never deletes/clears its underlying generated content — preserved and restored on toggle-back-on | Resolver is purely a boolean read over a *separate* JSONB bag — never touches `summary`/`notes`/etc. content columns; contrasts directly with today's destructive `toggleField()` (documented below) so the plan can prove non-destructiveness at the data level |
| PRESENT-03 | An estimate can override Tax (Default/Custom/Off), Discount, and Deposit independently of company defaults, scoped to that estimate only | "Existing tax/discount/deposit columns" section below — documents exactly what Phase 129 built and what new override-state fields belong in `presentation_settings` vs. what's already a typed column |
| PRESENT-04 | A single pure resolver module is the one place that decides section visibility — no renderer re-implements its own check | `lib/estimate/presentation-settings.ts` exact exports specified below, modeled on `isTaxConfig()`'s never-throw discipline |
| PRESENT-05 | If an estimate has already been sent/viewed, changing settings shows a non-blocking notice (UI is Phase 162's job — this phase makes the signal resolvable) | "Already-sent/viewed detection" section below — `estimates.sent_at`/`estimates.viewed_at` already exist and are already selected by every `.select('*')` read path |
</phase_requirements>

## Files to change

| File | What changes | Why |
|------|---------------|-----|
| `lib/actions/estimate.ts` | `SaveEstimateInput` interface gains one new optional field: `presentation_settings?: PresentationSettings \| null`. In `saveEstimate()`, add `presentation_settings: estimateData.presentation_settings ?? null` to the `.update({...})` payload (around line 176-196) — a **pass-through only**, added alongside the existing fields, never read by the `computeEstimateTotals(...)` call above it (lines 120-139). | This is the ONLY write path for estimate-level settings; must stay a pure pass-through per GUARD-03/CONTEXT.md decision that presentation settings have "zero interaction with the deterministic totals engine." |
| `components/workspace/estimate/use-estimate-reducer.ts` | 1) `EstimateEditorState` gains `presentation_settings: PresentationSettings \| null`. 2) `EstimateAction` union gains `{ type: 'UPDATE_PRESENTATION_SETTINGS'; presentation_settings: PresentationSettings }`. 3) `estimateReducer` gains a case that does `return { ...state, presentation_settings: action.presentation_settings, isDirty: true }` — **no `recalculate()` call**, matching the fact that visibility never affects totals. 4) `initState()` reads `(estimate as { presentation_settings?: PresentationSettings \| null }).presentation_settings ?? null` off the server row (same cast-with-fallback pattern already used for `deposit_type`/`deposit_value`/`estimate_date` at lines 224-229). | This is the state the (future, Phase 162) settings panel will dispatch into, and what `stateToSavePayload()`/`stateToDocumentData()` (Phase 162/163) will read from. Landing the plumbing now means Phase 162 only adds UI, not data flow. |
| `lib/queries/estimate.ts` | `Estimate` interface gains `presentation_settings: PresentationSettings \| null` (typed field, mirroring how `public_slug_token`/`deposit_type` were added in Phase 129/160). No query changes needed — `getProjectEstimates`, `getCurrentEstimate`, `getEstimateById` all use `.select('*')` (lines 87, 100, 116) so the new column flows through automatically. | Establishes the canonical TS type for the column at its source of truth; zero runtime query changes required (confirmed by reading all three functions). |

## Files intentionally NOT touched in this phase

| File | Why it's out of scope here |
|------|------------------------------|
| `components/workspace/estimate/estimate-document.tsx` | Contains the destructive `toggleField()`/`isFieldVisible()`/`AddDetailsPopover` (lines 1470-1522, 1613-1632) — read for context only. CONTEXT.md and PITFALLS.md Pitfall 2 both explicitly assign the *replacement* of this mechanism to Phase 162. This phase's resolver is built and unit-tested in isolation; it is not yet imported here. |
| `components/pdf/estimate-pdf.tsx`, `estimate-pdf-modern.tsx`, `components/share/estimate-document-modern.tsx`, `lib/utils/estimate-template.ts`, `lib/whatsapp/formatter.ts`, `lib/whatsapp/send-estimate.ts` | The 6 render/format consumers — Phase 163's job per ARCHITECTURE.md's "Integration Architecture (a)" table and CONTEXT.md's phase boundary. Wiring the resolver into these before Phase 163 both scope-creeps and risks colliding with Phase 163's own planned diff. |
| `components/workspace/estimate/estimate-editor.tsx` (`stateToDocumentData`/`stateToSavePayload`) | ARCHITECTURE.md flags these as needing a `presentation_settings` pass-through, but they are the bridge INTO `estimate-document.tsx`'s UI, which this phase does not touch. Recommend deferring these two function edits to Phase 162 alongside the UI wiring — OR, at Claude's discretion during planning, add the two trivial pass-through lines here since they're pure plumbing with no UI/visual surface. Either placement satisfies PRESENT-01; flagged as a phase-boundary judgment call, not a research gap. |

## New files

| File | Purpose |
|------|---------|
| `lib/estimate/presentation-settings.ts` | The one new module. Exports the `PresentationSettings` type, `resolvePresentationSettings()`, `isSectionVisible()`, and (recommended) a small `resolveTaxOverride()`-style helper for the Tax Default/Custom/Off state — see "Exact functions/types to add" below. Pure — no imports from `@supabase/*`, no `'use server'`, no side effects. |
| `supabase/migrations/20260708000002_phase161_presentation_settings.sql` (exact timestamp TBD by planner — see Migration approach) | The dormant-first column + index/comment, mirroring `20260627000001_phase129_advanced_pricing_schema.sql` and `20260708000001_phase160_public_url_contract.sql` exactly. |
| `tests/unit/estimate/presentation-settings.test.ts` | Unit tests for the resolver — defaulting, round-trip, non-destructive-hiding proof, NULL retrocompat (see Validation Architecture). Mirrors `tests/unit/estimate/compute-totals-guards.test.ts`'s style (vitest `describe`/`it`, hand-computed goldens, no mocking). |

## Migration approach

**Convention confirmed from `supabase/migrations/`:** filenames are `{YYYYMMDDHHMMSS-ish counter}_{phaseNNN or description}.sql`, one concern per file, idempotent (`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`), always carrying a `COMMENT ON COLUMN` explaining the dormant/retrocompat contract. The most recent migration is `20260708000001_phase160_public_url_contract.sql` (same day, Phase 160, first of today's migrations) — this phase's migration should be `20260708000002_phase161_presentation_settings.sql` (increment the sequence, same date, since Phase 161 lands same-day per the roadmap sequencing). **All migrations in this repo are "authored-only"** — committed and carried by CI→GHCR→Coolify, never applied directly via `supabase db push` from a dev machine (per the header comment convention in every existing migration file). The planner should follow this exact deployment discipline, not attempt a live `apply_migration` against the Supabase project.

```sql
-- supabase/migrations/20260708000002_phase161_presentation_settings.sql
-- Phase 161 (PRESENT-01/02/03): per-estimate presentation + pricing-override
-- settings, dormant-first. Mirrors 20260627000001_phase129_advanced_pricing_schema.sql's
-- exact idiom (companies.tax_config) and 20260708000001_phase160_public_url_contract.sql's
-- same-day sequencing.
--
-- Authored-only -- carried by CI->GHCR->Coolify; NOT applied on the VPS
-- (never `supabase db push` from a dev machine). Idempotent (ADD COLUMN IF
-- NOT EXISTS).
--
-- NOT a calculation column: Tax/Discount/Deposit CALCULATION inputs already
-- exist as typed columns on `estimates` (deposit_type/deposit_value, tax_rate,
-- discount_type/discount_value -- Phase 129) and are read directly by
-- computeEstimateTotals (lib/estimate/compute-totals.ts). This column stores
-- ONLY: (a) section-visibility flags, and (b) the estimate-scoped OVERRIDE
-- *state* (Default/Custom/Off for tax; enabled/disabled flags for
-- discount/deposit) that the Phase 161 resolver (lib/estimate/presentation-settings.ts)
-- turns into the exact inputs computeEstimateTotals already accepts. The
-- engine itself is never modified (GUARD-03).

ALTER TABLE estimates ADD COLUMN IF NOT EXISTS presentation_settings JSONB;

COMMENT ON COLUMN estimates.presentation_settings IS
  'Per-estimate document presentation + pricing-override settings (PRESENT-01..05). NULL = show everything, use company defaults (retrocompat). Read EXCLUSIVELY through lib/estimate/presentation-settings.ts -- never by ad hoc field != null checks (see PITFALLS.md #1, settings-drift). Section-visibility flags here are presentation-only and never reach lib/estimate/compute-totals.ts; tax/discount/deposit OVERRIDE STATE here resolves to inputs the existing engine already accepts.';
```

No index is needed — this column is never filtered/queried on, only read per-row (same as `companies.tax_config`, which also has no index).

## Exact functions/types to add

All in `lib/estimate/presentation-settings.ts`. Modeled directly on `isTaxConfig()`'s never-throw discipline (`lib/estimate/compute-totals.ts:71-79`) and `getBillingConfig()`'s shallow-merge-over-defaults pattern (`lib/billing/billing-config.ts:143-170`).

```typescript
// lib/estimate/presentation-settings.ts
// PRESENT-01..05: the ONE place that decides (a) section visibility and
// (b) estimate-scoped tax/discount/deposit OVERRIDE STATE. Pure — no DB
// calls, no side effects. Malformed/absent input degrades to defaults,
// never throws (mirrors isTaxConfig()'s discipline).

export type SectionKey =
  | 'summary'
  | 'sections'        // Line Sections / Scope Details
  | 'payment_terms'
  | 'timeline'
  | 'warranty_terms'
  | 'notes'
  | 'photos'

export interface SectionVisibility {
  summary?: boolean
  sections?: boolean
  payment_terms?: boolean
  timeline?: boolean
  warranty_terms?: boolean
  notes?: boolean
  photos?: boolean
}

/** Tax override state. 'default' = use company tax_config/default_tax_rate
 *  unchanged. 'custom' = use customRate. 'off' = enabled:false but originalRate
 *  is PRESERVED (never mutated to 0) so re-enabling restores the exact value —
 *  this is the CONTEXT.md-locked "Tax Off never mutates tax_rate=0" contract. */
export interface TaxOverride {
  mode: 'default' | 'custom' | 'off'
  customRate?: number | null
  /** The rate to restore when toggling OFF back to 'default'/'custom'. Captured
   *  at the moment 'off' is first set; never itself mutated by the 'off' state. */
  preservedRate?: number | null
}

export interface DiscountOverride {
  enabled: boolean
  type?: 'amount' | 'percent' | null
  value?: number | null
}

export interface DepositOverride {
  enabled: boolean
  type?: 'amount' | 'percent' | null
  value?: number | null
}

/** Raw shape persisted in estimates.presentation_settings (all fields optional —
 *  a partial/legacy object is valid input to resolvePresentationSettings). */
export interface PresentationSettings {
  sections?: SectionVisibility
  tax?: TaxOverride
  discount?: DiscountOverride
  deposit?: DepositOverride
}

/** Fully-defaulted, safe-to-read shape returned by resolvePresentationSettings.
 *  Every key is guaranteed present — no renderer needs `?? true` fallbacks. */
export interface ResolvedPresentationSettings {
  sections: Required<SectionVisibility>
  tax: TaxOverride
  discount: DiscountOverride
  deposit: DepositOverride
}

const DEFAULT_SECTION_VISIBILITY: Required<SectionVisibility> = {
  summary: true,
  sections: true,
  payment_terms: true,
  timeline: true,
  warranty_terms: true,
  notes: true,
  photos: true,
}

const DEFAULT_TAX_OVERRIDE: TaxOverride = { mode: 'default' }
const DEFAULT_DISCOUNT_OVERRIDE: DiscountOverride = { enabled: false }
const DEFAULT_DEPOSIT_OVERRIDE: DepositOverride = { enabled: false }

/**
 * Type guard + defaults-fill, mirroring isTaxConfig()'s degrade-safely
 * discipline. NULL / undefined / malformed input -> full defaults (= today's
 * behavior, everything visible, no overrides). A PARTIAL object (e.g. only
 * `sections.summary: false` set) fills every other key from defaults —
 * never throws, never returns `undefined` keys.
 */
export function resolvePresentationSettings(
  raw: unknown
): ResolvedPresentationSettings {
  const value = isPlainObject(raw) ? (raw as PresentationSettings) : {}

  return {
    sections: { ...DEFAULT_SECTION_VISIBILITY, ...(isPlainObject(value.sections) ? value.sections : {}) },
    tax: isValidTaxOverride(value.tax) ? { ...DEFAULT_TAX_OVERRIDE, ...value.tax } : DEFAULT_TAX_OVERRIDE,
    discount: isPlainObject(value.discount) ? { ...DEFAULT_DISCOUNT_OVERRIDE, ...value.discount } : DEFAULT_DISCOUNT_OVERRIDE,
    deposit: isPlainObject(value.deposit) ? { ...DEFAULT_DEPOSIT_OVERRIDE, ...value.deposit } : DEFAULT_DEPOSIT_OVERRIDE,
  }
}

/** The ONE predicate every renderer must call instead of `field != null`. */
export function isSectionVisible(
  settings: ResolvedPresentationSettings,
  section: SectionKey
): boolean {
  return settings.sections[section] !== false // absent/true -> visible; only explicit false hides
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isValidTaxOverride(v: unknown): v is TaxOverride {
  return isPlainObject(v) && (v.mode === 'default' || v.mode === 'custom' || v.mode === 'off')
}
```

**Design notes for the planner:**
- `isSectionVisible` reads `!== false` (not `=== true`) so a partially-populated settings object where a NEW section key (added in a future phase) hasn't been set yet still defaults to visible — same "add a toggle without a migration" extensibility CONTEXT.md/ARCHITECTURE.md call out as the reason for choosing JSONB.
- **Whether `resolvePresentationSettings` takes the raw estimate row or just the `presentation_settings` JSONB value directly is explicitly Claude's Discretion per CONTEXT.md.** The signature above takes the JSONB value directly (`raw: unknown`) — this matches `isTaxConfig(value: unknown)`'s own signature exactly (it also takes the raw config value, not the whole `companies` row) and keeps the function trivially unit-testable with plain object literals, no mock estimate rows needed. Recommend this shape unless the planner finds a concrete reason (e.g. needing `estimate.tax_rate` for `preservedRate` bootstrapping) to widen it to accept `{ presentation_settings, tax_rate, ... }`.
- The `TaxOverride.preservedRate` field is the mechanism satisfying CONTEXT.md's "Tax Off preserves the default rate" locked decision — it's data-model-only in this phase (the field exists and round-trips); the actual UI flow that sets it when the owner clicks "Off" is Phase 162's job.

## Existing tax/discount/deposit columns

**Already built by Phase 129** (`supabase/migrations/20260627000001_phase129_advanced_pricing_schema.sql`) — confirmed by direct read, this phase must NOT duplicate any of these:

| Column | Table | Type | Default | Notes |
|--------|-------|------|---------|-------|
| `tax_rate` | `estimates` | (pre-existing, not in Phase 129 migration) | — | Already read directly by `computeEstimateTotals` as `taxRate` |
| `tax_config` | `companies` | `JSONB` | `NULL` | Phase 129's own dormant-first precedent this phase mirrors; NULL = flat rate (retrocompat) |
| `discount_type` / `discount_value` | `estimates` | (pre-existing) | — | Read as `discountType`/`discountValue`; engine maps DB domain `'percentage'/'fixed'` → engine domain `'percent'/'amount'/'none'` in `saveEstimate()` (lines 113-118) |
| `deposit_type` | `estimates` | `TEXT NOT NULL` | `'none'` | CHECK constrained to `('none','percent','amount')` |
| `deposit_value` | `estimates` | `NUMERIC(12,2)` | `NULL` | |
| `balance_due` | `estimates` | `NUMERIC(12,2)` | `NULL` | Server-derived, never client-computed |
| `taxable` / `tax_category` / `discount` / `cost` / `markup_pct` | `estimate_items` | various | dormant defaults | Line-item level, not estimate-scoped — irrelevant to this phase's estimate-scoped overrides |

**What this phase adds ON TOP (not instead of):** the *override-state* dimension — is the estimate's tax in Default/Custom/Off mode, and (separately from the section-visibility flags) whether discount/deposit are estimate-scoped overrides vs. inheriting company defaults. These are new **state** fields inside `presentation_settings`, not new **calculation** columns. `computeEstimateTotals`'s existing `ComputeTotalsOptions` (`taxRate`, `taxConfig`, `discountType`, `discountValue`, `depositType`, `depositValue`) already accept everything the engine needs — the resolver's job (for Phase 162/163 to eventually call, not this phase) is turning `ResolvedPresentationSettings.tax`/`.discount`/`.deposit` into those exact option values, e.g. `tax.mode === 'off' ? 0-effective-but-preserved : tax.mode === 'custom' ? tax.customRate : company.default_tax_rate`. **This phase does not build that translation function** — CONTEXT.md scopes this phase to the resolver's visibility half plus the override-state *shape*; wiring the override state into an actual `computeEstimateTotals` call is implicitly part of Phase 162/163's "wire the settings panel" work, since only then does a UI exist to set these values. If the planner judges it cheap and low-risk to add a small `resolveTaxRateInput(settings, companyDefaultRate)`-style pure helper in this phase's module (fully unit-testable, zero consumer wiring), that is reasonable — but it is not required to satisfy PRESENT-03, which only requires the override to be *representable and resolvable*, not yet *consumed*.

## Already-sent/viewed detection

**Confirmed via direct read of `lib/queries/estimate.ts:41-43`:** the `Estimate` interface already has:
- `sent_at: string | null` — set by `markAsSentAction` (`lib/actions/estimate.ts:744-749`) and by the actual send routes.
- `viewed_at: string | null` — set by `logEstimateView` (`app/estimate/[token]/actions.ts`, per ARCHITECTURE.md/PITFALLS.md Pitfall 6) on first client open.

Both are already selected by every `.select('*')` read path (`getProjectEstimates`, `getCurrentEstimate`, `getEstimateById`), so **no schema or query change is needed** for PRESENT-05's data requirement. The condition to detect is simply `estimate.sent_at != null || estimate.viewed_at != null`. No `estimate_activity` table query is needed for this signal — the two denormalized timestamp columns on `estimates` itself are sufficient and already the fields CONTEXT.md names ("reuse existing status/view tracking — `estimates.viewed_at`/status fields").

**Recommendation for this phase:** either (a) leave this as documented knowledge for Phase 162 to consume directly (`estimate.sent_at != null || estimate.viewed_at != null` inline), or (b) add one trivial pure helper to `lib/estimate/presentation-settings.ts` — e.g. `hasEstimateBeenSentOrViewed(estimate: { sent_at: string | null; viewed_at: string | null }): boolean` — so Phase 162's notice logic and any future consumer share one predicate rather than re-deriving the OR-check independently (consistent with this whole phase's "one shared resolver, no drift" philosophy). Recommend (b) since it's a 3-line pure function with an obvious unit test and costs nothing to add now while the module is being built. **No new tracking infrastructure, no `estimate_activity` schema change, no new column** — this is purely a read-and-name step.

## Validation Architecture

> `workflow.nyquist_validation` not found as `false` in `.planning/config.json` (key absent or true) — section included per protocol default.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (confirmed via `package.json` `"test": "vitest run"`, `vitest.config.ts` present) |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run tests/unit/estimate/presentation-settings.test.ts` |
| Full suite command | `npm run test` (i.e. `vitest run`) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PRESENT-01 | `resolvePresentationSettings(null)` returns full defaults, all 7 sections visible | unit | `npx vitest run tests/unit/estimate/presentation-settings.test.ts -t "NULL"` | ❌ Wave 0 |
| PRESENT-01 | A partial persisted object (only `sections.summary: false` set) resolves with every OTHER key defaulted, not throwing/undefined | unit | same file, `-t "partial"` | ❌ Wave 0 |
| PRESENT-02 | Non-destructive-hiding proof: `isSectionVisible` returns `false` for a hidden section while the underlying content field (e.g. `data.summary`) is asserted UNCHANGED in the same test — proves the resolver never reads/writes content columns | unit | same file, `-t "non-destructive"` | ❌ Wave 0 |
| PRESENT-02 | Round-trip: settings object with `sections.notes: false` → serialize (JSON.stringify/parse, simulating a DB round-trip) → `resolvePresentationSettings` → `isSectionVisible(..., 'notes')` is `false`; toggle back to `true` → resolves `true` again, with no data loss modeled anywhere in the chain | unit | same file, `-t "round-trip"` | ❌ Wave 0 |
| PRESENT-03 | `TaxOverride` with `mode: 'off'` preserves `preservedRate` distinct from `customRate`; resolving after `mode` flips back to `'default'`/`'custom'` does not lose `preservedRate` | unit | same file, `-t "tax override"` | ❌ Wave 0 |
| PRESENT-03 | Malformed `tax` value (e.g. `{ mode: 'bogus' }`) degrades to `DEFAULT_TAX_OVERRIDE` (mode: 'default'), never throws | unit | same file, `-t "malformed tax"` | ❌ Wave 0 |
| PRESENT-04 | `isSectionVisible` is the only exported visibility predicate from the module (a lint-level/structural assertion: import the module, assert its exports match exactly `{PresentationSettings-types, resolvePresentationSettings, isSectionVisible, ...}` — guards against a future accidental second predicate) | unit | same file, `-t "single predicate"` | ❌ Wave 0 |
| PRESENT-05 | `hasEstimateBeenSentOrViewed` (if added) returns `true` when either `sent_at` or `viewed_at` is non-null, `false` when both null | unit | same file, `-t "sent or viewed"` | ❌ Wave 0 |
| Retrocompat guard | A legacy estimate row shaped exactly like today (no `presentation_settings` key at all, i.e. `undefined`) resolves identically to an explicit `null` — both produce the all-visible/no-override default, proving zero behavior change for every existing estimate | unit | same file, `-t "retrocompat"` | ❌ Wave 0 |
| GUARD-03 boundary | `computeEstimateTotals` is NOT imported anywhere in `lib/estimate/presentation-settings.ts` (a static/structural check — grep or a test that imports the module and asserts no `compute-totals` import exists via a source-text check) — proves the "zero interaction with the deterministic totals engine" invariant at the file level, not just by convention | unit (static) | `npx vitest run tests/unit/estimate/presentation-settings.test.ts -t "no compute-totals import"` OR a simple `grep -c "compute-totals" lib/estimate/presentation-settings.ts` returning 0 as a CI check | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/estimate/presentation-settings.test.ts`
- **Per wave merge:** `npm run test` (full suite — cheap here since this phase touches no renderers/routes that would pull in slower integration tests)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/estimate/presentation-settings.test.ts` — covers PRESENT-01, PRESENT-02, PRESENT-03, PRESENT-04, PRESENT-05 (new file, no existing coverage)
- [ ] No new fixtures/conftest needed — `tests/unit/estimate/compute-totals-guards.test.ts` proves this codebase's convention is plain object literals with hand-computed goldens, no shared fixture file required for a module this size
- [ ] Framework install: none — Vitest already configured and used identically for `lib/estimate/compute-totals.ts`

**A note on migration testing:** unlike Phase 160 (which added a static migration-contract test per PUBURL-03's security requirement), this migration has no security-sensitive surface (no RLS, no anon grants, pure `ADD COLUMN`) — a dedicated migration-contract test is not required for PRESENT-01..05, but the planner may choose to add one trivial assertion (column exists, is nullable, defaults to NULL) if the project's existing migration-testing convention calls for it uniformly. Not flagged as a gap since no comparable precedent test exists for the structurally-identical `companies.tax_config` column either.

## Common Pitfalls

### Pitfall 1: Reintroducing settings-drift by having this phase's resolver silently NOT be the only place visibility is decided
**What goes wrong:** A future developer (or this phase's own implementer, under time pressure) adds a second ad hoc `data.field != null` check somewhere "just for now," defeating PRESENT-04 before Phase 163 even starts wiring consumers.
**Why it happens:** This is PITFALLS.md's #1 flagged risk for the whole milestone — 5 renderers already do this independently today, zero shared source of truth.
**How to avoid:** This phase's own scope discipline is the mitigation — build ONLY the resolver, touch ZERO renderer files. The "single predicate" structural test above is a cheap guardrail that fails loudly if a second export starts creeping in.
**Warning signs:** Any diff in this phase touching `estimate-document.tsx`, `estimate-pdf*.tsx`, `estimate-document-modern.tsx`, `estimate-template.ts`, or `formatter.ts` — none of those files should appear in this phase's file list at all.

### Pitfall 2: Confusing "dormant column" with "actually wired to compute-totals"
**What goes wrong:** A plan step accidentally imports `computeEstimateTotals` into the new resolver module, or threads `presentation_settings` into the `computeEstimateTotals(...)` call inside `saveEstimate()`, silently coupling presentation state to the deterministic math engine.
**Why it happens:** Tax/Discount/Deposit overrides genuinely DO need to eventually reach the engine (that's the whole point of PRESENT-03) — it's tempting to wire that connection now since the resolver module is already being built.
**How to avoid:** The connection point is `saveEstimate()`'s existing `computeEstimateTotals(...)` call (lines 120-139), which takes `taxRate`/`discountType`/`discountValue`/`depositType`/`depositValue` — a FUTURE phase (162/163, once a UI can actually set override values) is responsible for translating `ResolvedPresentationSettings` into those exact option values and passing them in. This phase adds the STORAGE and the STATE SHAPE only.
**Warning signs:** Any grep for `compute-totals` inside `lib/estimate/presentation-settings.ts` returning a non-zero count (the Wave-0 structural test above catches this).

## Sources

### Primary (HIGH confidence — direct codebase inspection)
- `lib/estimate/compute-totals.ts` (full) — the `isTaxConfig()`/`TaxConfig` dormant-first pattern this phase mirrors exactly; also confirms `computeEstimateTotals`'s exact input surface
- `supabase/migrations/20260627000001_phase129_advanced_pricing_schema.sql` (full) — confirms exactly which tax/discount/deposit columns already exist; this phase's migration mirrors its idiom
- `supabase/migrations/20260708000001_phase160_public_url_contract.sql` (full) — most recent migration, confirms same-day sequencing convention and the "authored-only, never `supabase db push`" deployment discipline
- `lib/actions/estimate.ts` (full) — `SaveEstimateInput`, `saveEstimate()`'s exact update payload and its GUARD-03 `computeEstimateTotals` call boundary; `markAsSentAction` confirms `sent_at` write path
- `components/workspace/estimate/use-estimate-reducer.ts` (full) — exact reducer/state/action shape to mirror for the new `UPDATE_PRESENTATION_SETTINGS` action
- `components/workspace/estimate/estimate-document.tsx` (lines 1470-1522, 1595-1685) — today's destructive `toggleField()`/`isFieldVisible()`/`AddDetailsPopover` mechanism (read-only, confirms exactly what non-destructive hiding replaces) and `EstimateDocumentData` interface (lines 343-368)
- `components/workspace/estimate/estimate-editor.tsx` (lines 35-130) — `stateToDocumentData()`/`stateToSavePayload()`, confirming where a future pass-through would slot in
- `lib/queries/estimate.ts` (lines 1-120) — `Estimate`/`EstimateWithSections` interfaces, confirms `sent_at`/`viewed_at` already exist and every read function uses `.select('*')`
- `lib/billing/billing-config.ts` (full) — the second proven dormant-first JSONB+type-guard-with-defaults precedent in this codebase
- `tests/unit/estimate/compute-totals-guards.test.ts` (partial) — confirms test file location convention (`tests/unit/estimate/`), Vitest style, hand-computed-golden convention
- `package.json` — confirms `"test": "vitest run"`, `vitest.config.ts` present
- `.planning/phases/161-presentation-settings-data-model-persistence/161-CONTEXT.md` — locked decisions (storage shape, resolver module contract, non-destructive hiding, tax override semantics, post-send notice, Claude's discretion areas)
- `.planning/REQUIREMENTS.md` — PRESENT-01..05 definitions and locked milestone-level decisions
- `.planning/research/ARCHITECTURE.md` — milestone-level integration architecture, the 6-consumer fan-out table, recommended module/column shape
- `.planning/research/PITFALLS.md` — Pitfall 1 (settings-drift) and Pitfall 2 (destructive/non-destructive collision), both directly scoped into this phase's design

### Secondary (MEDIUM confidence)
- None — every claim in this document traces to a directly-read file in this repository.

## Metadata

**Confidence breakdown:**
- Standard stack (JSONB + resolver pattern): HIGH — two independent proven precedents in this exact codebase
- Architecture (file touch list, save-path integration): HIGH — direct inspection of `lib/actions/estimate.ts`, `use-estimate-reducer.ts`, `lib/queries/estimate.ts`
- Pitfalls: HIGH — sourced directly from milestone-level PITFALLS.md, which is itself grounded in direct codebase inspection with file/line citations

**Research date:** 2026-07-08
**Valid until:** Stable — this is an internal architectural pattern research, not a fast-moving external dependency; valid until Phase 162/163 land (whichever comes first) or until the underlying files change materially.

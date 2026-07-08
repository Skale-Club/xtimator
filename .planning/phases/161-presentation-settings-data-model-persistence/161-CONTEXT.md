# Phase 161: Presentation Settings Data Model & Persistence - Context

**Gathered:** 2026-07-08
**Status:** Ready for planning
**Mode:** Autonomous (smart discuss run non-interactively per standing no-checkpoint-interruptions preference — grey areas resolved from `.planning/research/*.md` + `.planning/REQUIREMENTS.md` locked decisions, all HIGH confidence and codebase-grounded, not guesses)

<domain>
## Phase Boundary

Every estimate carries its own persisted presentation and pricing-override settings — section visibility (Summary, Sections, Payment Terms, Timeline, Warranty, Notes, Photos) plus independent Tax/Discount/Deposit overrides — computed by exactly one pure resolver module, with zero interaction with the deterministic totals engine (`lib/estimate/compute-totals.ts` stays untouched — GUARD-03 invariant) and zero data loss when a section is hidden. This phase is DATA MODEL + RESOLVER ONLY — it does NOT build the gear-icon settings panel UI (that's Phase 162's job) and does NOT wire the resolver into the 6 render/format surfaces (that's Phase 163's job). This phase's own consumer is just: the persistence layer + the resolver function + (at most) a minimal internal call path proving the resolver works, ready for Phase 162/163 to import.

</domain>

<decisions>
## Implementation Decisions

### Storage shape
- New nullable JSONB column `estimates.presentation_settings`, dormant-first (`NULL` = today's behavior = everything visible), mirroring the EXACT precedent of `companies.tax_config` (nullable JSONB + `TaxConfig` interface + `isTaxConfig()` type-guard that degrades to defaults) in `lib/estimate/compute-totals.ts`.
- Do NOT use discrete typed columns for section-visibility flags (Summary/Sections/PaymentTerms/Timeline/Warranty/Notes/Photos) — one JSONB bag, one resolver function, matching the "single source of truth" principle this whole milestone is built around.
- Tax/Discount/Deposit overrides are DIFFERENT from section visibility: they are CALCULATION-AFFECTING and already have typed columns from the v4.11 Advanced Pricing Model (Phase 129) — `estimates.deposit_type`/`deposit_value`, tax fields, discount fields. This phase does NOT add new calculation columns; it adds the ESTIMATE-SCOPED OVERRIDE semantics on top of what already exists (Tax Default/Custom/Off as a resolved value the existing engine reads, not a new engine).

### Resolver module
- New `lib/estimate/presentation-settings.ts` exporting `resolvePresentationSettings(estimate)` and `isSectionVisible(settings, sectionName)` — the ONE place in the codebase that decides section visibility. No renderer may reimplement its own `!= null` visibility check (this is PITFALLS.md's #1 flagged risk for the whole milestone — 5-6 independent renderers each currently make their own visibility decision with zero shared source of truth).
- The resolver is PURE — no DB calls, no side effects, takes the estimate row's already-fetched `presentation_settings` field and returns a typed, defaulted object.
- This phase builds and unit-tests the resolver in isolation. Phase 163 is responsible for actually importing it into all 6 render/format consumers (classic PDF, modern PDF, classic share, modern share, plain-text template, WhatsApp formatter) — do not scope-creep into touching those files here.

### Non-destructive hiding (replaces existing destructive mechanism)
- Today, `estimate-document.tsx`'s `toggleField()` sets a field to `null` when hidden — genuinely deleting content. This phase's new mechanism is NON-DESTRUCTIVE: toggling a section off only flips a boolean in `presentation_settings`; the underlying generated text/content is untouched and reappears exactly when toggled back on.
- This REPLACES `toggleField()`'s role for the five fields it currently manages (Summary, Payment Terms, Timeline, Warranty, Notes) — going forward there is ONE hiding mechanism, not two competing ones. (The actual UI rewiring of `AddDetailsPopover`/`toggleField()` call sites happens in Phase 162 — this phase's job is to make sure the new persisted mechanism exists and is provably non-destructive at the data/resolver level.)

### Tax/Discount/Deposit override semantics
- Tax: three states — `Default` (use company `tax_config`), `Custom` (an estimate-specific rate), `Off` (a separate enabled/disabled flag layered on top of the existing rate — NEVER a mutation to `tax_rate = 0`, so toggling back to Default/Custom restores the exact original value rather than a lost zero).
- Discount and Deposit: estimate-scoped values that override company defaults, scoped to that one estimate, never mutating `companies` row defaults.
- All three overrides are RESOLVED VALUES the EXISTING `lib/estimate/compute-totals.ts` engine reads as inputs — this phase does not touch that engine's internals, only ensures the override values it needs are available and correctly resolved before reaching it.

### Post-send change notice
- If an estimate has already been sent or viewed by the client (reuse existing status/view tracking — `estimates.viewed_at`/status fields, no new tracking infrastructure), changing presentation or pricing settings surfaces a non-blocking inline notice ("the client has already seen this estimate"). This phase provides the DATA needed to detect that condition (i.e., confirms what existing fields already signal "sent/viewed"); the actual UI notice rendering is Phase 162's job.

### Claude's Discretion
- Exact TypeScript interface shape for `PresentationSettings` (field names, nesting) — follow the section list from REQUIREMENTS.md (Summary, Line Sections/Scope Details, Payment Terms, Timeline, Warranty, Notes, Attached Photos) as the authoritative field list.
- Whether `resolvePresentationSettings` takes the raw estimate row or just the `presentation_settings` JSONB value directly — whichever is more testable and matches this codebase's existing resolver patterns (e.g., how `isTaxConfig`/tax resolution is structured in `compute-totals.ts`).
- Migration file naming/timestamp — follow this project's existing convention (see recent migrations under `supabase/migrations/`).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/estimate/compute-totals.ts` — the `companies.tax_config`/`isTaxConfig()` dormant-first JSONB + type-guard pattern to mirror exactly for `presentation_settings`. Also the GUARD-03 deterministic engine that must stay untouched.
- `lib/billing/billing-config.ts` — a second proven precedent for the same JSONB+type-guard-with-defaults pattern in this codebase (per SUMMARY.md research).
- `supabase/migrations/20260627000001_phase129_advanced_pricing_schema.sql` — the Phase 129 migration that added `estimates.deposit_type`/`deposit_value` and other pricing columns this phase's Tax/Discount/Deposit override semantics build on top of (read this to understand what already exists before adding anything new).
- `components/workspace/estimate/estimate-document.tsx` — contains today's destructive `toggleField()`/`AddDetailsPopover` mechanism (read, do not modify in this phase — Phase 162 modifies this file).
- `components/workspace/estimate/use-estimate-reducer.ts` — the reducer this phase likely needs a new action/state field on, for the settings panel (Phase 162) to eventually dispatch into.

### Established Patterns
- Dormant-first nullable JSONB column + typed TS interface + degrade-to-default type guard — already proven twice in this exact codebase.
- Server-side, deterministic, never-trust-LLM math stays in `compute-totals.ts` — this phase's overrides are INPUTS to that engine, never a parallel calculator.

### Integration Points
- `lib/actions/estimate.ts` — the save path; `SaveEstimateInput` likely needs a pass-through field for `presentation_settings`, with zero interaction with `computeEstimateTotals`.
- Phase 162 (next after this) imports `resolvePresentationSettings`/`isSectionVisible` for the gear-panel UI.
- Phase 163 (after 162) imports the same resolver into all 6 render/format consumers.

</code_context>

<specifics>
## Specific Ideas

None beyond what's captured in Decisions above — this phase's scope and shape were already tightly specified by `.planning/research/ARCHITECTURE.md`, `.planning/research/PITFALLS.md`, and the locked decisions in `.planning/REQUIREMENTS.md`.

</specifics>

<deferred>
## Deferred Ideas

- The actual gear-icon settings panel UI (popover/bottom sheet) — Phase 162.
- Wiring the resolver into the 6 render/format consumers — Phase 163.
- Granular per-field visibility (v2, PRESENTX-01 in REQUIREMENTS.md) — explicitly out of scope for v1.
- Reusable settings presets/templates (v2, PRESENTX-02) — explicitly out of scope for v1.

</deferred>

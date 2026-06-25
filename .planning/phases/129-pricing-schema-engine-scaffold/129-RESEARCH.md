# Phase 129: Schema Foundation + GUARD-03 Engine Extension Scaffold + Retrocompat Lock — Research

**Researched:** 2026-06-25
**Domain:** Postgres schema migration (idempotent, authored-only) + deterministic server-side math engine extension + invariant regression tests (Supabase/Next.js/TypeScript/Vitest)
**Confidence:** HIGH (all findings verified against the live codebase; no external library claims required)

## Summary

Phase 129 is the FOUNDATION of milestone v4.11. It ships three things and NOTHING that changes a single number on an existing estimate:

1. **TAX-01 schema** — ONE idempotent migration landing every v4.11 column DORMANT (no behavior reads them yet) on `estimate_items`, `estimates`, and `companies`. This mirrors the proven "dormant threading" pattern used by Phase 105's `price_source='researched'` migration (`20260623000001`) — columns exist, defaults preserve current behavior, nothing populates them until Phases 130-132.
2. **ENG-02 retrocompat lock** — the GUARD-03 math block (`lib/services/generate-estimate.ts` L270-353) is EXTENDED to *read* the new fields with safe defaults (`taxable ?? true`, `discount ?? 0`, etc.), structured so that when every new field is absent/default the output is BYTE-IDENTICAL to today. A regression test pins the exact subtotal/taxAmount/grandTotal numbers as a golden.
3. **ENG-01 no-AI-calculator fence** — a static test asserting the AI's `create_estimate` tool schema contains NO calculator tool and NO computed-total field the server trusts. The server already recalculates everything (GUARD-03); this test *documents and locks* that invariant so no future phase regresses it.

The key engineering insight: **the engine extension in this phase is a SCAFFOLD, not active math.** The block should be refactored to read the new fields through a default-coalescing layer so the structure is ready for Phases 130-132, but with defaults it must compute the identical flat `subtotal × taxRate` it computes today. The actual per-item tax, discount, deposit, and markup computation is explicitly DEFERRED.

**Primary recommendation:** Author one idempotent migration `20260627000001_phase129_advanced_pricing_schema.sql` adding all dormant columns; refactor the L328-346 calc block to coalesce new fields to today's-behavior defaults (proving byte-identity by construction); add two new test files under `tests/unit/estimate/` — one golden-numbers retrocompat test (ENG-02) and one static AI-no-calculator assertion (ENG-01). Author-only migration (CI→GHCR→Coolify, never applied on the VPS).

## User Constraints (from REQUIREMENTS.md locked decisions)

> No CONTEXT.md exists for this phase (no `/gsd:discuss-phase` was run). The binding constraints come from REQUIREMENTS.md's "Locked decisions (non-negotiable)" block and SEED-032's "Princípio de design (não-negociável)". They are reproduced here verbatim because the planner MUST honor them.

### Locked Decisions (non-negotiable — from REQUIREMENTS.md L7-14)
- **The arithmetic integrity already exists** (GUARD-03, server-side deterministic recalculation, never-trust-LLM). This milestone adds the DATA MODEL + math, NOT a better calculator.
- **All new arithmetic stays SERVER-SIDE and DETERMINISTIC** — the AI NEVER computes tax/discount/deposit/markup; it only provides inputs (qty, unit_price or cost, labor/materials classification). EXTEND the existing GUARD-03 math block (`lib/services/generate-estimate.ts` ~L255-373); do NOT create a parallel one.
- **NO AI calculator tool** — explicitly excluded; it would reintroduce the n8n calculator's 3 LLM-failure points (a regression).
- **Retrocompat is mandatory** — existing estimates (taxable=true, discount=0, deposit=none, no tax_config) must be BYTE-IDENTICAL on the happy path; a regression test locks this.
- **Calculation sequence (locked, for the WHOLE milestone — Phase 129 implements only the default path of it):**
  `line_net = round2(qty×unit_price) − line_discount`; `subtotal = Σ line_net`; `disc_global = amount | subtotal×pct`; `taxable_base = Σ(line_net where taxable) − (disc_global prorated)`; `taxAmount = Σ(taxable_base_per_category × rate_category)`; `grandTotal = (subtotal − disc_global) + taxAmount`; `deposit = grandTotal×deposit_pct | deposit_amount`; `balanceDue = grandTotal − deposit`.
- **Discount before tax** (US norm — discount reduces the taxable base; configurable per company).
- **Mirrored across all 3 channels** (web/WhatsApp/MCP) because the math engine is the shared core.

### Phase 129 SCOPE FENCE (Claude's discretion — within the locked decisions)
- This phase ships the SCHEMA (all columns, dormant) + the ENGINE EXTENSION SCAFFOLD (math block extended but default-path byte-identical) + the two invariant tests (ENG-01, ENG-02).
- The per-item-tax / discount / deposit / markup ACTIVE math is DEFERRED to Phases 130-132.

### Deferred Ideas (OUT OF SCOPE for Phase 129 — and for the milestone where noted)
- **Active tax/discount/deposit/markup computation** → Phases 130-132 (NOT this phase).
- **AI output schema widening** (`taxable`/`tax_category` on items) → Phase 130 (TAX-02). This phase does NOT touch `lib/ai/schema.ts` or `lib/ai/types.ts` arithmetic-wise.
- **Editor UI fields** → Phase 133 (PUI-01). **PDF/plain-text totals** → Phase 134 (PUI-02).
- **Stripe deposit threading** → Phase 132 (DEP-02).
- **An AI calculator tool** → permanently out of scope (would reintroduce the n8n calculator's 3 LLM-failure points).
- **Rebuilding the math engine** → EXTEND GUARD-03, never parallel it.
- **Tiered/difficulty pricing** → v2 (PRICEX-01).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TAX-01 | Schema — `estimate_items.taxable` (bool default true) + optional `tax_category` ('labor'\|'materials'\|'other'); `companies.tax_config` (per-category rate OR "labor exempt" rule). Idempotent migration; retrocompat defaults. PLUS the milestone's other dormant columns. | Exact column set + types + defaults + CHECKs below (Standard Stack → Migration). Mirrors the `20260623000001` price_source dormant-threading template and the `20260620000002` ADD COLUMN convention. |
| ENG-01 | Static test asserts the AI is given NO calculator tool and computes none of tax/discount/deposit/markup. | The `create_estimate` tool schema (`lib/ai/providers/anthropic.ts` L23-90 + gemini.ts) has NO total/tax field on items — only description/quantity/unit_price/price_source. Server recalculates (GUARD-03). Static-grep test recommended below (ENG-01 section). |
| ENG-02 | Retrocompat invariant — an estimate with no new fields produces BYTE-IDENTICAL subtotal/tax/total to the pre-milestone engine; regression test locks the happy path. | The exact current calc (L328-346) documented byte-for-byte below. Default-coalescing refactor preserves it by construction. Golden-numbers test recommended in `tests/unit/estimate/` (ENG-02 section). |
</phase_requirements>

## Standard Stack

This phase introduces NO new libraries. It uses the existing stack exactly as the surrounding code does.

### Core
| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| Postgres (Supabase) | n/a | Schema columns | The 8-table schema; `estimate_items`/`estimates`/`companies` already exist |
| Vitest | (in devDeps; `npm test` → `vitest run`) | Unit/regression tests | Existing test runner; include glob covers `tests/unit/**/*.test.ts` and `tests/eval/**/*.test.ts` |
| `lib/estimate/totals.ts` | existing | `round2`, `assertFinitePositive`, `TOTALS_EPSILON` | The authoritative rounding/guard helpers the engine already uses — reuse, do not re-implement |

### Migration Conventions (verified from the codebase)
- **Filename:** `YYYYMMDDNNNNNN_descriptive_name.sql`. Newest is `20260626000001_phase123_chat_persistence.sql`. Use **`20260627000001_phase129_advanced_pricing_schema.sql`** (one day after newest; no collision — verified `20260627*` does not exist).
- **Idempotency:** `ADD COLUMN IF NOT EXISTS` for every column; `DROP CONSTRAINT IF EXISTS` then `ADD CONSTRAINT <named>` for CHECKs (the `20260623000001` template — it drops the autonamed inline CHECK and re-adds a named one so re-runs are safe).
- **Authored-only:** the migration file is committed and carried by CI→GHCR→Coolify. **Never** `supabase db push` / apply on the VPS (on-VPS build froze prod 2026-05-31 per project memory; same "authored, not applied remotely" discipline as `20260624000004` credit_ledger which states "NOT applied to remote — carried by CI->GHCR->Coolify").
- **Numeric types:** money columns are `NUMERIC(12,2)`; rate columns are `NUMERIC(5,4)` (see `default_tax_rate NUMERIC(5,4)`, `tax_rate NUMERIC(5,4)`). Percent-style discount values should follow the existing `discount_value NUMERIC(12,2)` convention already on `estimates`.
- **No secrets** in the migration or any planning doc (gitleaks pre-commit hook).

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| One migration for all dormant columns | Several per-table migrations | The phase explicitly wants ONE migration landing everything dormant; one file is simpler to reason about and matches the "land them all dormant" instruction. |
| Reusing `estimates.discount_value`/`discount_type`/`discount_amount` (already exist!) | Adding a new `estimates.discount` column | **IMPORTANT FINDING:** `estimates` ALREADY has `discount_type TEXT`, `discount_value NUMERIC(12,2) DEFAULT 0`, `discount_amount NUMERIC(12,2) DEFAULT 0` (initial_schema L102-104), and the engine already writes them (`discount_type: null, discount_value: 0, discount_amount: 0` at L424-426). The planner should DECIDE whether the global discount reuses these existing columns or adds a new `estimates.discount`. See Open Questions #1 — this is the single most important schema decision in the phase. |

## Architecture Patterns

### The current GUARD-03 math block (the byte-identical baseline — ENG-02's golden)

Verified at `lib/services/generate-estimate.ts`. This is EXACTLY what must stay byte-identical when new fields are absent:

```typescript
// L271 — tax rate source (the only tax input today)
const taxRate = Number(company.default_tax_rate) || 0

// L328-339 — per-item total + per-section subtotal
const calculatedSections = researchedSections.map((section) => {
  const items = section.items.map((item) => ({
    ...item,
    total: Math.round(item.quantity * item.unit_price * 100) / 100,   // item.total
  }))
  const sectionSubtotal = items.reduce((sum, item) => sum + item.total, 0)
  return {
    title: section.title,
    items,
    subtotal: Math.round(sectionSubtotal * 100) / 100,                 // section.subtotal
  }
})

// L341-346 — estimate totals (THE flat-rate computation TAX-03 will later replace)
const subtotal =
  Math.round(calculatedSections.reduce((sum, s) => sum + s.subtotal, 0) * 100) / 100
const taxAmount = Math.round(subtotal * taxRate * 100) / 100           // flat: subtotal × rate
const grandTotal = Math.round((subtotal + taxAmount) * 100) / 100

// L351-353 — defensive finite guards (no-op on happy path)
const safeSubtotal = assertFinitePositive(subtotal)
const safeTaxAmount = assertFinitePositive(taxAmount)
const safeGrandTotal = assertFinitePositive(grandTotal)
```

Note the inline rounding uses `Math.round(x * 100) / 100` directly (NOT the `round2` helper) at L331/337/345/346 — `round2` IS imported and used elsewhere (L276 aiProposedSubtotal, L358 invariant check). **Byte-identity means preserving the EXACT same arithmetic expressions**; do not "tidy" `Math.round(...*100)/100` into `round2(...)` as part of this phase unless a test proves identical output (they are numerically equal for finite ≥0 values, but the scaffold should minimize diff surface — see Pitfall 2).

Persisted fields (L407-431) on the happy path that the regression must keep stable: `subtotal: safeSubtotal`, `tax_rate: taxRate`, `tax_amount: safeTaxAmount`, `total: safeGrandTotal`, plus the already-zero `discount_type: null, discount_value: 0, discount_amount: 0`.

### Pattern 1: Default-coalescing scaffold (the recommended ENG-02-safe extension shape)

**What:** Refactor the calc block so it READS the new fields through defaults that reproduce today's math, WITHOUT activating any new computation.

**When to use:** This phase only — it makes the structure ready for 130-132 while guaranteeing byte-identity.

**Example (recommended scaffold direction — actual active math deferred):**
```typescript
// SCAFFOLD ONLY — defaults reproduce today's flat computation byte-for-byte.
// Active per-item/discount/deposit math lands in Phases 130-132.
const items = section.items.map((item) => {
  const lineGross = Math.round(item.quantity * item.unit_price * 100) / 100
  const lineDiscount = item.discount ?? 0          // default 0 → lineGross unchanged
  const lineNet = lineGross - lineDiscount          // == lineGross today
  return { ...item, total: lineNet }                // identical to today when discount=0
})
// taxRate path unchanged: when company.tax_config is absent → flat subtotal × default_tax_rate
const taxAmount = Math.round(subtotal * taxRate * 100) / 100
```

**Critical discipline:** every new field must coalesce to the value that makes the expression collapse to today's: `discount ?? 0`, `taxable ?? true`, `deposit_type ?? 'none'`, `tax_config ?? null → flat rate`. If any default does NOT collapse, ENG-02 fails — that is the whole point of the regression test.

### Anti-Patterns to Avoid
- **Building a parallel math block.** REQUIREMENTS forbids it. EXTEND the existing block.
- **Activating per-item tax in this phase.** That's TAX-03 (Phase 130). Here, `tax_config` absent → flat path only.
- **Touching the AI schema/types for arithmetic.** Widening `LineItemOutput` with `taxable`/`tax_category` is Phase 130 (TAX-02), and even then the AI only CLASSIFIES, never computes.
- **Applying the migration on the VPS.** Author-only; CI carries it.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 2-dp rounding / NaN-safe coercion | A new rounding helper | `round2`, `assertFinitePositive` from `lib/estimate/totals.ts` | Already the authoritative, never-throw helpers the engine uses |
| Totals invariant tolerance | A magic `0.01` | `TOTALS_EPSILON` from `lib/estimate/totals.ts` | Single source for the rounding tolerance |
| Idempotent CHECK swap | Ad-hoc constraint SQL | The `20260623000001` drop-IF-EXISTS + named-ADD pattern | Proven idempotent re-run-safe template |
| Money/rate column types | New precision choices | `NUMERIC(12,2)` money, `NUMERIC(5,4)` rate | Matches every existing estimate/company money column |

**Key insight:** This phase is deliberately small. Almost everything it needs (rounding, guards, the calc block, the migration template, the test runner) already exists. The work is *structuring the seams* and *locking the invariants*, not inventing mechanisms.

## Common Pitfalls

### Pitfall 1: Global discount column collision
**What goes wrong:** Adding `estimates.discount` when `estimates.discount_value`/`discount_type`/`discount_amount` already exist and are already written by the engine → two parallel discount representations.
**Why it happens:** REQUIREMENTS DISC-01 phrasing says "`estimates.discount` (global)"; the initial schema already shipped discount columns in 2026-04 that were never wired to UI.
**How to avoid:** The planner must explicitly choose: reuse `discount_type`/`discount_value` (preferred — they exist and the engine already zeroes them) OR add `estimates.discount` and migrate the old ones. Document the decision in the plan. (Open Question #1.)
**Warning signs:** A migration adding `estimates.discount` without referencing the existing `discount_value`.

### Pitfall 2: Refactor drift breaking byte-identity
**What goes wrong:** "Tidying" `Math.round(x*100)/100` into `round2(x)` or reordering reduce expressions during the scaffold changes a least-significant cent on some fixture.
**Why it happens:** Innocent cleanup during the extension.
**How to avoid:** Keep the default-path arithmetic expressions textually identical; let new logic sit behind `?? default` coalescing that collapses to no-op. The ENG-02 golden test is the guard — run it before and conceptually "after" the extension.
**Warning signs:** ENG-02 golden numbers shift by 0.01.

### Pitfall 3: Migration date collision (project memory)
**What goes wrong:** Two migrations sharing a timestamp prefix, or a phase-number `.startsWith` collision in GSD tooling.
**Why it happens:** Known project issue (memory: phase-number prefix collision; multiple same-day migrations exist e.g. two `20260619000001_*` and two `20260529000001_*`).
**How to avoid:** Use `20260627000001` (unique date, no existing `20260627*`). The 6-digit `NNNNNN` suffix gives headroom if a second migration is ever needed same day.
**Warning signs:** `ls supabase/migrations/20260627*` returns more than the one new file.

### Pitfall 4: tax_config type — JSONB vs columns
**What goes wrong:** Modeling per-category rates as separate columns now, then needing a flexible "labor exempt" rule later.
**Why it happens:** Over-fitting the v1 shape.
**How to avoid:** `companies.tax_config JSONB NULLABLE` (recommended) holds either `{ "labor": 0, "materials": 0.08, "other": 0.08 }` or a rule like `{ "labor_exempt": true, "rate": 0.08 }`. NULL → flat `default_tax_rate` path (retrocompat). The engine reads it only in Phase 130; here it lands dormant.
**Warning signs:** A migration adding `companies.tax_labor_rate`, `companies.tax_materials_rate` as fixed columns — less flexible and harder to evolve.

### Pitfall 5: Static AI-no-calculator test that tests the wrong thing
**What goes wrong:** Asserting "no calculator" by checking prompt text rather than the structured tool schema, so a future tool addition slips through.
**Why it happens:** The "calculator" is conceptual, not a named symbol.
**How to avoid:** Assert against the actual `create_estimate` tool `input_schema`: (a) the only tool name is `create_estimate`; (b) item properties are EXACTLY `description, quantity, unit, unit_price, price_source` — no `total`/`tax`/`tax_amount`/`grand_total`/`subtotal`; (c) section/top-level have no computed-total field. Both `anthropic.ts` and `gemini.ts` define this schema — assert both (or assert the shared shape). The server-recalculation authority (GUARD-03) is already covered by `tests/unit/estimate/totals-authority.test.ts`.

## Code Examples

### Recommended migration skeleton (TAX-01 — all columns dormant, idempotent)
```sql
-- supabase/migrations/20260627000001_phase129_advanced_pricing_schema.sql
-- Phase 129 (TAX-01): land all v4.11 advanced-pricing columns DORMANT.
-- Defaults preserve current behavior byte-for-byte (ENG-02). Nothing reads
-- these until Phases 130-132. Authored-only — carried by CI->GHCR->Coolify,
-- NOT applied on the VPS. Idempotent: ADD COLUMN IF NOT EXISTS + named CHECKs.

-- estimate_items: per-item taxability, line discount, cost/markup (markup dormant → no derived price yet)
ALTER TABLE estimate_items ADD COLUMN IF NOT EXISTS taxable      BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE estimate_items ADD COLUMN IF NOT EXISTS tax_category TEXT;            -- nullable; CHECK below
ALTER TABLE estimate_items ADD COLUMN IF NOT EXISTS discount     NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE estimate_items ADD COLUMN IF NOT EXISTS cost         NUMERIC(12,2); -- nullable
ALTER TABLE estimate_items ADD COLUMN IF NOT EXISTS markup_pct   NUMERIC(6,3);  -- nullable

ALTER TABLE estimate_items DROP CONSTRAINT IF EXISTS estimate_items_tax_category_check;
ALTER TABLE estimate_items
  ADD CONSTRAINT estimate_items_tax_category_check
  CHECK (tax_category IS NULL OR tax_category IN ('labor','materials','other'));

-- estimates: global discount (SEE Open Question #1 re: existing discount_* columns), deposit + balance
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS deposit_type  TEXT NOT NULL DEFAULT 'none';
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS deposit_value NUMERIC(12,2);  -- nullable
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS balance_due   NUMERIC(12,2);  -- nullable

ALTER TABLE estimates DROP CONSTRAINT IF EXISTS estimates_deposit_type_check;
ALTER TABLE estimates
  ADD CONSTRAINT estimates_deposit_type_check
  CHECK (deposit_type IN ('none','percent','amount'));
-- NOTE: estimates.discount — DECIDE in planning whether to reuse the existing
-- discount_type/discount_value/discount_amount columns (preferred) or add a new
-- `discount NUMERIC(12,2) DEFAULT 0`. Do NOT silently duplicate.

-- companies: per-category tax rule (NULL → flat default_tax_rate path = retrocompat)
ALTER TABLE companies ADD COLUMN IF NOT EXISTS tax_config JSONB;  -- nullable

COMMENT ON COLUMN companies.tax_config IS
  'Per-category tax rule (v4.11). NULL = use flat default_tax_rate (retrocompat). Read by the engine starting Phase 130.';
```

### Recommended ENG-02 regression test (golden numbers, retrocompat lock)
```typescript
// tests/unit/estimate/retrocompat-totals.test.ts  (collected by tests/unit/**/*.test.ts)
// ENG-02: an estimate with NO new fields must yield byte-identical
// subtotal/taxAmount/grandTotal vs the pre-milestone engine. Locks the happy path
// so Phases 130-134 cannot drift already-generated numbers.
import { describe, it, expect } from 'vitest'

// Pure golden: replicate the default-path expressions the engine guarantees.
// (If the engine math is extracted into a pure helper during the scaffold,
//  import and call it here instead of inlining — preferred.)
describe('ENG-02: retrocompat happy path (flat rate, no new fields)', () => {
  it('byte-identical totals when taxable=true, discount=0, deposit=none, no tax_config', () => {
    const sections = [
      { items: [ { quantity: 1, unit_price: 500 }, { quantity: 2, unit_price: 125.5 } ] },
      { items: [ { quantity: 3, unit_price: 33.33 } ] },
    ]
    const taxRate = 0.1
    const calc = sections.map((s) => {
      const items = s.items.map((i) => ({ total: Math.round(i.quantity * i.unit_price * 100) / 100 }))
      return Math.round(items.reduce((a, i) => a + i.total, 0) * 100) / 100
    })
    const subtotal = Math.round(calc.reduce((a, s) => a + s, 0) * 100) / 100
    const taxAmount = Math.round(subtotal * taxRate * 100) / 100
    const grandTotal = Math.round((subtotal + taxAmount) * 100) / 100

    // GOLDEN — these exact numbers must never change for this fixture.
    expect(subtotal).toBe(850.99)     // 500 + 251 + 99.99
    expect(taxAmount).toBe(85.1)
    expect(grandTotal).toBe(936.09)
  })
})
```
> **Stronger option (recommended for the planner):** during the scaffold, extract the L328-346 default-path math into a small pure function in `lib/estimate/` (e.g. `computeEstimateTotals(sections, { taxRate })`). Then ENG-02 imports the REAL function and asserts the golden — so the test guards the production code path, not a copy. The existing `tests/unit/services/generate-estimate.test.ts` already drives the full service with mocks (`default_tax_rate: 0.1`) and could gain a totals assertion too.

### Recommended ENG-01 static test (no AI calculator)
```typescript
// tests/unit/estimate/ai-no-calculator.test.ts
// ENG-01: the AI is given NO calculator tool and NO computed-total field the
// server trusts. The server is the sole arithmetic authority (GUARD-03).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const FORBIDDEN_ITEM_FIELDS = ['total', 'tax', 'tax_amount', 'subtotal', 'grand_total', 'grandTotal']

describe('ENG-01: AI has no calculator / no computed-total field', () => {
  for (const adapter of ['lib/ai/providers/anthropic.ts', 'lib/ai/providers/gemini.ts']) {
    it(`${adapter}: only create_estimate tool, no computed-total item property`, () => {
      const src = readFileSync(adapter, 'utf8')
      expect(src).toContain("name: 'create_estimate'")
      expect(src).not.toMatch(/name:\s*['"]calculat/i)   // no calculator tool
      // item schema exposes inputs only — no server-trusted computed totals
      for (const f of FORBIDDEN_ITEM_FIELDS) {
        // crude but effective: the tool input_schema must not declare these as item properties
        expect(src).not.toMatch(new RegExp(`${f}:\\s*\\{\\s*type:\\s*['"]number`))
      }
    })
  }
})
```
> The static-source-grep style matches existing tests in this repo (`tests/unit/server-only-imports.test.ts`, `tests/unit/platform-branding-sweep.test.ts`, `tests/unit/env-var-sweep.test.ts` all read source files and assert patterns). Adjust the exact regex to the real schema text. The runtime authority half is already covered by `tests/unit/estimate/totals-authority.test.ts`.

## Runtime State Inventory

> This is a SCHEMA + ENGINE-SCAFFOLD phase, not a rename/migration of stored strings. New columns land dormant with retrocompat defaults, so no existing runtime state is invalidated. Verified per category:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | New columns added with defaults (`taxable=true`, `discount=0`, `deposit_type='none'`, nullable cost/markup/tax_config). Existing `estimate_items`/`estimates` rows backfill to defaults atomically. No existing data semantics change. | None — defaults are the retrocompat baseline. NOT NULL DEFAULT backfills existing rows in one statement. |
| Live service config | None — no external service stores these column names. | None — verified (no n8n/Datadog/Tailscale dependency on estimate schema columns). |
| OS-registered state | None — no Task Scheduler/pm2/systemd reference to these columns. | None — verified. |
| Secrets/env vars | None — no secret or env var references the new columns. gitleaks hook unaffected. | None — verified. |
| Build artifacts | TypeScript types may be regenerated from the schema (if Supabase typegen is used); the AI types are NOT touched this phase. | If a generated `database.types.ts` exists, regenerate after migration (check; this phase adds columns the DB types should reflect for 130+). |

**The canonical question:** After the migration runs, what runtime systems still compute the OLD way? Answer: ALL of them, intentionally — the engine default path is byte-identical, so every existing and new estimate computes exactly as before until Phases 130-132 activate the new math.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Flat `subtotal × default_tax_rate` | (After v4.11) per-item `Σ(taxable_base_per_category × rate)` | Activates Phase 130, NOT 129 | Phase 129 only lands the schema + scaffold; behavior unchanged this phase |
| `estimates.discount_*` columns shipped but unused (since 2026-04 initial schema) | Will be wired (or superseded) in Phase 131 | DISC-01/02 | Reuse-vs-add decision is the key Phase-129 schema call (Open Q #1) |

**Deprecated/outdated:** Nothing deprecated this phase. The flat-rate path is RETAINED as the retrocompat default (it is the `tax_config IS NULL` branch).

## Open Questions

1. **Reuse `estimates.discount_type`/`discount_value`/`discount_amount` or add `estimates.discount`?**
   - What we know: The three columns already exist (initial_schema L102-104) and the engine already writes `discount_type:null, discount_value:0, discount_amount:0` (L424-426).
   - What's unclear: REQUIREMENTS DISC-01 says "`estimates.discount`"; whether that means a new column or the existing pair.
   - Recommendation: **Reuse the existing columns** (`discount_type` ∈ {percent,amount}, `discount_value` the magnitude, `discount_amount` the computed money). This avoids a duplicate representation and the engine already touches them. The Phase 129 migration then adds NOTHING new for global discount — it only adds the line-level `estimate_items.discount`. The planner should confirm and record this. (If a new column is chosen, the migration must also plan to retire/migrate the old trio.)

2. **`tax_category` default for new AI items — NULL or 'materials'?**
   - What we know: Column is nullable; the AI doesn't classify until Phase 130 (TAX-02).
   - What's unclear: Whether dormant rows should default to NULL (recommended — "unclassified, taxed at flat rate") vs a category.
   - Recommendation: NULL. The engine's flat path ignores category; NULL is the honest "not yet classified" value. Active classification arrives in 130.

3. **Does a generated Supabase `database.types.ts` exist that needs regen?**
   - What we know: The repo uses Supabase; this phase adds columns.
   - What's unclear: Whether typed DB access is generated or hand-typed (the service uses loose casts like `as never` in places).
   - Recommendation: The planner should check for a committed generated types file; if present, regenerate post-migration so Phases 130-132 get typed access. Not strictly required for Phase 129 (no code reads the new columns yet).

## Environment Availability

> Skipped — Phase 129 is schema + server-side TypeScript + tests only. No new external tools, services, runtimes, or CLIs beyond the existing Postgres/Vitest/Next.js stack already in use. (Step 2.6: no new external dependencies identified.)

## Validation Architecture

> `nyquist_validation` is `true` in `.planning/config.json` (workflow block) — this section is included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (`npm test` → `vitest run`; `npm run test:eval` → `vitest run tests/eval`) |
| Config file | `vitest.config.ts` (include globs: `tests/unit/**/*.test.ts`, `tests/unit/**/*.test.tsx`, `tests/eval/**/*.test.ts`) |
| Quick run command | `npx vitest run tests/unit/estimate` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TAX-01 | Migration adds all dormant columns idempotently with retrocompat defaults | migration/integration (or manual review) | `npx vitest run tests/integration` (if a migration-application test is added) | ❌ Wave 0 — optional; primary verification is the engine staying byte-identical (ENG-02). A pure SQL-review may suffice given authored-only deploy. |
| ENG-01 | AI tool schema has no calculator / no computed-total item field | unit (static source assertion) | `npx vitest run tests/unit/estimate/ai-no-calculator.test.ts` | ❌ Wave 0 |
| ENG-02 | Default-path totals byte-identical to pre-milestone | unit (golden numbers; ideally on extracted pure helper) | `npx vitest run tests/unit/estimate/retrocompat-totals.test.ts` | ❌ Wave 0 |
| ENG-02 (service-level) | Full service yields stable persisted subtotal/tax/total | unit (existing service test, add assertion) | `npx vitest run tests/unit/services/generate-estimate.test.ts` | ✅ exists — extend with a totals assertion |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/estimate` (the two new invariant files — fast)
- **Per wave merge:** `npm test` (full unit + eval suite)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/estimate/retrocompat-totals.test.ts` — covers ENG-02 (golden numbers; prefer importing an extracted pure `computeEstimateTotals` helper)
- [ ] `tests/unit/estimate/ai-no-calculator.test.ts` — covers ENG-01 (static schema assertion over anthropic.ts + gemini.ts)
- [ ] (optional) `lib/estimate/` pure totals helper extraction so ENG-02 guards production code, not a copy
- [ ] (optional) extend `tests/unit/services/generate-estimate.test.ts` with a persisted-totals assertion
- [ ] Framework install: none — Vitest already present and green.

## Sources

### Primary (HIGH confidence — live codebase, this repo)
- `lib/services/generate-estimate.ts` L271, L328-353, L407-431 — the exact GUARD-03 math + persistence (ENG-02 baseline)
- `lib/ai/providers/anthropic.ts` L23-91 — `create_estimate` tool `input_schema` (no computed-total field; ENG-01 evidence)
- `lib/ai/schema.ts`, `lib/ai/types.ts` — AI output schema/types (items carry inputs only; NOT widened this phase)
- `lib/estimate/totals.ts` — `round2`, `assertFinitePositive`, `TOTALS_EPSILON` (reuse, don't re-implement)
- `supabase/migrations/20260409000001_initial_schema.sql` L88-135 — `estimates`/`estimate_sections`/`estimate_items`/`companies` column conventions; existing `estimates.discount_*` columns
- `supabase/migrations/20260623000001_estimate_items_price_source_researched.sql` — idempotent dormant-threading + named-CHECK template
- `supabase/migrations/20260624000004_phase112_credit_ledger.sql` — `ADD COLUMN IF NOT EXISTS` + "authored, not applied remotely" convention
- `supabase/migrations/20260620000002_price_book_pricing_types.sql` — multi-column ADD + CHECK convention; `NUMERIC(12,2)` money, JSONB usage
- `tests/unit/estimate/totals-authority.test.ts` — existing GUARD-03 authority test (ENG-01 runtime half already covered)
- `tests/unit/services/generate-estimate.test.ts` — existing full-service test with `default_tax_rate:0.1` mock (extension point)
- `tests/eval/harness.test.ts`, `tests/eval/fixtures/types.ts` — eval harness (full-graph; alternative home, but `tests/unit/estimate/` is the right home for these invariant unit tests)
- `vitest.config.ts` — include globs (test file placement)
- `.planning/REQUIREMENTS.md`, `.planning/seeds/SEED-032-*.md`, `.planning/STATE.md` — locked decisions + scope fence
- `CLAUDE.md` + project memory — idempotent authored-only migrations, CI→GHCR→Coolify (never VPS), no secrets, GUARD-03 authority

### Secondary / Tertiary
- None required — this phase is fully grounded in the local codebase; no external library behavior is in question.

## Metadata

**Confidence breakdown:**
- Standard stack (migration conventions, types, test runner): HIGH — directly read from existing migrations and config
- Architecture (the byte-identical baseline + scaffold shape): HIGH — the exact current calc block was read line-by-line
- Pitfalls (discount column collision, byte-identity drift, date collision): HIGH — verified against existing schema, project memory, and migration listing

**Research date:** 2026-06-25
**Valid until:** ~2026-07-25 (stable; codebase-internal facts. Re-verify the newest migration timestamp if other migrations land before this phase executes — use newest+1 day.)

## Project Constraints (from CLAUDE.md)
- **GSD workflow:** make repo edits only through a GSD command (this phase executes via `/gsd:execute-phase`).
- **Secrets:** NEVER commit secrets/keys — including in the migration, comments, or planning docs. Use placeholders. gitleaks pre-commit hook enforces.
- **Tech stack:** Next.js 14 App Router, TypeScript strict, Supabase Postgres with RLS on all tables, zod. New columns inherit existing table RLS (no new policies needed for added columns).
- **AI authority:** all AI calls server-side; the service-role key never reaches the browser; the AI NEVER computes totals (GUARD-03).
- **Deploy:** migrations authored-only and carried via CI→GHCR→Coolify; never build/apply on the VPS (prod froze on-VPS 2026-05-31).

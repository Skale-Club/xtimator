# Phase 152: Usage Progress Bar + Super-Admin Cost Visibility - Research

**Researched:** 2026-07-05
**Domain:** Next.js App Router display-layer refactor (server-computed derived value replacing a raw prop) + a new admin-only aggregation query over an existing append-only cost table
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**The progress bar**

- Reuse `components/ui/progress.tsx` (shadcn `Progress` primitive already installed) — do not build a bespoke bar component. Wrap it with color-escalation logic (green → amber → red) driven by the same `lowBalanceThresholds`/percentage bands already conceptually present in `CreditBalanceCard`'s `isLow` check.
- **What "percentage" means:** % of THIS CYCLE'S allotment already consumed (bar FILLS as credits are used, matching CREDITUI-03's "color-escalating as it depletes" wording — mirrors Anthropic's own context-window bar, which shows % USED, not % remaining). Formula: `percentUsed = clamp(0, 100, round(100 * (cycleGrant - balance) / cycleGrant))`. `cycleGrant` = `getBillingConfig().tiers[tier].monthlyCreditGrant` for paid tiers, `getBillingConfig().signupCreditGrant` for the free tier (Billing v2: free tier is a one-time bucket, no monthly clock — treat it as the free tier's whole "cycle" for this bar's purposes). If `cycleGrant` is 0, render 0% used (avoid divide-by-zero) rather than hiding the bar.
- **Where it replaces the number:** `components/billing/credit-balance-card.tsx` (Settings > Plans) and `components/app-shell/credit-chip.tsx` (topbar). Both currently receive `balance: number` as a prop — thread `cycleGrant` alongside it (or compute `percentUsed` server-side in the page/layout and pass that single number down instead of raw balance, which is the CLEANER option since it means the raw balance never even reaches these client-rendered components — prefer this if practical, since it structurally enforces CREDITUI-04 rather than relying on "just don't render the prop").
- `CreditHistoryList` (`components/billing/credit-history-list.tsx`) already only selects `operation_type, delta_credits, reason, created_at` (the existing "owner-safe projection" in `lib/queries/credits.ts`) — no dollar figures there today. Verify it stays that way; no change needed unless the researcher finds a gap.

**Super-admin-only cost visibility (CREDITUI-05) — new per-company surface**

- **Home: `app/admin/companies/[id]/page.tsx`** (the per-company admin detail page — NOT `app/admin/integrations/measured-cost-card.tsx`, which is a PLATFORM-WIDE aggregate across all companies and stays as-is). Add a new card, e.g. `company-cost-card.tsx`, alongside the existing `company-quota-form.tsx` / `company-model-override-form.tsx` / `company-byok-form.tsx` cards on that page.
- Show: current `credit_balance`, total real USD cost incurred (sum of `credit_ledger.real_cost_usd` or `ai_cost_events`, scoped `.eq('company_id', ...)` — Claude's research to confirm which table has the authoritative real-cost column per-row), and the effective markup (`getBillingConfig().markup`, or per-row if the schema stores it per debit).
- This is a NEW query — do not repurpose `getCreditOverview()` (that function's whole point, per its own doc comment, is the OWNER-SAFE projection; a super-admin query is the opposite — it MUST include the real-cost columns that function deliberately excludes). Write a separate admin-only query function, mirroring `MeasuredCostCard`'s data-shape but scoped to one `company_id` instead of aggregated platform-wide.
- Static test (mirrors the codebase's existing "grep for forbidden tokens" convention, e.g. `neutrality.test.ts` / `ADMINLOG-05`'s `SAFE_EVENT_COLUMNS` whitelist): assert that no tenant-facing query file (`lib/queries/credits.ts`, any file under `components/billing/`) selects or forwards `real_cost_usd`/`markup`/`balance_after` — this is how CREDITUI-04's "never even indirectly" requirement gets a hard enforcement mechanism instead of just a code-review convention.

### Claude's Discretion

- Exact color bands for the escalation (e.g. <70% green, 70-90% amber, >90% red) — pick sensible defaults, not required to match `lowBalanceThresholds` exactly since those are absolute credit counts and this bar works in percentages; a static test is not needed here, just reasonable UX.
- Whether `percentUsed` is computed in a shared pure helper (e.g. `lib/billing/usage-percent.ts`) reused by both the Plans page and the topbar chip, vs computed twice inline — prefer the shared helper for a single source of truth.

### Deferred Ideas (OUT OF SCOPE)

- Per-tier usage-bar reset cadence customization (CREDITUIX-02, v2).
- The top-up purchase flow itself — Phase 153.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CREDITUI-03 | Tenant sees a single usage progress bar (percentage consumed this cycle, color-escalating as it depletes) on Settings > Plans and in the app-shell topbar credit chip, replacing today's raw numeric "N credits" display. | `usage-percent.ts` formula fully specified below with exact tier/cycleGrant resolution; both call sites (`app/(app)/settings/billing/page.tsx`, `app/(app)/layout.tsx`) traced to their existing data-fetch points; UI-SPEC.md already locks color bands, copy, and component shapes. |
| CREDITUI-04 | No tenant-facing surface displays a raw credit count or a dollar cost figure — only the percentage bar and qualitative low/critical states. | Prop-shape enforcement path traced end-to-end (layout → Topbar → CreditChip, page → CreditBalanceCard); static grep-test pattern identified (`tests/unit/agent-tools/neutrality.test.ts`) and adapted below; existing test file `tests/unit/billing/credit-balance-card.test.tsx` identified as needing a full rewrite (props change entirely). |
| CREDITUI-05 | Super admin can view, per company, exact credit balance, real USD cost incurred, and applied markup — extending `measured-cost-card.tsx` pattern; never sent to/renderable by a tenant session. | Both candidate cost-source tables read in full (`credit_ledger` vs `ai_cost_events` schemas below) with a concrete recommendation on which to query and why; `MeasuredCostCard` data-shape and `aggregateAiCostByOperation` read pattern confirmed reusable per-company by adding `.eq('company_id', ...)`; admin page card-insertion point confirmed via full read of `app/admin/companies/[id]/page.tsx`. |
</phase_requirements>

## Summary

This is a pure display-layer + one new admin read-query phase. All architectural building blocks already exist: the shadcn `Progress` primitive, the `billing_config` reader (`getBillingConfig()`), the two components being modified (`CreditBalanceCard`, `CreditChip`), their two call sites (`app/(app)/settings/billing/page.tsx` and `app/(app)/layout.tsx`), and an established admin cost-visibility pattern (`MeasuredCostCard` + `aggregateAiCostByOperation`) to mirror for the new per-company card. The phase's own `152-UI-SPEC.md` (already approved) is unusually prescriptive — it names the exact new files, exact prop shapes, exact copy strings, and exact color tokens. This research corroborates every UI-SPEC claim against the actual current source and fills the two gaps the UI-SPEC explicitly leaves to "the researcher": (1) which table is authoritative for real-cost-per-company (`credit_ledger` vs `ai_cost_events`), and (2) the concrete server-side call-site wiring for `percentUsed`.

**Key finding on cost source:** both `credit_ledger` (has `real_cost_usd NUMERIC(12,6)` and `markup NUMERIC(6,3)` per debit row, tenant-RLS-readable via `company_members`) and `ai_cost_events` (has `real_cost_usd NUMERIC(12,6)`, RLS restricted to `platform_admins` only) carry real-cost data. **Recommendation: query `ai_cost_events` for the admin card**, not `credit_ledger`, because (a) its RLS is already super-admin-only by design (defense in depth — even a query bug can't leak it to a tenant session, since RLS itself blocks non-admin reads), whereas `credit_ledger` is tenant-readable RLS and only the *application code's* column selection (the "owner-safe projection") keeps it safe today — reusing it for the admin card means the safety property depends entirely on remembering to select different columns in two different files reading the same table. `ai_cost_events` is per-operation-attempt granularity ideal for the "Mean/Median/p90" table shape `MeasuredCostCard` already renders, and `company_id` is already an indexed column (`ai_cost_events_company`) for scoping. Use `companies.credit_balance` directly for the balance figure (already read on the admin page's sibling query) and `getBillingConfig().markup` for the markup figure (global, not per-row — `credit_ledger.markup` is per-debit-row provenance of a *historical* markup, useful for audit but not needed for the "current effective markup" figure CREDITUI-05 asks for).

**Primary recommendation:** Compute `percentUsed` server-side at both existing data-fetch points (`app/(app)/settings/billing/page.tsx` line ~48, `app/(app)/layout.tsx` line ~73-77) using a new shared pure helper `lib/billing/usage-percent.ts`, and change `CreditBalanceCard`/`CreditChip` prop signatures to accept only `{ percentUsed: number }` — never `balance`. Build the new admin card by querying `ai_cost_events` scoped to `company_id`, converted to credits via the same `toCredits()` formula already in `measured-cost-card.tsx`.

## Standard Stack

This phase introduces no new external dependencies — every library involved is already installed and pinned.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| radix-ui | ^1.4.3 (installed, confirmed via `package.json`) | Underlying primitive for `components/ui/progress.tsx` (`Progress` from the `radix-ui` umbrella package) | Already the project's component-primitive layer; shadcn `Progress` wraps it directly |
| next | 16.2.6 (installed) | App Router server components/pages for both call sites | Already the project framework |
| react | 19.2.4 (installed) | Client component wrappers (`'use client'` on `CreditChip`, `CreditBalanceCard` is itself server-renderable per its own doc comment) | Already the project framework |

### Supporting
No new supporting libraries. `lucide-react` icons (`Coins`, `CreditCard`, `AlertTriangle`) are reused as-is per UI-SPEC.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Server-computed `percentUsed` passed as sole prop | Pass `balance` + `cycleGrant` and compute client-side | CONTEXT.md explicitly prefers server-side computation because it "structurally enforces CREDITUI-04" — the raw balance never reaches the client bundle at all, vs. relying on the component "just not rendering" a prop it still receives. This is also the UI-SPEC's locked choice. Do not use the alternative. |
| Query `ai_cost_events` for admin card | Query `credit_ledger.real_cost_usd`/`markup` for admin card | `credit_ledger` is tenant-RLS-readable (`company_members`) — reusing it for an admin-only view means the ONLY thing preventing tenant exposure is which columns application code selects, duplicating the exact risk `getCreditOverview()`'s doc comment warns against. `ai_cost_events` RLS is `platform_admins`-only at the database layer — defense in depth. Prefer `ai_cost_events`. |

**Installation:** None required — no new packages.

**Version verification:** N/A — all libraries pre-installed at project-pinned versions; no version bump needed for this phase.

## Architecture Patterns

### Recommended Project Structure
```
lib/billing/
├── billing-config.ts          # existing — getBillingConfig(), no changes needed
├── calibration.ts             # existing — aggregateAiCostByOperation() pattern to mirror (add company_id scope)
└── usage-percent.ts           # NEW — pure helper, computeUsagePercent({ balance, cycleGrant }): number

lib/queries/
├── credits.ts                 # existing — getCreditOverview(), UNCHANGED (owner-safe projection stays as-is)
└── admin-company-cost.ts      # NEW — admin-only, company-scoped real-cost + markup + balance query

components/billing/
├── credit-balance-card.tsx    # MODIFIED — props {balance, lowBalanceThresholds} -> {percentUsed}
├── credit-history-list.tsx    # UNCHANGED — already owner-safe, verified below
└── usage-progress-bar.tsx     # NEW — wraps components/ui/progress.tsx with color escalation

components/app-shell/
└── credit-chip.tsx            # MODIFIED — props {balance} -> {percentUsed}, renders "{percentUsed}% used" text (no bar, per UI-SPEC)

app/admin/companies/[id]/
├── page.tsx                   # MODIFIED — add 4th Card, wire new query
└── company-cost-card.tsx      # NEW — server component, mirrors MeasuredCostCard shape, company-scoped

tests/unit/billing/
├── credit-balance-card.test.tsx      # MODIFIED — full rewrite (old props no longer exist)
├── usage-percent.test.ts             # NEW — pure formula unit tests (clamp, divide-by-zero, tier resolution)
└── tenant-cost-neutrality.test.ts    # NEW — static grep test for CREDITUI-04 enforcement
```

### Pattern 1: Server-computed derived value replaces raw prop (the core pattern for CREDITUI-03/04)
**What:** Instead of passing `balance: number` to a client component and having it decide what to render, compute the fully-derived, display-ready value (`percentUsed`) at the server data-fetch boundary and pass only that.
**When to use:** Any time a raw sensitive/internal number must never reach client-rendered markup or a client bundle's props, even for components that today happen to render it safely.
**Example (Plans page, `app/(app)/settings/billing/page.tsx`):**
```typescript
// Source: existing file, lines 48-50 + 163-166 (this phase's modification)
const credits = await getCreditOverview(company.id)
const cfg = await getBillingConfig()

// NEW: resolve this tenant's cycle grant and compute percentUsed server-side
import { computeUsagePercent } from '@/lib/billing/usage-percent'
const cycleGrant =
  data.tier === 'free'
    ? cfg.signupCreditGrant
    : cfg.tiers[data.tier as 'pro' | 'business']?.monthlyCreditGrant ?? 0
const percentUsed = computeUsagePercent({ balance: credits.balance, cycleGrant })

// ...
<CreditBalanceCard percentUsed={percentUsed} />
```
**Example (topbar, `app/(app)/layout.tsx`):**
```typescript
// Source: existing file, lines 71-77 + 114-119 (this phase's modification)
// billingRow already selects `tier` AND `credit_balance` in the SAME query — no new
// query needed, only an added getBillingConfig() call + the same pure helper.
const [branding, adminRow, billingRow, memberships, { data: userData }, cfg] = await Promise.all([
  brandingPromise,
  requireServiceClient().from('platform_admins').select('user_id').eq('user_id', claims.sub).maybeSingle(),
  requireServiceClient().from('companies').select('tier, tier_trial_ends_at, credit_balance').eq('id', activeCompanyId).single(),
  getMembershipCompanies(),
  supabase.auth.getUser(),
  getBillingConfig(),
])
const tier = billingRow.data?.tier ?? 'free'
const cycleGrant = tier === 'free' ? cfg.signupCreditGrant : cfg.tiers[tier as 'pro' | 'business']?.monthlyCreditGrant ?? 0
const percentUsed = computeUsagePercent({ balance: billingRow.data?.credit_balance ?? 0, cycleGrant })
// ...
<Topbar company={company} userId={claims.sub as string} isAdmin={isAdmin} percentUsed={percentUsed} />
```
Note: `Topbar`'s own prop type (`interface TopbarProps`) must change `creditBalance?: number` to `percentUsed?: number`, and its render guard `typeof creditBalance === 'number'` becomes `typeof percentUsed === 'number'`.

### Pattern 2: Admin-only cost aggregation scoped to one company (mirrors `MeasuredCostCard`)
**What:** `aggregateAiCostByOperation()` in `lib/billing/calibration.ts` already does the exact per-operation mean/median/p90 aggregation this card needs, platform-wide. Add a company-scoped sibling (or an optional `companyId` parameter) rather than duplicating the aggregation logic.
**When to use:** For `company-cost-card.tsx`'s data needs.
**Example:**
```typescript
// Source: lib/billing/calibration.ts (existing, lines 118-155) — pattern to mirror
// NEW file: lib/queries/admin-company-cost.ts
import 'server-only'
import { requireServiceClient } from '@/lib/supabase/service'
import type { OpCostStat } from '@/lib/billing/calibration'

export interface CompanyCostOverview {
  creditBalance: number
  totalRealCostUsd: number
  markup: number
  perOperation: OpCostStat[]
}

export async function getCompanyCostOverview(companyId: string, markup: number): Promise<CompanyCostOverview> {
  const svc = requireServiceClient()
  const [companyRes, eventsRes] = await Promise.all([
    svc.from('companies').select('credit_balance').eq('id', companyId).single(),
    svc.from('ai_cost_events').select('operation_type, real_cost_usd').eq('company_id', companyId).not('real_cost_usd', 'is', null),
  ])
  const rows = (eventsRes.data as Array<{ operation_type: string; real_cost_usd: number }> | null) ?? []
  // group + mean/median/p90 per operation_type — same logic as aggregateAiCostByOperation, scoped
  // ... (see calibration.ts lines 129-149 for the exact grouping/stat algorithm to reuse)
  const totalRealCostUsd = rows.reduce((acc, r) => acc + (r.real_cost_usd ?? 0), 0)
  return {
    creditBalance: (companyRes.data as { credit_balance?: number } | null)?.credit_balance ?? 0,
    totalRealCostUsd,
    markup,
    perOperation: [], // computed via the shared grouping logic
  }
}
```
**Consideration for the planner:** to avoid duplicating the mean/median/p90 grouping algorithm, consider refactoring `aggregateAiCostByOperation` to accept an optional `companyId?: string` filter parameter (adds `.eq('company_id', companyId)` conditionally) rather than writing a second copy of the grouping loop. This keeps one source of truth for the stats algorithm while satisfying the UI-SPEC's file-boundary requirement (the *query file* must still live outside `lib/queries/credits.ts` / `components/billing/`, which a shared helper in `lib/billing/calibration.ts` naturally satisfies since that file is neither of those).

### Anti-Patterns to Avoid
- **Passing `balance` down "just in case" and trusting the component not to render it:** This is exactly what CONTEXT.md and the UI-SPEC both call out as the weaker enforcement mechanism. The prop must not exist on the modified components at all.
- **Reusing `getCreditOverview()`'s `OWNER_SAFE_LEDGER_COLUMNS` pattern for the admin query by just adding more columns:** would mean one file (`lib/queries/credits.ts`) contains both the forbidden columns and the safe ones, defeating the static grep test's ability to assert "this file never contains `real_cost_usd`". Keep the admin query in a separate file, as the UI-SPEC already specifies.
- **Querying `credit_ledger.real_cost_usd` for the admin card instead of `ai_cost_events`:** works functionally, but relies on tenant-RLS + column-selection discipline rather than RLS itself blocking the tenant. Prefer `ai_cost_events` (super-admin-only RLS) as the defense-in-depth choice.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Progress bar rendering/animation | A custom `<div>` width-percentage bar | `components/ui/progress.tsx` (already wraps Radix `Progress`) | Explicit CONTEXT.md instruction; Radix handles ARIA (`role="progressbar"`, `aria-valuenow`) for free, which a hand-rolled div would need to replicate manually |
| Mean/median/p90 cost aggregation | A new stats function for the admin card | `aggregateAiCostByOperation`'s existing grouping/percentile logic (extend with an optional `companyId` filter) | Already correct, already tested (`tests/unit/billing/calibration.test.ts`), already excludes NULL costs correctly (Phase-110 null-vs-0 discipline) |
| Static "forbidden token never appears in file X" enforcement | A new bespoke AST/regex scanner | The existing `collectTsFiles` + literal-token-scan pattern from `tests/unit/agent-tools/neutrality.test.ts` | Proven pattern already in the codebase test suite; same recursive-directory-walk + `.includes(token)` check works verbatim for this phase's needs |

**Key insight:** Every "problem" this phase touches already has a solved, tested analog somewhere in the codebase (`neutrality.test.ts` for grep-enforcement, `calibration.ts`/`MeasuredCostCard` for cost aggregation+display, `progress.tsx` for the bar primitive). The work is wiring and adaptation, not invention.

## Common Pitfalls

### Pitfall 1: `types/database.types.ts` does not include `credit_ledger`, `ai_cost_events`, or `companies.credit_balance`
**What goes wrong:** A new query written against `Database['public']['Tables']['ai_cost_events']['Row']` will fail to typecheck or silently type as `any`/`never`, because the generated types file was never regenerated after the Phase 110/112 migrations added these tables/columns.
**Why it happens:** `types/database.types.ts` is a generated snapshot; the codebase has apparently not run `supabase gen types` since before Phase 110/112. Confirmed by direct grep — zero matches for `credit_ledger`/`ai_cost_events` in that file, and the `companies.Row` type shown (lines 160-194+) does not include `credit_balance`.
**How to avoid:** Follow the exact pattern already used in `lib/queries/credits.ts` and `lib/billing/calibration.ts`: define a local inline interface (e.g. `interface CreditHistoryRow {...}`) and cast the Supabase response with `as SomeLocalType | null`, rather than relying on `Database[...]`. This is the established, working convention — not a shortcut to fix.
**Warning signs:** TypeScript errors referencing `never` on `.select()` chains for these tables, or a generated-types import that doesn't autocomplete the needed columns.

### Pitfall 2: `credit_ledger.markup` is per-debit-row (historical), not "current effective markup"
**What goes wrong:** Summing or averaging `credit_ledger.markup` across historical rows could give a stale/blended markup if `billing_config.markup` was changed after some debits were recorded, misrepresenting "the applied markup" CREDITUI-05 asks for as if it were a single current value.
**Why it happens:** `credit_ledger.markup NUMERIC(6,3)` is explicitly documented in the migration as "provenance of a debit" — i.e., a snapshot of markup AT THE TIME of that specific debit, not a live config value.
**How to avoid:** For the admin card's "applied markup" figure, use `getBillingConfig().markup` directly (the current, live, global value) — exactly as `MeasuredCostCard` already does (`markup` passed in as a prop derived from `getBillingConfig()`). Only reach for `credit_ledger.markup` if a future feature needs historical/per-debit markup provenance, which is out of scope here.
**Warning signs:** Admin card showing a markup figure that doesn't match the value visible in the billing-config admin panel.

### Pitfall 3: `data.tier` / `billingRow.data?.tier` is a loosely-typed `string`, not the `BillingTier` union
**What goes wrong:** `getBillingConfig().tiers[tier]` expects `tier: BillingTier` (`'free' | 'pro' | 'business'`), but both `getBillingData()` (`lib/queries/billing.ts`) and the layout's inline `companies` select type `tier` as a bare `string`. Indexing `cfg.tiers[tier]` with a bare `string` either fails to typecheck (with `noUncheckedIndexedAccess`) or, worse, silently returns `undefined` at runtime for any unexpected tier value (e.g., a legacy `'trial'` row that Billing v2 retired but that may still exist in the DB).
**Why it happens:** The `companies.tier` column is a free-text column (no DB enum), and the TS layer only asserts the union at the point of use, not at the query boundary.
**How to avoid:** When computing `cycleGrant`, guard with `?? 0` after the index (as shown in the Pattern 1 code example above: `cfg.tiers[tier as 'pro' | 'business']?.monthlyCreditGrant ?? 0`), and treat any unrecognized tier the same as free/zero-grant rather than throwing. This also naturally satisfies the CONTEXT.md instruction "if `cycleGrant` is 0, render 0% used... rather than hiding the bar" for any edge-case tier value.
**Warning signs:** `percentUsed` computing as `NaN` or the bar failing to render for a company with an unexpected/legacy tier string.

### Pitfall 4: The existing `credit-balance-card.test.tsx` will fail entirely after the prop-shape change — this is expected, not a regression to "fix around"
**What goes wrong:** All 5 existing tests in `tests/unit/billing/credit-balance-card.test.tsx` call `<CreditBalanceCard balance={...} lowBalanceThresholds={...} />` and assert on rendered credit numbers/copy ("10", "15", "credits"). Once the component's props change to `{ percentUsed }` and the copy changes per the UI-SPEC's Copywriting Contract (see `152-UI-SPEC.md` — "Usage this billing cycle", "{N}% used", no more "10–15 credits" line), every one of these 5 tests will fail against the new component.
**Why it happens:** This is a genuine breaking prop/behavior change, not an accidental regression — the whole point of CREDITUI-03/04 is to remove exactly what these old tests assert exists.
**How to avoid:** Plan an explicit task to REWRITE (not just patch) `tests/unit/billing/credit-balance-card.test.tsx` against the new `{ percentUsed }` prop and new copy contract, asserting the NEW cardinal rule (no raw credit count, no "$", still no "markup"/"token"). Don't try to keep the old test's assertions passing — they test the pre-phase behavior this phase is supposed to eliminate.
**Warning signs:** CI red on this test file immediately after the component/prop change lands, if the test file isn't updated in the same task/commit.

### Pitfall 5: Free tier "cycle" framing may read oddly if a company signs up, spends down, then never upgrades
**What goes wrong:** Because the free tier has no monthly clock (Billing v2: `signupCreditGrant` is a one-time bucket), `percentUsed` for a free-tier company creeps toward 100% and STAYS there — it never resets, unlike a paid tier's monthly-reset bar. If a developer assumes all tiers behave like a recurring cycle, they might build reset-adjacent UI (e.g., "resets in N days") that is simply wrong for free tier.
**Why it happens:** CONTEXT.md explicitly requires this ("free tier is a one-time bucket, no monthly clock — treat it as the free tier's whole 'cycle' for this bar's purposes"), and the UI-SPEC's Copywriting Contract already anticipates this with a SEPARATE caption for free tier ("Usage resets when you upgrade to a paid plan.") vs paid tier ("Usage resets at the start of your next billing cycle.").
**How to avoid:** Ensure the reset-caption logic branches on `data.tier === 'free'` (or equivalent) exactly as the UI-SPEC copywriting table specifies — do not use one static caption string for both cases.
**Warning signs:** A free-tier company stuck at "100% used" seeing a caption that says "resets at the start of your next billing cycle" when no such cycle exists for them.

## Code Examples

### The shared percentage helper (locked formula from CONTEXT.md)
```typescript
// Source: CONTEXT.md formula, adapted into lib/billing/usage-percent.ts (NEW file, per UI-SPEC Component Inventory)
export function computeUsagePercent({
  balance,
  cycleGrant,
}: {
  balance: number
  cycleGrant: number
}): number {
  if (cycleGrant <= 0) return 0 // avoid divide-by-zero; CONTEXT.md: "render 0% used... rather than hiding the bar"
  const raw = Math.round((100 * (cycleGrant - balance)) / cycleGrant)
  return Math.max(0, Math.min(100, raw)) // clamp(0, 100, ...)
}
```
This is pure and trivially unit-testable: `{balance: cycleGrant, cycleGrant} -> 0`, `{balance: 0, cycleGrant} -> 100`, `{balance: negative, cycleGrant} -> clamped to 100` (a company that somehow over-spent via a race condition should still show 100%, not >100% or a negative bar).

### Color-escalation band mapping (from UI-SPEC, already decided — not open for re-litigation)
```typescript
// Source: 152-UI-SPEC.md "Color-escalation bands" table
function usageBandClass(percentUsed: number): string {
  if (percentUsed >= 90) return 'bg-[hsl(var(--danger))]'
  if (percentUsed >= 70) return 'bg-[hsl(var(--warning))]'
  return 'bg-[hsl(var(--success))]'
}
```

### Static neutrality test skeleton (mirrors `tests/unit/agent-tools/neutrality.test.ts`)
```typescript
// Source: pattern from tests/unit/agent-tools/neutrality.test.ts (existing, lines 1-65), adapted
// NEW file: tests/unit/billing/tenant-cost-neutrality.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'

const ROOT = process.cwd()
const FORBIDDEN = ['real_cost_usd', 'markup', 'balance_after'] as const
const TARGET_FILES = ['lib/queries/credits.ts'] // + every file under components/billing/, collected via readdirSync

function collectTsFiles(dirAbs: string): string[] {
  if (!existsSync(dirAbs)) return []
  const out: string[] = []
  for (const entry of readdirSync(dirAbs, { withFileTypes: true })) {
    const full = join(dirAbs, entry.name)
    if (entry.isDirectory()) out.push(...collectTsFiles(full))
    else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.test.tsx'))
      out.push(full)
  }
  return out
}

describe('CREDITUI-04: tenant-facing billing files never reference cost/markup columns', () => {
  it('no forbidden token in lib/queries/credits.ts or components/billing/', () => {
    const files = [
      resolve(ROOT, 'lib/queries/credits.ts'),
      ...collectTsFiles(resolve(ROOT, 'components/billing')),
    ]
    const violations: Array<{ file: string; token: string }> = []
    for (const file of files) {
      const src = readFileSync(file, 'utf8')
      for (const token of FORBIDDEN) {
        if (src.includes(token)) {
          violations.push({ file: file.replace(ROOT, '').replace(/\\/g, '/'), token })
        }
      }
    }
    expect(violations).toEqual([])
  })
})
```
Note: `components/billing/credit-balance-card.tsx`'s own doc comment currently contains the literal word `"markup"` inside a sentence ("no dollar amounts, no 'markup', no 'token'") — a naive substring scan on the WHOLE file including comments would false-positive here. The planner should either (a) scope the scan to exclude comment lines, or (b) accept that this specific doc-comment usage is safe and instead scan for the tokens as they'd appear in actual code (e.g. `.markup`, `real_cost_usd:`, property-access or column-literal patterns) rather than bare substrings. `neutrality.test.ts`'s own FORBIDDEN list (`'lib/whatsapp'`, `'ownerPhone'`, etc.) doesn't have this collision problem because those tokens don't also appear in prose comments — this phase's forbidden list does, and the plan should account for it (e.g., strip comments before scanning, or use word-boundary-aware matching, or simply rephrase the doc comments in `credit-balance-card.tsx`/`credit-history-list.tsx` to avoid the literal words when this phase touches those files anyway).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Raw `balance` number rendered on Plans page + topbar chip (Phase 115, CREDITUI-01/02) | Single color-escalating `percentUsed` bar, no raw number anywhere tenant-facing | This phase (152) | `CreditBalanceCard`/`CreditChip` prop signatures change; the old "10–15 credits" static guidance line and the amber low-balance block (keyed off `isLow`/`lowBalanceThresholds`) are replaced by band-keyed copy (70%/90% thresholds) |

**Deprecated/outdated:**
- The `isLow` / `lowBalanceThresholds`-driven warning block in `CreditBalanceCard` (absolute credit-count based) is replaced by percentage-band logic (70%/90%) per the UI-SPEC — CONTEXT.md explicitly says the two threshold systems don't need to match exactly since they operate in different units (absolute credits vs. percentage).

## Open Questions

1. **Should `aggregateAiCostByOperation` be extended with an optional `companyId` param, or should the admin card's query duplicate the grouping algorithm in a new file?**
   - What we know: The UI-SPEC says the new admin-only query "must live outside `lib/queries/credits.ts` and outside any file the tenant-facing bundle imports" for the static test's file-boundary assertion. `lib/billing/calibration.ts` already satisfies that constraint (it's neither `lib/queries/credits.ts` nor under `components/billing/`).
   - What's unclear: Whether extending `calibration.ts`'s exported function signature is preferable to a fully separate new query file (`lib/queries/admin-company-cost.ts`, as the UI-SPEC's Component Inventory table suggests as a placeholder name — it explicitly says "exact filename is an implementation detail for the planner").
   - Recommendation: Either is acceptable per UI-SPEC; recommend extending `aggregateAiCostByOperation(companyId?: string)` to avoid duplicating the mean/median/p90 algorithm (DRY), then have a thin new file (`lib/queries/admin-company-cost.ts`) that calls it plus fetches `credit_balance` — satisfying both "single source of truth for stats" and "separate file for the safety boundary."

2. **Exact TypeScript type for `data.tier` when indexing `cfg.tiers[tier]`**
   - What we know: `companies.tier` is a free-text DB column; `BillingConfig.tiers` is typed `Record<BillingTier, TierBilling>` where `BillingTier = 'free' | 'pro' | 'business'`.
   - What's unclear: Whether any legacy company rows still have `tier = 'trial'` (retired per Billing v2 comments in `billing-config.ts`) that would fall through to `undefined` on `cfg.tiers['trial' as BillingTier]`.
   - Recommendation: Guard with `?? 0` as shown in Pitfall 3 — this makes the exact legacy-tier question moot for this phase's purposes (any unrecognized tier renders 0% used, which is a safe/sane default, not a crash).

## Environment Availability

Skipped — no external dependencies (no new services, CLIs, or runtimes). This phase is pure Next.js/React/TypeScript code + one new Supabase query against existing tables.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (installed; `tests/unit/` convention throughout the codebase) |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run tests/unit/billing/` |
| Full suite command | `npm test` (= `vitest run`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CREDITUI-03 | `usage-percent.ts` formula correctness (clamp, divide-by-zero, tier resolution) | unit | `npx vitest run tests/unit/billing/usage-percent.test.ts` | ❌ Wave 0 |
| CREDITUI-03 | `CreditBalanceCard` renders bar + "{N}% used" for given `percentUsed`, color bands trigger at 70/90 | unit | `npx vitest run tests/unit/billing/credit-balance-card.test.tsx` | ✅ exists, needs full rewrite (old props) |
| CREDITUI-03 | `CreditChip` renders "{N}%" text for given `percentUsed` | unit | `npx vitest run tests/unit/app-shell/credit-chip.test.tsx` (or wherever chip tests live — none found today) | ❌ Wave 0 (no existing chip test found) |
| CREDITUI-04 | No raw credit count / `$` figure in `CreditBalanceCard`/`CreditChip` render output | unit (render + string assertion) | same test files as above, additional assertions | ❌ Wave 0 (new assertions) |
| CREDITUI-04 | Static grep: `real_cost_usd`/`markup`/`balance_after` never appear in `lib/queries/credits.ts` or `components/billing/**` | static/unit | `npx vitest run tests/unit/billing/tenant-cost-neutrality.test.ts` | ❌ Wave 0 |
| CREDITUI-05 | Admin company-cost query returns balance/cost/markup scoped to one company, excludes other companies' rows | unit (mocked service client) or integration | `npx vitest run tests/unit/billing/admin-company-cost.test.ts` | ❌ Wave 0 |
| CREDITUI-05 | `company-cost-card.tsx` renders the three required figures; not reachable/imported from any tenant-facing route | unit + static import-boundary check | `npx vitest run tests/unit/admin/company-cost-card.test.tsx` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/billing/` (fast, scoped to touched domain)
- **Per wave merge:** `npm test` (full suite — this phase touches shared files like `credit-balance-card.tsx` and `credit-chip.tsx` that other suites may indirectly depend on via snapshot/import)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/billing/usage-percent.test.ts` — covers CREDITUI-03 (pure formula)
- [ ] `tests/unit/billing/tenant-cost-neutrality.test.ts` — covers CREDITUI-04 (static enforcement)
- [ ] `tests/unit/billing/admin-company-cost.test.ts` — covers CREDITUI-05 (new query)
- [ ] `tests/unit/billing/credit-balance-card.test.tsx` — REWRITE existing file (props changed) — covers CREDITUI-03/04
- [ ] No existing test file found for `credit-chip.tsx` — new test needed to cover CREDITUI-03/04 on that surface
- [ ] No existing test file found for admin `company-*-form.tsx`/card pattern under `app/admin/companies/[id]/` — establish the convention for `company-cost-card.tsx`'s test (likely `tests/unit/admin/` mirroring other admin component tests, or co-located — check `tests/unit/admin/` directory structure at plan time for the exact existing convention)

## Sources

### Primary (HIGH confidence)
- `components/ui/progress.tsx` (read in full) — confirms Radix `Progress` wrapper, current hardcoded `bg-primary` indicator needing a color-override mechanism
- `components/billing/credit-balance-card.tsx` (read in full) — current props, current copy, current `isLow` logic
- `components/app-shell/credit-chip.tsx` (read in full) — current props, current render
- `components/app-shell/topbar.tsx` (read in full) — confirms `creditBalance?: number` prop, render guard, needs matching update
- `app/(app)/layout.tsx` (read in full) — confirms exact existing query (`tier, tier_trial_ends_at, credit_balance` in one `Promise.all`) that will host the new `getBillingConfig()` call + `computeUsagePercent()`
- `app/(app)/settings/billing/page.tsx` (read in full) — confirms exact existing query chain (`getCreditOverview`, `getBillingConfig`) and current `<CreditBalanceCard balance={...} lowBalanceThresholds={...} />` call site
- `lib/queries/credits.ts` (read in full) — `getCreditOverview()`, `OWNER_SAFE_LEDGER_COLUMNS` pattern, doc-comment cardinal rule
- `lib/billing/billing-config.ts` (read in full) — `BillingConfig` type, `getBillingConfig()`, `tiers`/`signupCreditGrant`/`markup` fields, confirms `BillingTier = 'free' | 'pro' | 'business'`
- `lib/billing/calibration.ts` (read in full) — `aggregateAiCostByOperation()`, `OpCostStat`, mean/median/p90 algorithm, NULL-cost exclusion discipline
- `app/admin/integrations/measured-cost-card.tsx` (read in full) — `toCredits()` formula, table shape to mirror
- `app/admin/companies/[id]/page.tsx` (read in full) — card-per-concern layout convention, existing `svc.from('companies').select(...)` pattern
- `app/admin/companies/[id]/company-quota-form.tsx` (read in full) — sibling form-component convention (client component, server action call, `toast` feedback)
- `supabase/migrations/20260624000004_phase112_credit_ledger.sql` (read in full) — `credit_ledger` schema: `real_cost_usd NUMERIC(12,6)`, `markup NUMERIC(6,3)` (both nullable, per-debit provenance), RLS tenant-readable via `company_members`
- `supabase/migrations/20260624000003_phase110_ai_cost_events.sql` (read in full) — `ai_cost_events` schema: `real_cost_usd NUMERIC(12,6)` nullable, RLS restricted to `platform_admins` only — the recommended cost source for the admin card
- `tests/unit/agent-tools/neutrality.test.ts` (read in full) — the static grep-test pattern to mirror for the new CREDITUI-04 enforcement test
- `tests/unit/billing/credit-balance-card.test.tsx` (read in full) — confirms this existing test file asserts the OLD prop shape/copy and will need a full rewrite
- `components/billing/credit-history-list.tsx` (read in full) — confirms it already only renders `operation_type`/`delta_credits`/`reason`/`created_at`, no change needed
- `.planning/phases/152-usage-progress-bar-super-admin-cost-visibility/152-UI-SPEC.md` (read in full) — approved design contract; corroborated against actual source rather than taken at face value
- `.planning/phases/152-usage-progress-bar-super-admin-cost-visibility/152-CONTEXT.md` (read in full) — locked decisions
- `.planning/REQUIREMENTS.md` (read in full) — CREDITUI-03/04/05 definitions and locked project-wide decisions
- `types/database.types.ts` (grepped/read partial) — confirmed STALE relative to `credit_ledger`/`ai_cost_events`/`companies.credit_balance` (zero matches for any of these), documented as Pitfall 1
- `package.json` (read via `node -e`) — confirms installed versions: `radix-ui ^1.4.3`, `react 19.2.4`, `next 16.2.6`
- `.planning/config.json` (read in full) — confirms `nyquist_validation: true`, so Validation Architecture section is required

### Secondary (MEDIUM confidence)
None — this phase required no external/web research; every claim above is grounded directly in the project's own source files (HIGH confidence throughout).

### Tertiary (LOW confidence)
None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; every library confirmed installed via direct `package.json` read
- Architecture: HIGH — both call sites, both target components, and the admin insertion point were all read in full; the UI-SPEC's prescriptive file list was independently corroborated against actual source, not assumed
- Pitfalls: HIGH — all 5 pitfalls are grounded in direct evidence (stale generated types confirmed by grep returning zero matches; existing test file read in full showing exact assertions that will break; RLS policies read directly from migration SQL)

**Research date:** 2026-07-05
**Valid until:** 30 days (stable internal codebase research; no external library version drift risk since no new dependencies are introduced)

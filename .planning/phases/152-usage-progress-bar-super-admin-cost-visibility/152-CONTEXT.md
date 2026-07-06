# Phase 152: Usage Progress Bar + Super-Admin Cost Visibility - Context

**Gathered:** 2026-07-05
**Status:** Ready for planning
**Mode:** Autonomous run (discuss skipped per explicit user authorization to execute unattended).

<domain>
## Phase Boundary

Every tenant-facing credit surface (Settings > Plans `CreditBalanceCard`, the topbar `CreditChip`) stops showing a raw number and shows a single color-escalating % bar instead. The exact $/credit story becomes a NEW super-admin-only, per-company view. This phase does NOT touch the credit_ledger, markup math, debit logic, or the top-up purchase flow (that is Phase 153) — it is a display-layer change plus one new admin read surface.

</domain>

<decisions>
## Implementation Decisions

### The progress bar

- **Reuse `components/ui/progress.tsx`** (shadcn `Progress` primitive already installed in this project) — do not build a bespoke bar component. Wrap it with color-escalation logic (green → amber → red) driven by the same `lowBalanceThresholds`/percentage bands already conceptually present in `CreditBalanceCard`'s `isLow` check.
- **What "percentage" means:** % of THIS CYCLE'S allotment already consumed (bar FILLS as credits are used, matching CREDITUI-03's "color-escalating as it depletes" wording — this mirrors Anthropic's own context-window bar, which shows % USED, not % remaining). Formula: `percentUsed = clamp(0, 100, round(100 * (cycleGrant - balance) / cycleGrant))`. `cycleGrant` = `getBillingConfig().tiers[tier].monthlyCreditGrant` for paid tiers, `getBillingConfig().signupCreditGrant` for the free tier (Billing v2: free tier is a one-time bucket, no monthly clock — treat it as the free tier's whole "cycle" for this bar's purposes). If `cycleGrant` is 0, render 0% used (avoid divide-by-zero) rather than hiding the bar.
- **Where it replaces the number:** `components/billing/credit-balance-card.tsx` (Settings > Plans) and `components/app-shell/credit-chip.tsx` (topbar). Both currently receive `balance: number` as a prop — thread `cycleGrant` alongside it (or compute `percentUsed` server-side in the page/layout and pass that single number down instead of raw balance, which is the CLEANER option since it means the raw balance never even reaches these client-rendered components — prefer this if practical, since it structurally enforces CREDITUI-04 rather than relying on "just don't render the prop").
- **`CreditHistoryList`** (`components/billing/credit-history-list.tsx`) already only selects `operation_type, delta_credits, reason, created_at` (the existing "owner-safe projection" in `lib/queries/credits.ts`) — no dollar figures there today. Verify it stays that way; no change needed unless the researcher finds a gap.

### Super-admin-only cost visibility (CREDITUI-05) — new per-company surface

- **Home: `app/admin/companies/[id]/page.tsx`** (the per-company admin detail page — NOT `app/admin/integrations/measured-cost-card.tsx`, which is a PLATFORM-WIDE aggregate across all companies and stays as-is). Add a new card, e.g. `company-cost-card.tsx`, alongside the existing `company-quota-form.tsx` / `company-model-override-form.tsx` / `company-byok-form.tsx` cards on that page.
- Show: current `credit_balance`, total real USD cost incurred (sum of `credit_ledger.real_cost_usd` or `ai_cost_events`, scoped `.eq('company_id', ...)` — Claude's research to confirm which table has the authoritative real-cost column per-row), and the effective markup (`getBillingConfig().markup`, or per-row if the schema stores it per debit).
- This is a NEW query — do not repurpose `getCreditOverview()` (that function's whole point, per its own doc comment, is the OWNER-SAFE projection; a super-admin query is the opposite — it MUST include the real-cost columns that function deliberately excludes). Write a separate admin-only query function, mirroring `MeasuredCostCard`'s data-shape but scoped to one `company_id` instead of aggregated platform-wide.
- Static test (mirrors the codebase's existing "grep for forbidden tokens" convention, e.g. `neutrality.test.ts` / `ADMINLOG-05`'s `SAFE_EVENT_COLUMNS` whitelist): assert that no tenant-facing query file (`lib/queries/credits.ts`, any file under `components/billing/`) selects or forwards `real_cost_usd`/`markup`/`balance_after` — this is how CREDITUI-04's "never even indirectly" requirement gets a hard enforcement mechanism instead of just a code-review convention.

### Claude's Discretion

- Exact color bands for the escalation (e.g. <70% green, 70-90% amber, >90% red) — pick sensible defaults, not required to match `lowBalanceThresholds` exactly since those are absolute credit counts and this bar works in percentages; a static test is not needed here, just reasonable UX.
- Whether `percentUsed` is computed in a shared pure helper (e.g. `lib/billing/usage-percent.ts`) reused by both the Plans page and the topbar chip, vs computed twice inline — prefer the shared helper for a single source of truth.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- [`components/ui/progress.tsx`](../../../components/ui/progress.tsx) — the shadcn Progress primitive to wrap, not replace.
- [`components/billing/credit-balance-card.tsx`](../../../components/billing/credit-balance-card.tsx), [`components/app-shell/credit-chip.tsx`](../../../components/app-shell/credit-chip.tsx) — the two surfaces losing their raw numeric display.
- [`lib/queries/credits.ts`](../../../lib/queries/credits.ts) — `getCreditOverview()` + its documented "OWNER-SAFE PROJECTION" cardinal rule — the exact pattern to mirror (in spirit, not by reuse) for the tenant side; the admin side needs the OPPOSITE (a query that DOES select cost/markup).
- [`app/admin/integrations/measured-cost-card.tsx`](../../../app/admin/integrations/measured-cost-card.tsx) — the existing PLATFORM-WIDE cost-visibility pattern (table shape, `toCredits()` conversion helper) to mirror for the new PER-COMPANY card — same visual/data shape, different scope.
- [`app/admin/companies/[id]/page.tsx`](../../../app/admin/companies/[id]/page.tsx) + its sibling `-form.tsx` files — the card-per-concern layout convention for this page.
- [`lib/billing/billing-config.ts`](../../../lib/billing/billing-config.ts) — `getBillingConfig()`, `tiers[tier].monthlyCreditGrant`, `signupCreditGrant`, `markup` — all already exist, nothing new to add here.

### Established Patterns
- Static grep-based tests enforcing "column X never appears outside file Y" already exist in this codebase (`ADMINLOG-05`'s `SAFE_EVENT_COLUMNS` whitelist, `neutrality.test.ts`) — the same technique applies directly to CREDITUI-04.

</code_context>

<specifics>
## Specific Ideas

The owner explicitly referenced Anthropic Console's own UI (context-window bar showing "929.5k / 967k (96%)", the "5-hour limit" / "Weekly · all models" stacked usage bars) as the literal visual target for the tenant-facing bar — a thin bar + a percentage, no other emphasis.

</specifics>

<deferred>
## Deferred Ideas

- Per-tier usage-bar reset cadence customization (CREDITUIX-02, v2).
- The top-up purchase flow itself — Phase 153.

</deferred>

---
phase: 158
slug: admin-billing-page-credit-model-overhaul
milestone: v4.17
requirements: [BILLADMIN-01, BILLADMIN-02, BILLADMIN-03]
autonomous: true
created: 2026-07-06
---

# Phase 158 — Context (locked decisions)

## Goal

Replace the admin `/admin/billing` page's tier/MRR-centric view (hardcoded `pro*29 + business*99` math, force-tier/grant-credits as the only actions) with a credit-model-centric view built on the ALREADY-SHIPPED credit ledger + cost-visibility stack from v4.7 (Phases 110-116) and v4.15 Phase 152 — per-company credit balance, real AI cost vs markup, auto-top-up status as the primary display, keeping force-tier/grant-credits as secondary actions.

**No new backend logic** — every data source this phase needs already exists and is production-tested. **Independent of Phases 156/157/159** — different files (`app/admin/billing/*` only).

## Current state (exact, confirmed via research)

**File:** `app/admin/billing/page.tsx` (lines 1-52, server component):
- Fetches pro-tier count and business-tier count via separate `.eq('tier', ...)` queries.
- MRR line 23: `const mrr = (proCount ?? 0) * 29 + (bizCount ?? 0) * 99` — **HARDCODED**, not sourced from `billing_config`.
- MRR card (lines 35-45): `Card variant="stat"`, heading "Monthly Recurring Revenue", `${mrr.toLocaleString()}`, caption `"{proCount} Pro × $29 + {bizCount} Business × $99"`.
- Companies query (top 200 by created_at): selects only `id, name, tier, tier_trial_ends_at, stripe_subscription_id, tier_renews_at` — **zero credit/cost columns**.
- Renders `<BillingTable companies={companies ?? []} />`.

**File:** `app/admin/billing/billing-table.tsx` (client component):
- Table columns: Company / Tier (badge) / Trial ends / Stripe sub / Force tier (select+date+button) / Grant credits (number input+button) / Status message.
- Actions: `forceTier(companyId, tier, expiresAt?)` and `grantBonusCredits(companyId, units)` in `lib/actions/admin/billing/actions.ts` — both KEEP WORKING UNCHANGED, just become secondary/de-emphasized UI, not removed.

## Already-built credit-model functions to REUSE (confirmed via research — do not reimplement any of this)

| Function | Location | Signature | What it returns |
|---|---|---|---|
| `getCompanyCostOverview` | `lib/queries/admin-company-cost.ts` | `(companyId: string, markup: number) => Promise<CompanyCostOverview>` | `{ creditBalance, totalRealCostUsd, markup, perOperation: OpCostStat[] }` — already used by `CompanyCostCard` on `/admin/companies/[id]` (Phase 152) |
| `aggregateAiCostByOperation` | `lib/billing/calibration.ts` | `(companyId?: string) => Promise<OpCostStat[]>` | Per-operation `{ operationType, n, meanUsd, medianUsd, p90Usd }[]` — **no-arg call is platform-wide** (all companies), already used for the existing `MeasuredCostCard` calibration display on `/admin/integrations` |
| `getBillingConfig` | `lib/billing/billing-config.ts` | `() => Promise<BillingConfig>` | Includes `.markup` (currently 4.5) needed as the `markup` param above |
| `CompanyCostCard` | `app/admin/companies/[id]/company-cost-card.tsx` | React component, `{ overview: CompanyCostOverview }` prop | Existing UI pattern for a single company's cost breakdown — reference for visual/structural style, may be reused directly or adapted into a table-row-expandable form |

## Target admin Billing page structure (locked)

1. **Platform-wide summary card** — REPLACE the current "Monthly Recurring Revenue" `$mrr` card. New content: call `aggregateAiCostByOperation()` with NO argument (platform-wide mode) and `getBillingConfig()` for the markup, then show the aggregated REAL cost across all companies and the credits that cost represents at the current markup (i.e. `realCostUsd × markup ÷ creditUnitUsd`, the same formula `MeasuredCostCard` already uses) as the headline number instead of the old hardcoded MRR math. Keep the same `Card variant="stat"` visual container — this is a data-source swap, not a new visual component.
2. **Per-company table** — EXTEND the existing `companies` query to also select/join credit data (via `getCompanyCostOverview(companyId, markup)` per row, or a batched equivalent if per-row N+1 queries would be too slow for 200 rows — Claude's Discretion on batching strategy, but prefer a single efficient query path over 200 sequential calls; consider whether `getCompanyCostOverview` can be adapted to accept an array of IDs, or whether a lighter per-row summary suffices for the LIST view with the full `CompanyCostCard`-style detail staying on the existing `/admin/companies/[id]` page which is NOT being touched by this phase). Add new columns/cells: **Credit balance**, **Real cost (USD)**, and an **Auto-top-up** status indicator (on/off, reading `company.auto_topup_enabled`) — as the PRIMARY visible data per row.
3. **Force tier / Grant credits** — KEEP both actions working exactly as today (BILLADMIN-02 — do not remove or break `forceTier`/`grantBonusCredits`), but de-emphasize visually: move them into a less prominent position (e.g. a collapsed "Manage" action/menu per row, or push them to the right-most columns after the new credit-model columns) rather than being the first thing the admin sees. The existing Tier badge display may stay as a column (tier is still relevant context) — just no longer the headline.
4. **Trial ends / Stripe sub columns** — Claude's Discretion whether to keep, since they're not banned, just no longer the primary lens; keep if there's room, drop if the table gets too wide, given the new credit-model columns take priority per BILLADMIN-01.

## What must NOT change

- `forceTier()` and `grantBonusCredits()` server actions in `lib/actions/admin/billing/actions.ts` — logic, signatures, audit logging, notification dispatch all unchanged.
- No new `credit_ledger` rows, no new `billing_config` fields, no new DB columns/migrations — this phase reads existing data only.
- `getCompanyCostOverview`, `aggregateAiCostByOperation`, `getBillingConfig` — read-only reuse, do not modify their signatures or behavior (Phase 156 also touches billing but different files — do not let this phase's changes ripple into `lib/billing/credit-ledger.ts` or tenant-facing components).
- `CompanyCostCard` on `/admin/companies/[id]` — untouched (may be visually referenced/adapted from, but that file itself is out of scope for this phase).
- This is an ADMIN-ONLY surface (already gated by `requireAdmin()`) — real numbers (exact credit balance, real USD cost, markup) are EXPLICITLY ALLOWED here, unlike the tenant-facing Phase 156 fixes. Do not apply the "never show raw numbers" rule to this admin page — that rule is tenant-only.

## Test blast radius

- Any existing test asserting the current `page.tsx` MRR calculation (`pro*29 + business*99` or the "Monthly Recurring Revenue" heading) needs updating to assert the new credit/cost-based summary instead.
- Any test asserting the current `billing-table.tsx` column set needs updating if columns are reordered/added — check for column-header string assertions.
- `forceTier`/`grantBonusCredits` action tests should remain green UNCHANGED (their behavior isn't touched) — if any fail due to unrelated import/structural changes in the same files, that's a real regression to fix, not an expected test update.

## Claude's Discretion

- Exact query/batching strategy for computing per-company credit+cost data across up to 200 rows efficiently (single query with a join/aggregate vs. a capped subset vs. lazy-load — pick whatever keeps the page reasonably fast without introducing N+1 query risk).
- Whether the platform-wide summary card keeps the same "stat" card visual style or gains a second card (e.g. one for "Real cost" and one for "Credits equivalent") — either is acceptable, just replace the misleading MRR-only framing.
- Naming for the new summary card heading (e.g. "Platform AI Cost" vs "Real Usage Cost") — pick something clear and accurate, avoid reusing "Monthly Recurring Revenue" since that implies subscription revenue, not AI cost.

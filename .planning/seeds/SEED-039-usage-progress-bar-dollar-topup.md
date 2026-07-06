---
id: SEED-039
status: harvested
planted: 2026-07-05
planted_during: v4.14 SEO Readiness (Phase 1001 wrap-up)
harvested: 2026-07-05
harvested_in: v4.15 Credit UX Polish & Admin Support Tooling (Phases 152-153)
trigger_when: Now — next milestone after the current SEO wrap-up. Live tenants are already looking at the raw "2,000 credits" counter today.
scope: Medium
---

# SEED-039: Usage Progress Bar + Dollar-Based Credit Top-Up (Claude-style UX)

## Why This Matters

Xtimator today shows tenants a raw numeric credit counter ("2,000 credits" in the top nav
and on Settings > Plans). The owner wants tenants to never see credit/dollar math at all —
just a simple, trustworthy consumption indicator, the same pattern Anthropic uses in Claude
Code / Console: a progress bar with a percentage that depletes over the billing cycle. The
exact $ cost and credit ledger should stay visible, but **only to the super admin**, for
internal accounting. The "buy more credits" flow should also flip from
"buy N credits" to "buy $20 / $50 / $100", i.e. the customer picks a dollar amount, and that
converts to credits behind the scenes — with an auto-top-up option when the balance runs low,
mirroring Anthropic Console's Auto Top-Up UX.

## When to Surface

**Trigger:** Now — next milestone after the current SEO wrap-up. Live tenants are already
looking at the raw "2,000 credits" counter today.

This seed should be presented during `/gsd:new-milestone` when the milestone scope matches
any of these conditions:
- Billing / Plans page UI work
- Any follow-up to the credit-based billing system ([[SEED-035-credit-based-subscription-billing]])
- A general UX/polish milestone that touches Settings

## Scope Estimate

**Medium** — the credit ledger, markup math, and low-balance logic already exist
(SEED-035 delivered the backend). This seed is the **frontend + purchase-flow** layer on
top of it:
1. Replace the numeric credit badge with a single progress bar (% used, color-escalating).
2. Gate raw $/credit numbers behind a super-admin-only view.
3. Rework the top-up purchase flow to be dollar-pack based ($20/$50/$100, configurable)
   instead of credit-quantity based.
4. Express the auto-top-up threshold/amount in dollars to the tenant.

No new backend ledger or pricing model is needed — this reuses SEED-035's `billing_config`
and `credit_ledger`.

## Reference (visual target — NOT current Xtimator state)

The owner supplied screenshots of Anthropic's own Claude Code / Console UI as the literal
visual target, not of Xtimator:
- A thin plan-usage progress bar: `Context window 929.5k / 967k (96%)` — percentage +
  colored track, no emphasis on raw numbers.
- Multiple stacked usage bars ("5-hour limit", "Weekly · all models") — each just a bar +
  reset time + %.
- An "Auto Top-Up" settings card: *"Auto top-up is enabled and will add $10 automatically
  when your balance drops below $2."*
- The Auto Top-Up modal: payment method list (primary + up to 2 backups, tried in order),
  **"When credits are below: $__"** and **"Purchase this amount: $__"** — both fields are
  dollar amounts, never raw credit counts.

## Current Xtimator State (already shipped by SEED-035)

- [`app/(app)/settings/billing/page.tsx`](app/(app)/settings/billing/page.tsx) renders the
  current Plans page: tier card, usage card, and the credit widgets.
- [`components/billing/credit-balance-card.tsx`](components/billing/credit-balance-card.tsx) —
  the numeric balance card to be replaced by a progress bar.
- [`components/billing/credit-history-list.tsx`](components/billing/credit-history-list.tsx) —
  consumption history list (likely stays, but reconsider what's tenant-visible vs admin-only).
- [`components/billing/top-up-button.tsx`](components/billing/top-up-button.tsx) — existing
  top-up entry point, presumably credit-quantity based today; needs to become
  dollar-pack based.
- [`lib/queries/credits.ts`](lib/queries/credits.ts) — `getCreditOverview` (balance,
  `lowBalanceThresholds`, history) — the data this UI consumes.
- [`lib/billing/billing-config.ts`](lib/billing/billing-config.ts) — the super-admin-configurable
  knob store (per SEED-035 principle 6: markup, grants, packages). Dollar top-up pack sizes/
  prices belong here, not hardcoded.
- [`lib/billing/credit-ledger.ts`](lib/billing/credit-ledger.ts) — the ledger read/write layer.
- [`app/admin/integrations/measured-cost-card.tsx`](app/admin/integrations/measured-cost-card.tsx) —
  existing super-admin cost-visibility pattern; likely the right place to extend for
  per-tenant $ cost visibility.

## Related Seeds & Decisions

- [[SEED-035-credit-based-subscription-billing]] — the credit ledger, markup, and
  low-balance-threshold foundation. This seed is purely the UI/UX and purchase-flow layer
  on top; do not duplicate or re-derive the ledger logic.
- [[SEED-038-annual-billing-discount]] — shares the Plans page real estate; sequence the
  two so they don't collide in the same UI pass.

## Notes

The internal credit ledger and $ markup math from SEED-035 stay exactly as they are. This
seed is scoped to three things only: (a) hide raw numbers from tenants behind a % progress
bar, (b) expose the $ numbers to the super admin only, (c) make the top-up purchase flow
dollar-first with auto-top-up, matching the Anthropic Console pattern the owner referenced.

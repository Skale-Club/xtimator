---
phase: 84-v4-0-billing-per-company-tier-and-trial-scoped-to-company
status: complete-by-prior-work
shipped: 2026-05-26
mode: investigation
---

# Phase 84 — Billing Per-Company: Already Shipped (No Code Changes Needed)

## Finding

Investigation shows that **billing is already per-company at the data layer**. No migration or code rewrite is required in this phase — the columns and scoping were correctly designed in Phase 55 (Subscription Tier Definitions) and the supporting work landed across Phases 56-60.

### Billing columns live on `companies`

Confirmed via `information_schema.columns`:

| Column | Source phase |
|---|---|
| `tier` | Phase 55 |
| `tier_trial_ends_at` | Phase 55 |
| `tier_renews_at` | Phase 55 |
| `tier_cancelled_at` | Phase 55 |
| `stripe_customer_id` | Phase 58 |
| `stripe_subscription_id` | Phase 58 |
| `stripe_account_id` / `stripe_account_email` / `stripe_connect_status` / `stripe_connected_at` / `stripe_account_display_name` | Phase 70 (Stripe Connect) |

All billing state is per-row in `companies`, which means after Phase 79 (every owner has a `company_members` row) and Phase 81 (Switcher cookie), creating a second company via `createOrUpdateCompany('add')` produces an INDEPENDENT billing row with its own tier + trial clock + Stripe customer.

### Trial inheritance (Phase 79 D-14/D-15) already in place

`lib/actions/company.ts` mode:'add' branch copies `tier` + `tier_trial_ends_at` from the source company at insert time. Verified in Phase 79's plan 03 SUMMARY and existing tests.

### usage_events already per-company

Phase 56 created `usage_events` keyed by `company_id` (deny-all RLS, service-role writes only). Quota checks via `checkQuota(companyId, ...)` use the active company id, which after Phase 83 is derived from the cookie.

### What's NOT in this phase

These were originally written into the v4.0 milestone goal but are best handled as separate, smaller follow-ups:

- **Per-company billing UI** — the `/settings/billing` page currently scopes via `getActiveCompany()` already (since the layout in Phase 79 swapped to the active-company resolver). If a multi-company user wants to see billing for a different company, they switch via the Switcher — same as everything else. No special billing-switcher UI needed.
- **Stripe webhook routing** — `stripe.checkout.session.completed` writes `tier='pro'` to the company whose `stripe_customer_id` matches. This was per-company since Phase 58. No change needed.
- **Trial expiry cron** — Phase 60's pg_cron job iterates over `companies` rows where `tier='trial' AND tier_trial_ends_at < now()`. Per-row, so already per-company.

## Mode note

This phase shipped via **investigation only** — no migration, no code change. The pragmatic close-out documents that the work was completed in prior phases as a side-effect of correct schema design.

If a future product decision changes the billing model (e.g., "single user-level subscription that covers N companies"), that becomes a new phase. For v4.0 the current per-company model is correct.

## What's next

Phase 85 — Drop `companies.user_id`. With Phase 82 (RLS via company_members) and Phase 83 (actions via active cookie) both landed, the legacy column is reachable for drop. Phase 85 owns the migration + the remaining allowlisted-file refactors (auth.ts redirect, company.ts mode:'first' upsert).

---
phase: 58-stripe-integration
plan: "01"
subsystem: billing
tags: [stripe, billing, sdk, idempotency, wave0-stubs]
dependency_graph:
  requires: [55-schema-tier-definitions]
  provides: [stripe-client-factory, checkout-session-route, portal-session-route, stripe-idempotency-table]
  affects: [admin-integrations, billing-api]
tech_stack:
  added: [stripe@22.1.1]
  patterns: [per-request-sdk-init, deny-all-rls, wave0-nyquist-stubs]
key_files:
  created:
    - lib/billing/stripe-client.ts
    - app/api/billing/create-checkout-session/route.ts
    - app/api/billing/create-portal-session/route.ts
    - supabase/migrations/20260514000001_phase58_stripe_processed_events.sql
    - tests/unit/billing/checkout.test.ts
    - tests/unit/billing/portal.test.ts
    - tests/unit/billing/stripe-webhook.test.ts
  modified:
    - lib/platform-config.ts
    - lib/schemas/admin.ts
    - app/admin/integrations/actions.ts
    - package.json
    - package-lock.json
decisions:
  - "stripe@22.1.1 installed (API version 2026-04-22.dahlia — not the plan-specified 2025-04-30.basil)"
  - "getStripeClient() per-request factory follows ADMIN-06 pattern — no module-level Stripe instance"
  - "Checkout route uses supabase.auth.getClaims() pattern (established codebase pattern) instead of getClaims from @/lib/auth"
  - "Wave 0 stubs use expect.fail() for Nyquist compliance — all 14 tests are RED"
metrics:
  duration: "5min"
  completed_date: "2026-05-14"
  tasks_completed: 3
  files_changed: 11
---

# Phase 58 Plan 01: Stripe SDK Foundation + Billing API Routes Summary

Installed stripe@22.1.1, extended IntegrationProvider to include 'stripe', created the DB idempotency migration, built getStripeClient() per-request factory, implemented checkout-session and portal-session routes, and wrote 14 Wave 0 failing test stubs across three billing test files.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Install stripe SDK + extend IntegrationProvider + migration SQL | a3d801b | package.json, lib/platform-config.ts, lib/schemas/admin.ts, app/admin/integrations/actions.ts, migration SQL |
| 2 | lib/billing/stripe-client.ts + checkout + portal route handlers | adb446c | lib/billing/stripe-client.ts, create-checkout-session/route.ts, create-portal-session/route.ts |
| 3 | Wave 0 failing test stubs for STRIPE-01..04 | bb8bdb4 | tests/unit/billing/checkout.test.ts, portal.test.ts, stripe-webhook.test.ts |

## What Was Built

**stripe@22.1.1 SDK** installed. IntegrationProvider union and integrationKeySchema zod enum extended with 'stripe'. Admin testIntegrationKey now handles the stripe case by calling `stripe.balance.retrieve()` and returning the available currency.

**lib/billing/stripe-client.ts** — server-only per-request factory that calls `getIntegrationKey('stripe')` and throws a descriptive error if not configured. Follows the established ADMIN-06 pattern (no module-level SDK instantiation).

**app/api/billing/create-checkout-session/route.ts** — POST handler that authenticates via `supabase.auth.getClaims()`, fetches the company by user_id, resolves the price ID from `STRIPE_PRICE_PRO` or `STRIPE_PRICE_BUSINESS` env vars, and creates a Stripe Checkout session with `metadata: { companyId, plan }` on both the session and `subscription_data`. Attaches existing `stripe_customer_id` if present to avoid duplicate customer creation.

**app/api/billing/create-portal-session/route.ts** — POST handler that creates a Customer Portal session. Returns 400 when `stripe_customer_id` is absent (company has no active subscription).

**supabase/migrations/20260514000001_phase58_stripe_processed_events.sql** — `processed_stripe_events` table with `event_id TEXT PRIMARY KEY` and deny-all RLS. Service role writes only (same pattern as usage_events from Phase 56).

**14 Wave 0 test stubs** — 3 for checkout, 3 for portal, 8 for webhook+idempotency. All fail with `expect.fail()` (Nyquist-compliant RED state). Plan 02 will implement the webhook handler and turn these GREEN.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Stripe API version mismatch**
- **Found during:** Task 1 TypeScript compilation check
- **Issue:** Plan specified API version `'2025-04-30.basil'` but stripe@22.1.1 declares `ApiVersion = "2026-04-22.dahlia"` — TypeScript error TS2322 at compile time
- **Fix:** Changed API version to `'2026-04-22.dahlia'` in both `app/admin/integrations/actions.ts` stripe case and `lib/billing/stripe-client.ts`
- **Files modified:** app/admin/integrations/actions.ts, lib/billing/stripe-client.ts
- **Commit:** a3d801b (actions.ts), adb446c (stripe-client.ts)

**2. [Rule 1 - Bug] Used established auth pattern in route handlers**
- **Found during:** Task 2 — plan's interfaces section listed `getClaims` from `@/lib/auth` but that module doesn't export `getClaims`; the codebase uses `supabase.auth.getClaims()` directly in all API routes
- **Fix:** Used `supabase.auth.getClaims()` pattern consistent with generate-estimate/route.ts and all other authenticated API routes in the codebase
- **Files modified:** app/api/billing/create-checkout-session/route.ts, app/api/billing/create-portal-session/route.ts
- **Commit:** adb446c

## Known Stubs

The Wave 0 test stubs in `tests/unit/billing/` are intentional — they are Nyquist-compliant failing stubs that will be implemented in Plan 02 (webhook handler). They are not stubs in the "incomplete feature" sense; the routes themselves are fully implemented.

## Self-Check: PASSED

Files verified to exist:
- lib/billing/stripe-client.ts: EXISTS
- app/api/billing/create-checkout-session/route.ts: EXISTS
- app/api/billing/create-portal-session/route.ts: EXISTS
- supabase/migrations/20260514000001_phase58_stripe_processed_events.sql: EXISTS
- tests/unit/billing/checkout.test.ts: EXISTS
- tests/unit/billing/portal.test.ts: EXISTS
- tests/unit/billing/stripe-webhook.test.ts: EXISTS

Commits verified:
- a3d801b: feat(58-01): install stripe SDK, extend IntegrationProvider, add idempotency migration
- adb446c: feat(58-01): add getStripeClient factory + checkout-session and portal-session routes
- bb8bdb4: test(58-01): add Wave 0 failing stubs for STRIPE-01, STRIPE-02, STRIPE-03, STRIPE-04

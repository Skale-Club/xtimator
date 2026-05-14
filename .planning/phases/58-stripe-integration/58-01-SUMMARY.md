---
phase: 58-stripe-integration
plan: "01"
subsystem: monetization
tags: [stripe, checkout, portal, webhook, billing]
note: executed-in-worktree
dependency_graph:
  requires: [55-01]
  provides: [stripe-routes, stripe-webhook, lib/billing/stripe-client.ts]
  affects: [app/api/billing/, app/api/webhooks/stripe/, lib/billing/stripe-client.ts]
key_files:
  created:
    - lib/billing/stripe-client.ts
    - app/api/billing/create-checkout-session/route.ts
    - app/api/billing/create-portal-session/route.ts
    - app/api/webhooks/stripe/route.ts
    - supabase/migrations/20260514000001_phase58_stripe_processed_events.sql
metrics:
  duration_minutes: 30
  tasks_completed: 5
  tasks_total: 5
  files_created: 5
  files_modified: 0
  completed_date: "2026-05-14"
---

# Phase 58 Plan 01: Stripe Integration Summary

**One-liner:** Stripe Checkout + Customer Portal + webhook handler with 4 lifecycle events and idempotency via `processed_stripe_events`.

## What Was Built

### `lib/billing/stripe-client.ts`
- `getStripeClient()` per-request factory — follows ADMIN-06 pattern (no module-level Stripe instance)
- Reads key via `getIntegrationKey('stripe')`
- `import 'server-only'` marker

### `/api/billing/create-checkout-session`
- Creates Stripe Checkout Session with `{ plan, companyId }` in metadata
- Stores `stripe_customer_id` on `companies` if new

### `/api/billing/create-portal-session`
- Returns Stripe Customer Portal URL

### `/api/webhooks/stripe/route.ts`
- Raw body first, `constructEvent` signature verification
- 4 lifecycle handlers: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`
- Idempotency via `processed_stripe_events` table (upsert ON CONFLICT DO NOTHING)
- `invoice.payment_failed` makes zero DB writes — Stripe dunning handles retries
- `customer.subscription.deleted` triggers `tier='free'` downgrade

### Migration (`20260514000001_phase58_stripe_processed_events.sql`)
- `processed_stripe_events` table: event_id PK, processed_at; deny-all RLS

## Decisions

- stripe@22.1.1 API version is `2026-04-22.dahlia` (not `2025-04-30.basil` as planned — auto-fixed by executor)
- Per-request `getStripeClient()` follows ADMIN-06 — no module-level Stripe instance
- `invoice.paid` subscription ID extracted via legacy field cast + parent.subscription_details fallback (Stripe API 2026-04-22 moved subscription to nested structure)

## Self-Check: PASSED

- Executed via git worktree — artifacts merged to main

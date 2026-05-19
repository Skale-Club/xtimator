---
id: SEED-017
status: harvested
planted: 2026-05-14
planted_during: post-v3.0 (between milestones)
trigger_when: When activating real payments in production (go-live with Stripe)
scope: Small
---

# SEED-017: Stripe Live Mode Webhook for xtimator.com

## Why This Matters

The Stripe webhook endpoint for `https://xtimator.com/api/webhooks/stripe` was created in **test mode** only. The Stripe CLI restricted key (`rk_live_*`) used during setup does not have permission to create webhook endpoints in live mode.

Without the live mode webhook registered, Stripe will not send real payment events (subscription activations, renewals, cancellations) to the app — meaning tier upgrades will not apply after real payments.

## When to Surface

**Trigger:** When preparing to accept real payments in production — i.e., before the first paid customer or when switching Stripe from test to live mode.

This seed should be presented during `/gsd:new-milestone` when:
- Milestone involves production go-live or launch
- Milestone involves activating Stripe live keys
- Any milestone focused on revenue / first paying customer

## What Needs to Be Done

1. Log into **dashboard.stripe.com → Developers → Webhooks** (live mode toggle ON)
2. Click **Add endpoint**
3. URL: `https://xtimator.com/api/webhooks/stripe`
4. Events to select:
   - `checkout.session.completed`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `customer.subscription.deleted`
5. Copy the **Signing secret** (`whsec_live_...`) shown after creation
6. Add to **Vercel → Project → Environment Variables → Production**:
   ```
   STRIPE_WEBHOOK_SECRET = whsec_live_...
   ```

Alternatively via API with `sk_live_*` full secret key:
```bash
stripe webhook_endpoints create \
  --url="https://xtimator.com/api/webhooks/stripe" \
  --enabled-events="checkout.session.completed,invoice.paid,invoice.payment_failed,customer.subscription.deleted" \
  --api-key sk_live_...
```

## Current State (test mode — already done)

- Test webhook registered (see Stripe Dashboard → Webhooks for ID/secret)
- Test secret stored in Vercel env vars under `STRIPE_WEBHOOK_SECRET` (preview/staging)
- Local dev secret in `.env.local` as `STRIPE_WEBHOOK_SECRET` (from `stripe listen`)

**SECURITY NOTE:** Never commit webhook secrets, API keys, or signing secrets. They go in `.env.local` (gitignored) or Vercel env vars only.

## Scope Estimate

**Small** — 10 minutes in the Stripe Dashboard. No code changes required; only a Vercel env var update.

## Breadcrumbs

- `app/api/webhooks/stripe/route.ts` — webhook handler (reads `STRIPE_WEBHOOK_SECRET`)
- `lib/billing/stripe-client.ts` — `getStripeClient()` per-request factory
- `supabase/migrations/20260514000001_phase58_stripe_processed_events.sql` — idempotency table

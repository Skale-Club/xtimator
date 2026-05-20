---
id: SEED-021
status: ready
planted: 2026-05-17
planted_during: post-Phase-70 (Stripe Connect customer payments shipped in test mode)
trigger_when: Going live with real customer payments — same trigger as SEED-017 (Stripe Live Webhook)
scope: Small
---

# SEED-021: Stripe Connect Live Mode Activation + Platform Branding

## Why This Matters

Phase 70 shipped Stripe Connect Standard fully working in **test mode** (Client ID `ca_SmWRqFVGYFFDRXMgEhSwEewL64Pp63Pc`, webhook `we_1TXy61FNcPC8Pzz0V21rbF1q`). Tenants can connect, customers can pay with test cards (`4242 4242 4242 4242`), webhooks fire, estimates flip to `paid`, emails arrive.

Activating **live mode** is a separate one-time platform action by the Xtimator owner. Until done:
- No tenant can connect their real Stripe account in production
- "Connect Stripe Account" button in `/settings/payments` either errors or runs against test mode
- No real money moves anywhere

This is a **platform-level** concern (Xtimator's responsibility, NOT each tenant's). Each tenant has their own Stripe account, but they can only connect via the OAuth URL `connect.stripe.com/oauth/authorize?client_id=ca_LIVE_VALUE` — and that `ca_LIVE_VALUE` is owned by Xtimator and must be created once in the Dashboard.

## When to Surface

**Trigger (any of):**
- v3.2 production deploy milestone is being planned
- First tenant requests real payment activation
- SEED-017 (Stripe Live Webhook) is also being harvested

Surface alongside SEED-017 — both are "go-live with real Stripe" tasks.

## What Needs to Be Done

### Part A: Live Mode Connect Application (Stripe Dashboard — Dashboard-only, no API)

1. Log in to `dashboard.stripe.com` → toggle to **Live mode** (top-right)
2. **Connect → Settings → Get Started** (if not enabled in live yet)
3. Choose **Standard** integration type
4. Copy the **Client ID** (`ca_LIVE_...`) shown after creation
5. **Configure Platform Settings** (these affect what tenants see in OAuth screens):
   - Brand name: `Xtimator`
   - Logo upload: 128×128 PNG/SVG with Xtimator wordmark
   - Brand color: `#406EF1`
   - Support email: `support@xtimator.com` (or the platform owner email)
   - Privacy Policy URL: `https://xtimator.com/privacy`
   - Terms of Service URL: `https://xtimator.com/terms`
6. **OAuth Settings → Redirect URIs:**
   - Add `https://xtimator.com/api/stripe/connect/callback`
   - Keep `http://localhost:3000/api/stripe/connect/callback` if dev still uses live (usually don't — keep dev in test mode)

### Part B: Live Mode Connect Webhook (can be done via CLI)

```bash
stripe --live webhook_endpoints create \
  --url "https://xtimator.com/api/webhooks/stripe" \
  --enabled-events "checkout.session.completed" \
  --enabled-events "account.application.deauthorized" \
  --enabled-events "account.updated" \
  --connect \
  --description "Phase 70 — Stripe Connect customer payments (live)"
```

Capture the returned `secret` (`whsec_live_...`).

### Part C: Env Variable Promotion (Vercel)

Add to **Vercel → Project → Environment Variables → Production**:
- `STRIPE_CONNECT_CLIENT_ID_API_KEY = ca_LIVE_...` (from Part A step 4)
- `STRIPE_CONNECT_WEBHOOK_SECRET = whsec_live_...` (from Part B output)

If using the `/admin/integrations` UI path instead of env vars, paste the Client ID into the Stripe Connect Client ID card (encrypted via existing AES-GCM `platform_integrations` pattern).

### Part D: Smoke Test (1 round-trip with real Stripe live mode)

1. Log in as a non-admin tenant company
2. Navigate to `/settings/payments`
3. Click "Connect Stripe Account" — should redirect to live OAuth URL
4. Complete authorization (use a real Stripe account for the smoke test)
5. Verify return → "Connected ✓ as [display name]"
6. Create a fixture estimate → share → click "Pay $X" → see Stripe Checkout (live mode)
7. Cancel (don't actually pay real money) — verify cancel redirect works
8. Disconnect — verify status flips back

## Current State (test mode — already done in Phase 70 ship)

- Test mode Client ID: `ca_SmWRqFVGYFFDRXMgEhSwEewL64Pp63Pc`
- Test mode webhook ID: `we_1TXy61FNcPC8Pzz0V21rbF1q`
- Test mode webhook secret: stored in `.env.local` as `STRIPE_CONNECT_WEBHOOK_SECRET`
- Handler verifies BOTH platform secret AND Connect secret (try-each-then-fail pattern in `app/api/webhooks/stripe/route.ts`)

## Scope Estimate

**Small** — ~30 minutes total. No code changes. Pure configuration (Dashboard + CLI + env vars).

## Breadcrumbs

- `docs/STRIPE-CONNECT-OWNER-SETUP.md` — full runbook covering both test (already done) and live (this seed)
- `app/api/webhooks/stripe/route.ts` — handler that needs the new Connect webhook secret
- `lib/platform-config.ts` — `stripe_connect_client_id` provider in the `IntegrationProvider` union
- `app/admin/integrations/page.tsx` — admin UI card to paste the live Client ID
- `.env.local` — current test-mode values (copy structure for Vercel prod)

## Notes

- **NOT each tenant's responsibility:** the Connect Application (`ca_...`) belongs to the Xtimator platform Stripe account, not to any tenant. Each tenant only needs a Stripe account; the platform-level Connect app is what enables them to connect via OAuth.
- **NOT each tenant's branding:** the brand shown on the OAuth authorization page (logo + name) is the PLATFORM's brand (Xtimator). The brand shown on Checkout pages when the end customer pays is the TENANT's brand (their business name + their Stripe account branding) — Stripe forces tenants to configure that during their own onboarding, so no Xtimator action needed there.
- This seed is paired with **SEED-017** (Stripe Live Mode Webhook for platform subscription billing). Both should be harvested together in the same go-live session.

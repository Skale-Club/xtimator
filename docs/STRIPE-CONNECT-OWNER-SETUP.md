# Stripe Connect — Owner Setup Runbook

This is a one-time platform setup. After completing, any tenant company can
connect their Stripe account from **Settings → Payments** and start accepting
card payments on their shared estimates.

- **Time required:** ~15 minutes.
- **Prerequisites:**
  - Stripe account with test mode access (and production access when ready to
    go live).
  - Super-admin login to Xtimator (i.e. a row in `platform_admins`).
  - DB access to apply the Phase 70 migration to your target environment.
- **Owner of this doc:** Xtimator platform owner. Re-read this whenever you
  promote Connect from staging → production.

---

## ✅ TEST MODE — Already Done Automatically (2026-05-17)

The following steps were executed via `supabase` and `stripe` CLIs during ship,
so **test mode is ready to use out of the box**:

| Step | What was done | Artifact |
|------|---------------|----------|
| ✅ Migration applied | `supabase db push --db-url $DATABASE_URL` ran the Phase 70 migration against production DB | All Connect columns now exist on `companies` + `estimates` |
| ✅ Connect verified enabled | `stripe accounts list` returned 200 (Connect is active on `acct_1OLXrgFNcPC8Pzz0`) | — |
| ✅ Connect webhook created | `stripe webhook_endpoints create --connect --url https://xtimator.com/api/webhooks/stripe` | Webhook ID: `we_<your-connect-webhook-id>` |
| ✅ Test mode Connect Client ID captured | Returned in webhook creation response (`application` field) | `ca_<your-connect-client-id>` |
| ✅ Test mode Connect webhook secret captured | Returned in webhook creation response (`secret` field) | `whsec_<your-connect-webhook-secret>` (stored in `.env.local`, never committed) |
| ✅ Credentials added to `.env.local` | `STRIPE_CONNECT_CLIENT_ID_API_KEY` + `STRIPE_CONNECT_WEBHOOK_SECRET` | (gitignored) |
| ✅ Webhook handler updated | Now verifies signature against BOTH platform secret AND Connect secret (try-each pattern) | `app/api/webhooks/stripe/route.ts` |

**You can skip directly to Section 7 (smoke test) for test mode** — sections 1-6 below are reference / for go-live to LIVE mode.

For **production live mode**, you still need to:
1. Repeat steps via Dashboard in live mode (Stripe issues separate `ca_live_...` and live-mode webhook secrets)
2. Set the live values in `/opt/xtimator/.env.production` on the Hetzner VPS (or the Coolify UI → service → Environment Variables), then redeploy so the container picks them up — NOT Vercel
3. Configure the Connect platform branding (logo, color) in Dashboard for end-user OAuth pages

---

## 1. Enable Connect in the Stripe Dashboard

1. Log into [dashboard.stripe.com](https://dashboard.stripe.com) (top-left
   account switcher → your Xtimator platform account).
2. Top-left product menu → **Connect** → **Get Started**.
3. Choose integration type: **Standard**.
4. Confirm — Connect is now enabled for the Xtimator platform.

Connect is now switched on. The remaining sections wire it up.

## 2. Configure Platform Branding

Stripe Dashboard → **Connect → Settings → Branding**. Connected accounts'
OAuth consent screen and customer-facing Checkout pages use these values.

- **Brand name:** `Xtimator`
- **Brand color:** `#406EF1`
- **Logo:** upload the Xtimator logo (square SVG/PNG, transparent background).
  Stripe scales it automatically for the OAuth banner and Checkout header.
- **Support email:** `support@xtimator.com` (or your owner email).
- **Public business URL:** `https://xtimator.com`.

## 3. Configure OAuth Redirect URIs

Stripe Dashboard → **Connect → Settings → Integration**. Stripe will redirect
the connecting business back to one of these URIs after they authorize the
OAuth grant. Add both:

- Production: `https://xtimator.com/api/stripe/connect/callback`
- Local development: `http://localhost:9633/api/stripe/connect/callback`
  (the dev server listens on port 9633 per `playwright.config.ts`).

If you deploy to a staging URL, add it here too — Stripe rejects any redirect
not on this allowlist with `invalid_redirect_uri`.

## 4. Copy the Connect Client ID into Xtimator Admin

The Client ID is a **public** identifier that Xtimator embeds in the OAuth
authorize URL. It is not a secret, but it is per-platform and unique.

1. Stripe Dashboard → **Connect → Settings**. Top of the page shows
   **Client ID** in the form `ca_<random>` (test-mode and live-mode each have
   their own — copy the one matching your current Xtimator env).
2. Copy the value.
3. Log into Xtimator as a super-admin → navigate to `/admin/integrations`.
4. Find the **Stripe Connect Client ID** card (registered in Plan 70-01).
5. Paste → click **Save**.
6. Confirm the card flips to **Connected** with a `Last updated` timestamp.

The value is stored encrypted (AES-GCM via `platform_integrations`) and
read at runtime by `getIntegrationKey('stripe_connect_client_id')`.

> **Common pitfall:** the Client ID starts with `ca_`, not `sk_`. If Stripe
> rejects the OAuth authorize request with "ca_xxx invalid", you likely
> pasted a secret key by mistake.

## 5. Enable "Connected accounts" Event Scope on the Existing Webhook (CRITICAL)

The existing platform webhook endpoint (`/api/webhooks/stripe`) handles
**both** platform subscription events AND Connect customer-payment events.
Same URL, same `STRIPE_WEBHOOK_SECRET`, two event scopes.

Stripe Dashboard → **Developers → Webhooks** → click the existing endpoint:

1. Tab **Events from**: ensure **both** "Your account" AND
   "**Connected accounts**" are toggled on.
2. Under the "Connected accounts" scope, add these three events:
   - `checkout.session.completed`
   - `account.application.deauthorized`
   - `account.updated`
3. Click **Save**.

The `STRIPE_WEBHOOK_SECRET` env var does **not** change — Stripe signs both
scopes with the same secret on the same endpoint.

> **Warning sign of misconfiguration:** customer pays → redirects back to
> `/estimate/<token>?stripe=success` with the green banner → but the
> dashboard estimate row stays "unpaid" forever. First debug step:
> Stripe Dashboard → Workbench → Events for the connected account, and
> verify `checkout.session.completed` has a delivery attempt against your
> endpoint. No delivery attempt = the "Connected accounts" scope toggle
> was not saved.

## 6. Apply the Phase 70 DB Migration

The Phase 70-01 migration adds 10 columns (5 on `companies`, 5 on
`estimates`) plus two partial indexes and two CHECK constraints. It was
committed but not auto-applied in dev (local Supabase was offline at the
time per Plan 70-01 SUMMARY). You must apply it explicitly to each
environment.

```bash
# Local / linked project (after `supabase login` + `supabase link`)
npx supabase migration up

# Production: prefer the Supabase Studio "Migrations" tab or
# `supabase db push --linked` against the production project ref.
```

After applying, regenerate types so TS picks up the new columns:

```bash
npx supabase gen types typescript --linked > types/database.types.ts
```

Hand edits performed during Plan 70-01 (5 fields × 2 tables × 3 shapes)
will be overwritten by this regen — that is expected.

## 7. Smoke Test (Test Mode)

End-to-end customer payment loop. Run this exactly once after sections 1-6
to confirm Connect is wired correctly.

1. Sign up a **fresh non-admin company** in Xtimator (use an incognito
   window so existing cookies don't interfere).
2. Navigate to **Settings → Payments**.
3. Click **Connect Stripe Account** → complete OAuth in Stripe test mode
   (use your platform's test account or create a sandbox account).
4. Return to `/settings/payments?connected=1` → verify the page shows
   **Connected ✓ as `<display name>` (`<email>`)**.
5. Create a project + share an estimate (any total > $0; the test card
   ignores the actual amount).
6. Open the share link in a new incognito window → click **Pay $X** →
   use test card `4242 4242 4242 4242`, any future expiry, any CVC,
   any ZIP.
7. Verify each of the four post-payment actions fired:
   - **Redirect:** lands on `/estimate/<token>?stripe=success` with the
     green "Payment received" banner; Pay Now button no longer renders.
   - **Dashboard:** the project row shows the green **Paid** badge
     (Plan 70-05 polish) within ~5 seconds of paying.
   - **Database:** `SELECT payment_status, paid_at, payment_amount_cents,
     stripe_checkout_session_id, stripe_payment_intent_id FROM estimates
     WHERE id = '<estimate-id>';` returns `paid` plus the 4 populated
     Stripe references.
   - **Emails:** Resend dashboard shows **2 sends** for this event — one
     to the business owner (`payment-received`, from the Xtimator brand)
     and one to the customer (`payment-receipt`, from the business name).
8. Click **Disconnect** in Settings → Payments → confirm
   `companies.stripe_account_id` is NULL and
   `stripe_connect_status = 'disconnected'`. The paid estimate from
   step 7 retains `payment_status = 'paid'` (soft disconnect — history
   is preserved).

If all four checks pass, Connect is production-ready.

## 8. Troubleshooting

| Symptom                                                          | Likely cause                                                                                                                  |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| OAuth redirects to "platform not configured" / friendly message  | Section 4 skipped — `stripe_connect_client_id` is unset in `/admin/integrations`. Xtimator graceful-degrades when missing.    |
| Stripe rejects authorize URL with "ca_xxx invalid"               | You pasted a secret key (`sk_...`) instead of the Client ID (`ca_...`). Re-do section 4 with the right value.                 |
| OAuth callback shows `invalid_redirect_uri`                      | Section 3 incomplete — the env's callback URL isn't on the Stripe redirect-URI allowlist.                                     |
| OAuth callback shows `invalid_state` / `expired_state`           | CSRF state cookie blocked (strict third-party cookie mode in incognito) or the user took >10 min to complete the grant. Retry in a normal window. |
| Pay Now button never appears on the share page                   | The tenant company didn't complete Connect — `companies.stripe_account_id` is NULL for that row. Check `/settings/payments` for that company.    |
| Customer pays, redirect shows green banner, DB stays `unpaid`    | Section 5 skipped — the webhook endpoint doesn't subscribe to "Connected accounts" events. Check Stripe Workbench → Events.   |
| Webhook returns 500                                              | `STRIPE_WEBHOOK_SECRET` env var mismatch or the migration in section 6 wasn't applied (missing columns). Check server logs.  |
| Deauthorize call fails when user clicks Disconnect               | Best-effort by design — Xtimator clears its own DB regardless. The tenant can also disconnect from their Stripe Dashboard.    |
| Resend dashboard shows 0 sends after a paid event                | `resend` integration key missing in `/admin/integrations`, or the connected company's owner email is NULL. Webhook handler swallows email errors silently — check server logs for `console.error` lines from `lib/email/payment-emails.ts`. |

## Reference

- Phase 70 plans: `.planning/phases/70-stripe-connect-customer-payments/`
- Architecture spec: `.planning/seeds/SEED-020-stripe-connect-customer-payments.md`
- Research: `.planning/phases/70-stripe-connect-customer-payments/70-RESEARCH.md`
- DB migration: `supabase/migrations/20260517000001_phase70_stripe_connect_columns.sql`
- OAuth helpers: `lib/billing/connect-oauth.ts`
- Webhook handler: `lib/billing/connect-webhook.ts`
- Payment emails: `lib/email/payment-emails.ts`
- E2E snapshot tests: `tests/e2e/estimate-share-payment.spec.ts` (CONNECT-06 hard-gate)

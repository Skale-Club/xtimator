# Stripe Connect: owner setup runbook

This runbook sets up client payments on Xtimator. It is written for the platform owner, not for an engineer. Follow the numbered steps in order. Do the whole thing in Stripe test mode first, then repeat the Stripe steps in live mode.

## 1. What this is

Companies on Xtimator receive money from their own clients through Stripe hosted invoices. Each invoice is issued on the company's own Stripe account (a "direct charge"), so the money goes straight to the company. Xtimator takes an application fee on each invoice and never holds the money.

- The fee is a percentage read from the billing configuration (`billing_config`). The default is 1 percent.
- The fee is never lower than the configured minimum (default 1 cent).
- The fee is never more than 10 percent of the charge, and always strictly less than the charge itself.
- On a charge so small that no valid fee exists, the invoice is issued with no fee.

The client opens the Stripe hosted invoice page from the email Stripe sends (or from the link in the app), pays by card, and the Stripe webhook tells Xtimator the invoice is paid. Xtimator then marks the invoice row paid and sends two emails (one to the company owner, one receipt to the client).

## 2. Which Stripe account to use

Use Xtimator's OWN Stripe account (the platform account). Every company connects its separate Stripe account to this one.

Warning: a Stripe CLI profile on a developer machine may be logged in to a different account. Never use a local CLI profile to audit or configure this setup. Use the Stripe dashboard and check the account name in the top-left corner before every change.

## 3. Enable Connect (test mode first)

1. Open the Stripe dashboard and switch on **Test mode**.
2. Open **Connect** and complete the Get started flow for a platform. Choose the platform type that lets other businesses connect their existing Stripe accounts.
3. Caution about OAuth. Stripe's documentation now says OAuth is "not recommended for new Connect platforms" and steers new platforms to Stripe-hosted onboarding. The Xtimator connect step currently uses OAuth: it sends the company to `connect.stripe.com/oauth/authorize` with scope `read_write`, and exchanges the returned code at `connect.stripe.com/oauth/token`.
4. The first thing to verify is that the Connect settings in the dashboard offer an OAuth client id (it starts with `ca_`) and a place to enter redirect URIs. If they do not, STOP here. The connect routes must be changed to Stripe-hosted onboarding before going any further (task P2-00 in the Notion plan). Do not continue this runbook until that is done.

## 4. Platform profile and branding

In the Stripe dashboard, open **Settings, Connect, Branding** (the exact menu names change over time; look for the branding page of Connect). Fill in:

- Brand name: Xtimator.
- Brand color and logo (square image, transparent background).
- Support email and public business URL (`https://xtimator.com`).

Connected businesses see these on the authorization screen, and their clients may see them on invoices.

## 5. Redirect URIs

In the Connect settings, add both redirect URIs exactly as written:

- `https://xtimator.com/api/stripe/connect/callback`
- `http://localhost:9633/api/stripe/connect/callback` (only needed for local development)

Stripe rejects any other address with `invalid_redirect_uri`. If you also use a staging address, add its callback URL here too.

## 6. Save the client id in Xtimator

The client id is the public `ca_` value shown in the Connect settings. Test mode and live mode each have their own.

1. Sign in to Xtimator as a platform admin and open `/admin/integrations`.
2. Find the **Stripe Connect Client ID** card and paste the value, in the form `ca_<your-client-id>`.
3. Save. The card should show as connected with a last-updated time.

The value is stored encrypted in the `platform_integrations` table. It is not an environment variable. If Stripe later says the client id is invalid, you probably pasted a secret key (`sk_...`) by mistake.

Note: the platform Stripe secret key itself is also kept in `/admin/integrations`, not in environment variables. The connect step needs it to exchange the authorization code.

## 7. The Connect webhook

Xtimator uses one URL for two separate Stripe webhook endpoints. Each endpoint has its own signing secret, and the server tries them in turn: first `STRIPE_WEBHOOK_SECRET` (the platform endpoint, used for subscriptions), then `STRIPE_CONNECT_WEBHOOK_SECRET` (the Connect endpoint). The Connect endpoint does NOT share the platform signing secret.

1. In the Stripe dashboard, open **Developers, Webhooks** and add a NEW endpoint (do not edit the existing platform one).
2. Endpoint URL: `https://xtimator.com/api/webhooks/stripe`.
3. Choose to listen to events on **connected accounts** (not "your account").
4. Select exactly these events. They are the ones the code resolves to a company:
   - `invoice.paid`
   - `invoice.voided`
   - `invoice.marked_uncollectible`
   - `invoice.payment_failed`
   - `charge.refunded`
   - `account.updated`
   - `account.application.deauthorized`
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`

   The last two belong to the older estimate checkout flow, which no longer exists in the app. They are still handled so that old payments are recorded, and are harmless to keep. The invoice flow itself needs `invoice.paid` (marks the invoice paid and sends the emails), `charge.refunded` (refund notification and the refund record on the invoice row), and `account.updated` plus `account.application.deauthorized` (keeps connection health in sync and handles a company disconnecting from the Stripe side).
5. API version caveat. The refund handler in `lib/billing/connect-webhook.ts` reads the `invoice` field of the charge. Newer Stripe API versions no longer send that field. Until that handler is changed to resolve the invoice through the invoice payment instead (this needs a real Stripe test account to verify), create the endpoint with an API version that still includes `charge.invoice`. If you use a newer version, a refund will not match the invoice: it is neither recorded on the invoice row nor notified (the paid status is not affected).
6. Copy the signing secret of this endpoint, in the form `whsec_<your-secret>`.
7. In Coolify, open the Xtimator application, go to Environment Variables, add `STRIPE_CONNECT_WEBHOOK_SECRET` with that value, save, and redeploy the application. The variable is only read at start, so the redeploy is required.

Test mode and live mode have separate endpoints and separate secrets. Do the same again in live mode when you go live, and replace the value in Coolify.

## 8. Database

Client payments need these migrations, in this order, plus any migration added after them:

- `supabase/migrations/20261121180000_company_feature_switches.sql` (the per-company switches and the global stop)
- `supabase/migrations/20261121190000_invoice_stripe_account.sql` (each invoice row remembers the connected Stripe account it was issued on)
- `supabase/migrations/20261121200000_invoice_refunds.sql` (the refunded amount and time on the invoice row)

Migrations are applied by hand, never by the deploy, and on BOTH databases before the deploy that needs them.

1. Development database: run `npm run db:migrate`. By default it uses the development (Supabase) connection from `.env.local`.
2. Production database (PostgreSQL on Coolify): run the same command with the `MIGRATION_DATABASE_URL` variable pointing at the production database.
3. Never write to production without the owner's explicit OK.

The first migration adds the per-company switch columns and the global stop. Without it, the settings pages and the invoice action fail closed (the feature appears off). The second keeps customers and webhook events tied to the right Stripe account after a company switches accounts. The third adds `refunded_cents` and `refunded_at` to invoices; without it the invoice lists and the share links fail to load the refund data, so apply it before the deploy.

## 9. The switches

There are three layers, plus one global stop.

- Global stop: **Client payments open** in the admin billing configuration. When it is off, connecting a Stripe account and issuing invoices are closed for every company.
- Platform switch, per company: open `/admin/companies/<id>` and use the **Features** card. It has two switches, **Online payments** and **Digital signature**. Every change is recorded in the admin audit log.
- Company switches, set by the company owner: **Settings, Client actions**. The owner sees a switch for a feature only when the platform allows it for that company.

The rule: a feature works only when the platform allows it AND the owner turned it on AND (payments only) Stripe is connected and charges are enabled.

Defaults:

- Online payments are NOT allowed for any company until you allow them in the Features card. The owner switch is also off by default.
- Digital signature is allowed by default for every company. The owner switch is off by default.

## 10. Smoke test in test mode

Use a test company, never a real customer.

1. In `/admin/companies/<id>`, allow **Online payments** for the test company.
2. Sign in as that company's owner, open **Settings, Client actions**, and turn Online payments on.
3. Click connect and finish the Stripe authorization with a Stripe test account. You return to Client actions with a connected message.
4. Open an estimate whose project client has an email address, and issue a deposit invoice.
5. Open the Stripe hosted invoice page (the link in the invoice or in the email Stripe sent) and pay with the test card `4242 4242 4242 4242`, any future expiry, any CVC and any postal code.
6. Within a few seconds confirm:
   - the invoice row in the app shows paid;
   - two emails went out (one to the owner, one receipt to the client);
   - in the Stripe dashboard of the PLATFORM account, the payment shows a collected application fee.
7. Repeat for a balance invoice and for a change order invoice.
8. Refund the payment in the Stripe dashboard (on the connected test account) and confirm three things. The owner gets a refund notification. The invoice in the app, on the estimate (and change order) page, still says Paid but now carries a **Refunded** label (a full refund) or **Partly refunded** with the amount (a partial refund). The same label shows to the client on the share link. The invoice status stays paid on purpose, and the Xtimator fee is not returned on a refund.
9. Void an invoice. Issue a new invoice and leave it unpaid. As the company owner, click **Void** on the open invoice and confirm. The invoice shows as void in the app, the Stripe hosted page no longer accepts payment, and the client no longer sees a pay link. Do the same for a change order invoice. A paid invoice has no Void button: refund it in Stripe instead. Voiding also works while Online payments are switched off.
10. In the Stripe test dashboard, pause charges on the connected test account (or use a test account that is restricted). Confirm the app blocks new invoices with a message about Stripe pausing payments.
11. Disconnect from Settings, Client actions. Confirm the company shows as not connected and the earlier paid invoice stays paid.

## 11. Pilot in live mode

1. Repeat steps 3 to 7 of this runbook in live mode: Connect, client id, redirect URIs, live Connect webhook, new live signing secret in Coolify, redeploy.
2. Allow Online payments for ONE company only (a company you control).
3. Issue one real invoice of US$1.00 to a real email address you own.
4. Pay it with a real card, confirm the invoice turns paid, the emails arrive and the fee is collected.
5. Refund the payment in the Stripe dashboard and confirm the invoice shows the Refunded label.
6. Only then allow other companies.

## 12. What switching off does

- Online payments off (platform or owner): connecting a Stripe account and issuing new invoices are blocked. Invoices already sent stay visible and payable on Stripe's page, and the webhook still records any payment that arrives. The owner can still void an open invoice from the app (the **Void** button on open invoices of estimates and change orders), because that only closes an invoice that was already issued.
- Digital signature off (platform or owner): links already sent become view-only at once. Estimates and change orders that were already signed stay signed.

## 13. Troubleshooting

| Symptom | Likely cause and fix |
| --- | --- |
| Client paid in Stripe but the invoice is still open in the app | The Connect webhook is missing `invoice.paid`, is set to "your account" instead of connected accounts, or `STRIPE_CONNECT_WEBHOOK_SECRET` is wrong or was added without a redeploy. Check the endpoint's delivery log in Stripe. A `400 Invalid signature` there means the secret is wrong. |
| Connect returns to Client actions with `payments_not_available` | The platform switch is off for that company, or the global stop (Client payments open) is closed. |
| Connect returns with `payments_off` | The owner has not turned Online payments on in Settings, Client actions. |
| Connect returns with `owner_required` | Only the company owner can connect. A member or admin cannot. |
| Connect returns with `platform_not_configured` | The Stripe Connect Client ID is not saved in `/admin/integrations` (step 6). |
| Connect returns with `invalid_state` | The sign-in cookie was blocked, or more than 10 minutes passed. Try again in a normal browser window. |
| Connect returns with `token_exchange_failed` | The platform Stripe secret key is missing or belongs to a different mode than the client id (test vs live). Check the server logs. |
| Connect returns with `account_in_use` | That Stripe account is already connected to another company in Xtimator. One Stripe account can serve only one company. Use a different account, or disconnect it from the other company first. |
| Connect returns with `mode_mismatch` | The Stripe account is in a different mode (test or live) than the platform keys. Use an account in the same mode as the platform. |
| Connect returns with `insufficient_scope` | Stripe did not grant the access Xtimator needs (the `read_write` scope). Try connecting again and accept the full request. |
| Connect returns with `save_failed` | Stripe confirmed the connection but Xtimator could not save it. Try again, and check the server logs if it repeats. |
| Stripe says `invalid_redirect_uri` | The callback address is not in the Connect redirect URI list (step 5). |
| Stripe says the client id is invalid | A secret key was pasted instead of the `ca_` value, or the id is from the other mode. |
| Issuing an invoice says to add an email to the client | The project's client has no email, so Stripe cannot send the invoice. Add one. |
| Issuing an invoice says Stripe has paused payments | The connected account is restricted. The owner must finish verification in Stripe. The app clears this on its own after Stripe's `account.updated` event. |
| Issuing an invoice says online payments are not available | The platform switch or the global stop is off. |
| Issuing an invoice says to turn on online payments | The owner switch is off. |
| Webhook returns 400 for every event | Neither signing secret matches. Compare both secrets in Coolify with the endpoints in Stripe. |
| Webhook returns 503 | The platform Stripe secret key is not configured in `/admin/integrations`. |
| Refund happened but no refund notification, and the invoice shows no Refunded label | The endpoint uses a newer API version without `charge.invoice` (step 7, item 5). |
| Refund notification arrived but the invoice shows no Refunded label | The migration `20261121200000_invoice_refunds.sql` was not applied to this database, or the deploy is older than the refund recording. Apply the migration and check the delivery log: a failed write returns an error and Stripe retries it. |
| The Void button says the invoice was issued on an account that is no longer connected | The company switched Stripe accounts after issuing it. Void it in that Stripe account's dashboard. |
| The Void button says a paid invoice cannot be voided | Paid invoices cannot be voided. Refund the payment in Stripe instead. |
| No emails after a payment | The email provider key is missing in `/admin/integrations`, or the company has no email. Check the server logs. |

## 14. Reference

- Invoice issuing action: `lib/actions/invoice.ts`
- Stripe invoice creation (direct charge and fee): `lib/billing/invoice-service.ts`
- Fee calculation: `lib/billing/estimate-fee.ts`
- Fee percentage, minimum and global stop (defaults): `lib/billing/billing-config.ts`
- Connect webhook handler and the event list: `lib/billing/connect-webhook.ts`
- Webhook entry point (two signing secrets): `app/api/webhooks/stripe/route.ts`
- OAuth helpers: `lib/billing/connect-oauth.ts`
- Connect routes: `app/api/stripe/connect/initiate/route.ts`, `app/api/stripe/connect/callback/route.ts`, `app/api/stripe/connect/disconnect/route.ts`
- Feature switch rules (single source of truth): `lib/features/company-features.ts`
- Switch migration: `supabase/migrations/20261121180000_company_feature_switches.sql`
- Invoice account migration: `supabase/migrations/20261121190000_invoice_stripe_account.sql`
- Invoice refunds migration: `supabase/migrations/20261121200000_invoice_refunds.sql`
- Void action: `lib/actions/invoice-void.ts`
- Payment emails: `lib/email/payment-emails.ts`
- Deployment pipeline: the Deployment section of `CLAUDE.md`

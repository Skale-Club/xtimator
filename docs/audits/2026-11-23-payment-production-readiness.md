# Payment production readiness audit — 2026-11-23

**Verdict: not ready for a broad paid launch.** Subscription billing is already live, but payment recovery and credit delivery have release-blocking gaps. Customer payments through Stripe Connect must remain closed until configuration and invoice reliability are corrected.

Reviewed local `main` and production commit `55ec4ce082ec33f2ed2af995ec37c8941d539d28`. Production reads and negative-signature probes were performed around 19:40–19:43 America/New_York on November 23. No payment was initiated, subscription changed, customer record edited, migration applied or deployment performed. Application source is unchanged; this report and the Journal record are the deliverables.

## Confirmed production state

The production configuration was read through the existing Coolify API; the production database and Stripe account were then queried with GET requests. Secrets remained in process memory and were not written to this report or printed.

| Item | Observed state |
| --- | --- |
| Production health | HTTP 200; database, storage and auth OK; exact reviewed commit |
| Stripe identity | Business profile Xtimator; live key; charges and payouts enabled |
| Pro monthly / annual | Active live USD Prices: $29 monthly / $290 yearly |
| Business monthly / annual | Active live USD Prices: $99 monthly / $990 yearly; new sales hidden in the app |
| Subscription mapping | One Stripe subscription, active Pro monthly, correctly mapped to the database |
| Credit configuration | Enforcement ON; signup 350; Pro monthly grant 3,000 |
| Credit packs | $10 / 900 credits; $20 / 1,900; $50 / 5,000; three-month expiry |
| Auto top-up / BRL / affiliates | All three platform switches OFF |
| Customer Portal | Active default configuration; cancellation and price switching enabled |
| Platform webhook | Enabled, live, URL `/api/webhooks/stripe`, snapshot API version `2026-06-24.dahlia`, 11 expected subscription/top-up/refund/dispute/customer events |
| Production signature rejection | Unsigned `{}` and current-timestamp forged-signature `{}` both returned HTTP 400 `Invalid signature` |
| Connect | Zero companies allowed, enabled or connected; the decrypted configured client-id value does not start with the required `ca_` prefix |
| Connect event delivery | The only listed webhook does not subscribe to `account.updated`, `account.application.deauthorized`, `invoice.voided` or `invoice.marked_uncollectible`; no complete Connect destination was found |
| Historical local payment records | Five `invoices` rows marked paid; zero refunded rows. These are database states, not independently verified settlements |
| Evidence of card settlement | Live Charges list returned no charges. Recent relevant events included November 8 checkout completion and invoice payment with zero pending webhook deliveries. An active subscription and `invoice.paid` are not sufficient evidence of a card charge |

There are 20 production companies: 17 Free, two Pro and one Business; only one has a Stripe subscription mapping. Manually assigned paid tiers are supported by the app, so the other paid-tier rows are not automatically classified as incidents. One company has a negative credit balance; debt is supported by the credit model and is not, by itself, proof of an error.

## Release-blocking findings

Severity P1 means correct before opening the affected money flow. Findings describe reachable failure behavior; no claim is made that these failures have already affected a real customer.

### PAY-01 — P1 — A paid credit purchase can be acknowledged without delivering credits

References: `app/api/webhooks/stripe/route.ts:474` and `:918`; `lib/billing/credit-ledger.ts:422`; `components/billing/buy-credits.tsx:134`.

`grantCredits` catches database/RPC errors and returns `{ applied: false }`. Both the top-up Checkout webhook and the direct/automatic PaymentIntent webhook ignore this result, complete handling and return HTTP 200. Their processed-event marker remains. The payment can therefore be successful while its credits never arrive, and subsequent deliveries are acknowledged as duplicates. The one-click UI also ignores `granted: false` and displays “credits added.”

Reproduced for both `checkout.session.completed` and `payment_intent.succeeded`: grant result false, route HTTP 200, no processed-event cleanup. The reconciliation job checks database balance/ledger drift, missing subscriptions and old invoices; it does not compare paid Stripe purchases with missing grants. A missing grant can leave the database internally consistent and escape that sweep.

The same event-processing design has a crash window: the processed marker is committed before business processing (`route.ts:118`), with cleanup only in `catch`. A process kill cannot execute that cleanup. The schema stores only event id and creation time, not a recoverable processing status.

Required outcome: distinguish already-applied grants from failed grants; acknowledge only durable fulfillment or durable queued work; permit retry/recovery after RPC failure and process restart. Use a recoverable event inbox/processing state and reconcile paid purchases against grants. The UI must distinguish charged/pending-credit delivery from confirmed credit delivery.

### PAY-02 — P1 — An ambiguous one-click charge starts a second payment flow

Reference: `app/api/billing/buy-credits/route.ts:185`.

Every exception from PaymentIntent creation, including a connection timeout or Stripe server error, falls back to a new Checkout Session with a different idempotency key. A timeout does not prove that Stripe failed to charge the saved card. The customer can complete Checkout after the original charge succeeded, producing two payments for one intended purchase. A non-succeeded PaymentIntent also falls back even if its cancellation fails.

Reproduced a `StripeConnectionError`: HTTP 200 Checkout response, second payment flow created, no resolution of the original PaymentIntent.

Required outcome: preserve the original purchase identity and reconcile uncertain outcomes before offering another charge; only use a new payment flow after establishing that the original cannot succeed. Stripe documents this requirement in [advanced error handling](https://docs.stripe.com/error-low-level).

### PAY-03 — P1 — A subscription lookup timeout bypasses the duplicate-subscription guard

Reference: `app/api/billing/create-checkout-session/route.ts:132`.

When a company already has a subscription id, any retrieval error is treated as a deleted subscription and a fresh subscription Checkout is created. The catch does not distinguish `resource_missing` from a timeout, authentication failure or temporary Stripe outage. Checkout completion later attempts to cancel the previous subscription, but this is best effort and does not reverse a second initial charge.

Reproduced with an existing subscription mapping and a network timeout: a new subscription Checkout was created. Minute-based Checkout keys also do not act as a durable company-level subscription reservation across intervals or separate purchase attempts.

Required outcome: fail closed on uncertain lookup results; allow a replacement subscription only after proving the old one ended. Keep a durable company-level checkout/subscription reservation where necessary.

### PAY-04 — P1 — A billing-configuration read error disables enforcement

References: `lib/billing/billing-config.ts:542`, `:408`; `lib/billing/access-state.ts:115`.

The reader discards the database error and interprets `data: null` as absent configuration. It returns and caches defaults for 30 seconds; those defaults have `enforcementEnabled: false`. Access resolution then grants active/exempt access without reading a balance. This bypasses the newer fail-closed handling for failed company/balance reads.

Reproduced a database error from `platform_integrations`: enforcement became false and that result was cached. Defaults can also substitute commercial settings while the stored settings are temporarily unreadable.

Required outcome: separate a missing row/static-build context from a failed runtime read. Preserve a known-good configuration or return a retryable failure for paid operations; do not silently switch a configured production tenant to record-only mode.

### PAY-05 — P1 — Partial-refund fallback ignores later refunds on the same charge

Reference: `app/api/webhooks/stripe/route.ts:1114`.

When `charge.refunds.data[0]` is absent, the handler uses cumulative `amount_refunded` but keys the debit on `refund:{charge.id}`. A first partial refund consumes that key; the remaining refund reuses it and becomes a no-op. This fallback is explicitly implemented and the installed SDK permits the refunds list to be absent.

Reproduced a 900-credit/$10 pack with a $1 refund followed by the remaining refund, without an expanded refunds list: only 90 credits were removed in total, although the entire $10 had been refunded. No live refund was issued during the audit.

Required outcome: process individual refund objects using refund ids and validated successful status, or atomically track the already-reversed cumulative amount. Recover missing refund details through the API; do not collapse a sequence of distinct refunds into one charge-level operation. Stripe distinguishes the charge event from the individual refund in its [event catalog](https://docs.stripe.com/api/events/types).

### PAY-06 — P1 — Concurrent full invoices can bill the same contract twice

References: `lib/actions/invoice.ts:352`, `:458`, `:464`; `supabase/migrations/20260619000001_phase94_invoices.sql:23`; `supabase/migrations/20261117000002_change_order_invoices.sql:39`.

Overlap checks read existing invoices before inserting a reservation. Two simultaneous requests can both read an empty set and insert separate full-invoice drafts. Each uses a new random row id and therefore a different Stripe idempotency base. The only related partial unique index protects a change order; full/deposit/balance reservations have no equivalent atomic contract-level guard.

Reproduced two simultaneous `generateInvoice(..., { kind: 'full' })` calls reaching Stripe with distinct keys. Separately executed the invoice-table migration in PGlite: two $1,000 full reservations for the same estimate were both accepted, totaling $2,000. No production invoice was created.

Required outcome: reserve invoicing atomically under an estimate/contract lock, validating all live amounts and change orders in the same transaction. A per-kind unique index alone does not protect cross-kind full-versus-deposit/balance races.

### PAY-07 — P1 — An uncertain invoice send deletes its only routing reservation

References: `lib/actions/invoice.ts:507`, `:229`, `:359`; `lib/actions/invoice-void.ts:79`.

Any `createConnectInvoice` exception causes deletion of the local draft. Stripe may already have created/finalized/emailed the invoice before its response was lost. Deleting the row destroys the `metadata.invoice_id` target; a later paid event cannot match it, and another attempt creates a different Stripe invoice. Separately, ten-minute-old unpromoted drafts are marked void locally without proving that the Stripe invoice is void; the void action also deletes a draft with no saved Stripe id. An unknown remote outcome is being treated as no remote invoice.

Reproduced the exception path deleting the reservation after a simulated response loss. This proves the unsafe recovery action; an actual Stripe timeout-after-send was not induced.

Required outcome: retain the reservation and stable idempotency identity, persist remote ids as steps succeed, reconcile uncertain operations and cancel/void the remote invoice before permitting replacement. Never infer remote absence from an empty local id alone.

### PAY-08 — P1 for Connect activation — Production onboarding/event configuration is incomplete

References: `lib/billing/connect-oauth.ts:104`; `app/api/stripe/connect/callback/route.ts:128`; `lib/features/company-features.ts:121`.

The encrypted production `stripe_connect_client_id` record exists, but its plaintext is not a `ca_...` Connect Client ID. Presence alone is not readiness. The only live webhook destination found lacks the Connect account-health/deauthorization and invoice-terminal events listed above. A configured `STRIPE_CONNECT_WEBHOOK_SECRET` does not prove that a matching Connect destination exists or delivers events.

The zero-company allowlist currently contains this gap. Required outcome: validate/register the proper Connect application, OAuth redirect and connected-account event destination; verify the matching signing secret with a real signed delivery; then enable one controlled pilot tenant and exercise invoice payment, account restriction and disconnect. No configuration was changed by this audit.

### PAY-09 — P1 for Connect activation — Invoice refunds rely on a removed Stripe field

References: `lib/billing/connect-webhook.ts:239`, `:866`, `:884`; `app/api/webhooks/stripe/route.ts:395`.

Invoice refund resolution relies on `charge.invoice`. Stripe removed that pointer in the Basil change and directs integrations to Invoice Payments; see the [official migration note](https://docs.stripe.com/changelog/basil/2025-03-31/add-support-for-multiple-partial-payments-on-invoices). The code itself documents this limitation. With a current-version payload, a hosted-invoice refund falls into the legacy estimate-PaymentIntent lookup, where new invoices have no corresponding mapping. Refund amounts/notifications can therefore be lost. The platform affiliate reversal uses the same old pointer; affiliates are currently OFF.

Required outcome: resolve invoice payments from PaymentIntent/Invoice Payments with the correct connected-account context and the stored historical invoice account. Validate real payloads from the selected webhook version rather than extending old fixtures or relying on a cast to restore removed fields.

## Additional findings and inactive scope

- **P2 — Business price display:** `app/(app)/settings/billing/page.tsx:205` renders Pro's current-plan price for both Pro and Business. One Business row exists in production. Grandfathered subscriptions can similarly differ from the current catalog; display should follow the actual subscription where applicable.
- **P2 — Invoice UI recovery:** `components/workspace/estimate/generate-invoice-dialog.tsx:157` has no `try/finally`; a thrown server action can leave the dialog permanently pending.
- **Operational gap — Stripe reconciliation:** the daily job does not compare actual subscriptions/payments/refunds with local entitlement/grant/invoice state. It cannot repair or necessarily detect the failures above.
- **Operational gap — payment incidents:** the dispute handler sends an ops alert and reverses affiliate accrual when resolvable, but does not reconcile top-up credits on a chargeback. Treat the desired credit/debt/access response as an explicit policy before scaling that flow.
- **Auto top-up:** platform switch OFF, zero opted-in companies. It has locking, cooldown/backoff, a captured authorized pack and a PaymentIntent webhook backstop, but that backstop shares PAY-01. Keep it OFF until failure recovery and a real opt-in/card test pass.
- **Seats/additional companies:** new additions are deliberately disabled by `lib/billing/addon-availability.ts`; team UI says coming soon. Seat code exists, but this is not a released customer add-on and was not certified for sale.
- **BRL:** OFF; subscriptions still use USD Prices. Do not advertise BRL subscription billing on the basis of BRL pack/config fields.
- **Affiliates:** OFF; accrual/reversal code exists, but its own contract says the automated payout runner is not built. It is not a production-ready automated payout product.

## Payment webhook security

Both scopes share `POST /api/webhooks/stripe`; the signed event's account determines dispatch.

| Scope | Raw body | Verification before business use | Official method | Secret source | Missing-secret policy | Invalid signature | Idempotency | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Platform subscriptions/credits | Yes | Yes | Stripe SDK constructEvent, default timestamp tolerance | STRIPE_WEBHOOK_SECRET | No secret candidate is skipped; none verifies means reject | HTTP 400; unsigned and forged live probes passed | Unique event id plus operation keys; failed-grant and crash recovery gaps | Authentication passed; fulfillment open |
| Connected-account payments | Yes | Yes | Same Stripe SDK, Connect secret candidate | STRIPE_CONNECT_WEBHOOK_SECRET | Same fail-closed verification | HTTP 400 at shared route | Shared event claim plus company/account binding | Configuration and real signed delivery unverified; PAY-06–09 open |

The encrypted provider-key lookup occurs before signature verification to construct the SDK client. Tenant resolution and financial effects occur after verification. If the Stripe client itself cannot be configured the route returns 503; this does not grant access or trust an unverified payload. No new valid signed event was sent during this audit, so the live probes establish rejection, not successful payment fulfillment.

## What passed

- Authentication and server-side owner checks on financial actions; active-company scoping; demo and Android TWA purchase guards.
- Prices/credit quantities selected from server configuration, not client-submitted amounts.
- Raw-body Stripe SDK signature verification, generic invalid-signature response, and separate secret candidates. Both negative production probes passed. This does not establish that a new real signed Connect delivery succeeds.
- Company/account binding in Connect event resolution, company-scoped invoice updates, and stored historical invoice accounts.
- Atomic credit-lot/debit SQL, source/expiry/debt handling and shared monthly-grant identities. Real credit SQL is exercised by the existing PGlite suite.
- First-class subscription status, cancellation tracking, portal switching and annual monthly-credit scheduling. Daily jobs exist; their actual recent Inngest executions were not inspected in this audit.
- Draft-first invoice creation, exclusion of unrelated pending invoice items, immutable amount snapshots and service-role financial writes. The reservation/recovery gaps above remain despite these safeguards.

## Tests and limits

Existing targeted run:

```text
npx vitest run tests/unit/billing tests/unit/webhooks/stripe-credit-grant.test.ts tests/unit/webhooks/connect-events.test.ts tests/unit/actions/invoice.test.ts tests/unit/actions/invoice-void.test.ts tests/unit/inngest/monthly-credit-grant.test.ts tests/unit/inngest/billing-reconciliation.test.ts tests/unit/inngest/expire-credit-lots.test.ts --maxWorkers=2
102 files passed; 1,396 tests passed; 157.28 seconds.
```

Eight additional temporary characterization tests passed by reproducing the unsafe current behavior: two purchased-grant failures; ambiguous direct charge; duplicate concurrent full invoices; invoice reservation deletion after uncertainty; configuration read failure; partial-refund key reuse; existing-subscription lookup timeout. They reused the existing isolated fixtures and mocked provider boundaries; they did not perform real payments. Temporary copies were removed after the audit. A separate in-memory SQL check confirmed acceptance of duplicate full-invoice drafts.

No new real checkout, card charge, renewal, SCA challenge, refund, chargeback, Connect onboarding or payout was executed. No browser/physical-device payment flow was exercised. The existing public-payment Playwright spec explicitly uses placeholder invoice URLs (`tests/e2e/estimate-share-payment.spec.ts:15`), so it does not close these gaps. No full build/typecheck was run because application code was unchanged.

## Proposed release sequence

1. Correct PAY-01 through PAY-05 for SaaS billing; add durable recovery/reconciliation and regression tests that assert the safe behavior.
2. Exercise first purchase, repeated request, saved-card pack, SCA/decline, full/partial refund, renewal, annual credit anniversary, cancel/resume, database outage and restart in the correct account's sandbox. Verify Stripe objects, local subscription/credit lots and user-visible results together.
3. After owner authorization, perform and reconcile a controlled live purchase/refund. Validate portal settings, dunning/customer notifications and job execution. An active subscription with no observed card Charges does not substitute for this evidence.
4. Keep Connect, automatic top-up, BRL, seats and affiliates closed until each affected flow has its own completed acceptance evidence. Correct PAY-06 through PAY-09 before a Connect pilot, including contract-level concurrency and network-loss recovery.

The recommendation is an audit conclusion, not owner approval to change billing configuration or deploy fixes.

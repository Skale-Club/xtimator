# Payment launch fixes and release evidence

Date: 2026-11-23 (America/New_York). Branch: `fix/payment-launch-readiness`, based on `55ec4ce0`. Scope: the payment findings in [the audit](2026-11-23-payment-production-readiness.md), plus the owner's request for separate sandbox/live credentials.

## Current outcome

Payment recovery, duplicate prevention and refund fixes are implemented locally. Migrations `20261123130000_payment_recovery.sql` and `20261123133000_legacy_refund_watermarks.sql` are applied and read back in **development Supabase only**. Production remains unchanged. The production Connect account still requires product activation, a valid OAuth Client ID and a complete connected-account event destination. Do not describe this work as an activated production payment launch.

## Fixes

| Audit finding | Implemented behavior |
| --- | --- |
| PAY-01: paid delivery could be lost | Strict credit grants; durable event claims with expiring leases; completion only after persistent fulfillment; bounded recovery every five minutes. Missing company reads/mapping writes retry. First `invoice.paid` repairs an unmapped Free company from its paid subscription. |
| PAY-02: uncertain saved-card charge opened another payment | Durable company-wide purchase identity, frozen authorization and Stripe keys; ambiguous/processing payments remain pending. A replacement Checkout requires confirmed cancellation of the original intent. Manual purchases, legacy top-up and auto top-up share the boundary. |
| PAY-03: uncertain subscription lookup opened another subscription | Unknown retrieval errors stop checkout. Remote active subscriptions block another subscription. Unresolved Checkout is reused across requests/interval changes. |
| PAY-04: config read failures disabled enforcement | Runtime database read errors throw instead of caching enforcement-off defaults. |
| PAY-05: partial refunds under-reversed credits | Current successful refunds are summed and reversed against a locked cumulative watermark; duplicates/out-of-order totals cannot regress. Legacy charge/refund-id reversals seed the watermark so upgrades do not debit them again. |
| PAY-06: concurrent invoices overbilled | Estimate-level SQL lock, contract recalculation and atomic invoice reservation; unresolved drafts continue counting. |
| PAY-07: uncertain invoice send lost routing | Frozen invoice request and remote progress retained on every error. Resume the same invoice; after Stripe's retention window, search/verify instead of blindly creating a replacement or line. Explicit finalization precedes send. |
| PAY-08: Connect appeared configured without being ready | Validate `ca_` format, configured signing secret and enabled destination for that exact Connect application/URL/event set before onboarding or issuing. External live activation remains pending. |
| PAY-09: obsolete Charge invoice linkage | Resolve modern payloads through Invoice Payments, account-scoped; aggregate refunds across partial invoice payments. |

The credit purchase UI keeps its request identity across pending/network/reload states and reports success only after delivery. Invoice dialogs reset after exceptions; Business tenants display Business pricing. A real sandbox test also caught a premature lease release while awaiting Checkout: both Checkout returns now await persistence before releasing the lease.

## Environment and credential handling

Admin → Integrations → Stripe has separate encrypted Live (`stripe`) and Sandbox (`stripe_test`) fields and shows the active environment. Only production with the owned PostgREST data mode uses live credentials; development uses sandbox, including OAuth exchange/deauthorization. Missing/mismatched keys and signed events from the wrong environment fail closed.

The owner authorized reading the existing Xtimator test key from Chrome and saving it **only in development**. The panel showed Connected; no live key was changed. Next.js development invocation logging exposed the sandbox argument in an internal log during this save. `logging.serverFunctions=false` now disables that logger. Rotate the sandbox key after testing; no credential is included in these records or commits.

## Verification

- Application TypeScript passed. Default production Turbopack build passed, including type checking and 116 prerendered pages. Conservative 2 GB/3 GB Webpack attempts hit heap limits; the production compiler succeeded.
- Initial expanded regression: 191 files, 2,184 passing / 3 stale expectations. Updated those fixtures; focused final round: 16 files / 248 passing. The complete candidate unit/eval run then passed 10,694 tests across 1,017 files, with zero failures, seven skipped and five TODO (783.97 seconds). A final six-file round passed 55 checks, with its interactive browser case skipped because that acceptance had already completed (43.76 seconds).
- Eleven PGlite SQL checks cover crash recovery, fencing, cumulative reversals including both legacy key formats, invoice overlap/concurrency, monotonic invoice refunds and service-only execution.
- Development migration readback confirmed RLS on both new tables and denied all seven new RPCs to `authenticated`, while permitting `service_role`.
- Two independent connections to development PostgreSQL confirmed that competing company purchase reservations wait on the lock, return one operation with the original price and exclude a second live lease. Probe rows were removed.
- Real Xtimator Stripe **test mode** plus development PostgreSQL: six automatic scenarios passed after the lease fix: one charge/grant under repeats; official Event replay; injected response loss after actual Stripe acceptance; $1 then $9 test refunds reversing 90 then 810 credits; 3DS cancellation before Checkout plus expiration; one subscription Checkout across interval changes.
- Chrome completed a $29/month **sandbox** subscription using Stripe's fictional card. Official `invoice.paid` delivered before Checkout repaired the Free tier, mapped the subscription and granted 3,000 monthly credits exactly once. This browser acceptance passed on the preceding run; its credit-fallback defect was then fixed and all six automatic cases repeated successfully.
- Only Stripe sandbox and development SQL received test effects; test-mode webhook endpoints were empty. Notifications, marketing, CRM and Inngest dispatch were mocked during provider integration tests. Test subscriptions were canceled, open test Checkouts expired and synthetic SQL companies removed. Stripe test records remain for inspection.

Evidence: [configured sandbox panel](evidence/payment-sandbox-configuration.jpg), [fictional Checkout](evidence/payment-sandbox-checkout.jpg). The integration suite is opt-in with `RUN_PAYMENT_SANDBOX=1`; it hard-rejects live mode, the wrong Stripe account and a non-development database. `RUN_PAYMENT_BROWSER=1` enables the interactive subscription case.

## Production release sequence (requires owner approval)

1. Back up production, apply both additive migrations in order to Coolify PostgreSQL, and read back schema/RPC permissions. Do not run the development connection against production. During the version transition, pause new payment creation and return retryable HTTP 503 for webhook ingress until old handlers have drained and the new version is healthy; do not disable the Stripe destination or discard events.
2. Preserve existing platform event subscriptions and add `refund.created`, `refund.updated`, `refund.failed`. Verify the actual signing secret with a provider delivery. Complete the separate Connect application/redirect URL/signing destination before its pilot; keep company/payment switches closed until then.
3. Publish the validated branch through `dev` → `main`; require GitHub Test, Docker build/deploy, exact-SHA health and Inngest resync. Confirm `payment-recovery` registration/execution.
4. Reconcile one owner-authorized controlled live payment/refund, including Stripe objects, subscription/credit rows and UI. No live transaction was authorized or performed in this task.
5. Observe pending operations/events, failed credit deliveries and invoice recovery alerts. If reverting application code, first pause new payment creation at the ingress; preserve the additive schema and recovery records. Never discard unresolved reservations to unblock another charge.

## Final candidate checks

Complete secret-free candidate unit/eval: 10,694 passed, zero failed, seven skipped, five TODO. Latest financial verification: 55 passed, one browser-only case skipped; this includes the six real sandbox cases and both legacy reversal baselines. Final scoped ESLint and production Turbopack build passed after all application changes (compile 24.1s, TypeScript 28.6s, 116 prerendered pages). Production still reports commit `55ec4ce082ec33f2ed2af995ec37c8941d539d28`; its data mode is `postgrest`. Production migration/deployment, live Connect activation and live acceptance remain pending owner authorization.

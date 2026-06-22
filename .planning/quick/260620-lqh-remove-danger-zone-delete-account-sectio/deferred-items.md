# Deferred Items — quick-260620-lqh

Out-of-scope discoveries found during execution. These are PRE-EXISTING and NOT
caused by this task's changes (UI-only removal of the Danger Zone block). Logged
per the executor SCOPE BOUNDARY rule; intentionally NOT fixed here.

## Pre-existing project-wide `tsc --noEmit` errors (unrelated files)

Discovered while running the Task 1 verification command (`npx tsc --noEmit -p tsconfig.json`).
None of these are in the files this task modified (`account-section.tsx`,
`account/loading.tsx`), and the working tree shows them unmodified.

1. `app/admin/integrations/actions.ts(272,40)` — Stripe `apiVersion` literal
   mismatch: `"2026-04-22.dahlia"` vs expected `"2026-05-27.dahlia"`.
2. `lib/billing/stripe-client.ts(15,28)` — same Stripe `apiVersion` literal mismatch.
   (Matches STATE.md decision: "Phase 58: stripe@22.1.1 API version is 2026-04-22.dahlia";
   the installed stripe types appear to have advanced to expect a newer version literal.)
3. `tests/unit/inngest/generate-estimate-job.test.ts(145,66)` — `Mock<Procedure | Constructable>`
   not callable without `new`.
4. `tests/unit/notifications/account-emails.test.ts(84,46 / 172,46 / 219,46)` — test
   `Branding` fixtures missing `metaDescription`, `ogImageUrl`, `canonicalBaseUrl`, `faviconUrl`.

Recommendation: bump the Stripe `apiVersion` literal to match the installed SDK types,
and update the affected test fixtures/mocks — in a dedicated maintenance task, not here.

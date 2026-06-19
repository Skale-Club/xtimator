---
phase: 94-estimate-invoice-decoupling
plan: 01
subsystem: testing
tags: [vitest, stripe, supabase, rls, invoices, migration, tdd, nyquist]

# Dependency graph
requires:
  - phase: 82-rls-company-members
    provides: company_members RLS subquery pattern (the canonical tenant-scoping pattern the invoices table must match)
  - phase: 70-stripe-connect
    provides: Direct-Charges { stripeAccount } request-option pattern, metadata-keyed webhook, processed_stripe_events idempotency, stripe-connect.ts fixture
provides:
  - "invoices table migration (immutable snapshot entity, one estimate -> many invoices, company_members RLS, kind/status CHECK enums, amount_cents>0 guard, 3 indexes)"
  - "types/database.types.ts invoices Row/Insert/Update typing with literal-union kind + status"
  - "6 RED Wave-0 contract tests pinned to their future Wave 1+ module/migration paths"
  - "1 GREEN migration-contract test (static SQL assertions for the invoices DDL)"
  - "makeConnectInvoice + makeConnectInvoiceEvent fixtures (invoice.paid Connect event builder)"
affects: [94-02-invoice-service, 94-03-generate-invoice-action, 94-04-remove-consolidate, 94-05-invoice-paid-webhook, 94-06-backfill-migration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wave 0 RED foundation: every implementation lands against a pre-existing failing test (Nyquist gate)"
    - "Late await import() of a not-yet-existent module makes a test fail loudly until Wave 1 delivers the target"
    - "Source-read RED test (readFileSync of lib/actions/estimate.ts) for asserting future code removal deterministically"
    - "invoices RLS uses Phase 82 company_members subquery (NOT companies.user_id) per D-09 correction"

key-files:
  created:
    - supabase/migrations/20260619000001_phase94_invoices.sql
    - tests/unit/billing/invoices-migration.test.ts
    - tests/unit/money/invoice-split.test.ts
    - tests/unit/billing/invoice-service.test.ts
    - tests/unit/actions/invoice.test.ts
    - tests/unit/queries/invoice.test.ts
    - tests/unit/billing/invoices-backfill-migration.test.ts
    - tests/unit/actions/estimate-save-no-gate.test.ts
  modified:
    - types/database.types.ts
    - tests/fixtures/stripe-connect.ts

key-decisions:
  - "invoices RLS matches Phase 82 company_members subquery pattern (D-09 correction), never companies.user_id — keeps the table consistent with every other tenant table and passes the migration assertion"
  - "Column names/types locked for the phase (per D-08 discretion) so downstream service/action/query tests bind to a stable schema"
  - "database.types.ts hand-extended (Docker-less Windows convention since Phase 19/24) — no supabase gen types"
  - "estimate-save-no-gate test uses the deterministic source-read variant (assert absence of the consolidated error string) rather than mocking the full saveEstimate"

patterns-established:
  - "Wave 0 RED: 6 contract tests fail loudly on missing targets; 1 migration test ships GREEN since the migration is additive in this plan"
  - "Fixture extension is additive — makeConnectEvent/makeConnectCheckoutSession preserved so Phase 70 webhook tests stay green"

requirements-completed: [INVOICE-01, INVOICE-02, INVOICE-03, INVOICE-04, INVOICE-05, INVOICE-06, INVOICE-07]

# Metrics
duration: 6min
completed: 2026-06-19
---

# Phase 94 Plan 01: Wave 0 RED Foundation Summary

**Additive `invoices` table migration (company_members RLS, kind/status CHECK enums, amount_cents>0, 3 indexes) + hand-extended database types + 6 RED contract tests + 1 GREEN migration test + an `invoice.paid` Connect fixture — the Nyquist gate every later Phase 94 wave makes green.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-06-19T18:02:25Z
- **Completed:** 2026-06-19T18:08:39Z
- **Tasks:** 3
- **Files modified:** 10 (8 created, 2 modified)

## Accomplishments
- Shipped the additive `invoices` migration: immutable-snapshot entity (16 columns), `kind ∈ {deposit,balance,full}` and `status ∈ {draft,open,paid,void,uncollectible}` CHECK enums, `amount_cents > 0` guard, unique partial index on `stripe_invoice_id` + estimate/company indexes, and RLS using the Phase 82 `company_members` subquery (4 `FROM company_members`, 0 `FROM companies`).
- Hand-extended `types/database.types.ts` with the `invoices` Row/Insert/Update typing (literal-union `kind`/`status`, correct nullability, defaults optional on Insert) plus FK relationships.
- Created 7 test files: 1 GREEN migration-contract test (12 assertions) and 6 RED contracts pinned to their future Wave 1+ targets (split math, invoice service, generate-invoice action, snapshot read-back query, backfill migration, save-no-gate).
- Extended the Stripe Connect fixture with `makeConnectInvoice` + `makeConnectInvoiceEvent` (an `invoice.paid` connected-account event carrying `metadata.invoice_id`), without touching the existing Phase 70 builders.

## Task Commits

Each task was committed atomically (gitleaks pre-commit hook ran clean on every commit):

1. **Task 1: invoices migration + database types** - `7022150` (feat)
2. **Task 2: migration-contract test + 5 RED contract stubs + save-no-gate** - `7983d8f` (test)
3. **Task 3: stripe-connect invoice.paid event fixture** - `59c86fb` (test)

_Plan metadata commit follows this summary._

## Files Created/Modified
- `supabase/migrations/20260619000001_phase94_invoices.sql` - The invoices table DDL: snapshot columns, CHECK enums, indexes, company_members RLS (SELECT/INSERT/UPDATE, no DELETE).
- `types/database.types.ts` - Added the `invoices` Tables entry (Row/Insert/Update + FK relationships), alphabetically between `estimates` and `notification_preferences`.
- `tests/unit/billing/invoices-migration.test.ts` - GREEN: 12 static-SQL assertions (table, RLS pattern, CHECKs, indexes, no DELETE policy).
- `tests/unit/money/invoice-split.test.ts` - RED: `splitDepositBalance` cents exactness, every case asserts `deposit + balance === total` (USD $100.01/30%, $100/30%, $0.01/50%, JPY 0-decimal).
- `tests/unit/billing/invoice-service.test.ts` - RED: `createConnectInvoice` Stripe sequence (`{ stripeAccount }` request arg, amount-based item, `send_invoice`, `metadata.invoice_id`, no `application_fee_amount`, idempotencyKey, customer reuse, URL read-back).
- `tests/unit/actions/invoice.test.ts` - RED: `generateInvoice` action (demo guard blocks Stripe, null/inactive Connect refused, happy path persists row + returns URLs).
- `tests/unit/queries/invoice.test.ts` - RED: `getInvoicesByEstimateId` returns the stored `amount_cents` snapshot (3000), not a re-derived total.
- `tests/unit/billing/invoices-backfill-migration.test.ts` - RED: Plan 06 backfill migration contract (inserts into invoices, selects paid estimates, kind='full'/status='paid').
- `tests/unit/actions/estimate-save-no-gate.test.ts` - RED: source-read assertion that `lib/actions/estimate.ts` no longer contains the consolidated write-block string (turns GREEN in Plan 04).
- `tests/fixtures/stripe-connect.ts` - Added `makeConnectInvoice` + `makeConnectInvoiceEvent`; preserved `makeConnectEvent` + `makeConnectCheckoutSession`.

## Decisions Made
- **RLS pattern (D-09 correction):** Used the Phase 82 `company_members` subquery, not the legacy `companies.user_id` form quoted in CONTEXT.md. RESEARCH.md confirmed Phase 82's migration ends with an assertion that fails the build if any policy references `companies.user_id`. Verified: 4 `FROM company_members`, 0 `FROM companies` in the migration.
- **Locked column names:** Although D-08 grants column-name discretion, the names were locked for this phase so the Wave 1+ service/action/query tests bind against a stable schema.
- **Hand-edited types:** Continued the established Docker-less Windows convention (Phase 19/24) of hand-extending `database.types.ts` rather than running `supabase gen types`.
- **save-no-gate via source-read:** Chose the deterministic `readFileSync` variant (the plan offered it as the simpler option) over mocking the full `saveEstimate`.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None. The 6 RED tests fail for exactly the intended reasons: 4 fail to resolve their missing Wave 1 module imports (`@/lib/money/invoice-split`, `@/lib/billing/invoice-service`, `@/lib/actions/invoice`, `@/lib/queries/invoice`), the backfill test gets ENOENT on the Plan 06 migration, and the save-no-gate test sees the consolidated write-block string still present in `lib/actions/estimate.ts` (Plan 04 removes it).

## User Setup Required
None - no external service configuration required (this plan only ships a migration file + types + tests; `supabase db push` is applied separately in a later step, not by this plan).

## Next Phase Readiness
- The `invoices` schema and types are ready for Plan 94-02 (invoice service) and 94-03 (generate-invoice action) to build against.
- The `invoice.paid` fixture is ready for Plan 94-05's webhook rewrite (`makeConnectInvoiceEvent`).
- The backfill-migration contract is waiting for Plan 94-06 to deliver `20260619000003_phase94_backfill_invoices.sql`.
- The save-no-gate contract is waiting for Plan 94-04 to delete the consolidated write-block.
- **Migration is written but NOT applied** — the actual `supabase db push` happens out-of-band per project convention.

## Self-Check: PASSED

All 11 claimed files exist on disk and all 3 task commits are present in git history.

---
*Phase: 94-estimate-invoice-decoupling*
*Completed: 2026-06-19*

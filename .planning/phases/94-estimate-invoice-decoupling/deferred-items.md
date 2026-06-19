# Phase 94 — Deferred Items

Out-of-scope discoveries logged during execution. NOT fixed in the discovering plan.

---

## From Plan 94-03 (invoice.paid webhook)

### Pre-existing Wave 0 RED: `tests/unit/billing/invoices-backfill-migration.test.ts` (4 failing)

- **Discovered during:** Plan 94-03 full-suite run (`npx vitest run tests/unit/webhooks tests/unit/billing`).
- **Status:** Pre-existing failure — the test existed at the baseline commit (`HEAD~2`) before any 94-03 work, and is unrelated to the webhook changes.
- **Cause:** The test asserts the static contents of `supabase/migrations/20260619000003_phase94_backfill_invoices.sql`, which does not exist yet (`ENOENT`). That migration is **Plan 94-06's** deliverable (INVOICE-07 backfill / retirement).
- **Why not fixed here:** Plan 94-03's scope is explicitly the `invoice.paid` Connect webhook only ("Do NOT touch consolidate logic (Plan 05) or the pay route (Plan 06)"). Creating the backfill migration belongs to Plan 94-06.
- **Resolution owner:** Plan 94-06 (backfill + retirement) will create the migration and turn this RED test GREEN.

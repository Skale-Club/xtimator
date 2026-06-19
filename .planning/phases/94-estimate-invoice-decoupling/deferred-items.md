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

---

## From Plan 94-05 (consolidate retirement)

### Pre-existing environment failures: 24 test files RED due to uninstalled optional dependencies

- **Discovered during:** Plan 94-05 full-suite green gate (Task 4, `npx vitest run` + `npx tsc --noEmit`).
- **Status:** Pre-existing — the identical failing-file set is present at the baseline commit `9fd0fb6` (immediately before any 94-05 work). A set-diff of failing files (main vs `9fd0fb6`) shows **zero** new regressions from the consolidate removal; the only delta is that `tests/unit/actions/estimate-save-no-gate.test.ts` went RED→GREEN (the intended 94-05 outcome).
- **Cause:** Several packages are declared in `package.json` but are **not installed in `node_modules`** in this local dev environment: `langfuse@^3.38.20`, `@sentry/nextjs@^10.56.0`, `@modelcontextprotocol/sdk@^1.29.0`, `@langchain/core`, `@langchain/openai`, `@langchain/langgraph`. Vitest fails to resolve these imports (e.g. `Failed to resolve import "langfuse"`) and `tsc` reports `TS2307: Cannot find module`. Affected files: the `mcp-*`, `inngest/*`, `whatsapp/*` (confirm, intent-router, query-tools), `ai/provider-factory`, `errors/*`, plus pre-existing fixture drift in `onboarding-survey`, `theme-toggle`, `landing-actions`, `capture-attempt-lineage`, `account-emails`.
- **Why not fixed here:** SCOPE BOUNDARY — none of these failures are caused by the consolidate removal (none reference `workflow_status`, consolidate, estimate-save, share-query, or invoice). They are an environment/`npm install` concern, not a code defect introduced by this plan.
- **Resolution owner:** Run a full `npm install` (or `npm ci`) so the declared optional deps are present; that alone should clear the missing-module failures. The pre-existing fixture-drift tests (`onboarding-survey`, `theme-toggle`, etc.) are unrelated to this milestone and should be triaged separately.

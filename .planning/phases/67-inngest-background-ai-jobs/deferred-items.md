# Deferred Items — Phase 67 Inngest Background AI Jobs

Out-of-scope discoveries logged during plan execution. NOT fixed by this phase.

## Plan 67-01 (2026-05-15)

### 1. Live DB index verification could not run — `.env.local` symlink dangling

**Discovery:** The plan's `<action>` Step A asks to verify the `usage_events_idempotency` partial UNIQUE index on the live dev DB via `node supabase/audits/run-audit.mjs` or direct `psql`. On this machine `.env.local` is a symlink to `G:\My Drive\Dev\xtimator\.env.local` and the target is offline (Google Drive not mounted), so `DATABASE_URL` cannot be loaded.

**Mitigation applied (Rule 3 scope boundary):** Verified the index via the migration source-of-truth instead:

- `supabase/migrations/20260513000002_phase56_usage_idempotency.sql` creates `CREATE UNIQUE INDEX usage_events_idempotency ON usage_events(company_id, idempotency_key) WHERE idempotency_key IS NOT NULL;`
- No subsequent migration drops/alters it (`ls supabase/migrations/ | grep -i 'usage\|idempot'` → only the Phase 56 file).

**Action when DB is reachable again:** Run `node supabase/audits/run-audit.mjs` and confirm the index exists. If it does NOT exist (e.g., the dev DB drifted), apply the idempotent migration described in the plan as a follow-up:

```sql
-- supabase/migrations/<timestamp>_phase67_usage_idempotency_verify.sql
CREATE UNIQUE INDEX IF NOT EXISTS usage_events_idempotency
  ON usage_events(company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
```

### 2. Pre-existing test failures (39 tests) unrelated to Wave 0

`npx vitest run` reports 75 failures total: 36 are the new RED stubs created by this plan (intentional). The remaining 39 are pre-existing failures in:

- `tests/integration/cleanup-orphan-projects.test.ts`, `platform-brand-rls.test.ts`, `price-book-rls.test.ts` — need `DATABASE_URL` (same `.env.local` issue)
- `tests/unit/admin-actions.test.ts`, `admin-dashboard.test.ts`, `admin-gate.test.ts`, `blog-actions.test.ts`, `cleanup-route-auth.test.ts`, `landing-actions.test.ts`, `seo-actions.test.ts`, `wizard-client-only.test.ts`, `api/generate-estimate-name-patch.test.ts`

None of these tests touch files that this plan modifies. Out of scope per the executor's scope boundary rule. To be triaged in Phase 69 (UAT Validation + Bug Triage).

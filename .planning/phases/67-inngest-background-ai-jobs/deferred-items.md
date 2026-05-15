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

## Plan 67-02 (2026-05-15)

### 3. Pre-existing tsc errors in tests/unit/api/*-quota.test.ts (2 errors)

`npx tsc --noEmit` after Plan 67-02 reports 2 pre-existing errors:

- `tests/unit/api/analyze-photos-quota.test.ts(111,81): error TS2322: Type 'null' is not assignable to type 'number | undefined'.`
- `tests/unit/api/generate-estimate-quota.test.ts(72,81): error TS2322: Type 'null' is not assignable to type 'number | undefined'.`

Both relate to the quota mock object shape (`number | undefined` field receiving `null`). They predate this phase — the quota module was finalized in Phase 56 — and do NOT touch any Inngest files. Verified clean: `npx tsc --noEmit 2>&1 | grep -E "(lib/inngest|app/api/inngest|tests/unit/inngest)"` returns zero matches.

Out of scope per the executor's scope boundary rule. Triaged for Phase 69.

### 4. Plan PLAN.md used Inngest 3.x createFunction signature

The plan's code samples use `createFunction({ id, ... }, { event }, handler)` (3-arg). Inngest 4.x renamed this to `createFunction({ id, triggers: [{ event }], ... }, handler)` (2-arg with `triggers` array in the opts object).

**Mitigation applied (Rule 3 — blocking issue):** All 4 functions wired with the 4.x signature. Verified at runtime: `node -e "const fn = i.createFunction({...,triggers:[{event:'foo'}]},async()=>1); console.log(fn.opts.triggers)"` returns the registered trigger.

This is the inngest@4.4.0 API as shipped 2026-05-13. Plan was written against the older sample in RESEARCH.md.

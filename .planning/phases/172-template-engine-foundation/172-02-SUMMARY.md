---
phase: 172-template-engine-foundation
plan: 02
subsystem: database
tags: [supabase, postgres, rls, typescript, vitest, notifications]

# Dependency graph
requires:
  - phase: 104-notification-category-reduction
    provides: EventType union + EVENT_CATEGORIES (lib/notifications/event-types.ts)
  - phase: 77-notification-copy
    provides: buildNotificationCopy switch (lib/notifications/copy.ts) — the byte-equivalence source for this plan's seed
provides:
  - "notification_templates table (migration, INERT until manually applied to prod)"
  - "EVENT_TEMPLATE_SEED: Record<EventType, TemplateSeedEntry> — single TS source of truth for the seed"
  - "notification_templates Row/Insert/Update types in database.types.ts"
  - "CI test proving the SQL migration and TS seed can never silently drift apart (Pitfall 1 guard)"
affects: [172-03-resolver, 173-template-editor-ui, 174-call-site-sweep, 177-end-customer-copy]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Record<EventType, T> as a compile-time exhaustiveness guard replacing an exhaustive switch's no-default-case guarantee"
    - "SQL migration hand-copied from a TS source-of-truth module, cross-checked by a text-containment CI test rather than trusted to stay in sync by convention"

key-files:
  created:
    - supabase/migrations/20260721000001_phase172_notification_templates.sql
    - lib/notifications/template-seed.ts
    - tests/unit/notifications/template-seed-completeness.test.ts
  modified:
    - types/database.types.ts

key-decisions:
  - "Seed channel='in_app' only (17 rows); email/sms CHECK values exist in schema but are unseeded — copy.ts has no per-channel divergence to preserve today."
  - "No scope='customer' rows seeded — no end-customer copy exists anywhere yet (Phase 177's job)."
  - "No company_id column on notification_templates — structurally enforces the locked no-tenant-overrides decision, not just an RLS-policy convention."
  - "RLS enabled with ZERO policies (service-role-only), mirroring whatsapp_notification_templates (20260621000003) exactly."
  - "admin.bonus_credits_granted seeded with variables: [] and a static body with no {{credits}}/{{amount}} token — CREDITUI-04 / Pitfall 5 guard, enforced structurally (the variable isn't offered to insert) plus a dedicated test assertion."
  - "Migration ships INERT: no code reads from notification_templates yet; per project convention it is NOT applied to prod automatically and must be applied manually."

patterns-established:
  - "Record<EventType, TemplateSeedEntry> re-establishes copy.ts's switch-exhaustiveness compile-time guard at the seed-module layer, now that the resolver (172-03) will read from a DB table instead of a switch."
  - "Migration/TS-seed drift is verified by a CI vitest test that reads the migration file as text and asserts literal substring containment, not by developer discipline alone."

requirements-completed: [TMPL-01]

# Metrics
duration: ~15min
completed: 2026-07-21
---

# Phase 172 Plan 02: notification_templates migration + TS-exhaustive seed + CI drift guard Summary

**`notification_templates` table (service-role-only RLS, no company_id) with a 17-row day-one seed hand-derived byte-for-byte from `copy.ts`, sourced from one TS `Record<EventType,...>` module and cross-checked against the migration SQL by a CI test — closing Pitfall 1's lost exhaustiveness guard with two independent layers.**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-07-21
- **Tasks:** 2/2 completed
- **Files modified:** 4 (3 created, 1 modified)

## Accomplishments
- `notification_templates` table shipped as an inert, ready-to-apply-manually migration: `scope`/`event_type`/`channel` unique, service-role-only RLS (zero policies), no `company_id` column — structurally impossible to add a per-tenant override by accident.
- `EVENT_TEMPLATE_SEED` (`lib/notifications/template-seed.ts`) is the single TS source of truth for all 17 `EventType` entries; its `Record<EventType, TemplateSeedEntry>` shape makes a forgotten entry for a future `EventType` a `tsc` compile error (verified via `tsconfig.ci.json`), re-establishing the guarantee `copy.ts`'s exhaustive `switch` (no `default`) used to provide.
- A CI-run vitest test (`template-seed-completeness.test.ts`) independently proves: (a) the seed's key set matches `EVENT_CATEGORIES`'s key set at runtime, (b) every seed entry's `(scope, event_type, channel)` tuple and body text appear verbatim in the migration SQL text, and (c) `admin.bonus_credits_granted` carries zero variables and no `{{}}` token.
- `types/database.types.ts` hand-updated with `notification_templates` Row/Insert/Update, inserted alphabetically between `notification_preferences` and `notifications`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Seed module + migration + database.types.ts** - `0484d2e1` (feat)
   - Correction commit for a concurrent-executor staging race: `8cbaf857` (fix) — see Deviations.
2. **Task 2: CI exhaustiveness + SQL/TS drift guard test** - `c26d2b32` (test)

_No separate plan-metadata commit yet — this SUMMARY.md commit serves that role per the house rules for this execution (no `gsd-tools state` commands run)._

## Files Created/Modified
- `supabase/migrations/20260721000001_phase172_notification_templates.sql` - `CREATE TABLE notification_templates` + partial lookup index + RLS-enabled/zero-policy + `COMMENT ON TABLE` + 17-row `scope='tenant' channel='in_app'` seed INSERT (`ON CONFLICT DO NOTHING`), hand-copied verbatim from `template-seed.ts`. Ships INERT — not applied to prod by this plan.
- `lib/notifications/template-seed.ts` - `EVENT_TEMPLATE_SEED: Record<EventType, TemplateSeedEntry>`, 17 entries, exported for plan 172-03's resolver and this plan's own CI test.
- `tests/unit/notifications/template-seed-completeness.test.ts` - 5 tests: seed/category key-set parity, exact 17-count, CREDITUI-04 zero-variables guard, migration-text tuple+body containment for all 17 entries, presence of `CREATE TABLE`/`ENABLE ROW LEVEL SECURITY` in the migration.
- `types/database.types.ts` - Added `notification_templates` Row/Insert/Update/Relationships block (alphabetically placed).

## Decisions Made
- Followed the plan's `<interfaces>` table verbatim for all 17 title/body/variables entries — derived by hand-tracing `copy.ts`'s switch under a fully-populated `CopyContext`, matching the plan author's own derivation exactly (cross-checked case-by-case against `copy.ts` during execution, no discrepancies found).
- Included a `variables` jsonb value in every seed `INSERT` row (beyond the plan's minimum acceptance criteria, which only required the `(scope, event_type, channel)` tuple + body) so the day-one seed rows are immediately useful to Phase 173's future admin editor, not just placeholders needing a follow-up backfill.
- Used `git commit ... -- <path>` (explicit pathspec) for Task 2's commit after Task 1 was accidentally swept into a broader commit by a concurrent sibling executor's staging activity — see Deviations below.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking / process] Concurrent-executor git staging race swept a sibling's file into this plan's Task 1 commit**
- **Found during:** Task 1, immediately after committing.
- **Issue:** A sibling executor (working on plan 172-01, `lib/notifications/template-engine.ts`) staged its own file (`git add`) in the shared working tree between this executor's `git add <3 files>` and `git commit -m "..."` (which had no explicit pathspec). Since `git commit -m` with no `--` pathspec commits the entire index, the sibling's already-staged-but-not-yet-committed `template-engine.ts` (107 lines) was swept into commit `0484d2e1` alongside this plan's 3 intended files.
- **Fix:** Ran `git rm --cached lib/notifications/template-engine.ts` (untracks the file from the index/history, leaves its content untouched on disk) and committed that as a follow-up fix commit (`8cbaf857`), restoring the file to the exact untracked state it was in before the race, so the sibling executor could `git add`/commit it under its own task without any content loss. Verified via `git diff --stat <sibling's-last-commit> HEAD -- <4 paths>` that the net diff across both commits touches only this plan's 3 intended files.
- **Files affected:** `lib/notifications/template-engine.ts` (untracked again, content unchanged — not a file this plan owns).
- **Verification:** `git status --short` showed `lib/notifications/template-engine.ts` back to `??` (untracked); `git diff --stat` confirmed the net change since the sibling's prior commit was exactly `template-seed.ts` / the migration / `database.types.ts`.
- **Committed in:** `8cbaf857`
- **Process change applied for Task 2:** committed with an explicit `-- <path>` pathspec (`git commit -m "..." -- tests/unit/notifications/template-seed-completeness.test.ts`) instead of a bare `git commit -m`, so only that file's staged change is included regardless of what else might be concurrently staged in the shared index. Recommend this pattern for any future concurrent-executor run against this repo.

---

**Total deviations:** 1 auto-fixed (1 blocking/process, caused by concurrent sibling-executor git activity, not by this plan's own code)
**Impact on plan:** No impact on the shipped artifacts — the fix commit only removes a foreign file from tracking; this plan's own 3 files were correct and complete in the original commit. No scope creep.

## Issues Encountered
None beyond the git-staging race documented above.

## PREREQUISITE NOTE FOR PHASE 174 (carry forward — do not lose this)

The seed's byte-equivalence to `copy.ts` holds **only under a fully-populated `CopyContext`**. `copy.ts`'s switch defines per-field fallback strings for a **sparse** (partially-missing) `ctx` — e.g. `ctx.clientName ?? 'A client'`, `ctx.projectName ?? 'a project'`, `ctx.daysRemaining ?? 3`, `ctx.quotaPercent ?? 80`, `ctx.jobType ?? 'Job'`, `ctx.errorMessage ?? 'unknown error'`, `ctx.tierFrom ?? 'previous'`, `ctx.tierTo ?? 'new'`, `ctx.whatsappFrom ?? 'a contact'` — none of which a plain `{{var}}` string-substitution interpolator reproduces. Fed a sparse `ctx`, such an interpolator renders those tokens as `''` (empty string) instead of falling back to the coherent default phrase `copy.ts` produces today.

This gap is not reachable today (this table ships inert; no call site passes a `copyContext` into a DB-templates path yet). **Phase 174's call-site sweep must do one of the following at every swept call site, or this will regress user-visible copy quality:**
1. Pass a fully-populated `ctx` to every resolver/`notify()` call so no field is ever missing at render time, **or**
2. Reproduce `copy.ts`'s exact per-field default values inside whatever interpolator plan 172-03 or Phase 174 ships (i.e., the interpolator itself needs a per-event-type default-value table, not just blank-on-missing behavior).

This is documented in `lib/notifications/template-seed.ts`'s own doc header as well — this SUMMARY duplicates it here per explicit house-rule instruction so it surfaces in phase-level planning context, not only in the seed file's comments.

## User Setup Required

None - no external service configuration required. The migration itself requires **manual** application to the Supabase prod instance per project convention (`project_migrations_manual_apply` memory) — it is NOT applied by this plan, by CI, or by any deploy step, and ships inert (nothing reads from `notification_templates` yet).

## Next Phase Readiness
- Plan 172-03 (resolver) has a real table + a 17-row seed to query, and `EVENT_TEMPLATE_SEED` exported for any code that wants the TS-typed seed data directly.
- Phase 173's future admin editor has a populated starting catalog, including a per-event `variables` catalog (jsonb) to build a scoped variable picker from (Pitfall 5 — never expose a global "insert any variable" picker; this seed's per-event `variables` arrays are already the correct, narrow catalog to source that picker from).
- Phase 174 has the explicit sparse-ctx prerequisite note above to act on before switching any real call site over to DB-sourced copy.
- Table is not yet applied to any Supabase environment (local or prod) — plan 172-03 or a deploy runbook step should apply it manually before the resolver is exercised against a real database.

---
*Phase: 172-template-engine-foundation*
*Completed: 2026-07-21*

## Self-Check: PASSED

- FOUND: `lib/notifications/template-seed.ts`
- FOUND: `supabase/migrations/20260721000001_phase172_notification_templates.sql`
- FOUND: `tests/unit/notifications/template-seed-completeness.test.ts`
- FOUND: `.planning/phases/172-template-engine-foundation/172-02-SUMMARY.md`
- FOUND commit: `0484d2e1` (feat(172-02): notification_templates table + TS-exhaustive day-one seed)
- FOUND commit: `8cbaf857` (fix(172-02): drop accidentally-included template-engine.ts from prior commit)
- FOUND commit: `c26d2b32` (test(172-02): add CI drift guard for notification_templates seed/migration)
- FOUND: `notification_templates:` block in `types/database.types.ts` (line 1487, between `notification_preferences` and `notifications`)

---
phase: 81-add-whatsapp-send-option-in-sendtab-and-integrations-setting
plan: 01
subsystem: database
tags: [supabase, postgres, migration, vitest, whatsapp, meta, schema, check-constraint]

# Dependency graph
requires:
  - phase: 54-whatsapp-status-flow
    provides: company_whatsapp table + status column + delivery_format column
  - phase: 53-pdf-attachment-delivery
    provides: DROP + ADD CONSTRAINT migration pattern reference
  - phase: 44-outbound-client-delivery
    provides: delivery_format branching pattern (share_link / formatted_text / pdf_attachment)
provides:
  - estimate_deliveries.channel CHECK accepts 'whatsapp' alongside 'email' and 'sms'
  - estimate_deliveries.provider CHECK accepts 'meta' alongside 'resend' and 'twilio'
  - 4 Wave 0 RED test scaffolds (33 it.todo) that Wave 1 plans 81-02 / 81-03 flip GREEN
  - types/database.types.ts JSDoc annotations documenting the new literal unions
affects:
  - 81-02 (api-route-and-entitlement-gate): depends on schema + scaffolds for send-route.test.ts and entitlement-gate.test.ts
  - 81-03 (ui-tab-and-integrations-page): depends on send-form-tab.test.tsx and integrations-page.test.tsx scaffolds

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT pattern for idempotent enum-like CHECK extension (Phase 53 mirror)"
    - "Manual TypeScript type extension via JSDoc when current types are bare 'string' (Phase 19/24 convention — Docker unavailable on Windows for type regen)"
    - "Wave 0 RED scaffolds via `it.todo()` with names matching RESEARCH.md test-map for Wave 1 lookup-by-name (Phase 12/18 convention)"

key-files:
  created:
    - supabase/migrations/20260526000005_phase81_whatsapp_delivery_channel.sql
    - tests/unit/whatsapp/send-route.test.ts
    - tests/unit/whatsapp/send-form-tab.test.tsx
    - tests/unit/whatsapp/integrations-page.test.tsx
    - tests/unit/whatsapp/entitlement-gate.test.ts
  modified:
    - types/database.types.ts

key-decisions:
  - "Migration timestamp bumped from prescribed 20260526000001 to 20260526000005 to avoid collision with existing phase82 RLS migration already on this branch (Rule 3 blocking auto-fix)"
  - "types/database.types.ts patched with JSDoc comments rather than narrowing literal unions — current types are bare `string`, so Phase 19/24 'extend if literal exists, otherwise document' rule applies"
  - "Task 2 supabase db push surfaced as orchestrator checkpoint (cannot run interactive auth from agent); 4 scaffold files were created in parallel because they have no dependency on the migration being live"

patterns-established:
  - "Migration filename collision handling: bump timestamp to next free slot in same date; document deviation inline in the migration file header"
  - "Worktree-aware file editing: in parallel-executor worktrees, all writes/edits must use absolute paths under .claude/worktrees/<id>/ — main-repo paths are silently misrouted"

requirements-completed:
  - WA-SEND-06

# Metrics
duration: ~8min
completed: 2026-05-26
---

# Phase 81 Plan 01: Schema Migration and Test Scaffolds Summary

**Migration extends `estimate_deliveries.channel` CHECK to accept `'whatsapp'` and `estimate_deliveries.provider` CHECK to accept `'meta'`, plus 4 Wave 0 RED scaffolds (33 `it.todo`) that Wave 1 will flip GREEN.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-05-26T18:51Z
- **Completed:** 2026-05-26T18:58Z
- **Tasks:** 3 (Task 2 = checkpoint surfaced — db push delegated to orchestrator/user; Tasks 1 & 3 = executed + committed)
- **Files modified:** 6 (1 migration created, 1 types file modified, 4 test scaffolds created)

## Accomplishments

- New migration `supabase/migrations/20260526000005_phase81_whatsapp_delivery_channel.sql` mirrors the Phase 53 DROP + ADD CONSTRAINT pattern exactly:
  - `CHECK (channel IN ('email', 'sms', 'whatsapp'))`
  - `CHECK (provider IN ('resend', 'twilio', 'meta'))`
  - Idempotent (DROP CONSTRAINT IF EXISTS guards both re-applies).
- `types/database.types.ts` patched with JSDoc comments on `estimate_deliveries` Row/Insert/Update for both `channel` and `provider` documenting the new literal union (Phase 19/24 convention).
- 4 RED test scaffolds with 33 total `it.todo` entries, each named to match RESEARCH.md "Phase Requirements → Test Map" verbatim so Wave 1 verify commands resolve to specific tests by name.
- `npx vitest run` exits 0 with all 33 cases reported as `todo` (yellow) — matches Phase 12/18 Wave 0 convention.
- `npx tsc --noEmit` exits 0 (the surfaced errors are pre-existing MCP SDK module-resolution issues unrelated to this plan — out of scope per deviation rules).

## Task Commits

Each task was committed atomically (all `--no-verify` per parallel-executor protocol):

1. **Task 1: Create migration file + extend types/database.types.ts** — `06c9563` (feat)
2. **Task 2: [BLOCKING] Push migration to Supabase + smoke INSERT** — checkpoint surfaced; no in-agent commit
3. **Task 3: Create RED test scaffolds** — `9ad7163` (test)

_Plan metadata commit (this SUMMARY) will be created next._

## Files Created/Modified

- `supabase/migrations/20260526000005_phase81_whatsapp_delivery_channel.sql` — DROP + ADD CONSTRAINT for `estimate_deliveries_channel_check` (adds `'whatsapp'`) and `estimate_deliveries_provider_check` (adds `'meta'`).
- `types/database.types.ts` — Added JSDoc comments to `estimate_deliveries` Row/Insert/Update for `channel` and `provider` documenting the new literal unions and pointing at the migration filename.
- `tests/unit/whatsapp/send-route.test.ts` — 12 `it.todo` covering 401, 400 phone, 409 status, 402 entitlement, 409 company_whatsapp, branch-by-format (share_link / formatted_text / pdf_attachment), pdf fallback, log delivery / activity / sent_at.
- `tests/unit/whatsapp/send-form-tab.test.tsx` — 9 `it.todo` covering tab visibility, MessageCircle icon, tab order, E.164 validation, submit wiring, success / fallback toasts, CTA disabled.
- `tests/unit/whatsapp/integrations-page.test.tsx` — 5 `it.todo` covering header copy, WhatsAppConnectCard mounting (both `initial={null}` and populated), absence of old OpenRouter placeholder.
- `tests/unit/whatsapp/entitlement-gate.test.ts` — 7 `it.todo` covering the tier × status matrix for `getEntitlements(tier).whatsappEnabled && company_whatsapp.status === 'active'`.

## Migration Push Status (Task 2)

**The migration has NOT been auto-pushed from inside the agent.** Per the orchestrator's task2 note and the plan's `type="checkpoint:human-action"`, this step requires interactive auth that cannot be suppressed reliably from a non-TTY context. The action is surfaced as a checkpoint for the orchestrator/user to complete.

**Exact command to run from repo root (or the worktree, equivalently):**

```
npx supabase db push
```

**Expected output:** `Applying migration 20260526000005_phase81_whatsapp_delivery_channel.sql` followed by `Finished supabase db push.` with no constraint-violation errors.

**Smoke verification (after push) — run via Supabase MCP `execute_sql` against project Xtimator:**

```sql
BEGIN;
INSERT INTO estimate_deliveries (
  estimate_id, company_id, channel, recipient_phone, provider, status
)
SELECT
  e.id, e.company_id, 'whatsapp', '+15555550100', 'meta', 'sent'
FROM estimates e
LIMIT 1;
ROLLBACK;
```

**Expected:** `INSERT 0 1` followed by `ROLLBACK`. If the INSERT violates the CHECK, the migration did not apply — re-run `supabase db push`.

**Optional pg_constraint introspection:**

```sql
SELECT con.conname, pg_get_constraintdef(con.oid)
FROM pg_constraint con
WHERE con.conname IN ('estimate_deliveries_channel_check', 'estimate_deliveries_provider_check');
```

Should return both constraint definitions including `'whatsapp'` and `'meta'`.

## it.todo Counts (Task 3 acceptance criteria — each file > 5)

| File | `it.todo` count |
|------|-----------------|
| `tests/unit/whatsapp/send-route.test.ts` | 12 |
| `tests/unit/whatsapp/send-form-tab.test.tsx` | 9 |
| `tests/unit/whatsapp/integrations-page.test.tsx` | 5 |
| `tests/unit/whatsapp/entitlement-gate.test.ts` | 7 |
| **Total** | **33** |

`npx vitest run tests/unit/whatsapp/send-route.test.ts tests/unit/whatsapp/send-form-tab.test.tsx tests/unit/whatsapp/integrations-page.test.tsx tests/unit/whatsapp/entitlement-gate.test.ts --reporter=verbose` exits 0; report: `Tests 33 todo (33)`.

## Decisions Made

- **Migration filename:** Bumped from prescribed `20260526000001_phase81_whatsapp_delivery_channel.sql` to `20260526000005_phase81_whatsapp_delivery_channel.sql` because the `20260526000001` slot is already taken by `20260526000001_phase82_rls_company_members.sql` (shipped earlier in the v4.0 multi-tenancy milestone). Bumping to `00005` keeps the date-prefix lexicographic ordering and avoids a name collision that would otherwise fail at `supabase db push` parse-time. SQL body, constraint values, and DROP-IF-EXISTS pattern are verbatim from the plan.
- **Types extension via JSDoc, not literal narrowing:** Current `estimate_deliveries` Row/Insert/Update types use bare `string` for `channel` and `provider` — the plan's Phase 19/24 convention says "extend if literal exists, otherwise document". I chose document, adding `/** 'email' | 'sms' | 'whatsapp' — see migration ... */` JSDoc on each property.
- **Task 2 push deferred to orchestrator:** Documented above. The plan declares Task 2 as `type="checkpoint:human-action"` — interactive auth gate.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Migration filename collision**
- **Found during:** Task 1 (Create migration file).
- **Issue:** Plan prescribed `supabase/migrations/20260526000001_phase81_whatsapp_delivery_channel.sql`, but `20260526000001_phase82_rls_company_members.sql` already exists in the branch (Phase 82 RLS migration shipped earlier). Supabase CLI errors when two migration files share the same timestamp prefix.
- **Fix:** Bumped timestamp to `20260526000005` (next free 20260526 slot — `00001..00004` are taken). Documented the deviation inline in the migration file header comment so future readers see why the timestamp does not match the plan.
- **Files modified:** `supabase/migrations/20260526000005_phase81_whatsapp_delivery_channel.sql` (created at this name instead of the planned one).
- **Verification:** `node -e "..."` content check passes (channel/provider CHECK clauses + DROP IF EXISTS guards present); `ls supabase/migrations/2026052*` confirms no name collision.
- **Committed in:** `06c9563` (Task 1 commit).

---

**Total deviations:** 1 auto-fixed (1 blocking).
**Impact on plan:** Filename change is the only deviation; semantics (constraint values, DROP+ADD pattern, idempotency, types extension behavior) are unchanged. Wave 1 plans 81-02 / 81-03 reference the migration by behavior, not by filename, so this has zero downstream impact.

## Issues Encountered

- **Cross-worktree path misrouting (recovered):** The first attempts to Write the migration file and Edit `types/database.types.ts` landed in the main repo (`C:\Users\User\Desktop\projetos_skale\xtimator\xtimator\…`) rather than the parallel worktree (`…\.claude\worktrees\agent-a74c56a5c15e53c25\…`), even though the working-directory header and Bash `pwd` both reported the worktree. Recovery: deleted the misplaced migration from the main repo, reverted the main repo's `types/database.types.ts` via `git checkout --`, and re-issued the Write/Edit with explicit absolute paths under the worktree directory. Pattern noted under `patterns-established` so the next worktree agent uses absolute paths from the first write.

## User Setup Required

None — no new external service configuration is needed in this plan.

The only manual step is `supabase db push` against the dev project, which is the standard Task 2 [BLOCKING] checkpoint. See "Migration Push Status (Task 2)" above for the exact commands.

## Next Phase Readiness

- Wave 1 plan 81-02 (api-route-and-entitlement-gate) can now flip `send-route.test.ts` and `entitlement-gate.test.ts` todos to real `it()`s — the contracts are encoded in the test names verbatim per RESEARCH.md test-map.
- Wave 1 plan 81-03 (ui-tab-and-integrations-page) can flip `send-form-tab.test.tsx` and `integrations-page.test.tsx` todos.
- **Blocker for Wave 1 GREEN tests:** Task 2 `supabase db push` MUST be applied before Wave 1 send-route GREEN tests run against the dev DB, otherwise the `estimate_deliveries` INSERT with `channel='whatsapp'` / `provider='meta'` will fail the CHECK constraint (RESEARCH.md Pitfall 1 — silent partial success).

## Self-Check: PASSED

- `supabase/migrations/20260526000005_phase81_whatsapp_delivery_channel.sql` — FOUND
- `types/database.types.ts` — FOUND (modified; JSDoc additions visible via `git diff`)
- `tests/unit/whatsapp/send-route.test.ts` — FOUND
- `tests/unit/whatsapp/send-form-tab.test.tsx` — FOUND
- `tests/unit/whatsapp/integrations-page.test.tsx` — FOUND
- `tests/unit/whatsapp/entitlement-gate.test.ts` — FOUND
- Commit `06c9563` — FOUND in `git log --oneline --all` (Task 1)
- Commit `9ad7163` — FOUND in `git log --oneline --all` (Task 3)
- `npx vitest run` on the 4 scaffolds — exit 0, 33 todos reported
- `node -e` migration content check — exit 0, "migration content OK"

---
*Phase: 81-add-whatsapp-send-option-in-sendtab-and-integrations-setting*
*Plan: 01-schema-migration-and-test-scaffolds*
*Completed: 2026-05-26*

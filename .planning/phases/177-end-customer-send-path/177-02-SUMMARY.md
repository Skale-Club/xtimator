---
phase: 177-end-customer-send-path
plan: 02
subsystem: database
tags: [supabase, postgres, rls, audit-log, notifications, typescript]

# Dependency graph
requires:
  - phase: 176-customer-consent-suppression
    provides: "client_message_events precedent (append-only audit table shape, nullable company_id/client_id with ON DELETE SET NULL) this plan mirrors"
provides:
  - "customer_messages table (migration 20260721000004): audit trail for every end-customer email/SMS send attempt"
  - "Hand-maintained customer_messages Row/Insert/Update/Relationships types in types/database.types.ts"
  - "logCustomerMessage(params): Promise<void> — best-effort, never-throwing audit writer"
affects: [177-06-send-orchestration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Best-effort audit writer: try/catch + console.warn-on-failure, never throws to caller (mirrors lib/admin/audit-log.ts, lib/billing/record-ai-cost.ts)"
    - "Dual-recipient-column convention (recipient_email/recipient_phone, exactly one populated per channel) — modeled on estimate_deliveries"

key-files:
  created:
    - supabase/migrations/20260721000004_phase177_customer_messages.sql
    - lib/notifications/customer-message-log.ts
    - tests/unit/notifications/customer-message-log.test.ts
  modified:
    - types/database.types.ts

key-decisions:
  - "customer_messages positioned alphabetically between credit_ledger and demo_config in database.types.ts, matching the file's existing ordering convention."
  - "Migration ships INERT — no code reads/writes the table until 177-06 wires it in. NOT applied to prod; must be applied manually per project convention before 177-06's code path can write real rows."

patterns-established:
  - "logCustomerMessage() is the single writer every future end-customer send path (177-06) must call after every dispatch attempt — mirrors the recordAICost/logAdminAction one-writer discipline."

requirements-completed: [CUST-05]

duration: 4min
completed: 2026-07-21
---

# Phase 177 Plan 02: customer_messages audit table + logCustomerMessage() Summary

**Append-only `customer_messages` audit table (RLS-enabled, service-role-only writes) modeled on `estimate_deliveries`, plus a best-effort `logCustomerMessage()` writer that never throws even when the insert itself fails.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-07-21T23:06:xx-04:00
- **Completed:** 2026-07-21T23:10:48-04:00
- **Tasks:** 2 completed
- **Files modified:** 4 (1 migration created, 1 types file modified, 1 implementation file created, 1 test file created)

## Accomplishments
- `customer_messages` table: company_id/client_id nullable with `ON DELETE SET NULL` (audit trail survives deletion), `channel`/`provider`/`trigger_source`/`status` CHECK constraints, a `customer_messages_recipient_matches_channel` CHECK enforcing exactly one of `recipient_email`/`recipient_phone` per channel, RLS enabled with a SELECT-only `company_members`-scoped policy (writes are service-role only, bypassing RLS).
- Hand-maintained `Row`/`Insert`/`Update`/`Relationships` TypeScript types added to `types/database.types.ts`, matching the migration column-for-column.
- `logCustomerMessage(params): Promise<void>` — maps every camelCase param to its snake_case column, sets `sent_at` only when `status === 'sent'`, defaults every optional field to `null` (never `undefined`), and never propagates a failure (thrown `requireServiceClient()` or a returned Supabase `error`) out to the caller.
- 6 passing unit tests covering the exact insert payload, the sent/failed `sent_at` split, the null-not-undefined discipline, and both never-throw failure modes.

## Task Commits

Each task was committed atomically:

1. **Task 1: customer_messages migration + hand-maintained types** - `f77f2132` (feat)
2. **Task 2: logCustomerMessage() best-effort audit writer (TDD)**
   - RED: originally committed as `4bbcd023` (test) - failing test for logCustomerMessage. This commit was later dropped from `main`'s history by a concurrent sibling executor's `git reset` (see Deviations below); the test file's content survived and is now part of commit `9295a1f1` (a different, unrelated 177-03 commit it got swept into). Confirmed present and correct at current HEAD.
   - GREEN: `e6742846` (feat) - implementation, all 6 tests pass
   - REFACTOR: none needed — implementation was clean on first pass

**Plan metadata:** (this commit)

## Files Created/Modified
- `supabase/migrations/20260721000004_phase177_customer_messages.sql` - customer_messages table, indexes, RLS SELECT policy
- `types/database.types.ts` - hand-added customer_messages Row/Insert/Update/Relationships block
- `lib/notifications/customer-message-log.ts` - logCustomerMessage() best-effort writer
- `tests/unit/notifications/customer-message-log.test.ts` - 6 unit tests

## Decisions Made
- Table/type/writer follow the plan's literal spec with no schema deviation from what was written in 177-02-PLAN.md.
- No refactor commit for Task 2 — the TDD GREEN implementation matched the target shape (mirroring `record-ai-cost.ts`) without needing cleanup.

## Deviations from Plan

None on the file contracts — plan executed exactly as written (migration filename, column set, RLS policy, `LogCustomerMessageParams` shape, and `logCustomerMessage` behavior all match the plan verbatim).

**Process notes (concurrency, not plan deviations):**

1. Task 1's commit (`f77f2132`) was made with a pathspec-scoped `git add` but a non-pathspec-scoped `git commit`. Between the `add` and the `commit`, a concurrent sibling executor (working on `lib/platform-config.ts` and `lib/sms/client.ts` for a different 177-plan) staged its own in-progress changes to the shared index, and the bare `git commit` swept them into this plan's commit alongside the intended migration + types files. No code or data was lost — those files' content is correct and present in history — but they are now attributed to the `feat(177-02)` commit message instead of their own plan's commit. All subsequent commits in this plan (RED test, GREEN implementation) used pathspec-scoped `git add -- <file>` AND `git commit -- <file>` to prevent recurrence on this executor's side.
2. Despite that fix, the RED-test commit (originally `4bbcd023`, made with a fully pathspec-scoped add+commit) was later dropped from `main` entirely: a concurrent sibling executor ran what the reflog shows as `reset: moving to 470a477a` (rewinding shared `main`), then re-committed broadly, sweeping this plan's test file into its own unrelated commit `9295a1f1` ("admin panel field for dedicated Messaging Service SID"). This is a destructive history rewrite performed by another concurrent process, not by this executor. Impact assessed and mitigated: verified the test file's exact content is intact at current HEAD (165 lines, matches what was authored), all 6 tests pass, and `tsc -p tsconfig.ci.json` is clean at the current tip. Given multiple sibling executors were actively committing on top of this point, further history rewriting (to re-attribute the commit correctly) was judged higher-risk than leaving the content correctly in place under a mis-attributed commit message. No functional impact — flagging for phase-level review.

## Issues Encountered
None beyond the concurrency note above.

## User Setup Required

None - no external service configuration required. **Important:** this migration (`supabase/migrations/20260721000004_phase177_customer_messages.sql`) has NOT been applied to prod. Per this project's manual-apply convention (deploy is CI→GHCR→Coolify; migrations are never run automatically), it must be applied by hand before 177-06's `sendCustomerMessage()` code path can write real rows to `customer_messages`.

## Next Phase Readiness
- `customer_messages` table + types + `logCustomerMessage()` are ready for 177-06 to import and call after every end-customer send attempt.
- Blocker for prod use: the migration must be manually applied before 177-06 ships to prod (see above).

---
*Phase: 177-end-customer-send-path*
*Completed: 2026-07-21*

## Self-Check: PASSED

- FOUND: `supabase/migrations/20260721000004_phase177_customer_messages.sql`
- FOUND: `lib/notifications/customer-message-log.ts`
- FOUND: `tests/unit/notifications/customer-message-log.test.ts`
- FOUND: commit `f77f2132` (Task 1)
- FOUND: commit `e6742846` (Task 2 GREEN)
- Re-verified at current `main` tip (`a8eed074`, several sibling commits ahead of this plan's own commits): `npx vitest run tests/unit/notifications/customer-message-log.test.ts` — 6/6 passed; `npx tsc -p tsconfig.ci.json --noEmit` — clean.
- Note: the RED-test commit hash `4bbcd023` is no longer reachable from `main` (dropped by a concurrent sibling executor's `git reset`, see Deviations). The test file's content is confirmed intact and correct at current HEAD despite the mis-attributed commit.

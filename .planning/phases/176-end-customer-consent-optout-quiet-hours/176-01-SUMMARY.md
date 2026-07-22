---
phase: 176-end-customer-consent-optout-quiet-hours
plan: 01
subsystem: database
tags: [supabase, postgres, migration, rls, generated-column, consent, sms-opt-out]

# Dependency graph
requires: []
provides:
  - "clients.sms_consent_status/sms_consent_method/sms_consent_text/sms_consent_recorded_at/sms_consent_recorded_by/sms_opted_out_at — net-new consent/suppression columns (not a reuse of notification_preferences)"
  - "clients.phone_normalized — STORED generated column (last-10-digit strip of clients.phone), indexed, for O(1) inbound-phone matching"
  - "client_message_events — append-only audit table for inbound STOP/START/HELP SMS events, RLS-scoped, service-role-write-only"
  - "types/database.types.ts — clients Row/Insert/Update + client_message_events fully typed to match the migration"
affects: ["176-04 (pre-send suppression gate)", "176-05 (Twilio inbound webhook)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "STORED generated column for phone normalization: RIGHT(regexp_replace(phone, '\\D', '', 'g'), 10), computed once at write time, indexed with a partial WHERE phone_normalized <> '' to exclude short/empty matches"
    - "Audit-trail FK nullability: company_id/client_id use ON DELETE SET NULL (not CASCADE) so compliance history survives entity deletion; nullable company_id lets an unresolved event (matches no client anywhere) still be recorded, invisible to tenants via RLS but retained for service-role review"
    - "RLS SELECT-only for service-role-write tables (Phase-82 company_members pattern), mirroring estimate_deliveries's precedent"

key-files:
  created:
    - supabase/migrations/20260721000003_phase176_customer_consent_suppression.sql
  modified:
    - types/database.types.ts

key-decisions:
  - "Followed the plan's revision exactly: migration dated ...000003 (000001/000002 already taken by Phase 172/175 in this milestone's parallel tracks, verified present on disk before writing)"
  - "client_message_events.company_id is nullable + ON DELETE SET NULL (deviates from research doc's non-null recommendation) to resolve the conflict between 'tenant-scoped for RLS' and 'never drop an unresolved inbound event' — documented in the migration header for the prod-apply reviewer"
  - "phone_normalized added as Row-only in database.types.ts (never Insert/Update) since it's a GENERATED ALWAYS ... STORED column the DB computes; hand-adding it as writable would silently lie about a field that errors at the DB layer if sent"

patterns-established:
  - "Pattern: net-new end-customer-scoped consent state lives directly on the owning entity (clients) as dedicated columns, never overloaded onto an existing owner-scoped preferences table"

requirements-completed: [CUST-03]

# Metrics
duration: 3min
completed: 2026-07-22
---

# Phase 176 Plan 01: Consent/Suppression Schema Migration Summary

**Net-new `clients` consent/suppression columns (sms_consent_status/method/text/recorded_at/recorded_by, sms_opted_out_at) plus a STORED `phone_normalized` generated column and an append-only `client_message_events` audit table, all typed in `database.types.ts` ahead of the 176-04 pre-send gate and 176-05 inbound webhook.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-07-22T02:12:00Z (approx.)
- **Completed:** 2026-07-22T02:14:12Z
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments
- `clients` gains 6 consent/suppression columns as net-new columns, independent of Twilio's own carrier-level opt-out list, with `'unknown'` (not `'granted'`) as the fail-closed default for the future 176-04 gate
- `clients.phone_normalized` STORED generated column (last-10-digit strip via `regexp_replace`) closes the format-drift hole that fragile exact-string phone matching would have hit, backed by a partial index for O(1) inbound-phone lookup
- `client_message_events` append-only audit table records every inbound STOP/START/HELP event — including ones that match no client anywhere — with nullable `company_id`/`client_id` and `ON DELETE SET NULL` so the audit trail survives company/client deletion and is never silently dropped
- Both surfaces are fully typed in `types/database.types.ts`, matching the migration's exact shape so 176-04/176-05 write against real types instead of `any`

## Task Commits

Each task was committed atomically:

1. **Task 1: Migration — clients consent/suppression columns + phone_normalized + client_message_events audit table** - `5dec6706` (feat)
2. **Task 2: Hand-add types/database.types.ts to match the migration** - `ba2e6a5b` (feat)

**Plan metadata:** (this commit) docs(176-01): complete consent/suppression schema plan

_No TDD/refactor commits — pure schema + generated-types plan, no application logic._

## Files Created/Modified
- `supabase/migrations/20260721000003_phase176_customer_consent_suppression.sql` - Idempotent migration: `clients` consent/suppression columns + `phone_normalized` generated column + indexes; `client_message_events` audit table + indexes + RLS (SELECT-only, service-role writes)
- `types/database.types.ts` - `clients` Row/Insert/Update gain the 6 consent columns + `phone_normalized` (Row-only); new `client_message_events` table entry inserted alphabetically before `clients`

## Decisions Made
- Verified `20260721000001` (Phase 172) and `20260721000002` (Phase 175) both exist on disk before writing `...000003`, per the plan's revision note and the concurrency warning that sibling executors are active on this milestone
- Confirmed the RLS pattern against `supabase/migrations/20260526000001_phase82_rls_company_members.sql` (current `company_members` pattern, not the older `companies.user_id` pattern) and the service-role-write-only precedent against `supabase/migrations/20260519000003_estimate_deliveries.sql`
- Re-read `types/database.types.ts`'s `clients`/`chat_messages` block immediately before editing (concurrency guard) — line numbers were unchanged from the initial read, and a post-edit `git diff HEAD` after a sibling commit landed confirmed the edited region was untouched by concurrent work

## Deviations from Plan

None - plan executed exactly as written (the revised version, post-plan-check). The migration filename, `phone_normalized` generated-column approach, and `client_message_events.company_id` `ON DELETE SET NULL` nullability were all already specified in the plan's revision note and implemented verbatim.

## Issues Encountered
None. Multiple sibling executors (176-02, 176-03, 175-02/175-03) committed concurrently to `main` during this plan's execution; both task commits were pathspec-scoped (`git add <file>` / `git commit <file>`) and verified via `git show --stat` to contain only the intended file, with no cross-contamination from concurrently staged files (e.g., `lib/notifications/timezone-derive.ts` was staged by a sibling process at the time of the Task 2 commit and was correctly excluded).

## User Setup Required
None - no external service configuration required. The migration ships inert (per project convention: deploy is CI->GHCR->Coolify, migrations are applied manually). Prod apply is a follow-up manual step, not part of this plan's scope.

## Next Phase Readiness
- `clients` consent/suppression columns, `phone_normalized`, and `client_message_events` are schema-ready (in the migration file) and type-ready (in `database.types.ts`) for 176-04 (pre-send suppression gate) and 176-05 (Twilio inbound webhook) to build against
- Manual prod migration apply required before 176-04/176-05's runtime code can actually read/write these columns against the live database — tracked as a deploy-time follow-up per project convention, not a blocker for continuing plan execution

---
*Phase: 176-end-customer-consent-optout-quiet-hours*
*Completed: 2026-07-22*

## Self-Check: PASSED

Both created/modified files confirmed present on disk (`supabase/migrations/20260721000003_phase176_customer_consent_suppression.sql`, `types/database.types.ts`); both task commit hashes (`5dec6706`, `ba2e6a5b`) confirmed in git log.

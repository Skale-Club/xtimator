---
phase: 135-schema-roles-auth
plan: 01
subsystem: team-seats
tags: [schema, rls, migration, invites, roles]
requires: [company_members (Phase 79), companies]
provides:
  - company_members.role widened to ('owner','admin','member')
  - public.company_invites table + owner/admin-scoped RLS
affects: [supabase/migrations]
tech-stack:
  added: []
  patterns: [authored-only-migration, idempotent-drop-add-named-check, static-sql-contract-test, phase79-rls-subquery-scope]
key-files:
  created:
    - supabase/migrations/20260628000001_phase135_team_seats_schema.sql
    - tests/unit/phase135-team-seats-migration.test.ts
  modified: []
decisions:
  - "Reused the Phase-79 auto-named constraint `company_members_role_check`; widened via DROP IF EXISTS + named ADD so re-runs are safe."
  - "company_invites RLS uses the owner/admin company_members subquery (Phase-79 posture); no anon/token policy — accept runs via service role in Phase 137."
  - "Invite role CHECK is ('admin','member') only — an invite can never grant 'owner'."
metrics:
  duration: ~5m
  completed: 2026-06-25
requirements: [SEAT-01]
---

# Phase 135 Plan 01: Team Seats Schema Summary

One idempotent authored-only migration lands the v4.12 Team Seats foundation: it widens `company_members.role` from `('owner')` to `('owner','admin','member')` via a named DROP/ADD CHECK, and creates `public.company_invites` (9 columns, invite-role ∈ admin|member, status ∈ pending/accepted/revoked/expired, UNIQUE token, FK CASCADE to companies, two indexes) with owner/admin-scoped RLS mirroring the Phase-79 posture. A 15-assertion static contract test locks the shape.

## What Was Built

- **`supabase/migrations/20260628000001_phase135_team_seats_schema.sql`** (authored-only, NOT applied to remote — carried by CI→GHCR→Coolify):
  - Role CHECK widening: `DROP CONSTRAINT IF EXISTS company_members_role_check` then `ADD CONSTRAINT company_members_role_check CHECK (role IN ('owner','admin','member'))`. DEFAULT stays `'owner'`; column type, PK, and existing rows untouched.
  - `company_invites` table via `CREATE TABLE IF NOT EXISTS` — id (uuid PK, gen_random_uuid), company_id (FK CASCADE), email, role (CHECK admin|member), token (UNIQUE), status (CHECK pending|accepted|revoked|expired, default pending), invited_by (FK auth.users), expires_at, created_at.
  - Two idempotent indexes: `company_invites_company_id`, `company_invites_token`.
  - RLS enabled; three DROP-then-CREATE manage-policies (select/insert/update) scoped via the owner/admin `company_members` subquery. No anon/public/token policy — documented in comments that Phase-137 accept runs via service role (bypasses RLS).
  - No `companies` billing column touched; no backfill (invites start empty).

- **`tests/unit/phase135-team-seats-migration.test.ts`** — static SQL-contract test (15 assertions) mirroring `company-members-migration.test.ts`: widened named CHECK, table shape (all 9 columns + id PK), invite-role admin|member, status enum, UNIQUE token, FK CASCADE, RLS enabled, owner/admin scope, no-anon/no-`USING (true)`, idempotent token index, retrocompat (no billing column), and the verbatim secret-scan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test regexes did not tolerate aligned-column whitespace**
- **Found during:** Task 2 (first test run — 2 failures)
- **Issue:** The migration formats column definitions with aligned (multi-space) whitespace (`token       text NOT NULL UNIQUE`, `role        text NOT NULL CHECK ...`). The plan's literal `token text` / `role text` regexes assumed a single space and failed.
- **Fix:** Changed `token text` → `token\s+text` and `role text NOT NULL CHECK` → `role\s+text NOT NULL CHECK`. The asserted contract is unchanged — still pins the exact column/type/constraint — only the inter-token whitespace is now tolerant, consistent with the plan's "case-tolerant where the template is" intent.
- **Files modified:** tests/unit/phase135-team-seats-migration.test.ts
- **Commit:** b00c67cf

## Authentication Gates

None.

## Known Stubs

None. This is a schema-only plan; the empty `company_invites` table is the intended initial state (invites are created starting Phase 136). The deliberate absence of an anon/token RLS policy is by design (Phase-137 accept is service-role), not a stub.

## Verification

- `npx vitest run tests/unit/phase135-team-seats-migration.test.ts` → 15 passed.
- Migration contract node-check → `migration OK` (required substrings present, no secret patterns).
- gitleaks ran on both commits → no leaks found.
- Migration NOT applied to any remote (no `supabase db push`); committed as authored-only.

## Self-Check: PASSED

- FOUND: supabase/migrations/20260628000001_phase135_team_seats_schema.sql
- FOUND: tests/unit/phase135-team-seats-migration.test.ts
- FOUND commit 8b1c50fe (migration)
- FOUND commit b00c67cf (test)

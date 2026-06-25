---
phase: 138-member-management-ui
plan: 01
subsystem: team-seats
tags: [team, members, roles, authorization, server-actions, query]
requires:
  - "requireCompanyManager (Phase 135 / SEAT-02) — the single server-side role gate"
  - "company_members table (display_name/email/role columns) + company_invites table (Phase 135)"
provides:
  - "removeMember(companyId, userId) — gated member deletion"
  - "changeMemberRole(companyId, userId, role) — gated role update (admin|member)"
  - "listCompanyRoster(companyId) — gated roster read (members + pending invites)"
  - "RosterMember / RosterInvite types for the Plan 02 UI"
affects:
  - "Phase 138 Plan 02 (Settings -> Team UI) consumes all three exports"
  - "Phase 139 seat-sync reads the clean membership change (no billing added here)"
tech-stack:
  added: []
  patterns:
    - "Server action gate idiom: try { await requireCompanyManager(companyId) } catch -> { error }"
    - "Last-owner / owner-target guard via a maybeSingle role lookup before any write"
    - "zod enum (admin|member) rejects 'owner' at the boundary; role never from args"
key-files:
  created:
    - lib/queries/team.ts
    - tests/unit/actions/team-manage.test.ts
    - tests/unit/queries/team-roster.test.ts
  modified:
    - lib/actions/team.ts
decisions:
  - "Member-management actions appended to the existing SEAT-03 team.ts (single team-actions module), mirroring inviteMember/revokeInvite idiom"
  - "Guards enforced server-side before any DB write; UI gate (Plan 02) is convenience only"
  - "Roster lists from company_members columns directly — NO auth.users join (display_name/email live on the row)"
metrics:
  duration: "~3 min"
  completed: "2026-06-25"
  tasks: 2
  files: 4
---

# Phase 138 Plan 01: Member-Management Actions + Roster Query Summary

SEAT-05 server half — `removeMember` + `changeMemberRole` server actions plus a `listCompanyRoster` query, all gated exclusively through `requireCompanyManager` (owner|admin), enforcing last-owner / owner-target / role-enum guards, proven by 15 green unit tests. No billing logic introduced.

## What Was Built

- **`removeMember(companyId, userId)`** (appended to `lib/actions/team.ts`): gates via `requireCompanyManager`, looks up the target's role, refuses to delete an `owner` row (last-owner guard) and a missing row, then deletes the `company_members` row scoped by `(company_id, user_id)` and revalidates `/settings/team`.
- **`changeMemberRole(companyId, userId, role)`**: gates via `requireCompanyManager`, validates `role` against `z.enum(['admin','member'])` (rejecting `'owner'` and any non-enum value before any DB access), refuses to target an `owner` row, then updates `company_members.role`.
- **`listCompanyRoster(companyId)`** (new `lib/queries/team.ts`): manager-gated; returns active members (`user_id/display_name/email/role` from `company_members`, ordered by `created_at` asc) plus `status='pending'` invites (`id/email/role`). Exports `RosterMember` / `RosterInvite` types for the Plan 02 UI.

## Authority & Guards (the security boundary)

- Both actions and the query gate EXCLUSIVELY through `requireCompanyManager`; the role is read from `company_members` under the gate, never from an argument.
- Last-owner protection: `removeMember` refuses an `owner` row; `changeMemberRole` refuses to target an `owner` row (owner transfer out of scope v1, SEED-037).
- Settable roles limited to `'admin' | 'member'` via `roleSchema = z.enum(['admin','member'])`.
- On gate deny, no DB read/write is attempted (asserted in tests).

## Scope Fence

Member-management actions + the roster query ONLY. NO seat billing/sync (Phase 139 reads the clean membership change) and NO seat-cost number (Phase 140). Verified: no `billing`/`stripe`/`syncSeat` import was added (only fence-documenting comments match the grep).

## Verification

- `npx vitest run tests/unit/actions/team-manage.test.ts` → 11/11 green
- `npx vitest run tests/unit/queries/team-roster.test.ts` → 4/4 green
- `npx vitest run tests/unit/actions/team-invite.test.ts` (existing SEAT-03) → 10/10 still green (inviteMember/revokeInvite untouched)
- `npx tsc --noEmit` → no new type errors in the touched files

## Deviations from Plan

None — plan executed exactly as written.

## Commits

- `a669d545` feat(138-01): removeMember + changeMemberRole gated server actions
- `51706dff` feat(138-01): listCompanyRoster manager-gated roster query

## Self-Check: PASSED

- FOUND: lib/actions/team.ts (removeMember + changeMemberRole)
- FOUND: lib/queries/team.ts (listCompanyRoster)
- FOUND: tests/unit/actions/team-manage.test.ts
- FOUND: tests/unit/queries/team-roster.test.ts
- FOUND commit: a669d545
- FOUND commit: 51706dff

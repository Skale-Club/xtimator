---
phase: 137-accept-onboarding
plan: 01
subsystem: team-seats
tags: [invites, auth, server-action, token-authority, tdd]
requires:
  - company_invites (Phase 135 schema)
  - company_members (Phase 79 schema)
  - switchActiveCompany (Phase 81)
  - requireServiceClient (service client)
provides:
  - acceptInvite(token) server action (SEAT-04 action half)
affects:
  - Plan 02 (accept route) and the new-user signup branch both call acceptInvite
tech-stack:
  added: []
  patterns:
    - service-client token authority (NOT requireCompanyRole) for not-yet-members
    - atomic single-use via guarded UPDATE ... WHERE status='pending' .select()
    - idempotent membership via upsert onConflict 'user_id,company_id' ignoreDuplicates
key-files:
  created:
    - lib/actions/invite-accept.ts
    - tests/unit/actions/invite-accept.test.ts
  modified: []
decisions:
  - "Status flip runs BEFORE the member insert so a lost race writes no membership"
  - "Role and company sourced ONLY from the invite row — acceptInvite takes no role/company arg"
  - "v1 tradeoff: a hard member-insert error after the flip leaves the invite consumed; re-issue is the recovery path (documented in code)"
  - "switchActiveCompany discriminated error is ignored for the return (membership already exists; cookie hiccup must not fail the join)"
metrics:
  duration: ~5m
  completed: 2026-06-25
  tasks: 2
  files: 2
---

# Phase 137 Plan 01: acceptInvite Action Summary

SEAT-04 token-authority server action `acceptInvite(token)` that turns a pending, unexpired, email-matched team invite into an active `company_members` row and switches the accepting user into that company — single-use, idempotent, service-client only.

## What Was Built

`lib/actions/invite-accept.ts` exports `acceptInvite(token): Promise<{ success: true } | { error: string }>`:

1. Reads the accepting user via the request-scoped client's `auth.getClaims()` (no claims → signed-out error).
2. Looks up the invite by token via `requireServiceClient()` (the user is not yet a member, so RLS owner/admin policies do not cover them — token IS the authority).
3. Validates `status === 'pending'`, `expires_at > now`, and `claims.email === invite.email` (case-insensitive) — rejecting with typed errors and writing nothing on any failure.
4. Performs the SINGLE-USE atomic flip FIRST: `update({ status: 'accepted' }).eq('id', id).eq('status', 'pending').select('id')`. A 0-row result means another accept won → reject, no membership written.
5. Upserts `company_members` with `{ user_id, company_id, role, email }` sourced ONLY from the invite, `onConflict: 'user_id,company_id', ignoreDuplicates: true` (idempotent — re-accept by an existing member does not duplicate or crash).
6. Calls `switchActiveCompany(invite.company_id)` so the user lands in the right org.

The raw token never appears in any error message and is never logged.

## Tests

`tests/unit/actions/invite-accept.test.ts` — 12 cases, all green:
- happy path (member inserted with invite.role, invite flipped, company switched)
- role driven from invite (admin invite → admin membership)
- reject: expired, revoked, already-accepted, lost single-use race (0-row flip → no insert, no switch), unknown token, email mismatch, unauthenticated
- case-insensitive email match accepts mixed case
- idempotent membership (onConflict assert) still flips + switches
- never logs the raw token (spies all console.* levels)

## Deviations from Plan

None - plan executed exactly as written. (The TDD test-helper used module-level captured-payload variables instead of stashing properties on the mock fns, to keep `tsc --noEmit` clean; this is an internal test detail, not a behavior change.)

## Out-of-Scope (not touched)

Full-repo `tsc --noEmit` reports 12 pre-existing errors in unrelated test files (whatsapp handlers, estimate/observability regex-flag, inngest job). These predate this plan and were left untouched per scope boundary.

## Known Stubs

None.

## Verification

- `npx vitest run tests/unit/actions/invite-accept.test.ts` → 12 passed.
- `npx tsc --noEmit` → 0 errors in `invite-accept.ts` / `invite-accept.test.ts`.
- Service-client token lookup, guarded flip, member write, and active-company switch all present in `lib/actions/invite-accept.ts`.
- No `console` statement carries the token; role sourced from `invite.role` only (no role parameter on the signature).

## Commits

- d9e3afe7 — test(137-01): add failing acceptInvite test suite (RED)
- a49d39ef — feat(137-01): implement acceptInvite token-authority action (GREEN)

## Self-Check: PASSED
- FOUND: lib/actions/invite-accept.ts
- FOUND: tests/unit/actions/invite-accept.test.ts
- FOUND commit: d9e3afe7
- FOUND commit: a49d39ef

---
phase: 136-invite-lifecycle
plan: 02
subsystem: team-seats
tags: [seats, invites, server-actions, authz]
requires:
  - "requireCompanyManager from lib/auth/require-company-role (Phase 135 — the single role gate)"
  - "sendInviteEmail / InviteEmailContext from lib/email/invite-emails (Plan 01)"
  - "requireServiceClient from lib/supabase/service"
  - "company_invites table (Phase 135 migration)"
provides:
  - "inviteMember(companyId, email, role) — creates a pending invite + emails the accept link (lib/actions/team.ts)"
  - "revokeInvite(inviteId) — flips a pending invite to revoked (lib/actions/team.ts)"
affects:
  - "Phase 137 /invite/accept consumes the pending company_invites rows this action creates"
  - "Phase 138 member-management UI will call both actions"
tech-stack:
  added: []
  patterns:
    - "Both actions gate exclusively through requireCompanyManager (owner|admin); role never trusted from the client"
    - "randomBytes(32).toString('base64url') token idiom (matches connect-oauth); column UNIQUE is the uniqueness backstop"
    - "{ success: true } | { error: string } return shape; gate throw mapped to { error } so no unhandled throw reaches the client"
key-files:
  created:
    - "lib/actions/team.ts"
    - "tests/unit/actions/team-invite.test.ts"
  modified: []
decisions:
  - "Duplicate pending invite is REJECTED (side-effect-free), not silently replaced"
  - "Token is generated + persisted + emailed only; NEVER returned to the client and NEVER logged"
  - "Already-active-member guard matches company_members.email case-insensitively; if a row lacks a usable email it simply does not match (acceptable for this phase)"
  - "revokeInvite looks up the invite first to scope the gate on the invite's own company_id"
metrics:
  duration: "~6 min"
  completed: "2026-06-25"
  tasks: 2
  files: 2
---

# Phase 136 Plan 02: inviteMember + revokeInvite Actions Summary

Shipped the SEAT-03 invite-lifecycle server actions in `lib/actions/team.ts`: `inviteMember` creates a pending, 7-day-expiring `company_invites` row with a cryptographically-random token + `invited_by`, emails the absolute accept link via Plan 01, and returns success WITHOUT the token; `revokeInvite` flips a pending invite to `revoked`. Both gate exclusively through `requireCompanyManager` (owner/admin) and revalidate `/settings/team`.

## What Was Built

- **`lib/actions/team.ts`** (`'use server'`) — two exported actions:
  - `inviteMember(companyId, email, role)`: gates via `requireCompanyManager`; zod-validates email + `role ∈ ('admin','member')` (the `z.enum` rejects `'owner'`); normalizes email to trimmed-lowercase; rejects an already-active member (case-insensitive `company_members.email` match) and a duplicate pending invite (documented REJECT, not replace); generates `randomBytes(32).toString('base64url')`; inserts the pending row (`expires_at = now + 7d`, `invited_by = ctx.userId`); resolves the company name; calls `sendInviteEmail` with the token; `revalidatePath('/settings/team')`; returns `{ success: true }` — never the token.
  - `revokeInvite(inviteId)`: looks up the invite first, gates on its `company_id`, no-ops with an error if status `!== 'pending'`, else updates `status='revoked'` guarded by `WHERE status='pending'`, and revalidates.
- **`tests/unit/actions/team-invite.test.ts`** — 10 cases over a per-table service-client mock: happy path (asserts insert fields + email token + normalized email), token-never-returned, non-manager, invalid email, role `'owner'`, already-member, duplicate-pending, plus revoke happy / revoke non-pending / revoke non-manager.

## Verification

- `npx vitest run tests/unit/actions/team-invite.test.ts` → 10 passed.
- `npx vitest run tests/unit/actions/require-company-role.test.ts tests/unit/notifications/invite-emails.test.ts` → 12 passed (Phase 135 + Plan 01 stay green).
- `grep requireCompanyManager lib/actions/team.ts` → both actions gate through the single authority (L53, L155).
- `grep randomBytes` → token at L91; `grep "return { success: true"` → L133, L177; no `token:` appears in any return statement.
- `grep -rn "stripe|seat|billing|/invite/accept|token:"` → only matches the scope-fence doc comment; no scope-violating logic.
- `tsc --noEmit` → no errors in `lib/actions/team.ts` or the new test. All remaining tsc errors are pre-existing failures in unrelated test files (whatsapp/estimate/ai/inngest), logged to `deferred-items.md`.
- gitleaks pre-commit → no leaks on either commit; no real token/secret in source or test.

## Deviations from Plan

None — plan executed exactly as written.

### Out-of-scope discoveries (not fixed)

Pre-existing `tsc` errors in unrelated test files (Entitlements `chatEnabled` drift, regex `s`-flag target, mock-shape drift) surfaced during the whole-project typecheck. None are caused by 136-02 and none touch the files this plan created — logged to `.planning/phases/136-invite-lifecycle/deferred-items.md` per the scope boundary.

## Commits

- `eee0c4c5` feat(136-02): inviteMember + revokeInvite invite-lifecycle actions
- `0a3536d8` chore(136-02): log out-of-scope pre-existing tsc errors to deferred-items

## Self-Check: PASSED

- FOUND: lib/actions/team.ts
- FOUND: tests/unit/actions/team-invite.test.ts
- FOUND: commit eee0c4c5
- FOUND: commit 0a3536d8

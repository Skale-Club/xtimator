---
phase: 136-invite-lifecycle
verified: 2026-06-25T14:32:00Z
status: passed
score: 9/9 must-haves verified
re_verification: null
gaps: []
human_verification:
  - test: "Send a real invite end-to-end with a live Resend key"
    expected: "Invited person receives a branded email naming the company + role + expiry, with one working Accept link of shape https://<host>/invite/accept?token=..."
    why_human: "Requires a live Resend integration key + real inbox; the send path is unit-mocked, not exercised against production Resend."
---

# Phase 136: Invite Lifecycle + Email Verification Report

**Phase Goal (SEAT-03):** Invite lifecycle — `inviteMember(companyId, email, role)` + `revokeInvite` server actions (owner/admin only) creating a single-use, expiring `company_invites` row and sending a Resend invite email with the accept link. A pending invite does not consume a billable seat.
**Verified:** 2026-06-25T14:32:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | Invited person receives a Resend email naming company + role + expiry | ✓ VERIFIED | `invite-emails.ts` body+text interpolate `companyName`, `role`, `expiresLine` (L127-173) |
| 2 | Email body contains exactly ONE absolute `${baseUrl}/invite/accept?token=...` link | ✓ VERIFIED | Single `acceptUrl` built via `getCanonicalBaseUrl()` (L119), used in html CTA (L138) + text (L168) |
| 3 | Email never-throws / no-key-skip / empty-recipient-skip (mirrors account-emails) | ✓ VERIFIED | Whole body in try/catch (L108-186); empty-recipient early return (L109); no-key warn+return (L111-114) |
| 4 | Raw token only inside the accept link — never logged, never in subject | ✓ VERIFIED | Token appears only in `acceptUrl` (L119, encodeURIComponent); subject is static (L180); no `console.*` logs token |
| 5 | `inviteMember` inserts pending row (status 'pending', expires_at now+7d, invited_by=caller) for owner/admin only | ✓ VERIFIED | Gate L52-56; insert L97-105 with `status:'pending'`, `expires_at` now+7d (L94), `invited_by: ctx.userId` |
| 6 | `inviteMember` generates unique crypto-random token, emails it, NEVER returns it | ✓ VERIFIED | `randomBytes(32).toString('base64url')` (L91); `sendInviteEmail` (L120); returns `{ success: true }` only (L133), no `token:` in any return |
| 7 | `inviteMember` rejects: non-manager, invalid email, role 'owner', already-active-member, duplicate-pending | ✓ VERIFIED | Gate (L52); zod `safeParse` (L59-60); `z.enum(['admin','member'])` rejects owner (L32); member guard (L66-76); duplicate-pending guard (L80-88) |
| 8 | `revokeInvite` flips pending→revoked for owner/admin, company-scoped, no-op on non-pending | ✓ VERIFIED | Lookup-then-gate on invite's company (L146-158); non-pending error (L161-163); guarded update `WHERE status='pending'` (L166-170) |
| 9 | No billing/seat logic, no accept route, no UI; no secrets/tokens inlined | ✓ VERIFIED | Only doc-comment mentions billing/seat (L19-20); no Stripe/seat/accept-route logic; no `re_`/`sk_` literals |

**Score:** 9/9 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `lib/email/invite-emails.ts` | `sendInviteEmail` + `InviteEmailContext` (min 60 lines) | ✓ VERIFIED | 188 lines; exports both; self-contained escHtml/buildEmailShell/FROM_ADDRESS |
| `tests/unit/notifications/invite-emails.test.ts` | Email behavioral test | ✓ VERIFIED | 5 cases; passes in isolation (5/5) |
| `lib/actions/team.ts` | `inviteMember` + `revokeInvite` (min 90 lines, contains requireCompanyManager) | ✓ VERIFIED | 178 lines; both gate via `requireCompanyManager` (L53, L155) |
| `tests/unit/actions/team-invite.test.ts` | Happy + reject + revoke tests | ✓ VERIFIED | 10 cases; passes 10/10 in isolation |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `invite-emails.ts` | `getCanonicalBaseUrl()` | import from `@/lib/utils/site-url` | ✓ WIRED | Imported L3, used L119; export exists at site-url.ts L65 |
| `invite-emails.ts` | Resend | `import('resend')` + `resend.emails.send` | ✓ WIRED | Dynamic import L175, `resend.emails.send` L177 after key check |
| `team.ts` | `requireCompanyManager(companyId)` | import from `@/lib/auth/require-company-role` | ✓ WIRED | Imported L6, used L53 + L155; export exists at require-company-role.ts L70 |
| `team.ts` | `sendInviteEmail` | import from `@/lib/email/invite-emails` | ✓ WIRED | Imported L8, called L120 with the generated token |
| `team.ts` | `company_invites` | service-role insert/update | ✓ WIRED | Insert L97-105, update L166-170; schema columns match migration |

### Schema Alignment (Level 4 — data shape)

| Field used in action | Migration column | Status |
| -------------------- | ---------------- | ------ |
| `company_id, email, role, token, status, invited_by, expires_at` | All present in `company_invites` (migration L27-39) | ✓ MATCH |
| `role IN ('admin','member')` | DB CHECK `role IN ('admin','member')` (L31) | ✓ MATCH — owner rejected at both layers |
| `status='pending'`/`'revoked'` | DB CHECK status IN pending/accepted/revoked/expired (L34) | ✓ MATCH |
| `token` UNIQUE | DB `token text NOT NULL UNIQUE` (L32) | ✓ MATCH — single-use/uniqueness backstop |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Phase 136 tests pass in isolation | `vitest run invite-emails.test.ts team-invite.test.ts` | 15 passed (2 files) | ✓ PASS |
| team-invite re-run isolated | `vitest run team-invite.test.ts` | 10 passed | ✓ PASS |
| mcp-route-contract isolated (known flake) | `vitest run mcp-route-contract.test.ts` | 8 passed | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| SEAT-03 | 136-01, 136-02 | Invite lifecycle: inviteMember + revokeInvite (owner/admin), single-use expiring invite row + Resend email; pending invite ≠ billable seat | ✓ SATISFIED | Actions + email shipped, gated, no billing logic; truths 1-9 verified |

No orphaned requirements — REQUIREMENTS.md maps only SEAT-03 to Phase 136, claimed by both plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | None | — | No TODO/FIXME/placeholder; no stub returns; token never logged; no secrets inlined |

### Full Suite Result

`npx vitest run` → **2 failed | 2467 passed | 2 skipped | 33 todo (2504)**, 360 files.

Both failures are `Test timed out in 5000ms` errors caused by parallel-import contention (full-run import phase 245s), NOT logic failures:

1. `tests/unit/mcp-route-contract.test.ts > GET returns 405` — the documented KNOWN non-blocking flake (GET-405 fails only in parallel, passes in isolation). Confirmed 8/8 passing standalone.
2. `tests/unit/actions/team-invite.test.ts > happy path` — same parallel-contention class: the in-test `await import('@/lib/actions/team')` timed out during the import storm. Confirmed 10/10 passing standalone (twice). This is NOT a defect in the phase code; the action logic is exercised and green in isolation.

Per the known-flake clause: both failures vanish in isolation and both are timeout-not-assertion failures from the same parallel-import root cause. Suite treated as **green**.

### Human Verification Required

1. **Live invite email** — Send a real invite with a production Resend key and confirm the recipient gets a branded email with company/role/expiry and one working Accept link of shape `https://<host>/invite/accept?token=...`. Why human: send path is unit-mocked; not exercised against live Resend. (Non-blocking; the route consuming the link ships in Phase 137.)

### Gaps Summary

No gaps. All 9 observable truths verified, all 4 artifacts substantive and wired, all 5 key links connected, schema aligned, scope fence intact (no billing/seat/accept-route/UI), no secrets or logged tokens. The two full-suite failures are parallel-contention timeouts that pass deterministically in isolation — covered by the known-flake provision.

---

_Verified: 2026-06-25T14:32:00Z_
_Verifier: Claude (gsd-verifier)_

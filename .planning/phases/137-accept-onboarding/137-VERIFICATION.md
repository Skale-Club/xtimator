---
phase: 137-accept-onboarding
verified: 2026-06-25T14:58:00Z
status: passed
score: 10/10 must-haves verified
re_verification: No
---

# Phase 137: Accept Onboarding Verification Report

**Phase Goal:** SEAT-04 — an invited person can JOIN an existing company (never create one): `acceptInvite(token)` is a single-use, expiry-enforced, email-matched, idempotent service-client token-authority action; the `/invite/accept` route handles authed + unauthed visitors; an invited new-user signup is ROUTED to JOIN (accept) instead of CREATE (/onboarding).
**Verified:** 2026-06-25T14:58:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
| -- | ----- | ------ | -------- |
| 1  | Pending/unexpired/email-matching token inserts company_members with invite.role and flips invite to accepted | ✓ VERIFIED | invite-accept.ts steps 6–7; happy-path test passes |
| 2  | Expired/revoked/already-accepted/unknown token rejected, no membership written | ✓ VERIFIED | steps 3–4; reject tests (expired/revoked/already-accepted/unknown) pass |
| 3  | Single-use atomic: guarded flip `WHERE id AND status='pending'`, 0-row → reject BEFORE member insert | ✓ VERIFIED | step 6 (`.eq('status','pending').select('id')`, 0-row reject); lost-race test asserts no insert/no switch |
| 4  | Email mismatch (authed email != invite.email, case-insensitive) rejected, no membership | ✓ VERIFIED | step 5 trim+toLowerCase compare; mismatch + mixed-case tests pass |
| 5  | Membership insert idempotent (ON CONFLICT no dup, no crash) | ✓ VERIFIED | upsert onConflict 'user_id,company_id' ignoreDuplicates; idempotency test passes |
| 6  | On success active company switched to invite's company | ✓ VERIFIED | step 8 `switchActiveCompany(invite.company_id)`; happy-path asserts call |
| 7  | Authed visitor → acceptInvite → redirect into app; unauthed → signup/login carrying guarded ?next | ✓ VERIFIED | page.tsx Branch A (`/?auth=signup&next=`) + Branch B (acceptInvite → /dashboard) |
| 8  | Invited new-user signup SKIPS company creation and JOINs (routing, not company.ts edit) | ✓ VERIFIED | auth.ts safeInviteNext honored by signUp/signIn; route outside (app) group; company.ts untouched |
| 9  | Test asserts invited signup → /invite/accept (never /onboarding) while plain signup still → /onboarding | ✓ VERIFIED | auth-invite-redirect.test.ts: invited→accept, no-next→/onboarding, hostile-next→/onboarding |
| 10 | Token never logged | ✓ VERIFIED | no console statements in either file; "never logs raw token" test passes |

**Score:** 10/10 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `lib/actions/invite-accept.ts` | acceptInvite service-client token authority, ≥80 lines, exports acceptInvite | ✓ VERIFIED | 108 lines, exports acceptInvite, requireServiceClient + guarded flip + member upsert + switchActiveCompany |
| `tests/unit/actions/invite-accept.test.ts` | happy + all reject + idempotency + switch + token-secrecy | ✓ VERIFIED | 13 cases, all green |
| `app/invite/accept/page.tsx` | accept route, authed + unauthed, ≥40 lines | ✓ VERIFIED | 78 lines, outside (app) group, Branch A/B, error card |
| `lib/actions/auth.ts` | signUp/signIn honor guarded ?next | ✓ VERIFIED | safeInviteNext guard; both actions redirect to safe next else original dest |
| `tests/unit/actions/auth-invite-redirect.test.ts` | invited signup → accept, plain → onboarding, hostile blocked | ✓ VERIFIED | 4 cases, all green |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| invite-accept.ts | company_invites | service-client lookup + guarded flip | ✓ WIRED | `from('company_invites')` select-by-token + guarded update |
| invite-accept.ts | company_members | service-client upsert with invite.role | ✓ WIRED | `from('company_members').upsert({ role: invite.role, ... })` |
| invite-accept.ts | switchActiveCompany | import from @/lib/actions/active-company | ✓ WIRED | imported + called step 8 |
| page.tsx | acceptInvite | import from @/lib/actions/invite-accept | ✓ WIRED | imported + called Branch B |
| auth.ts | /invite/accept | next-param redirect after signUp/signIn | ✓ WIRED | safeInviteNext + redirect(inviteNext) in both |
| accept page → landing → AuthDialog → auth.ts | (full chain) | next survives auth round-trip | ✓ WIRED | landing-page.tsx captures `next`; AuthDialog appends to formData (login+signup); auth.ts honors it |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Phase 137 unit tests | `vitest run invite-accept + auth-invite-redirect` | 17 passed | ✓ PASS |
| Flaky-pair isolation | `vitest run mcp-route-contract + team-invite` | 18 passed | ✓ PASS |
| Full suite | `npx vitest run` | 2486 passed, 2 failed (timeout-only flakes, pass in isolation) | ✓ PASS (green per known-flake policy) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| SEAT-04 | 137-01, 137-02 | acceptInvite join + signup-then-join branch skipping company creation | ✓ SATISFIED | Truths 1–10 verified; both plans' must_haves met |

### Anti-Patterns Found

None. No TODO/FIXME/placeholder/stub in phase files. No console statements (token never logged). No secret patterns. company.ts create path untouched (scope fence). No Team UI (Phase 138) or billing (Phase 139) added.

### Human Verification Required

None required for goal verification. (Optional manual sanity: end-to-end browser flow of an invited new-user email click → signup → JOIN, since real Supabase auth + cookie behavior is only mocked in tests.)

### Gaps Summary

No gaps. All ten observable truths verified, all five artifacts substantive and wired, all six key links connected end-to-end, full test suite green (only the two documented parallel-timeout flakes failed and both pass in isolation). Scope fence intact: company.ts create path untouched, no Team UI or billing introduced. SEAT-04 fully satisfied.

---

_Verified: 2026-06-25T14:58:00Z_
_Verifier: Claude (gsd-verifier)_

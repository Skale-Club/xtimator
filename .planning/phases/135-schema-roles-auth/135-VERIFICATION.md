---
phase: 135-schema-roles-auth
verified: 2026-06-25T14:12:00Z
status: passed
score: 9/9 must-haves verified
re_verification: false
requirements:
  - id: SEAT-01
    status: satisfied
  - id: SEAT-02
    status: satisfied
---

# Phase 135: Schema + Roles + Authorization — Verification Report

**Phase Goal:** Turn the dormant `company_members` foundation into the team-seats data + authorization layer: widen the role matrix to owner/admin/member, create the `company_invites` store with owner/admin-scoped RLS (SEAT-01), and ship the single server-side `requireCompanyRole` gate every later team/billing action will call (SEAT-02).
**Verified:** 2026-06-25
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | `company_members.role` accepts owner/admin/member (CHECK widened, named, idempotent) | ✓ VERIFIED | Migration L18-21: `DROP CONSTRAINT IF EXISTS company_members_role_check` + `ADD CONSTRAINT ... CHECK (role IN ('owner','admin','member'))` |
| 2 | `company_invites` table exists with all 9 columns + 2 CHECKs + UNIQUE token + FK CASCADE | ✓ VERIFIED | Migration L27-38: id/company_id/email/role/token/status/invited_by/expires_at/created_at; role CHECK admin\|member; status CHECK pending/accepted/revoked/expired default pending; token UNIQUE; `REFERENCES companies(id) ON DELETE CASCADE` |
| 3 | RLS lets owner/admin manage their company's invites; no anon/token/public policy | ✓ VERIFIED | Migration L57-93: `ENABLE ROW LEVEL SECURITY`; 3 DROP-then-CREATE policies (select/insert/update) scoped via `company_members ... role IN ('owner','admin')` subquery; no `TO anon`, no `USING (true)` |
| 4 | Existing owner rows untouched; no companies billing column changed | ✓ VERIFIED | Migration only ALTERs the named CHECK + DEFAULT stays 'owner'; grep confirms no `ALTER TABLE companies` touching stripe/tier/subscription |
| 5 | Re-running the migration is safe (fully idempotent) | ✓ VERIFIED | DROP CONSTRAINT IF EXISTS, CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, DROP POLICY IF EXISTS before each CREATE POLICY |
| 6 | `requireCompanyRole` resolves role SERVER-SIDE from company_members (RLS-bound, never client-supplied) | ✓ VERIFIED | `require-company-role.ts` L46-59: `createClient()` (RLS-bound) → `getClaims()` → `from('company_members').select('role').eq('user_id',userId).eq('company_id',companyId).maybeSingle()`. No `requireServiceClient`. Role never an argument. |
| 7 | owner passes owner-gate; admin passes manager but fails owner-gate; member fails manager; non-member denied; unauthenticated denied | ✓ VERIFIED | L62-63 deny logic; behavioral matrix test (7 cases) green |
| 8 | manager/owner wrappers delegate to the single `requireCompanyRole` (one authority) | ✓ VERIFIED | L70-81: both wrappers are thin delegations to `requireCompanyRole` |
| 9 | Denial throws typed XtimatorError (unauthorized / forbidden, surface 'company'), not a boolean | ✓ VERIFIED | L51 `unauthorized`, L63 `forbidden`; both types + surface 'company' validated in lib/errors/codes.ts |

**Score:** 9/9 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `supabase/migrations/20260628000001_phase135_team_seats_schema.sql` | Role widening + company_invites + RLS | ✓ VERIFIED | 94 lines, substantive, newest migration timestamp (collision-free), no secrets |
| `tests/unit/phase135-team-seats-migration.test.ts` | Static SQL-contract test | ✓ VERIFIED | 15 assertions, all green; locks CHECK, table shape, RLS posture, retrocompat, secret-scan |
| `lib/auth/require-company-role.ts` | Single server-only role gate + wrappers | ✓ VERIFIED | 82 lines; `import 'server-only'` first line; exports requireCompanyRole/Manager/Owner + types |
| `tests/unit/actions/require-company-role.test.ts` | 7-case behavioral matrix | ✓ VERIFIED | 7 cases, all green; mocks RLS client; asserts `from('company_members')` server-read |

### Key Link Verification

| From | To | Via | Status |
| ---- | -- | --- | ------ |
| migration | `company_members_role_check` | DROP IF EXISTS + ADD named CHECK with 3-role matrix | ✓ WIRED |
| `company_invites.company_id` | `companies(id)` | FK ON DELETE CASCADE | ✓ WIRED |
| `require-company-role.ts` | `company_members` | `from('company_members')` RLS-bound read on user_id+company_id | ✓ WIRED |
| `require-company-role.ts` | `XtimatorError` | throws forbidden/unauthorized (surface 'company') on deny | ✓ WIRED |
| wrappers | `requireCompanyRole` | requireCompanyManager/Owner delegate to single helper | ✓ WIRED |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Phase 135 tests green | `vitest run` (both phase test files) | 22 passed (15 + 7) | ✓ PASS |
| Migration is authored-only, not applied | git status + newest-migration listing | clean, committed, never `supabase db push`-ed | ✓ PASS |
| Error types/surface valid | grep lib/errors/codes.ts | `unauthorized`/`forbidden`/`company` all defined | ✓ PASS |
| No secrets in artifacts | secret-pattern grep | NO SECRETS FOUND | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| SEAT-01 | 135-01 | Idempotent authored-only migration: widen role CHECK + company_invites table + RLS, retrocompat | ✓ SATISFIED | Migration + 15-assertion contract test, all green |
| SEAT-02 | 135-02 | Single server-side `requireCompanyRole` gate, never client-trusted, typed errors | ✓ SATISFIED | Helper + 7-case behavioral matrix test, all green |

No orphaned requirements: REQUIREMENTS.md maps only SEAT-01 + SEAT-02 to Phase 135; both are claimed by the plans and verified.

### Anti-Patterns Found

None. No TODO/FIXME/placeholder, no stub returns, no client-trusted role, no service-role client in the gate, no anon RLS policy, no hardcoded billing values (none in scope this phase), no secrets.

### Full Suite

`npx vitest run` → **1 failed | 2451 passed | 2 skipped | 33 todo** across 358 files.

The single failure is `tests/unit/mcp-route-contract.test.ts > GET returns 405 Method Not Allowed with Allow: POST header` — timing out at 5000ms in the parallel run. This is the documented known non-blocking flake. Re-run in isolation: **8 passed (8)**. Per the verification contract, since this is the ONLY failure and it passes in isolation, the suite is treated as **green**. No other failures.

### Gaps Summary

None. Both requirements (SEAT-01, SEAT-02) fully satisfied. The migration is idempotent, retrocompat (existing owner rows + companies billing columns untouched), authored-only (committed, never pushed to remote), secret-free, and locked by a static contract test. The authorization gate is server-only, RLS-bound (not service role), the single source of truth with delegating wrappers, throws typed errors, and is proven by a 7-case behavioral matrix covering owner/admin/member/non-member/unauthenticated and the server-side read.

---

_Verified: 2026-06-25T14:12:00Z_
_Verifier: Claude (gsd-verifier)_

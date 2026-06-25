---
phase: 135-schema-roles-auth
plan: 02
subsystem: team-seats
tags: [auth, authorization, roles, rls, server-only]
requires:
  - company_members.role ('owner','admin','member') (Phase 135-01)
  - lib/supabase/server createClient (RLS-bound)
  - lib/errors XtimatorError
provides:
  - requireCompanyRole(companyId, allowedRoles) — single server-side role-authority gate
  - requireCompanyManager (owner|admin) convenience wrapper
  - requireCompanyOwner (owner) convenience wrapper
affects: [lib/auth]
tech-stack:
  added: []
  patterns: [server-only-guard-module, rls-bound-membership-read, single-authority-gate, typed-xtimator-error-deny, supabase-from-chain-mock-test]
key-files:
  created:
    - lib/auth/require-company-role.ts
    - tests/unit/actions/require-company-role.test.ts
  modified: []
decisions:
  - "Role authority lives in exactly ONE function: requireCompanyRole. The manager/owner wrappers are thin delegations, never re-deriving a role."
  - "Reads the role from company_members via the RLS-bound createClient (caller's JWT) — never requireServiceClient — so the gate operates under the caller's identity."
  - "Deny throws a typed XtimatorError (unauthorized when no auth sub, forbidden when role not in allowedRoles) on surface 'company' — never a client-trusted boolean."
  - "No wiring into any existing action this plan (scope fence): the gate is created and proven only; Phases 136-140 consume it."
metrics:
  duration: ~2m
  completed: 2026-06-25
requirements: [SEAT-02]
---

# Phase 135 Plan 02: requireCompanyRole Authorization Helper Summary

The single server-side role-authority gate for team seats: `requireCompanyRole(companyId, allowedRoles)` resolves the caller's `company_members` role from the RLS-bound server client (the caller's own JWT, never the service role, never a client-supplied role) and throws a typed `XtimatorError` — `unauthorized` when there is no auth claim, `forbidden` when the role is not in `allowedRoles`. Thin `requireCompanyManager` (owner|admin) and `requireCompanyOwner` (owner) wrappers delegate to it so role authority lives in exactly one place. A 7-case behavioral matrix test locks every cell of the locked role matrix.

## What Was Built

- **`lib/auth/require-company-role.ts`** (`import 'server-only'` first line, mirrors `lib/auth/admin-context.ts` module shape):
  - `requireCompanyRole(companyId, allowedRoles)`: `createClient()` → `getClaims()` → no `sub` throws `XtimatorError('unauthorized', 'company', ...)`; queries `company_members.select('role').eq('user_id', userId).eq('company_id', companyId).maybeSingle()` (mirrors `active-company.ts`); if `!role || !allowedRoles.includes(role)` throws `XtimatorError('forbidden', 'company', ...)`; otherwise returns `{ userId, companyId, role }`.
  - `requireCompanyManager(companyId)` → `requireCompanyRole(companyId, ['owner','admin'])`.
  - `requireCompanyOwner(companyId)` → `requireCompanyRole(companyId, ['owner'])`.
  - Exports `type CompanyRole = 'owner' | 'admin' | 'member'` and `CompanyRoleContext`.
  - Header doc comment carries the locked role matrix and the "single gate, never client-trusted" contract. Uses the RLS-bound `createClient`, never `requireServiceClient`.

- **`tests/unit/actions/require-company-role.test.ts`** — `describe('SEAT-02: requireCompanyRole role matrix')`, 7 cases, mocking `@/lib/supabase/server` createClient with a per-case `mockSupabase({ role, authenticated })` that fakes `auth.getClaims()` and the `from('company_members').select(...).eq(...).eq(...).maybeSingle()` chain:
  1. owner passes owner-only gate (asserts `.role === 'owner'`, `.userId`, `.companyId`).
  2. admin passes manager gate.
  3. admin FAILS owner-only gate (rejects).
  4. member FAILS manager gate (rejects).
  5. non-member (membership null) denied (rejects).
  6. unauthenticated (no claim sub) denied (rejects).
  7. server-side read proof: `expect(from).toHaveBeenCalledWith('company_members')`.

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `npx vitest run tests/unit/actions/require-company-role.test.ts` → 7 passed (7).
- `tsc --noEmit` → no errors in `require-company-role.ts` or its test.
- `grep requireServiceClient lib/auth/require-company-role.ts` → NONE (gate reads under caller identity).
- `grep requireCompanyManager|requireCompanyOwner` → both wrappers present and delegate to `requireCompanyRole`.
- Helper structural check (`server-only`, `from('company_members')`, all three exports, `forbidden`, no service role) → OK.

## Known Stubs

None.

## Commits

- `f9862147` feat(135-02): add requireCompanyRole server-side role-authority gate
- `c60b1f9c` test(135-02): prove requireCompanyRole role matrix (7 cases)

## Self-Check: PASSED

- FOUND: lib/auth/require-company-role.ts
- FOUND: tests/unit/actions/require-company-role.test.ts
- FOUND commit: f9862147
- FOUND commit: c60b1f9c

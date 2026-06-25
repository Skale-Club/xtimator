---
phase: 139-seat-billing
plan: 03
subsystem: payments
tags: [stripe, billing, seats, membership, wiring, vitest]

# Dependency graph
requires:
  - phase: 139-02
    provides: syncSeatBilling(companyId) — gated, idempotent, never-throw Stripe seat reconciliation
  - phase: 137-invite-accept
    provides: acceptInvite(token) token-authority join action (success path = upsert + switchActiveCompany)
  - phase: 138-member-management
    provides: removeMember + changeMemberRole member-management actions (requireCompanyManager gate)
provides:
  - acceptInvite wires syncSeatBilling(invite.company_id) on the join success path
  - removeMember wires syncSeatBilling(companyId) on the delete success path
  - changeMemberRole wires syncSeatBilling(companyId) on the update success path
  - guarded call sites — a seat-sync failure never rolls back / fails the membership op
affects: [seat-billing, membership-actions, stripe-subscription, phase-140]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Membership-mutation success path fires a guarded, never-throw billing side-effect (try/catch belt-and-suspenders over an already-never-throw fn)"
    - "Billing side-effect wired ONLY on the success path; every early-return error branch is untouched"

key-files:
  created:
    - tests/unit/billing/seat-billing-wiring.test.ts
  modified:
    - lib/actions/invite-accept.ts
    - lib/actions/team.ts

key-decisions:
  - "Guarded `try { await syncSeatBilling(id) } catch {}` (not fire-and-forget void) so the wiring test can assert the call deterministically, while still never failing the membership op"
  - "changeMemberRole is wired even though an admin<->member flip rarely changes the billable count — a flip that changes billable status must re-sync; syncSeatBilling's idempotent no-op makes the redundant call cheap"
  - "Updated team.ts scope-fence doc comment (Phase 138 said 'NO seat billing/sync here') to reflect that SEAT-07 now intentionally wires the guarded sync"

patterns-established:
  - "Every membership-count-affecting mutation reconciles seat billing as a guarded side-effect after the row change commits"

metrics:
  duration: "~10 min"
  completed: 2026-06-25
  tasks: 2
  files-created: 1
  files-modified: 2
  commits: 2
---

# Phase 139 Plan 03: Wire syncSeatBilling into Membership Actions Summary

Closed the SEAT-07 loop: the never-throw `syncSeatBilling(companyId)` from Plan 02 is now invoked as a guarded side-effect on the success path of all three membership-count-affecting mutations — `acceptInvite` (join), `removeMember`, and `changeMemberRole` — so the Stripe seat quantity reconciles after every membership change, while a billing-side failure can never roll back or fail the underlying team operation.

## What Shipped

- **`lib/actions/invite-accept.ts`** — after `switchActiveCompany(invite.company_id)` and before `return { success: true }`, a guarded `try { await syncSeatBilling(invite.company_id as string) } catch {}` reconciles seats for the joined company.
- **`lib/actions/team.ts`** — `removeMember` and `changeMemberRole` each gained a guarded `try { await syncSeatBilling(companyId) } catch {}` after their respective `delete`/`update` + `revalidatePath(TEAM_PATH)`, before the success return. The stale "NO seat billing/sync here" scope-fence comment was updated to reflect the intentional SEAT-07 wiring.
- **`tests/unit/billing/seat-billing-wiring.test.ts`** — 10 wiring tests (3 suites) mocking `syncSeatBilling` with `vi.fn` and reusing the membership-boundary mock posture (service client, auth claims, `requireCompanyManager`, `switchActiveCompany`, `next/cache`). Asserts: each action fires `syncSeatBilling` once with the correct company id on success; a rejecting `syncSeatBilling` still yields `{ success: true }`; failure branches (lost single-use race, missing target, last-owner guard, invalid role) do NOT call it.

## Key Implementation Details

- Only the **success path** is wired. Every early-return error branch (not-a-manager, missing target, last-owner / owner-target guard, invalid role, lost race) is byte-unchanged and verified by the test to NOT trigger a seat sync.
- The call sites use an **awaited-but-guarded** `try/catch` rather than fire-and-forget `void`. `syncSeatBilling` is already never-throw internally; the extra catch is belt-and-suspenders so a future change can't make the membership op fail, and the awaited form lets the test assert invocation deterministically.

## Deviations from Plan

**1. [Rule 1 - Bug] Updated stale scope-fence doc comment in team.ts**
- **Found during:** Task 1
- **Issue:** The SEAT-05 doc block (from Phase 138) explicitly stated "NO seat billing/sync (Phase 139 reads the clean membership change) ... Do NOT import or call any billing/syncSeatBilling/Stripe code here." After wiring, that comment directly contradicted the code and would mislead future readers.
- **Fix:** Reworded the scope fence to state that SEAT-07 now wires the guarded never-throw `syncSeatBilling` after a successful mutation, keeping the "never fail the membership op" invariant explicit. No behavior change.
- **Files modified:** lib/actions/team.ts
- **Commit:** d1c79221

**2. [Rule 3 - Blocking] Vitest 4 `vi.fn` generic signature**
- **Found during:** Task 2
- **Issue:** `vi.fn<[string], Promise<void>>()` (two-arg generic) is valid at runtime but rejected by `tsc` under Vitest 4, which expects a single function-type argument (`TS2558` + downstream `TS2345`).
- **Fix:** Changed to `vi.fn<(companyId: string) => Promise<void>>()`. Tests still green, tsc clean.
- **Files modified:** tests/unit/billing/seat-billing-wiring.test.ts
- **Commit:** 85caedb2

## Verification

- `npx vitest run tests/unit/billing/seat-billing-wiring.test.ts` → 10/10 passing.
- `npx vitest run tests/unit/billing tests/unit/actions/team-manage.test.ts tests/unit/actions/invite-accept.test.ts` → 30 files, 250 passing (no regressions in the existing membership-action or billing suites — additive guarded calls only).
- `npx vitest run tests/unit/actions` → 8 files, 55 passing.
- `npx tsc --noEmit` → no new errors in invite-accept.ts / team.ts / the new test.
- `grep -c "syncSeatBilling"` → invite-accept.ts = 3, team.ts = 5 (thresholds: >=2, >=3).
- No secrets touched.

## Self-Check: PASSED

- FOUND: lib/actions/invite-accept.ts (wired)
- FOUND: lib/actions/team.ts (wired)
- FOUND: tests/unit/billing/seat-billing-wiring.test.ts
- FOUND commit: d1c79221 (feat — wiring)
- FOUND commit: 85caedb2 (test — wiring tests)

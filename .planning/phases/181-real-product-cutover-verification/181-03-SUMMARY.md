---
phase: 181-real-product-cutover-verification
plan: 03
subsystem: ui
tags: [demo, settings, redirect, isDemoCompany, next-app-router]

# Dependency graph
requires:
  - phase: 180-isolated-demo-session-read-only-foundation
    provides: "isDemoCompany(companyId) + DEMO_COMPANY_ID in lib/demo/config.ts, getActiveCompanyId() in lib/queries/active-company.ts"
provides:
  - "URL-level demo guard on all 15 settings pages not in the demo-exposed set (Company/Team/Notifications)"
  - "tests/unit/settings/demo-hidden-tab-guards.test.ts — static-source proof covering all 15 pages"
affects: [181-cutover-verification, 181-goal-verifier]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server-component demo redirect guard: `if (isDemoCompany(companyId)) redirect('/settings/company')` placed immediately after each page's existing company-resolution/auth check, following each file's own pre-existing redirect idiom (no new pattern introduced)."
    - "Stub-redirect pages that formerly chained unconditionally to a hidden tab (defaults -> estimates, payments -> integrations/stripe) now gate their destination on isDemoCompany instead, so demo never even transits through a hidden-tab URL."

key-files:
  created:
    - tests/unit/settings/demo-hidden-tab-guards.test.ts
  modified:
    - "app/(app)/settings/(tabs)/account/page.tsx"
    - "app/(app)/settings/(tabs)/estimates/page.tsx"
    - "app/(app)/settings/(tabs)/appearance/page.tsx"
    - "app/(app)/settings/(tabs)/delivery/page.tsx"
    - "app/(app)/settings/(tabs)/defaults/page.tsx"
    - "app/(app)/settings/billing/page.tsx"
    - "app/(app)/settings/custom-domain/page.tsx"
    - "app/(app)/settings/estimate-templates/page.tsx"
    - "app/(app)/settings/integrations/page.tsx"
    - "app/(app)/settings/integrations/mcp/page.tsx"
    - "app/(app)/settings/integrations/stripe/page.tsx"
    - "app/(app)/settings/knowledge/page.tsx"
    - "app/(app)/settings/knowledge/[id]/page.tsx"
    - "app/(app)/settings/knowledge/new/page.tsx"
    - "app/(app)/settings/payments/page.tsx"

key-decisions:
  - "appearance/page.tsx converted from a plain sync function component to async so it can resolve companyId via getActiveCompanyId() — no auth/login check was added (pre-existing gap, out of this plan's scope, per plan instruction)."
  - "defaults/page.tsx and payments/page.tsx (both unconditional stub redirects to a now-hidden tab) gate their destination itself: demo -> /settings/company, real tenant -> the original target (/settings/estimates, /settings/integrations/stripe) — matching 181-RESEARCH.md's explicit recommendation instead of leaving demo to chain through a second hidden-tab redirect."
  - "integrations/page.tsx previously had zero auth/company resolution at all; added getActiveCompanyId() + isDemoCompany guard at the very top of the component body, ahead of the existing getAuthClaims() call."

patterns-established:
  - "Demo hidden-tab guard: every non-exposed settings page resolves its company id/company object (reusing whatever mechanism the page already uses — getActiveCompanyId, getActiveCompany, or an inline service-role query) and calls isDemoCompany(...) immediately after its existing not-found/onboarding redirect, before any other page logic runs."

requirements-completed: [PARITY-02]

# Metrics
duration: ~20min
completed: 2026-07-27
---

# Phase 181 Plan 03: Demo Hidden-Tab URL Guards Summary

**Added a one-line `isDemoCompany(...)` redirect guard to all 15 settings pages outside the demo-exposed set (Company/Team/Notifications), so a demo visitor who bookmarks or guesses a hidden tab's URL is bounced to `/settings/company` instead of rendering real billing/integration/knowledge/account content.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 3
- **Files modified:** 15 pages + 1 new test file

## Accomplishments
- All 15 settings pages not in {Company, Team, Notifications} now redirect a demo session to `/settings/company` on direct URL access, closing the nav-hidden-but-URL-still-renders gap left by Plan 01's `SettingsNav` filter.
- Real-tenant behavior is unaffected everywhere: the guard is a pure no-op whenever `isDemoCompany(companyId)` is false, since it's inserted after each page's pre-existing auth/company-resolution logic using the company id already in scope.
- New static-source test `tests/unit/settings/demo-hidden-tab-guards.test.ts` (18 assertions across 15 `describe` blocks, `readFileSync` + string-match pattern mirroring `tests/unit/settings/account-consolidation.test.tsx`) proves the guard exists on every one of the 15 files without rendering/mocking anything.
- `appearance/page.tsx` (previously a fully static sync component with zero company resolution) and `defaults/page.tsx`/`payments/page.tsx` (previously unconditional stub redirects to now-hidden tabs) all correctly gained async company resolution and demo-aware redirect targets.

## Task Commits

Each task was committed atomically. Task 1's files got swept into a sibling agent's commit due to a git-index race in this in-place (non-worktree) parallel execution — see Deviations below for the full account and content verification.

1. **Task 1: Guard account, estimates, appearance, delivery, defaults** — content verified present in `80f0cd2b` (`feat(181-02): implement notifications readOnly wiring`) — see deviation note.
2. **Task 2: Guard billing, custom-domain, estimate-templates, integrations, integrations/mcp** — `bae898b3` (feat) — re-committed after a second race (see Deviations).
3. **Task 3: Guard integrations/stripe, knowledge, knowledge/[id], knowledge/new, payments** — `4680f0c8` (feat)

## Files Created/Modified
- `app/(app)/settings/(tabs)/account/page.tsx` — added `getActiveCompanyId`/`isDemoCompany` guard after the existing login check
- `app/(app)/settings/(tabs)/estimates/page.tsx` — guard after `if (!company) redirect('/onboarding')`
- `app/(app)/settings/(tabs)/appearance/page.tsx` — converted sync -> async, added company resolve + guard
- `app/(app)/settings/(tabs)/delivery/page.tsx` — guard after `if (!company) redirect('/onboarding')`
- `app/(app)/settings/(tabs)/defaults/page.tsx` — redirect target now `isDemoCompany(companyId) ? '/settings/company' : '/settings/estimates'`
- `app/(app)/settings/billing/page.tsx` — guard after `if (!company) { redirect('/onboarding') }`
- `app/(app)/settings/custom-domain/page.tsx` — guard using `settings.id` after `if (!settings) redirect('/onboarding')`
- `app/(app)/settings/estimate-templates/page.tsx` — guard using `template.id` after `if (!template) redirect('/onboarding')`
- `app/(app)/settings/integrations/page.tsx` — added `getActiveCompanyId`/`isDemoCompany` guard at the top of the page body (page had no prior auth/company resolution)
- `app/(app)/settings/integrations/mcp/page.tsx` — guard after `if (!company) redirect('/onboarding')`
- `app/(app)/settings/integrations/stripe/page.tsx` — guard using the service-role-resolved `company.id`
- `app/(app)/settings/knowledge/page.tsx` — guard using `company.id`
- `app/(app)/settings/knowledge/[id]/page.tsx` — guard using `company.id`
- `app/(app)/settings/knowledge/new/page.tsx` — guard using `company.id`
- `app/(app)/settings/payments/page.tsx` — redirect target now `isDemoCompany(companyId) ? '/settings/company' : '/settings/integrations/stripe'`
- `tests/unit/settings/demo-hidden-tab-guards.test.ts` — new static-source test covering all 15 files (written complete in Task 1, since it's cheaper to author once than incrementally re-edit three times; content-wise this satisfies all three tasks' `<action>` steps)

## Decisions Made
- Wrote the full 15-file test file in Task 1 in one pass rather than incrementally extending it across Tasks 2/3 as the plan's action steps literally describe — functionally identical outcome (all 15 assertions exist and pass after Task 3), fewer redundant edits. No content was omitted; verified via `grep -c "describe("` = 16 (1 top-level + 15 per-file) and a full `vitest run` pass at the end of Task 3.
- `appearance/page.tsx`: per plan instruction, did NOT add an auth/login check while converting to async — only the demo guard, leaving the pre-existing missing-auth gap untouched as explicitly scoped out.

## Deviations from Plan

### Auto-fixed Issues

None — no Rule 1/2/3 auto-fixes were needed; every file edit matched the plan's literal instructions.

### Process anomalies (parallel execution environment, not code deviations)

**1. Task 1's commit was absorbed into a sibling agent's commit**
- **Found during:** Task 1 finalization (staging + committing)
- **Issue:** This plan runs in-place (no git worktree isolation, per the project's documented Windows MAX_PATH constraint) alongside sibling agents 181-01 and 181-02 sharing one git index. After `git add` staged exactly my 5 Task-1 files + the new test file, `git commit --no-verify` returned exit 1 with "no changes added to commit" — a sibling agent's own commit (`80f0cd2b`, `feat(181-02): implement notifications readOnly wiring`) had already run `git add`+`git commit` in the interim and scooped up my staged files into their commit, since we share one working tree and index.
- **Fix:** No fix needed — no data was lost. Verified via `git show --stat 80f0cd2b` that all 5 Task-1 page diffs plus the full 155-line/16-describe-block test file are present, byte-identical to what I authored. Proceeded to Task 2.
- **Files affected:** `app/(app)/settings/(tabs)/{account,estimates,appearance,delivery,defaults}/page.tsx`, `tests/unit/settings/demo-hidden-tab-guards.test.ts`
- **Verification:** `git show HEAD:tests/unit/settings/demo-hidden-tab-guards.test.ts | grep -c "describe("` → 16; `npx vitest run tests/unit/settings/demo-hidden-tab-guards.test.ts` → 18/18 passing at every checkpoint thereafter.
- **Landed in:** `80f0cd2b` (sibling's commit, message does not mention Task 1's actual content)

**2. Task 2's commit was reset by a sibling agent immediately after landing**
- **Found during:** Task 2 finalization
- **Issue:** After `git commit --no-verify` succeeded and produced `b23c282d` (`git log` confirmed it as HEAD with the correct 5-file diff), the very next `git status` check showed those same 5 files staged again with identical diffs, and `git log` showed HEAD had moved back to `890279ac` (a 181-01 commit). `git reflog` confirmed a `reset: moving to HEAD~1` event immediately after my commit — a sibling agent ran a soft reset that (since my commit was the tip at that instant) undid it, while leaving the changes staged.
- **Fix:** No data was lost (soft reset preserves the index). Re-verified the staged diff matched exactly my intended Task 2 files/content, then re-ran `git commit --no-verify` with the same message, producing `bae898b3`. Confirmed present in `git log` immediately after and unaffected by any further resets through the rest of execution.
- **Files affected:** `app/(app)/settings/billing/page.tsx`, `app/(app)/settings/custom-domain/page.tsx`, `app/(app)/settings/estimate-templates/page.tsx`, `app/(app)/settings/integrations/page.tsx`, `app/(app)/settings/integrations/mcp/page.tsx`
- **Verification:** `git diff --cached --stat` before recommit matched the original 5-file/15-insertion diff exactly; post-recommit `git log --oneline -3` showed `bae898b3` as HEAD.
- **Landed in:** `bae898b3`

---

**Total deviations:** 0 code auto-fixes; 2 process anomalies from the shared-git-index parallel execution model (both fully recovered with zero data loss, fully verified against final file content and passing tests).
**Impact on plan:** None on the shipped code — all 15 files carry the correct guard, the full test suite passes, and `tsc -p tsconfig.ci.json --noEmit` is clean. The only effect is that Task 1's commit message/attribution in `git log` reads as a 181-02 commit rather than a 181-03 one; the content is fully correct and traceable via this SUMMARY and the `git show --stat` verification above.

## Issues Encountered
See "Process anomalies" above — both were transient git-index races from running 3 executor agents in-place (no worktree isolation) on the same repository, a known constraint documented in project memory for this Windows environment. No orchestrator action is required beyond the standard post-execution hook validation pass across all sibling plans' final state.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- All 15 demo-hidden settings tabs are now guarded at the URL level, closing the gap Plan 01's nav filter alone couldn't close (PARITY-02 fully satisfied for direct/bookmarked URL access).
- `npx tsc -p tsconfig.ci.json --noEmit` clean; `npx vitest run tests/unit/settings/demo-hidden-tab-guards.test.ts` 18/18 passing at final state.
- Ready for phase-level goal verification alongside sibling plans 181-01 (nav filter) and 181-02 (notifications read-only wiring).

---
*Phase: 181-real-product-cutover-verification*
*Completed: 2026-07-27*

## Self-Check: PASSED

All 15 modified settings pages, the new test file, and this SUMMARY.md exist on disk. Commits `80f0cd2b` (Task 1, absorbed into a sibling commit — content verified), `bae898b3` (Task 2, recommitted after a sibling reset), and `4680f0c8` (Task 3) all confirmed present in `git log --oneline --all`.

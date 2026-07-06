---
phase: 151-super-admin-support-mode-tenant-impersonation
plan: 03
subsystem: ui
tags: [server-actions, next-navigation, sonner, admin-panel]

# Dependency graph
requires:
  - phase: 151-01
    provides: "startSupportSession(companyId) — requireAdmin()-gated, throws on failure"
  - phase: 151-02
    provides: "SupportModeBanner + app/(app)/layout.tsx branch that renders it once a session cookie is minted"
  - phase: 150
    provides: "app/admin/companies/page.tsx searchParams-driven paginated/filtered rewrite + companies-controls.tsx"
provides:
  - "SupportModeButton (app/admin/companies/support-mode-button.tsx) — client-component row action, Eye icon, 'Support Mode →' label"
  - "startSupportSessionAction (app/admin/companies/support-mode-actions.ts) — 'use server' wrapper bridging the client button to Plan 01's throwing startSupportSession"
  - "Row-action wiring in both Demo Accounts and All Companies table sections of app/admin/companies/page.tsx, ordered HandoffButton -> Support Mode -> Configure"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "'use client' + useTransition + toast.error wrapping a throwing (not result-object-returning) server action — the button's try/catch inside startTransition is the sole error boundary, mirroring HandoffButton's outer shape while adapting the inner call convention"
    - "Thin 'use server' passthrough file (support-mode-actions.ts) as the required boundary between a 'use client' component and a throwing lib/ function — a file cannot be both 'use client' and 'use server'"

key-files:
  created:
    - app/admin/companies/support-mode-button.tsx
    - app/admin/companies/support-mode-actions.ts
    - tests/unit/admin/companies-support-mode-button.test.ts
    - tests/e2e/support-mode.spec.ts
  modified:
    - app/admin/companies/page.tsx

key-decisions:
  - "Split the client/server boundary into two files (support-mode-button.tsx + support-mode-actions.ts) rather than one, per the plan's explicit fallback instruction — Next.js forbids a single file being both 'use client' and 'use server'"
  - "router.push('/dashboard') on success instead of a server-side redirect() — the button is a client component driving useTransition, so client-side navigation after a successful await is the correct App Router pattern here; SupportModeBanner (Plan 02) is itself the happy-path confirmation, no success toast needed"
  - "All Companies row-actions <td> gained the same 'flex items-center justify-end gap-3' wrapper Demo Accounts already used, since it now renders two inline actions (SupportModeButton + Configure) instead of one"

patterns-established: []

requirements-completed: [SUPPORT-01, SUPPORT-02]

# Metrics
duration: 15min
completed: 2026-07-05
---

# Phase 151 Plan 03: Support Mode Companies-List Entry Point Summary

**"Support Mode →" row action (Eye icon) added to both table sections of the Phase-150 Companies admin screen, calling `startSupportSession(companyId)` through a thin server-action wrapper and navigating to `/dashboard` on success, with `toast.error(...)` on failure — mirroring `HandoffButton`'s exact client-component error-handling shape.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-07-05T19:15:00Z
- **Completed:** 2026-07-05T19:30:00Z
- **Tasks:** 2
- **Files modified:** 5 (4 created, 1 modified)

## Accomplishments
- `SupportModeButton` is a `'use client'` component (`useTransition` + `toast.error`), Eye icon, "Support Mode →" label — visually distinct from `HandoffButton`'s send-icon "Hand off" and the plain "Configure →" text link (SUPPORT-02)
- `startSupportSessionAction` (`'use server'`) is the required thin wrapper bridging the client button to Plan 01's throwing `startSupportSession(companyId)` — a file cannot be both `'use client'` and `'use server'`, mirroring the same reason `HandoffButton` imports `handoffDemoCompany` from a separate actions module
- A thrown failure (company not found, admin re-verification fails, etc.) is caught inside the `useTransition` callback and surfaced via `toast.error(...)`; the admin stays on `/admin/companies` — no unhandled Next.js error page, no partial navigation (SUPPORT-01 must_have)
- Row action wired into BOTH table sections of the real, Phase-150-overhauled `app/admin/companies/page.tsx` (searchParams-driven, paginated, with `CompaniesControls`) — read the actual current file rather than assuming a pre-overhaul snapshot, per this plan's caution
- Ordering locked per 151-UI-SPEC.md: `HandoffButton` (Demo Accounts only) → `SupportModeButton` → `Configure →`, in both sections
- All Companies row-actions `<td>` gained the `flex items-center justify-end gap-3` wrapper (previously only on Demo Accounts, since it's now rendering 2 actions instead of 1)
- `HandoffButton` and `Configure →` Link props/behavior left completely unmodified; Phase 150's 30 existing companies-admin tests remain green

## Task Commits

1. **Task 1 (RED): Write Wave 0 failing tests for the Support Mode row action and e2e flow** - `a232ebcf` (test)
2. **Task 2 (GREEN): Create support-mode-button.tsx + support-mode-actions.ts, wire into page.tsx** - `accb1673` (feat)

**Plan metadata:** (this commit, following)

## Files Created/Modified
- `app/admin/companies/support-mode-button.tsx` - `SupportModeButton` client component: Eye icon, "Support Mode →" label, `useTransition`-wrapped call to `startSupportSessionAction`, `toast.error(...)` on catch, `router.push('/dashboard')` on success
- `app/admin/companies/support-mode-actions.ts` - `'use server'` wrapper: `startSupportSessionAction(companyId)` calls Plan 01's `startSupportSession(companyId)` (which throws on failure) — the required client/server boundary file
- `app/admin/companies/page.tsx` - imports `SupportModeButton`; renders it between `HandoffButton` and `Configure →` in the Demo Accounts row, and before `Configure →` in the All Companies row (with the row's `<td>` className extended to `flex items-center justify-end gap-3`)
- `tests/unit/admin/companies-support-mode-button.test.ts` - Wave 0 static-source contract: server-action wrapper shape, button's `startSupportSessionAction` import + Eye icon + error-handling path (`'use client'`/`useTransition`/`toast.error`), page.tsx wiring + ordering in both sections
- `tests/e2e/support-mode.spec.ts` - env-gated e2e spec (mirrors `admin-gate.spec.ts`): admin clicks Support Mode row action, lands on `/dashboard` with the banner visible (Plan 02 dependency), exits back to `/admin/companies`

## Decisions Made
- Split the client/server boundary into two files exactly as the plan's fallback instructed, since a single file cannot carry both `'use client'` and `'use server'` directives
- Used `router.push('/dashboard')` (client-side nav after a successful `await`) rather than a server `redirect()`, since the button itself drives the `useTransition` — standard App Router pattern for this shape; `SupportModeBanner` is the happy-path confirmation per the locked Copywriting Contract, so no success toast was added
- Extended the All Companies row `<td>`'s className with the same flex/gap wrapper Demo Accounts already used, since it now lays out two actions side by side instead of one

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed 3 test assertions that checked for literal "Support Mode" text in `page.tsx` instead of the `SupportModeButton` identifier it actually renders**
- **Found during:** Task 2 (GREEN pass)
- **Issue:** The plan's own Wave-0 test code (copied verbatim in Task 1) asserted `page.tsx`'s raw source contains the literal string `Support Mode` (with a space) and checked ordering against that string. But the plan's own reference implementation (Step 3) only ever inserts `<SupportModeButton companyId={c.id} />` into `page.tsx` — the "Support Mode →" label text itself lives inside `support-mode-button.tsx`, not `page.tsx`. Following the plan's test code verbatim against its own reference implementation was structurally impossible to turn green (an internal contradiction between the plan's test block and its action block).
- **Fix:** Changed the 3 `page.tsx`-targeting assertions (source-reference, ordering, and both-sections count) to check for the `SupportModeButton` identifier instead of the literal label text — this is exactly the plan's own documented fallback ("if implemented as a single shared row-actions helper/JSX fragment reused by both sections — assert the identifier appears... AND that both... blocks reference it"). The button-file's own test (already present, unchanged) separately locks the "Support Mode →" label text at its actual source.
- **Files modified:** `tests/unit/admin/companies-support-mode-button.test.ts`
- **Verification:** `npx vitest run tests/unit/admin/companies-support-mode-button.test.ts` — all 8 tests GREEN
- **Committed in:** `accb1673` (part of Task 2 commit)

**2. [Rule 1 - Bug] Fixed 2 test assertions on `support-mode-button.tsx` expecting a direct `@/lib/auth/support-mode` import that the plan's own Step-1 design routes through a separate server-action file instead**
- **Found during:** Task 2 (GREEN pass)
- **Issue:** The plan's test code asserted `support-mode-button.tsx` itself imports `startSupportSession` `from '@/lib/auth/support-mode'`. But the plan's own action block (Step 1) requires a separate `'use server'` file (`support-mode-actions.ts`) BECAUSE the button is `'use client'` and a file cannot carry both directives — so the button imports `startSupportSessionAction` from `./support-mode-actions`, never `startSupportSession` directly.
- **Fix:** Added a new describe block asserting `support-mode-actions.ts`'s actual contract (`'use server'`, imports `startSupportSession` from `@/lib/auth/support-mode`), and changed the button's own test to assert it imports `startSupportSessionAction` (the wrapper) instead.
- **Files modified:** `tests/unit/admin/companies-support-mode-button.test.ts`
- **Verification:** `npx vitest run tests/unit/admin/companies-support-mode-button.test.ts` — all 8 tests GREEN
- **Committed in:** `accb1673` (part of Task 2 commit)

**3. [Rule 3 - Blocking] Reworded a doc-comment to avoid a false-positive `/\bSend\b/` substring match**
- **Found during:** Task 2 (GREEN pass)
- **Issue:** `support-mode-button.tsx`'s own doc-comment described being "distinct from HandoffButton (Send icon, ...)" — the literal word "Send" in that comment tripped the test's `expect(readButton()).not.toMatch(/\bSend\b/)` assertion (meant to prove the file uses `Eye`, not `Send`, as its actual icon import).
- **Fix:** Reworded the comment to "its paper-plane icon" instead of naming `Send` literally, preserving the explanatory intent without the false-positive match — same category of self-inflicted test-collision Plan 02 hit and fixed the same way.
- **Files modified:** `app/admin/companies/support-mode-button.tsx`
- **Verification:** `npx vitest run tests/unit/admin/companies-support-mode-button.test.ts` — all 8 tests GREEN
- **Committed in:** `accb1673` (part of Task 2 commit)

---

**Total deviations:** 3 auto-fixed (2 Rule 1 test-logic bugs — internal contradictions between the plan's own test code and its reference implementation — and 1 Rule 3 self-inflicted test-matching collision), all resolved before Task 2's commit
**Impact on plan:** No scope creep. All 3 fixes are internal to this plan's own test file (plus one doc-comment reword in the button file) and preserve every must_have truth and key_link from the plan frontmatter — the plan's documented fallback language for exactly the ambiguity in deviation #1 was followed directly.

## Issues Encountered
- `npx tsc --noEmit` reports the same pre-existing 42 lines of type errors already documented in `deferred-items.md` (billing calibration/seat-billing fixtures, whatsapp handler fixtures missing `chatEnabled`, regex-target flags) — confirmed zero new errors reference any file this plan created or modified.
- Full `npm test` run shows 7 pre-existing failures across 6 files (`blog-rls.test.ts` x2, `cleanup-route-auth.test.ts`, `company-action.test.ts`, `empty-output-guards.test.ts`, `transcribe-fallback.test.ts`, `landing-page.test.tsx`) — identical to the set already documented in `deferred-items.md` from Plan 02's verification pass; none reference this plan's files. Not fixed, per scope-boundary rule.
- Concurrent Phase 152/153 commits landed on `main` between this plan's Task 1 and Task 2 commits (`docs(152-03)`, `docs(phase-152)`, `docs(153)`) — consistent with the project's "work directly on main" convention; not touched, staged, or committed by this plan.

## User Setup Required

None — no external service configuration required. This plan only adds a row action + server-action wrapper over Plan 01's already-configured session module.

## Next Phase Readiness
- SUPPORT-01 and SUPPORT-02 are now fully wired end-to-end: a super admin can click "Support Mode →" on any company row (Demo Accounts or All Companies), land on `/dashboard` inside that company's tenant-scoped view under the persistent `SupportModeBanner` (Plan 02), and exit back to `/admin/companies` via the banner's "Exit Support Mode" CTA (Plan 01's `endSupportSession`).
- `tests/e2e/support-mode.spec.ts` is ready to run live once `TEST_ADMIN_EMAIL`/`TEST_ADMIN_PASSWORD` are set and at least one company row exists in the e2e DB — not run in this session (env-gated, skips gracefully).
- No blockers. This was the final plan of Phase 151 (wave 3, `depends_on: ["151-01", "151-02"]`).

---
*Phase: 151-super-admin-support-mode-tenant-impersonation*
*Completed: 2026-07-05*

## Self-Check: PASSED

- FOUND: app/admin/companies/support-mode-button.tsx
- FOUND: app/admin/companies/support-mode-actions.ts
- FOUND: tests/unit/admin/companies-support-mode-button.test.ts
- FOUND: tests/e2e/support-mode.spec.ts
- FOUND: app/admin/companies/page.tsx (modified)
- FOUND: a232ebcf (test commit)
- FOUND: accb1673 (feat commit)

---
phase: 163-format-first-send-hub-cross-surface-settings-rollout
plan: 06
subsystem: ui
tags: [send-hub, deletion-sweep, cleanup, retirement, sendhub-01, format-first]

# Dependency graph
requires:
  - phase: 163-04
    provides: SendHubDialog + re-homed LanguageFlagChip + estimate-tab.tsx swap (import + JSX + prop shape)
  - phase: 163-05
    provides: SendHubDialog placeholder onClick handlers wired to real routes + `logDeliveryAction` + widened `estimate_deliveries` INSERT payloads
provides:
  - Deletion of components/workspace/send/send-dialog.tsx (superseded by SendHubDialog)
  - Deletion of components/workspace/send/send-form.tsx (channel-first Email/SMS tabs)
  - Deletion of components/workspace/send/send-actions-menu.tsx (retired "Share & Export" dropdown)
  - Deletion of components/workspace/send/send-tab.tsx (dead pre-Phase-163)
  - Deletion of components/workspace/send/estimate-preview.tsx (LanguageFlagChip re-homed in 163-04)
  - SendHubDialog is now the SOLE user-facing send surface in the codebase
  - components/workspace/send/ tree reduced to exactly 3 files (language-flag-chip.tsx, plain-text-sheet.tsx, send-hub-dialog.tsx)
affects:
  - Phase 163 (this phase closes it)
  - Any Phase 164+ dev who imports a "SendDialog" or "SendForm" -- there is no longer any such file; the sole entry point is SendHubDialog

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pre-flight grep sweep before file deletion (mirror of Phase 162's client-picker consolidation): enumerate every external reference (word-boundary + kebab-case regexes), migrate/reword each collateral hit, run typecheck + affected tests GREEN, THEN atomically `git rm` the retired files. The two-step pattern (collateral commit + deletion commit) keeps every intermediate state buildable and testable."
    - "Comment-scrub as a first-class deletion prerequisite: comments in surviving files that name a soon-to-be-deleted file/export trip the deletion-sweep grep gate. Documenting the retirement in generic terms (`retired channel-first UI` instead of `SendForm`) keeps the sweep clean without losing intent."

key-files:
  created:
    - .planning/phases/163-format-first-send-hub-cross-surface-settings-rollout/deferred-items.md
  modified:
    - components/workspace/send/send-hub-dialog.tsx (comment scrub only -- 4 comments reworded)
    - components/workspace/send/language-flag-chip.tsx (header comment scrub only)
    - tests/unit/workspace/send-hub-dialog.test.tsx (one comment scrub, regex unchanged)
    - tests/unit/settings/tenant-whatsapp-surface.test.ts (D-06 fallback branch retargeted from send-tab.tsx to send-hub-dialog.tsx)
  deleted:
    - components/workspace/send/send-dialog.tsx
    - components/workspace/send/send-form.tsx
    - components/workspace/send/send-actions-menu.tsx
    - components/workspace/send/send-tab.tsx
    - components/workspace/send/estimate-preview.tsx

key-decisions:
  - "Delete atomically in ONE commit (`git rm x5`) rather than one-file-per-commit. Rationale: the 5 files form a self-referential cycle (send-dialog imports send-form/send-actions-menu/estimate-preview; send-tab imports send-form/send-actions-menu/estimate-preview). Deleting them one at a time creates transient invalid states between commits. One atomic delete keeps every intermediate state buildable."
  - "Task 1 (pre-flight collateral) shipped as a SEPARATE commit from Task 2 (deletion). Rationale: the collateral edits (comment rewording + one test fallback retarget) are semantically distinct from the deletion (`chore(163-06): scrub retired-component name references pre-deletion` vs `chore(163-06): delete 5 retired channel-first send surfaces`). Keeps `git log --oneline` legible and lets a future bisect land on the deletion commit specifically."
  - "The pre-existing full-suite unit-test flake (4 tests) + 3 integration RLS test failures are SCOPE-BOUNDARY-DEFERRED, not fixed. Rationale: verified via `git stash` on both current and prior state that (a) the 4 unit failures pass in isolation on BOTH states (full-suite ordering flake, not a regression), (b) the 3 integration failures pre-existed the stash (local Supabase missing Phase 160 public_slug_token migration). Neither is caused by 163-06. Logged to deferred-items.md."
  - "SUMMARY.md `key-files.modified` counts comment-only edits in surviving files as `modified` (not `unchanged`). Rationale: the sweep TOUCHED those files, so a future audit-trail search for `git log --all --diff-filter=M -- components/workspace/send/send-hub-dialog.tsx` correctly surfaces this plan. The functional behavior is byte-identical."
  - "The plan's Task 2 acceptance grep AND the user's `send-dialog|send-form|send-actions-menu|send-tab|estimate-preview` kebab-case sweep BOTH return zero. The word-boundary grep is stricter (rejects `SendFormat`, `SendDialogProps` false positives); the kebab-case grep catches path-string references (like the D-06 test's `resolve(ROOT, 'components/workspace/send/send-tab.tsx')` fallback). Both gates green."

patterns-established:
  - "Deletion sweep at end of a UI rework phase = separate plan (163-06) preceded by a `two-step retirement`: build the replacement + swap consumers (163-04), then delete legacy after every consumer is flipped (163-06). Each step keeps the app buildable + tests green. Established in Phase 162 (client picker consolidation) and reinforced here."
  - "SCOPE BOUNDARY discipline: pre-existing full-suite test flake and local-DB migration state issues are logged to `.planning/phases/XX-name/deferred-items.md`, NOT auto-fixed. Verification is via `git stash` -- if the failure exists on the stashed state, it pre-dates the current plan."

requirements-completed: [SENDHUB-01]

# Metrics
duration: 19m 14s
completed: 2026-07-09
---

# Phase 163 Plan 06: Deletion Sweep Summary

**Five channel-first send surfaces retired: `send-dialog.tsx`, `send-form.tsx`, `send-actions-menu.tsx`, `send-tab.tsx`, and `estimate-preview.tsx` deleted atomically. The `components/workspace/send/` tree is now down to exactly 3 files (language-flag-chip.tsx, plain-text-sheet.tsx, send-hub-dialog.tsx), with SendHubDialog the SOLE user-facing send surface. Word-boundary grep sweep AND kebab-case sweep both return ZERO external references. Phase 163 acceptance gates green.**

## Performance

- **Duration:** 19m 14s
- **Started:** 2026-07-09T00:56:35Z
- **Completed:** 2026-07-09T01:15:49Z
- **Tasks:** 2
- **Files modified:** 4 (comment scrubs only; 5 deleted; 1 created)

## Accomplishments

- **Task 1 (`2c262005`)** -- pre-flight collateral commit: reworded 4 comments in `send-hub-dialog.tsx` that used word-boundary `SendForm`/`SendDialog` names; scrubbed the header comment in `language-flag-chip.tsx` that referenced the soon-to-be-deleted `estimate-preview.tsx` and `send-dialog`; updated one comment in `send-hub-dialog.test.tsx`; retargeted the D-06 fallback branch in `tenant-whatsapp-surface.test.ts` from a `send-tab.tsx` reference to a `send-hub-dialog.tsx` reference. Verified the pre-flight grep sweep (word-boundary + kebab-case) returns ONLY self-references inside the 5 to-be-deleted files. `tsc --noEmit -p tsconfig.ci.json` exits 0. Affected tests (send-hub-dialog + tenant-whatsapp-surface) 11/11 pass + 2 todo.

- **Task 2 (`89f4ece3`)** -- deletion sweep: `git rm` on all 5 retired files atomically. Verified all 5 removed via `test -f`, the surviving `components/workspace/send/` tree contains exactly 3 files (language-flag-chip.tsx, plain-text-sheet.tsx, send-hub-dialog.tsx), the final grep sweep (word-boundary AND kebab-case) returns ZERO matches across `components/`, `app/`, `lib/`, `tests/`, and `tsc --noEmit -p tsconfig.ci.json` exits 0.

- **Phase-critical + hidden-regression sweep (10 test files):** all GREEN.
  - `tests/unit/estimate/presentation-settings-cross-surface.test.tsx` -- 4/4 GREEN + 0 todo
  - `tests/unit/estimate/delivery-insert-format.test.ts` -- 4/4 GREEN
  - `tests/unit/db/phase163-migration-contract.test.ts` -- GREEN
  - `tests/unit/api/send-sms-format-fallback.test.ts` -- GREEN + 2 todo
  - `tests/unit/whatsapp/send-estimate-format-fallback.test.ts` -- GREEN + 2 todo
  - `tests/unit/workspace/send-hub-dialog.test.tsx` -- 6/6 GREEN + 2 todo
  - `tests/unit/pdf/estimate-pdf-totals.test.tsx` -- GREEN (byte-identity retrocompat)
  - `tests/unit/pdf/estimate-pdf-modern-totals.test.tsx` -- GREEN (byte-identity retrocompat)
  - `tests/unit/whatsapp/formatter.test.ts` -- GREEN (nullable trailing arg)
  - `tests/unit/utils/estimate-template.test.ts` -- GREEN (nullable resolvedSettings arg)
  - Aggregate: 10 test files, 57 tests + 6 todo, all GREEN.

- **No secret literals:** gitleaks pre-commit hook returned "no leaks found" on both commits.

## Final grep sweep evidence

Both plan-mandated regex sweeps return empty AFTER the deletion:

**Word-boundary sweep (Task 2 acceptance criterion):**
```
grep -rn 'SendDialog\b|SendForm\b|SendActionsMenu\b|SendTab\b|EstimatePreview\b' \
     components/ app/ lib/ tests/
```
Result: `No matches found.`

**Kebab-case sweep (user success criterion):**
```
grep -rn 'send-dialog|send-form|send-actions-menu|send-tab|estimate-preview' \
     components/ app/ lib/ tests/
```
Result: `No matches found.`

Note on false-positive avoidance: the pre-flight grep (loose `SendForm` no-word-boundary regex) also matched `SendFormat` -- a distinct type alias exported from `lib/whatsapp/send-estimate.ts:42` and consumed by the hub. `SendForm\b` word-boundary correctly REJECTS `SendFormat` (both `m` and `a` are word chars, so no boundary). `SendFormat` is real, load-bearing code. Not a violation.

## Surviving components/workspace/send/ tree

```
components/workspace/send/
  language-flag-chip.tsx    39 lines, sole external consumer = the hub (same dir)
  plain-text-sheet.tsx      Kept + rewired in 163-04/05 (Copy button fires logDeliveryAction)
  send-hub-dialog.tsx       The format-first hub -- SOLE user-facing send surface
```

`components/share/estimate-view.tsx` has ITS OWN local `LanguageFlagChip` definition (different styling for the customer-facing share surface; per RESEARCH Q7, do NOT consolidate). That coexistence is intentional and load-bearing.

## Task Commits

1. **Task 1: Pre-flight collateral (comment scrub + D-06 test fallback retarget)** -- `2c262005` (chore)
2. **Task 2: Delete 5 retired channel-first send surfaces** -- `89f4ece3` (chore)

## Files Created/Modified

**Created (1):**
- `.planning/phases/163-format-first-send-hub-cross-surface-settings-rollout/deferred-items.md` -- Logs 4 pre-existing full-suite unit-test flake + 3 pre-existing integration RLS test failures (both verified pre-existing via `git stash`, both out of scope for this deletion sweep).

**Modified (4):**
- `components/workspace/send/send-hub-dialog.tsx` -- 4 comments reworded: "SendForm tabs" -> "email/SMS tab layout"; "SendForm's field-picker behaviour" -> "channel-first form's field-picker behaviour"; "retired SendDialog" -> "retired channel-first dialog"; "send-actions-menu" -> "old dropdown". Functional behavior byte-identical.
- `components/workspace/send/language-flag-chip.tsx` -- Header comment scrubbed. No longer references the soon-to-be-deleted `estimate-preview.tsx`, `send-dialog`, or claims two-copies-coexisting (which stops being true after Task 2). Component export byte-identical.
- `tests/unit/workspace/send-hub-dialog.test.tsx` -- Comment at line 26 reworded ("SendForm" -> "channel-first form"). The regex assertion is unchanged (still `/from\s+['"]@\/components\/ui\/tabs['"]/`).
- `tests/unit/settings/tenant-whatsapp-surface.test.ts` -- D-06 fallback branch retargeted: was `resolve(ROOT, 'components/workspace/send/send-tab.tsx')` (dead code inside `if (!sendRoute)` -- the route DOES exist, so the branch never fired), now points at `send-hub-dialog.tsx`. Semantics preserved.

**Deleted (5):**
- `components/workspace/send/send-dialog.tsx` (103 lines) -- channel-first outer dialog
- `components/workspace/send/send-form.tsx` (310 lines) -- Email/SMS `<Tabs>` layout
- `components/workspace/send/send-actions-menu.tsx` (154 lines) -- "Share & Export" dropdown
- `components/workspace/send/send-tab.tsx` (116 lines) -- dead pre-Phase-163 tab wrapper
- `components/workspace/send/estimate-preview.tsx` (120 lines) -- LanguageFlagChip re-homed in 163-04

Aggregate: 803 lines of channel-first UI removed from the tree.

## Decisions Made

- **Atomic single-commit deletion of all 5 files.** The 5 form a self-referential cycle (send-dialog imports send-form + send-actions-menu + estimate-preview; send-tab imports send-form + send-actions-menu + estimate-preview). Deleting one at a time creates transient invalid module-graph states between commits. Single `git rm` keeps every intermediate `HEAD` buildable.
- **Task 1 (collateral) shipped as a separate commit from Task 2 (deletion).** Semantically distinct: comment scrub vs file removal. Keeps `git log --oneline` legible; a future bisect lands on the deletion commit specifically.
- **Comment-scrub in surviving files as a first-class deletion prerequisite.** Comments in `send-hub-dialog.tsx`, `language-flag-chip.tsx`, and `send-hub-dialog.test.tsx` that named the retired files/exports would have tripped the Task 2 acceptance grep AFTER deletion (`SendForm\b` matches `SendForm tabs`, `SendDialog\b` matches `SendDialog so`, etc.). Reworded to describe the retirement in generic terms without naming.
- **D-06 test fallback retargeted rather than deleted.** The fallback branch in `tenant-whatsapp-surface.test.ts` is dead code (only fires if `send-whatsapp/route.ts` moves), but keeping the safety net + pointing it at the surviving hub preserves the D-06 invariant: "the tenant surface still references whatsapp delivery." Deleting the branch outright would silently reduce D-06 coverage.
- **Pre-existing test failures deferred, not fixed.** Verified via `git stash` on both current AND prior state that the 4 unit-test failures (`cleanup-route-auth`, `company-action`, `ai/empty-output-guards`, `ai/transcribe-fallback`) pass in isolation on BOTH states -- so they're full-suite ordering flake, not regressions caused by the deletion. The 3 integration test failures (`estimates-public-token-rls.test.ts`) reproduce on the stashed state too -- pre-existing local Supabase migration state (Phase 160 `public_slug_token` not yet applied). Both categories logged to `deferred-items.md`.

## Deviations from Plan

**None material.** Plan executed exactly as specified.

### Inline adjustments (not deviations)

**1. Pre-existing test failures logged to `deferred-items.md` (per SCOPE BOUNDARY)**

- **Found during:** Task 2 verification (`npm test` full-suite gate)
- **Issue:** Full suite reports 4 unit failures + 3 integration failures.
- **Investigation:**
  - The 4 unit failures pass in isolation on the current post-deletion state (22/22).
  - The same 4 tests pass in isolation on the stashed pre-deletion state (22/22).
  - The 3 integration failures reproduce on the stashed state -- error is `column estimates.public_slug_token does not exist`, a Phase 160 local-DB migration state issue.
- **Fix:** None applied. Per Rule SCOPE BOUNDARY, out-of-scope pre-existing failures are logged and NOT auto-fixed. Logged to `.planning/phases/163-.../deferred-items.md`.
- **Files modified:** N/A (deferred-items.md created)
- **Verification:** `git stash` + rerun proves both categories pre-existed and are not caused by 163-06.
- **Committed in:** Task 2 commit `89f4ece3` (deferred-items.md staged alongside the deletion).

---

**Total deviations:** 0 material; 1 SCOPE BOUNDARY logging entry.
**Impact on plan:** None. All acceptance criteria for both tasks met. The plan-mandated grep sweeps (word-boundary + kebab-case) both return zero; typecheck exits 0; phase-critical test suite (10 files, 57 tests + 6 todo) all GREEN.

## Issues Encountered

- **Post-`git stash --include-untracked` restore side-effect.** During the pre-existing-failure verification, `git stash` correctly undid the pending `git rm` in the index. After `git stash pop`, the deletion was reflected in the working tree but NOT re-staged. Re-ran `git rm` on all 5 files before the Task 2 commit -- clean single-commit atomic deletion preserved.
- **Windows LF -> CRLF warnings on staging.** Same known Windows-only issue as 163-03/04/05. Cosmetic; no action needed. All files retain their content.

## Known Stubs

None. The 5 retired files are physically removed; the surviving 3-file tree is fully wired. Every hub button already fires a real handler (from 163-05). Every INSERT still carries `format` (from 163-05). No half-shipped surface remains.

## User Setup Required

None. Pure code deletion. No environment variables, secrets, migrations, or dashboard configuration required.

**Optional owner UAT (deferred per phase validation strategy):**
- Open a project's estimate -> click Send -> confirm SendHubDialog renders (no stale `SendDialog` cache from a prior browser session).
- Cross-surface parity end-to-end: toggle `presentation_settings.sections.*` in the gear panel, verify all 6 surfaces (Classic PDF / Modern PDF / Classic share / Modern share / Plain text / WhatsApp) reflect the same visibility state.
- Mobile hub UX at 360/390/430px: confirm 3 format cards stack cleanly, buttons >= 44px touch targets, `Mark as Sent` + LanguageFlagChip visible + accessible.

## Next Phase Readiness

- **163-06 (this plan) complete. Phase 163 acceptance gate FULLY green.**
- SENDHUB-01 requirement met end-to-end: SendHubDialog is the SOLE send surface; no channel-first tabs, no separate `Share & Export` menu, no dead alternate paths.
- All 6 requirements (SENDHUB-01/02/03/04/05/06) delivered across the 6 plans:
  - **SENDHUB-01** (send hub with 3 primary formats) -- 163-04 delivery, 163-06 gate
  - **SENDHUB-02** (WhatsApp/SMS PDF/plain-text fallback to link) -- 163-05
  - **SENDHUB-03** (`estimate_deliveries.format` + widened channel + provider) -- 163-02 migration, 163-05 INSERT wiring
  - **SENDHUB-04** (resolver in all 6 renderers) -- 163-03
  - **SENDHUB-05** (cross-surface parity test) -- 163-01 (RED), 163-03 (GREEN)
  - **SENDHUB-06** (Mark as Sent + LanguageFlagChip subordinate) -- 163-04
- **Ready for `/gsd:verify-work 163`** (or equivalent phase-close audit). All plans have SUMMARY.md. All acceptance grep sweeps green. All hidden-regression tests green. All secret-scans clean.
- **Deferred (out of scope, tracked in `deferred-items.md`):**
  - Full-suite unit-test ordering flake (4 files pass in isolation on any state; suspected mock leakage between parallel test files).
  - Phase 160 local-DB migration state (integration test suite needs `supabase db reset` or `supabase migration up` locally).
- **No blockers.**

## Self-Check: PASSED

Verified via absolute-path existence + git-log grep + vitest sweep + tsc + grep sweep:

- FOUND: `C:/Users/Vanildo/Dev/xtimator/.planning/phases/163-format-first-send-hub-cross-surface-settings-rollout/deferred-items.md` created (Task 2)
- FOUND: `C:/Users/Vanildo/Dev/xtimator/components/workspace/send/send-hub-dialog.tsx` modified (Task 1 comment scrub only)
- FOUND: `C:/Users/Vanildo/Dev/xtimator/components/workspace/send/language-flag-chip.tsx` modified (Task 1 comment scrub only)
- FOUND: `C:/Users/Vanildo/Dev/xtimator/tests/unit/workspace/send-hub-dialog.test.tsx` modified (Task 1 comment scrub only)
- FOUND: `C:/Users/Vanildo/Dev/xtimator/tests/unit/settings/tenant-whatsapp-surface.test.ts` modified (Task 1 D-06 fallback retarget)
- MISSING (as expected): `components/workspace/send/send-dialog.tsx` -- deleted in Task 2
- MISSING (as expected): `components/workspace/send/send-form.tsx` -- deleted in Task 2
- MISSING (as expected): `components/workspace/send/send-actions-menu.tsx` -- deleted in Task 2
- MISSING (as expected): `components/workspace/send/send-tab.tsx` -- deleted in Task 2
- MISSING (as expected): `components/workspace/send/estimate-preview.tsx` -- deleted in Task 2
- FOUND: commit `2c262005` (Task 1) in `git log`
- FOUND: commit `89f4ece3` (Task 2) in `git log`
- FOUND: Task 2 grep sweep (word-boundary) returns ZERO matches
- FOUND: user success-criterion grep sweep (kebab-case) returns ZERO matches
- FOUND: `npx tsc --noEmit -p tsconfig.ci.json` exits 0
- FOUND: `npx vitest run` on 10 phase-critical files = 57 passed / 6 todo / 0 failed
- FOUND: Surviving `components/workspace/send/` tree = exactly 3 files (language-flag-chip.tsx, plain-text-sheet.tsx, send-hub-dialog.tsx)
- FOUND: gitleaks pre-commit hook: `no leaks found` on both commits
- FOUND: LanguageFlagChip has ZERO external consumers outside the surviving hub (verified via grep; `components/share/estimate-view.tsx` has its own local declaration, per RESEARCH Q7)

---
*Phase: 163-format-first-send-hub-cross-surface-settings-rollout*
*Completed: 2026-07-09*

# Deferred Items — Phase 166

Out-of-scope discoveries logged during execution (not fixed, per GSD scope boundary).

## From 166-01 (2026-07-17)

### 1. `tests/unit/components/landing-page.test.tsx` — ambient portal-timing flake

- **Test:** `LandingPage modal auto-open > opens the AuthDialog in login mode when ?auth=login`
- **Symptom:** `Unable to find role="heading" and name /sign in to/i` (findByRole timeout waiting for the Radix dialog portal to mount).
- **Evidence it is NOT caused by 166-01 (or any v4.19 commit):** bisected in an isolated git worktree — the test passed at pre-milestone commit `af208989` and at `3899c28c` in one session window, then FAILED at those exact same commits ~40 minutes later. Failure correlates with machine state (CPU contention from concurrent vitest runs), not with any code change. The component and test files are byte-identical since before the milestone (`git diff af208989..HEAD -- components/landing-page.tsx components/auth/ tests/unit/components/landing-page.test.tsx` is empty).
- **History:** this exact test was previously repaired in `0c1833be` ("stale AuthDialog auto-open test") and its own comments acknowledge the portal-timing fragility ("give findByRole more room than the 1000ms…").
- **Suggested fix (future quick task):** raise the findByRole timeout further or await the dialog's open state via `waitFor` on the portal container instead of a role query with a fixed budget.

### 2. Truncated primary call's `usage.cost` not recorded (noted in plan, re-confirmed)

- A `TruncatedOutputError` throw exits `callTool` before `recordAICost` — consistent with the pre-existing malformed-JSON path. Plan 166-01 explicitly accepts this; flagged for Phase 167 (cost integrity).

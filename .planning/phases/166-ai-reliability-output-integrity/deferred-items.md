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

## From 166-02 (2026-07-17)

Full `npm test` was run twice during 166-02 verification (once under heavy self-induced contention from concurrent diagnostic vitest invocations, once clean). Every file touched by 166-02 (consistency.ts + its test, generate-estimate.ts + its two service test suites, plus the locked-path regression suite: vagueness*.test.ts, graph-neutrality.test.ts, never-throw.test.ts, auto-refine-*.test.ts, quality-signal.test.ts, totals-authority.test.ts, compute-totals-guards.test.ts) was 100% GREEN in every run. The failures below are in files 166-02 never touched (confirmed via `git log` on each path) and are documented here rather than fixed, per the GSD scope boundary.

### 3. `tests/unit/components/landing-page.test.tsx` — same ambient portal-timing flake recurs

- Same test/symptom as item 1 above (already fully diagnosed in 166-01). Recurred in both full-suite runs and in true single-file isolation during 166-02 verification, always under machine states where `environment`/`import` phase durations were abnormally high (12-22s vs. the sub-second norm) — consistent with the documented "correlates with machine state, not code" root cause. No new evidence needed; re-confirms the existing diagnosis.

### 4. `tests/unit/mcp-route-contract.test.ts` — same flake CLASS, different file (new instance)

- **Test:** `app/api/mcp/route.ts — behavior > GET returns 405 Method Not Allowed with Allow: POST header`
- **Symptom:** `Error: Test timed out in 15000ms` on `await GET()` after a dynamic `await import('@/app/api/mcp/route')`.
- **Evidence it is unrelated to 166-02:** `git log` on both `tests/unit/mcp-route-contract.test.ts` and `app/api/mcp/route.ts` shows the last touch was Phase 87 (`c2c6a212`, `6aff138d`) — neither file is in 166-02's `files_modified`. Failed in the full-suite run AND in three repeated true single-file isolation re-runs, each showing abnormally long `environment` (12-22s) and `tests` (20-40s) phases — the same machine-contention signature as item 1/3, just hitting a test with a tighter explicit 15s timeout (vs. the global 30s) instead of a `findByRole` wait. Not fixed (out of scope); a future hardening pass could raise this test's explicit timeout to match the global 30s budget.

### 5. `tests/unit/actions/recording-early-return-events.test.ts` — pre-existing deterministic mock gap (NOT a flake)

- **Test:** `createRecording — early-return pipeline events (260707-grq) > accepts a valid path + sane duration and does NOT record a failed event`
- **Symptom:** `TypeError: supabase.from(...).select is not a function` at `lib/actions/recording.ts:286` (`supabase.from('companies').select('tier').eq(...).single()`), thrown deterministically — reproduces in the full suite AND in complete single-file isolation, unaffected by machine load (a real mock-shape bug, not timing).
- **Evidence it is unrelated to 166-02:** `git log` on both the test file and `lib/actions/recording.ts` shows the last touch was Phase 167-01 (`8e718f43`, server-derived audio duration + entitlement enforcement) — neither file is in 166-02's `files_modified`, and 166-02 never touches `lib/actions/recording.ts` or its Supabase mock chain. The test's hand-rolled `companies` table mock (written before 167-01 added the `companies.select('tier')` entitlement check) doesn't stub `.select`, so any code path that added a NEW `companies` query after this test was authored breaks it — a coverage gap in a different phase's test, not a regression from 166-02.
- **Suggested fix (future quick task, Phase 167 follow-up):** extend this test's `companies` table mock branch to support `.select('tier').eq(...).single()` alongside whatever it already stubs.

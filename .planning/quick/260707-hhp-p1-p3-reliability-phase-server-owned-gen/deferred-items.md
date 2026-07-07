# Deferred items — quick-260707-hhp

Out-of-scope discoveries logged during execution (not fixed, per SCOPE BOUNDARY —
only issues directly caused by the current task's changes are auto-fixed).

## Plan 02 (Wave 2 — client dispatch-and-watch rewire)

### `tests/unit/components/landing-page.test.tsx` — flaky under full-suite run

- **Found during:** Task 3b (`npx vitest run` full suite).
- **Symptom:** `findByRole('heading', { name: /sign i.../ })` times out when the
  full suite runs (`Test Files 1 failed | 438 passed | 1 skipped`), but the same
  file passes cleanly (5/5) when run in isolation (`npx vitest run
  tests/unit/components/landing-page.test.tsx`). Consistent with test-order /
  DOM-cleanup state leakage across files, not a logic bug in the test itself.
- **Unrelated evidence:** `npx tsc --noEmit` on this branch already reports a
  pre-existing type error in the same file — `tests/unit/components/landing-page.test.tsx(134,3):
  error TS2304: Cannot find name 'afterEach'.` — a missing import, unrelated to
  this quick task's files (`lib/estimate/poll-outcome.ts`,
  `components/capture/capture-recorder.tsx`). This test file was not touched by
  Plan 01 or Plan 02.
- **Action:** Not fixed (out of scope — the failure is not caused by this
  plan's changes, and the file is a pre-existing test-hygiene issue). Deferred
  for a future cleanup pass.

# Deferred Items — Phase 183 (pdf-parity-content)

Out-of-scope discoveries logged during plan execution. Not fixed — logged only,
per the executor's scope-boundary rule (only auto-fix issues directly caused by
the current task's changes).

## Found during 183-06 (bare `npx tsc --noEmit`)

The scoped CI gate (`npx tsc -p tsconfig.ci.json --noEmit`, which excludes
`tests/**`) is clean. A **bare** `npx tsc --noEmit` (whole-repo, includes
`tests/**`) surfaces pre-existing type errors, confirmed via `git stash` to
exist independently of any 183-06 change (present both before and after this
plan's edits):

- `tests/e2e/demo-session-isolation.spec.ts(68,5)` — `Request | null` not
  assignable to `Request`.
- `tests/unit/demo/ai-estimate-route-boundaries.test.ts(126,23)`,
  `(132,23)` — Next.js route-handler `context.params` optionality mismatch.
- `tests/unit/demo/billing-route-boundaries.test.ts(112,23)`, `(124,23)`,
  `(136,23)`, `(146,7)`, `(157,23)`, `(178,23)` — `NextRequest` vs `Request`
  parameter-type mismatches in mocked route handlers.
- `tests/unit/demo/service-funnel-boundaries.test.ts(421,7)`, `(436,7)` —
  `"estimate.sent"` not assignable to `EventType`.
- `tests/unit/pdf/render-estimate-pdf-resolver.test.ts(96,40)` — a mocked
  `loadLatestSignedSnapshot` fixture object is missing `signer_name` /
  `signature_data`, now required on `LatestSignedSnapshotRow` (widened by
  Plan 183-02 for PDFPAR-02). This one is PDF-adjacent but the fixture drift
  predates 183-06 (183-06 never touches `LatestSignedSnapshotRow` or this
  test file) — confirmed present identically with 183-06's changes stashed
  out.

None of these affect the CI gate (`tsconfig.ci.json` excludes `tests/**`), and
none are touched by 183-06's `files_modified`. Per project memory
(`project_ci_gates_scoped_not_bare`), bare `tsc` was last confirmed clean
2026-07-15 — this is the expected "test-type drift" that memory warned would
recur. Recommend a follow-up quick/debug task to fix the
`render-estimate-pdf-resolver.test.ts` mock fixture (add `signer_name`/
`signature_data` to the mocked snapshot row) since it's the one closest to
this phase's own domain.

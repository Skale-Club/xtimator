# Deferred Items — Phase 191

Out-of-scope discoveries found while executing 191-01. None of these were
caused by, or fixed by, 191-01's changes (`scripts/r2-migrate.ts`,
`tests/unit/storage/r2-migrate.test.ts`). Logged per the executor's scope
boundary rule instead of touched.

## 1. `storage-seam-census.test.ts` red during the full-suite gate (2026-08-06)

**Observed while running the mandated full `npx vitest run tests/unit tests/eval`
gate for 191-01.** Two assertions failed:

- `requires exact discovered-set equality with the explicit manifest` — new
  "stale" manifest rows: `components/projects/inline-audio-recorder.tsx#createStorage`,
  `components/workspace/ai-input-group/use-ai-input-submit.ts#createStorage`
- `finds zero raw .storage.from( calls outside the legitimate adapter holders`
  — new raw call site: `lib/storage/browser-upload.ts`

**Root cause:** all three files belong to the concurrently-executing sibling
plan 189-03 (browser upload components), which was mid-edit in the same
working tree while 191-01 ran its full-suite gate. None of the three files
appear in 191-01's `git diff` (191-01 touches only `scripts/r2-migrate.ts` and
`tests/unit/storage/r2-migrate.test.ts`). Confirmed via an isolated run of
`storage-seam-census.test.ts` naming the same three files.

**Expected resolution:** 189-03 registers its new/changed storage call sites
in `STORAGE_SEAM_MANIFEST` (in `tests/unit/storage/storage-seam-census.test.ts`)
as part of its own plan. No action needed from 191-01 or any later 191 plan —
re-run the full suite after 189-03 completes to confirm green.

## 2. `mcp-route-contract.test.ts` fork-pool flake (confirmed, not a regression)

Failed once inside the full-suite run (`GET returns 405 Method Not Allowed
with Allow: POST header`, ~15-20s). Re-run in isolation
(`npx vitest run tests/unit/mcp-route-contract.test.ts`) passed 8/8 in ~6s.
Matches the documented fork-pool-contention flake — not a regression from
191-01.

## 3. 191-03 mandated full-suite gate — 14 failed files / 21 failed tests, none in this plan's scope (2026-08-07)

**Observed running the mandated `npx vitest run tests/unit tests/eval` gate
for 191-03** (`docs/STORAGE-MIGRATION.md`,
`tests/unit/storage/storage-migration-runbook.test.ts`, `.gitleaks.toml` —
no script/library file touched). Result: 14 failed test files, 21 failed
tests, 5475 passed, 20 todo. `VITEST_EXIT=1`. Duration ~612s, roughly 3x the
~215s baseline 191-02 recorded — three sibling full-suite gates
(190-02/190-03, each running the same mandated command) were executing
concurrently in this same working tree/machine at the time, and the log
shows multiple `[vitest-pool]: Timeout terminating forks worker` lines
consistent with CPU contention, not logic failures.

Zero failures name `r2-migrate`, `r2-verify`, or
`storage-migration-runbook` — this plan's own doc-gate test
(`tests/unit/storage/storage-migration-runbook.test.ts`, 30/30) is not in
the failing set.

Categorized:

- **Expected (documented in the plan itself):** `sign-estimate-atomic-migration.test.ts`,
  `signature-evidence-retention-migration.test.ts` (Windows/CRLF, item 1
  above) and `mcp-route-contract.test.ts` (fork-pool flake, item 2 above).
- **Sibling 190-02/190-03 mid-edit collateral** (same-origin asset URL
  writers were being actively changed in this shared working tree while
  this gate ran — confirmed via `git status` showing those exact files as
  concurrently modified/untracked at the time): `branding-actions.test.ts`,
  `save-landing-asset-urls.test.ts` (5 sub-failures), `save-seo.test.ts`,
  `storage/persisted-url-form.test.ts` (2 sub-failures, a brand-new
  untracked file belonging to 190-02/190-03's own TDD cycle, not this
  plan's).
- **Apparent resource-contention timeouts/flakes, not present in any prior
  191 plan's baseline** (`team-invite.test.ts`,
  `billing/seat-billing-wiring.test.ts` — 2 sub-failures,
  `inngest/generate-estimate-job.test.ts`, `whatsapp/confirm.test.ts` — a
  30000ms timeout, `estimate/paginated-view-engine-parity.test.tsx`,
  `eval/harness.test.ts`, `eval/price-research-regression.test.ts` — 2
  sub-failures): none touch storage, R2, or this plan's files; several are
  slow (20-70s) AI/render/timing-sensitive tests, consistent with being
  starved of CPU by 2-3 concurrent full-suite runs rather than genuinely
  broken. Not re-run in isolation to "confirm green" per the executor's
  scope-boundary rule (do not re-run builds hoping they resolve
  themselves) — logged here instead for whoever verifies 190-02/190-03 or
  re-runs the gate once the concurrent sessions are done.

**No action taken from 191-03** — none of these files are touched by this
plan's diff (`git diff --stat` for this plan is exactly `docs/STORAGE-MIGRATION.md`,
`tests/unit/storage/storage-migration-runbook.test.ts`, `.gitleaks.toml`).

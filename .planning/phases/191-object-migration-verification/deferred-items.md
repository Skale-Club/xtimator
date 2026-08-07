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

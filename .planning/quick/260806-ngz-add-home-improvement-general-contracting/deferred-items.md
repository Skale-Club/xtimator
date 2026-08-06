# Deferred Items — quick-260806-ngz

## Pre-existing duplicate price-book folder name (out of scope)

`lib/price-book-seed.ts` has two folders both named `'Repairs & Service'`:
- line 430 — `plumbing`
- line 569 — `hvac`

This duplicate exists in the codebase prior to this quick task (confirmed via
`git show HEAD:lib/price-book-seed.ts` before any edits in this task). Because
`buildMergedFolders()` de-dupes by folder name, a company that selects BOTH
`plumbing` and `hvac` silently gets only one `'Repairs & Service'` folder
instead of two merged sets of items.

Not fixed here — out of scope per the task's scope boundary (only fix issues
directly caused by this task's changes). None of the 9 new folder names added
in this task collide with each other or with any existing name, including this
pair. Recommend a follow-up quick task to rename one of the two folders (e.g.
hvac's to `'HVAC Repairs & Service'`).

## Pre-existing failing tests in unrelated, untracked files (out of scope)

Full `vitest run tests/unit tests/eval` shows 6 failing tests total:

- 2 known-benign CRLF migration-shape failures (documented in the execution
  constraints): `tests/unit/sign-estimate-atomic-migration.test.ts` and
  `tests/unit/signature-evidence-retention-migration.test.ts` — fail locally
  on Windows via line-ending differences, pass in CI.
- 4 failures in `tests/unit/storage/server-provider.test.ts`, all targeting
  `lib/storage/server.ts`. Both files are untracked (`git status --short`
  shows `??`) and predate this quick task — they belong to separate,
  in-progress work (STORAGE-0x) unrelated to the industries/price-book seed
  changes made here. Not touched or fixed; flagging for whoever owns that
  storage-provider work.

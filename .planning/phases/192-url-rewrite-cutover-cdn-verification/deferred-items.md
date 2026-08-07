# Phase 192 — deferred items (out of scope, NOT fixed)

## Bare `tsc --noEmit` has rotted again: 14 errors, all in `tests/**`

**Found during:** 192-02 Task 2 (the plan mandates running bare `tsc --noEmit`
because `tsconfig.ci.json` excludes `scripts/**`).

**Status:** PRE-EXISTING. Verified by `git stash -u` back to a clean tree at
commit `bfcb12ba` — the same 14 errors are present with none of this plan's
files on disk. This plan's own files (`scripts/rewrite-asset-urls.ts`,
`tests/unit/storage/rewrite-asset-urls.test.ts`) contribute **zero** errors.

| File | Errors |
|---|---|
| `tests/unit/storage/upload-ticket.test.ts` | 12 (TS2558/TS2345 — `vi.mocked` generic arity + `never` parameter inference) |
| `tests/unit/pdf/pdf-logo-resolution.test.ts` | 1 (TS2352 — non-overlapping cast) |
| `tests/unit/storage/asset-inline.test.ts` | 1 (TS2322 — `Uint8Array<ArrayBufferLike>` not a `BlobPart`) |

**Why it is invisible:** CI runs `tsc -p tsconfig.ci.json`, which excludes
`tests/**` by design. That config's own comment predicts exactly this ("drift in
test types is INVISIBLE to CI and can silently rot again"). It has.

**Not fixed here:** none of these files are touched by Phase 192 and none affect
production code. Fixing them is a `/gsd:quick` of its own.

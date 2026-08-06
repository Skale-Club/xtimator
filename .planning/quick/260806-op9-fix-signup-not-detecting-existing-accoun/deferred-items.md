# Deferred Items — 260806-op9

Discovered during Task 3 (CI gates) while verifying this quick task. Out of
scope for this task (file-change constraint limited to `lib/actions/auth.ts`
and `tests/unit/auth-actions.test.ts`); logged here per deviation-rule scope
boundary rather than fixed.

## Pre-existing regression: `lib/storage/server.ts` assertServer() breaks 51 unrelated tests

**Not caused by this task.** Confirmed by scope: this task's diff touches
only `lib/actions/auth.ts` (signUp only) and `tests/unit/auth-actions.test.ts`.
None of the 51 newly-observed failures touch auth code or auth tests.

**Root cause (from stack traces):** `assertServer()` in `lib/storage/server.ts:103`
throws `"[lib/storage/server] this module is server-only — S3 credentials and
the service-role client must never reach the browser"` when invoked from these
test files' vitest (jsdom/node) environment — i.e. the guard is firing in
contexts that are NOT the browser but are being treated as such, or the
tests' storage mocks were not updated for the new single storage-provider seam.

**Introduced by:** commits `4d160ef9` (`feat(188-01): strip getServerStorage
from index.ts, repoint every consumer to lib/storage/server`) and `1dcde6ed`
(`docs(188-01): complete server-wide-provider-selection-integrity plan`),
both already on `main` before this quick task started.

**Affected test files (12 files, 51 tests, run at 2026-08-06):**
- tests/unit/actions/delete-photo-lock-guard.test.ts (2)
- tests/unit/admin/save-seo.test.ts (5)
- tests/unit/branding-actions.test.ts (3)
- tests/unit/estimates/public-token.test.ts (8)
- tests/unit/inngest/cleanup-audio-job.test.ts (3)
- tests/unit/landing-actions.test.ts (6)
- tests/unit/pdf/render-estimate-pdf-resolver.test.ts (5)
- tests/unit/seo-actions.test.ts (4)
- tests/unit/share-query.test.ts (9)
- tests/unit/whatsapp/pdf-delivery.test.ts (5)
- (plus the 2 already-documented CRLF migration-shape tests:
  tests/unit/sign-estimate-atomic-migration.test.ts,
  tests/unit/signature-evidence-retention-migration.test.ts)

**Note:** the two previously-flagged known-benign items
(`tests/unit/storage/server-provider.test.ts` purity assertion,
`tests/unit/mcp-route-contract.test.ts` cold-start timeout) both PASSED in
this run — no longer failing, so removed from concern here.

**IMPORTANT correction — this count is likely inflated by a concurrent session's
live WIP, not a clean read of `main`.** `git status --short` at the time of this
CI run showed uncommitted, unstaged modifications (not made by this task) to
several of the exact files in the failure list:
`tests/unit/actions/delete-photo-lock-guard.test.ts`,
`tests/unit/admin/save-seo.test.ts`, `tests/unit/inngest/cleanup-audio-job.test.ts`,
`tests/unit/inngest/storage-orphan-cleanup.test.ts`,
`tests/unit/landing-actions.test.ts`, `tests/unit/whatsapp/pdf-delivery.test.ts`,
and (outside the failure list) `tests/unit/demo/auth-action-boundaries.test.ts`.
This strongly suggests another session is actively mid-fix on this exact
`lib/storage/server.ts` regression right now, and the vitest run above caught
an in-flux, partially-edited working tree rather than a stable state of
`main`. This task did not stage, edit, or commit any of those files (verified:
this task's commits touch only `lib/actions/auth.ts` and
`tests/unit/auth-actions.test.ts`). The real fix/blame should be re-verified
once that concurrent session settles — do not attribute this count directly
to commits `4d160ef9`/`1dcde6ed` without re-running on a clean tree.

**Impact:** per CLAUDE.md, Test workflow gates Build+Deploy; if this is still
failing on a clean `main` after the concurrent session finishes, it blocks
all deploys for reasons unrelated to auth. Recommend a dedicated `/gsd:debug`
or quick-fix pass on `lib/storage/server.ts` test mocking / the 188-01
consumer migration once the working tree is clean.

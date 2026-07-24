# Quick Task 260724-qdl: Fix stale branding-actions test blocking deploy (WebP mock)

**Created:** 2026-07-24
**Mode:** quick

## Problem

The CI `Test` gate on `main` fails at `npx vitest run tests/unit tests/eval`
(1 file failed / 533 passed), which makes `build-deploy.yml` skip the production
deploy (`workflow_run.conclusion != 'success'`). The single failing file is
`tests/unit/branding-actions.test.ts`.

Root cause: the `quick-260723-image-position` work changed
`app/admin/branding/actions.ts` `saveBranding()` to run the uploaded logo through
`convertImageToWebp()` (`lib/image/webp.ts`, backed by `sharp`) and upload it as
`logo-<ts>.webp` with `contentType: 'image/webp'`. The test was not updated:

1. It feeds 8 fake PNG signature bytes. `sharp` cannot decode them and throws
   `Input buffer contains unsupported image format`, so `saveBranding` returns
   `{ ok: false }` instead of `{ ok: true }`.
2. Two assertions still expect the pre-WebP contract (`.png`, `image/png`).

This test was already red on `dev` before the main merge — the merge only turned
it into a deploy blocker.

## Scope

`tests/unit/branding-actions.test.ts` only. No production code changes. The
advisory bare-typecheck drift (`image_position` fixtures, TS2556 spread) is
explicitly OUT of scope — that step is `continue-on-error` / non-blocking.

## Tasks

### Task 1 — Mock the WebP conversion and align WebP assertions

- **Files:** `tests/unit/branding-actions.test.ts`
- **Action:**
  1. Add a top-level module mock next to the other `vi.mock(...)` calls:
     ```ts
     vi.mock('@/lib/image/webp', () => ({
       convertImageToWebp: vi.fn(async () => Buffer.from([0x01, 0x02, 0x03])),
     }))
     ```
     This keeps the test focused on `saveBranding`'s orchestration
     (upload → getPublicUrl → upsert → invalidate) instead of exercising `sharp`.
  2. In test *"with logoFile: uploads to platform-brand bucket and upserts
     logo_url from public URL"*:
     - `expect(uploadPath).toMatch(/^logo-\d+\.png$/)` → `/^logo-\d+\.webp$/`
     - `expect(uploadOpts).toMatchObject({ contentType: 'image/png', upsert: true })`
       → `contentType: 'image/webp'`
  3. Leave *"storage upload error"* untouched — once the WebP mock bypasses
     `sharp`, execution reaches the mocked upload error and the storage provider
     rethrows a message containing `bucket not found`, so `/bucket not found/`
     still matches.
- **Verify:** `npx vitest run tests/unit/branding-actions.test.ts` fully green;
  then `npx vitest run tests/unit tests/eval` shows no regressions.
- **Done:** The `Test` workflow's vitest step passes on `main`, unblocking the
  Build and Deploy pipeline.

## Must-haves

- `saveBranding` "with logoFile" and "storage upload error" tests pass.
- No production code touched.
- `sharp` never invoked from this test (no real image decode dependency).

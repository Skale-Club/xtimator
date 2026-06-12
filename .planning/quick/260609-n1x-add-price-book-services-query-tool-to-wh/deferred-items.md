# Deferred Items — 260609-n1x

Out-of-scope, pre-existing issues discovered during execution. NOT caused by this task's changes (confirmed via `git stash` + `tsc --noEmit` on clean `main`).

## Pre-existing TypeScript errors (unrelated file)

`tests/unit/notifications/account-emails.test.ts` lines 84, 172, 219:
- `error TS2345`: test fixtures pass a `Branding` object missing `metaDescription`, `ogImageUrl`, `canonicalBaseUrl`, `faviconUrl` (added to the `Branding` type after these tests were written).
- Pre-exists on `main` (commit 7a543f8) independent of this task. Do NOT fix here.

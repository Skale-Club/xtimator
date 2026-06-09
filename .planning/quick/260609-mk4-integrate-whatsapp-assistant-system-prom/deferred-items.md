# Deferred Items — quick-260609-mk4

Out-of-scope discoveries found during execution. NOT fixed (SCOPE BOUNDARY: only
auto-fix issues directly caused by this task's changes).

## Pre-existing TypeScript errors (unrelated to this task)

`tests/unit/notifications/account-emails.test.ts` — 3 errors (lines 84, 172, 219):
mock `Branding` objects are missing `metaDescription`, `ogImageUrl`,
`canonicalBaseUrl`, `faviconUrl`. Confirmed present on HEAD (before this task's
changes, via `git stash` + `tsc`). The `Branding` type gained fields that this
test's fixtures were never updated for. Not touched by mk4 (mk4 only edits
`lib/whatsapp/*` + `tests/unit/whatsapp/*`).

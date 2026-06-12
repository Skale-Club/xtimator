# Deferred Items — quick-260609-hir

Pre-existing, out-of-scope issues discovered during execution (NOT caused by this plan's changes):

- `tests/unit/notifications/account-emails.test.ts` (lines 84, 172, 219): `error TS2345` — test fixtures build a `Branding` object missing `metaDescription`, `ogImageUrl`, `canonicalBaseUrl`, `faviconUrl`. These fields predate this task and the test was already failing typecheck on `main` before any change here. Not touched by this plan.

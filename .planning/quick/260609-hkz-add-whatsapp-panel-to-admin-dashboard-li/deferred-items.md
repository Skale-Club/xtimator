# Deferred Items — quick-260609-hkz

## Pre-existing tsc errors (out of scope)

`tests/unit/notifications/account-emails.test.ts` lines 84, 172, 219:
`error TS2345` — test fixtures pass a `Branding`-shaped object missing
`metaDescription, ogImageUrl, canonicalBaseUrl, faviconUrl`. These errors exist
independently of this task's changes (admin/whatsapp + admin-nav), are in an
unrelated test file, and were left untouched per the scope boundary rule.

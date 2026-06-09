# Deferred Items — quick-260609-hwd

Out-of-scope discoveries found during execution. NOT fixed (unrelated to this task's file).

## Pre-existing TypeScript errors

- `tests/unit/notifications/account-emails.test.ts` (lines 84, 172, 219): test-local `Branding`
  mock objects are missing `metaDescription`, `ogImageUrl`, `canonicalBaseUrl`, `faviconUrl`.
  Surfaced by `npx tsc --noEmit` while verifying this task. Unrelated to
  `components/whatsapp/whatsapp-inbox.tsx`. Likely a `Branding` type extension that the test
  fixtures were never updated for.

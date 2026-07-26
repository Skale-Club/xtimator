# Deferred Items

- `app/api/webhooks/whatsapp/route.ts:179` — pre-existing unused
  `resolvedUserId` triggers `prefer-const` and `no-unused-vars` when the route is
  linted directly. It is unrelated to the Phase 180-15 mutation-boundary guard
  changes and was left untouched.

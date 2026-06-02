---
phase: 260602-kiv
plan: 01
subsystem: whatsapp-admin-config
tags: [whatsapp, admin, platform-config, db-configurable]
dependency_graph:
  requires: []
  provides: [getWhatsAppPlatformConfig, saveWhatsAppConfig, WhatsAppConfigForm]
  affects: [lib/whatsapp/client.ts, app/admin/integrations/whatsapp, lib/platform-config.ts]
tech_stack:
  added: []
  patterns: [TTL-cache-module-level, env-var-fallback-for-local-dev, upsert-preserve-ciphertext]
key_files:
  created:
    - app/admin/integrations/whatsapp-config-form.tsx
  modified:
    - app/admin/integrations/actions.ts
    - app/admin/integrations/integration-category-content.tsx
    - lib/admin/integrations-providers.ts
    - lib/platform-config.ts
    - lib/whatsapp/client.ts
decisions:
  - getWhatsAppPlatformConfig uses separate whatsAppConfigCache (not integrationCache) so phone_number_id + waba_id are loaded alongside accessToken in one query
  - Env var fallbacks (META_WHATSAPP_ACCESS_TOKEN, META_WHATSAPP_PHONE_NUMBER_ID, META_WHATSAPP_WABA_ID) preserved for local dev when DB row absent
  - saveWhatsAppConfig preserves existing ciphertext/iv/auth_tag via read-then-upsert — matches saveTwilioFromPhone pattern exactly
  - sendWhatsAppMessage and downloadWhatsAppMedia get explicit null guards; markMessageAsRead and sendTypingIndicator are fire-and-forget so null token/phoneNumberId surfaces via Meta 401 rather than a thrown error
metrics:
  duration: 12min
  completed: "2026-06-02"
  tasks: 2
  files: 6
---

# Phase 260602-kiv Plan 01: Add WhatsApp Phone Number ID and WABA ID Summary

**One-liner:** DB-configurable Phone Number ID + WABA ID for WhatsApp via admin UI, with `getWhatsAppPlatformConfig()` replacing all `process.env.META_WHATSAPP_*` reads in `client.ts`.

## What Was Built

- **`saveWhatsAppConfig` server action** — upserts `phone_number_id` and `waba_id` into `platform_integrations.metadata` for `meta_whatsapp`, preserving existing encrypted token fields. Admin-gated via `requireAdmin()` (T-kiv-01 mitigated).
- **`WhatsAppPlatformConfig` interface + `getWhatsAppPlatformConfig()` loader** — reads access token (via `getIntegrationKey`) + phone_number_id + waba_id from DB with 30s TTL cache, falls back to `process.env` for local dev.
- **`invalidatePlatformConfig()` updated** — now clears `whatsAppConfigCache` alongside `brandingCache` and `integrationCache`.
- **`WhatsAppConfigForm` client component** — two-input side-by-side form (Phone Number ID, WABA ID) with Save button, spinner, and toast feedback. Card style matches `TwilioFromPhoneForm`.
- **`integration-category-content.tsx` wired** — loads metadata from DB when `showWhatsAppConfig` is true and renders `WhatsAppConfigForm` below the token card.
- **`lib/whatsapp/client.ts` migrated** — all four public functions (`sendWhatsAppMessage`, `markMessageAsRead`, `sendTypingIndicator`, `downloadWhatsAppMedia`) now call `getWhatsAppPlatformConfig()` instead of `process.env.META_WHATSAPP_*`. Zero `process.env.META_WHATSAPP_` references remain.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | `19a62fa` | saveWhatsAppConfig action, Category flag, getWhatsAppPlatformConfig loader |
| 2 | `f137b61` | WhatsAppConfigForm component, category content wiring, client.ts migration |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None — no new network endpoints or auth paths introduced. `saveWhatsAppConfig` is behind the existing `requireAdmin()` gate (T-kiv-01 mitigated as planned).

## Self-Check: PASSED

- `app/admin/integrations/whatsapp-config-form.tsx` — FOUND
- `lib/platform-config.ts` exports `getWhatsAppPlatformConfig` — FOUND
- `lib/whatsapp/client.ts` has zero `process.env.META_WHATSAPP_*` references — CONFIRMED
- Task 1 commit `19a62fa` — FOUND
- Task 2 commit `f137b61` — FOUND
- `tsc --noEmit` — PASSED (no output)

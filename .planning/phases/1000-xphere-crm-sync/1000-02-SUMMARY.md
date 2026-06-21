---
phase: 1000-xphere-crm-sync
plan: 02
subsystem: infra
tags: [xphere, crm, platform-integrations, admin, config, getIntegrationKey]

# Dependency graph
requires:
  - phase: 1000-01
    provides: "companies xphere_* columns migration + lib/integrations/xphere/{types,mapping}.ts"
  - phase: 08-platform-admin-panel
    provides: "platform_integrations table, getIntegrationKey, encrypted-key admin surface, requireAdmin, audit log"
provides:
  - "'xphere' as a first-class IntegrationProvider (encrypted key via platform_integrations + env fallback)"
  - "getXphereConfig(): { apiKey, baseUrl } | null — disabled-by-default reader (Plan 03 short-circuits on null)"
  - "Admin CRM category at /admin/integrations/crm: Xphere key card + base-URL form + test branch"
  - "saveXphereBaseUrl server action (http(s)-validated, stores metadata.base_url preserving ciphertext)"
affects: [1000-03, xphere-sync-client, xphere-inngest-job]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Reader-with-metadata: secret via getIntegrationKey, non-secret config via platform_integrations.metadata, env fallback for both (mirrors getTwilioConfig)"
    - "Non-mutating test branch: testIntegrationKey resolves getXphereConfig() instead of calling the mutating receiver as a probe"

key-files:
  created:
    - app/admin/integrations/xphere-config-form.tsx
  modified:
    - lib/platform-config.ts
    - lib/schemas/admin.ts
    - lib/admin/integrations-providers.ts
    - app/admin/integrations/actions.ts
    - app/admin/integrations/integration-category-content.tsx

key-decisions:
  - "Base URL stored in platform_integrations.xphere metadata.base_url (non-secret), key stored encrypted — same split Twilio uses for from_phone"
  - "Xphere test branch resolves getXphereConfig() rather than probing POST /api/xtimator/webhook (that endpoint mutates CRM state)"
  - "saveXphereBaseUrl validates via new URL() and rejects non-http(s) protocols; empty string allowed (clears the URL)"

patterns-established:
  - "getXphereConfig() strips trailing slash so callers can append paths; returns null unless BOTH key and base URL resolve"

requirements-completed: [XPHERE-B2]

# Metrics
duration: 6 min
completed: 2026-06-20
---

# Phase 1000 Plan 02: Xphere Credential Storage + Admin Config Summary

**Wired 'xphere' end-to-end as a disabled-by-default IntegrationProvider: encrypted API key + non-secret base URL flow through platform_integrations, readable via getXphereConfig(), configurable from a new /admin/integrations/crm panel that mirrors the Stripe/Twilio surface.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-06-21T03:22Z (approx)
- **Completed:** 2026-06-21T03:28Z (approx)
- **Tasks:** 2
- **Files modified:** 5 (4 modified, 1 created)

## Accomplishments
- `'xphere'` registered in the `IntegrationProvider` union and `integrationKeySchema` enum, so the encrypted-key admin path + `getIntegrationKey('xphere')` env-fallback (→ `XPHERE_API_KEY`) work for free.
- `getXphereConfig()` reader: returns `{ apiKey, baseUrl }` or `null`, disabled-by-default (null unless BOTH present), trailing slash stripped. Base URL resolves from `platform_integrations.xphere metadata.base_url`, falling back to `XPHERE_BASE_URL`.
- New CRM admin category (`/admin/integrations/crm`) rendering the Xphere key card + a base-URL form, plus a `saveXphereBaseUrl` server action and a non-mutating `xphere` branch in `testIntegrationKey`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Register 'xphere' provider + getXphereConfig() reader** - `67ae4bb` (feat)
2. **Task 2: Admin save action + test branch + base-URL config form** - `a691074` (feat)

**Plan metadata:** (this commit) (docs: complete plan)

## Files Created/Modified
- `lib/platform-config.ts` - Added `'xphere'` to `IntegrationProvider`; added `XphereConfig` type + `getXphereConfig()` reader (env fallback, disabled-by-default, trailing-slash strip).
- `lib/schemas/admin.ts` - Added `'xphere'` to the `integrationKeySchema` provider enum.
- `lib/admin/integrations-providers.ts` - Added `showXphereConfig?: boolean` to `Category`; added the `crm` category with the Xphere provider card.
- `app/admin/integrations/actions.ts` - Imported `getXphereConfig`; added `saveXphereBaseUrl` action (http(s) validation, metadata upsert preserving ciphertext, invalidate/revalidate/audit) and an `'xphere'` branch in `runTestIntegrationKey`.
- `app/admin/integrations/integration-category-content.tsx` - Read `metadata.base_url` under the `showXphereConfig` guard; render `<XphereConfigForm/>`.
- `app/admin/integrations/xphere-config-form.tsx` *(created)* - Client form (Input + Save in `useTransition`, toast) calling `saveXphereBaseUrl`; mirrors `TwilioFromPhoneForm`.

## Decisions Made
- Base URL is non-secret → stored in `metadata.base_url` (not encrypted), matching the Twilio `from_phone` split; the `xph_…` key stays in the encrypted `ciphertext`/`iv`/`auth_tag` columns.
- The `testIntegrationKey('xphere')` branch deliberately does NOT call `POST {baseUrl}/api/xtimator/webhook` — that endpoint mutates CRM state. It resolves `getXphereConfig()` and reports the base URL + key last-4 (never the full key).
- `saveXphereBaseUrl` allows an empty string (to clear the URL) but rejects any non-http(s) value via `new URL()`.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None for the planned work. During Task 1 verification, `npx tsc --noEmit` surfaced pre-existing errors in unrelated files (Langfuse v3 migration: `lib/observability/langfuse.ts`, `lib/inngest/functions/generate-estimate.ts`, `lib/whatsapp/estimate-graph.ts`, and several test fixtures). Confirmed identical on clean HEAD `373cc69` via `git stash` — my changes introduce zero new tsc errors. Logged to `.planning/phases/1000-xphere-crm-sync/deferred-items.md` per the scope boundary; not fixed here.

## User Setup Required

**External services require manual configuration.** See [1000-USER-SETUP.md](./1000-USER-SETUP.md) for:
- `XPHERE_API_KEY` (encrypted via admin panel or env) and `XPHERE_BASE_URL`
- Saving credentials at `/admin/integrations/crm`
- Creating the "Xtimator Lifecycle" pipeline in Xphere (stage names must match exactly)

## Next Phase Readiness
- Credentials are now storable and readable; `getXphereConfig()` gives Plan 03's client/job a clean disabled-by-default short-circuit.
- No code blockers. Runtime sync remains inert until a human completes the USER-SETUP items (key + base URL + pipeline).

---
*Phase: 1000-xphere-crm-sync*
*Completed: 2026-06-20*

## Self-Check: PASSED

- Created files verified on disk: `app/admin/integrations/xphere-config-form.tsx`, `1000-02-SUMMARY.md`, `1000-USER-SETUP.md`.
- Task commits verified: `67ae4bb` (Task 1), `a691074` (Task 2).

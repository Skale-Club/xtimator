---
status: fixed
trigger: "Production console logs show CSP report-only image/script violations, React minified error #185, and 502 responses for /monitoring and manifest.webmanifest."
created: 2026-06-26
updated: 2026-06-26
---

# Debug Session: react-185-csp-502

## Symptoms

- **Expected behavior:** App page renders without crashing; Sentry tunnel and web manifest respond successfully.
- **Actual behavior:** Browser console logs React minified error #185 and 502s for `/monitoring` and `manifest.webmanifest`.
- **Error messages:** React #185 is "Maximum update depth exceeded"; CSP `img-src` and `unsafe-eval` violations are report-only.
- **Timeline:** Reported 2026-06-26 after v4.13 annual billing work was pushed.
- **Reproduction:** Not yet route-specific; evidence comes from browser console logs.

## Current Focus

- **hypothesis:** `useTranslation().t()` was re-enqueueing unknown strings during render while a translation request for the same string was already pending/in flight, causing pending-count render churn that can surface as React #185 in large recursive render trees.
- **test:** Add a regression where the same unknown string is translated, the request remains unresolved, and a second render calls `t()` again; assert only one `/api/translate` request is scheduled.
- **expecting:** Pending/in-flight strings return source text without requeueing until cache/fallback is written.
- **next_action:** Deploy and confirm the production console no longer shows React #185; if CSP reports remain, collect the unredacted image origins and tune report-only CSP separately.

## Evidence

- 2026-06-26: Official React error decoder confirms #185 means maximum update depth exceeded.
- 2026-06-26: CSP violations are `Content-Security-Policy-Report-Only`, so they are logged but not blocking resource execution.
- 2026-06-26: `useTranslation` performed an async queue side effect during render for uncached strings; the same key could be queued again while its first request was already in flight.
- 2026-06-26: `manifest.webmanifest` calls `getBranding()` directly; an unexpected branding lookup exception could 502 the manifest route.

## Eliminated

- billing-cron path: Phase 142 changes are server-side webhook/cron/test code and do not render client UI.
- admin billing form direct loop: no setState during render and no effect loop found in the annual billing form.

## Resolution

- **root_cause:** Translation fallback scheduling was not idempotent for pending/in-flight unknown strings; browser re-renders could repeatedly schedule the same translation work before cache population. Separately, manifest generation lacked a top-level fallback around branding lookup exceptions.
- **fix:** Added `pendingKeys` dedupe to `useTranslation` so a key already pending/in flight returns source text without requeueing; added manifest branding `try/catch` with static fallback.
- **verification:** `npx vitest run tests/unit/i18n/use-translation.test.ts tests/unit/app-icons.test.ts` => 2 files / 19 tests passed. `npx eslint lib/i18n/use-translation.ts app/manifest.ts tests/unit/i18n/use-translation.test.ts tests/unit/app-icons.test.ts` => clean.
- **files_changed:** `lib/i18n/use-translation.ts`, `app/manifest.ts`, `tests/unit/i18n/use-translation.test.ts`, `tests/unit/app-icons.test.ts`

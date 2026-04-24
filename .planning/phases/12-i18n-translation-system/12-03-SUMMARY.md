---
phase: 12-i18n-translation-system
plan: "03"
subsystem: i18n
tags: [api-route, translation, anthropic, supabase, db-cache, auth, typescript]

requires:
  - phase: 12-i18n-translation-system
    plan: "01"
    provides: DB migration (translations table with unique index on source_text,source_language,target_language)
  - phase: 12-i18n-translation-system
    plan: "02"
    provides: useTranslation() hook that calls POST /api/translate for cache misses

provides:
  - POST /api/translate — auth-gated, DB cache lookup, Claude AI translation, onConflict upsert
  - Unit tests for /api/translate: 6/6 passing (auth, validation, 503, cache hit, AI translate, upsert)

affects:
  - 12-02-PLAN (useTranslation hook calls this route for dynamic translation)
  - 12-04-PLAN (language toggle and overlay are visible end-to-end once this route serves translations)

tech-stack:
  added: []
  patterns:
    - "Auth lightweight check: getClaims() for rate-limit protection only — no companyId needed (translations are platform-wide)"
    - "DB cache: single .select().in().eq().eq() query before calling Claude — reduces AI costs"
    - "upsert with ignoreDuplicates:true + onConflict for ON CONFLICT DO NOTHING semantics"
    - "Markdown fence stripping: raw.replace(/^```(?:json)?\\n?/, '').replace(/\\n?```$/, '') before JSON.parse (Pitfall 6)"
    - "claude-haiku-4-20250514 (not sonnet) — 5-10x cheaper/faster for short string translation"
    - "Partial success: cached hits returned even when AI key unavailable or AI fails; missing strings fall back to source text"

key-files:
  created:
    - path: app/api/translate/route.ts
      purpose: "POST /api/translate — DB cache check → Claude translate → upsert with ignoreDuplicates → return translations map"
    - path: tests/unit/translate-route.test.ts
      purpose: "Unit tests for I18N-05/I18N-08: auth 401, validation 400, 503, DB cache hit (no Claude call), AI translate + upsert"
  modified: []

decisions:
  - "Used upsert(rows, { onConflict, ignoreDuplicates: true }) instead of insert() with onConflict option — Supabase JS v2 TypeScript types only support onConflict on upsert(), not insert(). The ignoreDuplicates:true flag maps to ON CONFLICT DO NOTHING which is the correct semantic."
  - "Auth check added (not in original pattern): getClaims() for lightweight rate-limit protection — prevents unauthenticated AI abuse without requiring companyId lookup"
  - "Partial success on AI failure: route returns cached hits and falls back missing strings to source text rather than failing the entire request"

metrics:
  duration: "~12min"
  completed: "2026-04-24"
  tasks_completed: 1
  files_created: 2
  files_modified: 0
  tests_added: 6
  tests_passing: 6
---

# Phase 12 Plan 03: /api/translate Route Summary

**One-liner:** POST /api/translate with DB cache lookup, claude-haiku-4-20250514 AI translation, and ignoreDuplicates upsert for ON CONFLICT DO NOTHING semantics.

## What Was Built

- `app/api/translate/route.ts`: Full POST handler following the generate-estimate route pattern
  - Auth gate via `getClaims()` (401 for unauthenticated requests)
  - Input validation: `texts` (non-empty array) and `targetLanguage` ('pt' or 'es') required (400 if missing)
  - DB cache check: single `.from('translations').select().in().eq().eq()` query
  - Claude AI translation for cache misses using `claude-haiku-4-20250514`
  - Markdown fence stripping before JSON.parse (prevents silent fallback from code-block wrapped responses)
  - `upsert(rows, { onConflict: 'source_text,source_language,target_language', ignoreDuplicates: true })` for silent duplicate protection
  - Partial success: returns cached hits even when AI key is null or AI call fails; missing strings fall back to source text

- `tests/unit/translate-route.test.ts`: 6 unit tests, all passing GREEN
  - 401 when not authenticated
  - 400 when texts field missing
  - 400 when targetLanguage field missing
  - 503 when getIntegrationKey returns null with no cache hits
  - DB cache hit returns translation without calling Claude
  - DB cache miss calls claude-haiku, upserts with onConflict, returns translated text

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `insert()` with `onConflict` option is not valid in Supabase JS v2**

- **Found during:** Task 1 (TypeScript check)
- **Issue:** Plan specified `svc.from('translations').insert(rows, { onConflict: '...' })` but the TypeScript type definitions for Supabase JS v2's `insert()` do not include `onConflict` in the options type. The `onConflict` option only exists on `upsert()`.
- **Fix:** Changed to `svc.from('translations').upsert(rows, { onConflict: 'source_text,source_language,target_language', ignoreDuplicates: true })`. The `ignoreDuplicates: true` flag maps to `resolution=ignore-duplicates` in the Prefer header, equivalent to `ON CONFLICT DO NOTHING`.
- **Files modified:** `app/api/translate/route.ts`
- **Commit:** ac9a1f7

**2. [Rule 1 - Bug] Test mock chain missing second `.eq()` call**

- **Found during:** Task 1 (first test run)
- **Issue:** Initial mock chain had single `.eq()` call but route chains two `.eq()` calls (`.eq('source_language', 'en').eq('target_language', targetLanguage)`). This caused TypeError in 2 tests.
- **Fix:** Added two chained `.eq()` mock fns in beforeEach and all per-test overrides.
- **Files modified:** `tests/unit/translate-route.test.ts`
- **Commit:** ac9a1f7

**3. [Rule 1 - Bug] Anthropic mock used `vi.fn().mockImplementation()` which is not constructible**

- **Found during:** Task 1 (second test run)
- **Issue:** `new Anthropic(...)` in the route requires a constructible mock. Arrow function via `vi.fn().mockImplementation` is not constructible.
- **Fix:** Used `class` pattern for the Anthropic mock with a module-level `anthropicCreateMock` function reference so `beforeEach` can reset and control the mock across tests.
- **Files modified:** `tests/unit/translate-route.test.ts`
- **Commit:** ac9a1f7

## Known Stubs

None — all route functionality is fully implemented and tested.

## Self-Check: PASSED

- `app/api/translate/route.ts` — FOUND
- `tests/unit/translate-route.test.ts` — FOUND
- Commit ac9a1f7 — FOUND (git log confirms)
- All 6 tests — GREEN
- TypeScript — zero errors in translate files

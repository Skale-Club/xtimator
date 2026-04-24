---
phase: 12-i18n-translation-system
plan: 01
subsystem: database, testing
tags: [i18n, supabase, vitest, rls, postgresql, translations]

# Dependency graph
requires:
  - phase: 11-marketing-landing-page
    provides: app structure on which i18n layers are added

provides:
  - translations DB table with BIGSERIAL PK, RLS, and unique index on (source_text, source_language, target_language)
  - Wave 0 test scaffolds (5 failing stub files) for language-context, use-translation, language-toggle, translation-loading-overlay, translate-route
  - RED test baseline for all I18N requirements (I18N-01 through I18N-08)

affects:
  - 12-02-PLAN (LanguageContext + useTranslation implementation)
  - 12-03-PLAN (translate API route)
  - 12-04-PLAN (UI components: LanguageToggle, TranslationLoadingOverlay)
  - 12-05-PLAN (wiring into app layout)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wave 0 TDD pattern: test stubs created before source modules exist, with vi.mock to prevent import errors"
    - "pendingCount/setPendingCount in LanguageContext (not isTranslating) for correct concurrent batch handling"

key-files:
  created:
    - supabase/migrations/20260424000001_add_translations_table.sql
    - tests/unit/i18n/language-context.test.tsx
    - tests/unit/i18n/use-translation.test.ts
    - tests/unit/components/language-toggle.test.tsx
    - tests/unit/components/translation-loading-overlay.test.tsx
    - tests/unit/translate-route.test.ts
  modified: []

key-decisions:
  - "LanguageContext uses pendingCount/setPendingCount (not isTranslating/setIsTranslating) to prevent premature overlay dismissal on concurrent translation batches"
  - "All 5 Wave 0 test files mock their source modules via vi.mock so tests compile without import errors even though source modules don't exist yet"
  - "translations table uses service-role-only writes (no INSERT policy) — service role bypasses RLS, so no explicit write policy is needed"

patterns-established:
  - "Wave 0 test scaffold pattern: vi.mock the target module itself so test files can import it before the module is created"
  - "pendingCount integer context pattern for translation batches (avoids premature overlay dismissal)"

requirements-completed:
  - I18N-08
  - I18N-01
  - I18N-02
  - I18N-03
  - I18N-04
  - I18N-06

# Metrics
duration: 5min
completed: 2026-04-24
---

# Phase 12 Plan 01: i18n Translation System — DB Migration & Wave 0 Test Scaffolds

**Translations DB table (BIGSERIAL PK, unique index, RLS) applied to Supabase + 23 failing stub tests across 5 files establishing the RED baseline for all I18N requirements**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-24T16:52:02Z
- **Completed:** 2026-04-24T17:00:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Created and applied `20260424000001_add_translations_table.sql` — translations cache table with BIGSERIAL PK, NOT NULL constraints, TIMESTAMPTZ created_at, unique index on `(source_text, source_language, target_language)`, RLS enabled with public SELECT policy
- Created 5 Wave 0 test scaffold files (23 stubs total) covering I18N-01 through I18N-08 — all fail with `AssertionError: expected true to be false`, none fail with import/compile errors
- Verified all pre-existing tests (218 tests, 39 files) continue to pass after adding the new test files

## Task Commits

Each task was committed atomically:

1. **Task 1: Write translations DB migration** - `201cc4e` (feat)
2. **Task 2: Write Wave 0 test scaffolds (failing stubs)** - `5527daf` (test)

## Files Created/Modified

- `supabase/migrations/20260424000001_add_translations_table.sql` — Translations cache table DDL: BIGSERIAL PK, source_text/source_language/target_language/translated_text columns, unique index, RLS with public read policy; applied to Supabase DB
- `tests/unit/i18n/language-context.test.tsx` — 4 stubs for I18N-01 (toggle) and I18N-02 (localStorage persistence)
- `tests/unit/i18n/use-translation.test.ts` — 5 stubs for I18N-03 (EN passthrough), I18N-04 (static dict lookup), I18N-06 (mem cache)
- `tests/unit/components/language-toggle.test.tsx` — 5 stubs for I18N-01 (EN→PT→ES→EN cycle behavior)
- `tests/unit/components/translation-loading-overlay.test.tsx` — 3 stubs for I18N-07 (overlay renders when pendingCount > 0)
- `tests/unit/translate-route.test.ts` — 6 stubs for I18N-05 (auth check, DB cache hit/miss, AI translate, onConflict) and I18N-08

## Decisions Made

- LanguageContext uses `pendingCount`/`setPendingCount` (integer counter, not boolean `isTranslating`) — prevents premature overlay dismissal when concurrent translation batches are in flight (RESEARCH Pattern 3)
- Wave 0 test scaffold pattern: each test file mocks its own target module (`vi.mock('@/components/app-shell/language-toggle', ...)`) so the import at the bottom compiles even before the source file exists
- `translations` table grants no explicit INSERT/UPDATE policy — writes are service-role only, which bypasses RLS by design

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `bunx` command not available in the shell environment — applied migration using `npx supabase db push` instead (same Supabase CLI behavior, same outcome)

## User Setup Required

None - no external service configuration required beyond what was already configured.

## Next Phase Readiness

- DB migration applied and verified on Supabase
- All 5 Wave 0 test files in place and failing with correct assertion errors
- Plan 02 can immediately implement `LanguageContext` + `useTranslation()` to turn tests GREEN
- Plan 03 can implement `/api/translate` route
- Plan 04 can implement `LanguageToggle` + `TranslationLoadingOverlay` components

---
*Phase: 12-i18n-translation-system*
*Completed: 2026-04-24*

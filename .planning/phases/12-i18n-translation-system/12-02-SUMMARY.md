---
phase: 12-i18n-translation-system
plan: "02"
subsystem: i18n
tags: [react-context, localstorage, typescript, i18n, translation, hooks]

requires:
  - phase: 11-marketing-landing-page
    provides: Completed landing page and root layout app/layout.tsx that we extend

provides:
  - LanguageContext with pendingCount/setPendingCount (not isTranslating) for overlay management
  - useTranslation() hook with EN fast-path, memCache, staticDict lookup, debounced batch to /api/translate
  - staticDict with 154 translation entries (80+ strings) for PT-BR and ES
  - LanguageProvider wired into app/layout.tsx wrapping all app content inside ThemeProvider

affects:
  - 12-03-PLAN (translate API route — uses same staticDict structure)
  - 12-04-PLAN (UI components — LanguageToggle, TranslationLoadingOverlay — import useLanguage and useTranslation)
  - 12-05-PLAN (string wrapping pass — imports useTranslation from lib/i18n/use-translation)

tech-stack:
  added: []
  patterns:
    - "LanguageContext pattern: useState('en') default + useEffect localStorage read for SSR-safe hydration (same as ThemeToggle mounted guard)"
    - "pendingCount counter (not isTranslating boolean) for concurrent batch overlay management"
    - "Per-language debounced batch accumulator: Map<lang, Map<source, resolvers[]>> + Map<lang, timer>"
    - "Module-level memCache Map keyed as lang:source prevents redundant static dict or API calls"
    - "EN fast-path: t() returns text unchanged with zero overhead when language is 'en'"

key-files:
  created:
    - lib/i18n/language-context.tsx
    - lib/i18n/use-translation.ts
    - lib/i18n/translations.ts
    - tests/unit/i18n/language-context.test.tsx
    - tests/unit/i18n/use-translation.test.ts
  modified:
    - app/layout.tsx

key-decisions:
  - "pendingCount (not isTranslating) in LanguageContext prevents premature overlay dismissal when multiple concurrent batches are in flight"
  - "Per-language batch accumulator (Map<lang, ...>) avoids Pitfall 3: language switch mid-debounce won't mix PT and ES translations"
  - "res.text() + markdown fence stripping before JSON.parse per Pitfall 6: Claude can return markdown-wrapped JSON"
  - "memCache is module-level Map so it persists across re-renders and component unmounts for the browser session"

patterns-established:
  - "lib/i18n/ directory convention for i18n core modules"
  - "useLanguage() is the context hook; useTranslation() builds on it with t() + language return"
  - "LanguageProvider nests inside ThemeProvider in app/layout.tsx"

requirements-completed: [I18N-01, I18N-02, I18N-03, I18N-04, I18N-06]

duration: 7min
completed: "2026-04-24"
---

# Phase 12 Plan 02: i18n Core — LanguageContext, useTranslation, Static Dictionary

**React Context i18n foundation with 154-entry static dictionary for PT-BR/ES, pendingCount overlay state, and EN fast-path hook wired into root layout**

## Performance

- **Duration:** 7 min
- **Started:** 2026-04-24T16:53:25Z
- **Completed:** 2026-04-24T17:00:25Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- `lib/i18n/language-context.tsx` — LanguageContext with `pendingCount`/`setPendingCount` (not `isTranslating`), SSR-safe localStorage mount guard, exports `Language` type
- `lib/i18n/use-translation.ts` — `useTranslation()` with EN fast-path, module-level `memCache`, `staticDict` lookup, per-language debounced batch to `/api/translate` with `setPendingCount` increment/decrement around fetch
- `lib/i18n/translations.ts` — `staticDict` with 154 entries (77 per language) covering navigation, buttons, status labels, form labels, empty states, common messages, and modal strings for PT-BR and ES
- `app/layout.tsx` — `LanguageProvider` wired inside `ThemeProvider`, wrapping all children and `<Toaster />`
- 21 unit tests covering all behaviors: EN fast-path, static dict PT/ES, memCache, async fallback, pendingCount increment/decrement

## Task Commits

1. **Task 1: Implement LanguageContext, useTranslation, and static dictionary** - `f21f39a` (feat)
2. **Task 2: Wire LanguageProvider into root layout** - `3c6e503` (feat)

## Files Created/Modified

- `lib/i18n/language-context.tsx` — LanguageContext, LanguageProvider, useLanguage(), Language type, pendingCount state
- `lib/i18n/use-translation.ts` — useTranslation() with t() function, memCache, per-language debounced batch, flushBatch with pendingCount lifecycle
- `lib/i18n/translations.ts` — staticDict with 154 translation entries for PT-BR and ES
- `tests/unit/i18n/language-context.test.tsx` — 10 tests covering LanguageProvider mount, localStorage, setLanguage, pendingCount
- `tests/unit/i18n/use-translation.test.ts` — 11 tests covering EN fast-path, PT/ES static dict, memCache, async fallback, flushBatch pendingCount
- `app/layout.tsx` — Added LanguageProvider import + JSX wrapping of ThemeProvider children

## Decisions Made

- Used `pendingCount` (counter) not `isTranslating` (boolean) in LanguageContext — multiple concurrent batches can be in flight; a counter prevents premature overlay dismissal when one batch completes
- Per-language batch accumulator (`Map<lang, Map<source, resolvers[]>>`) — mitigates Pitfall 3: rapid language switch (EN→PT→ES) cannot mix translations between languages
- `res.text()` + markdown fence stripping before `JSON.parse` — Claude Haiku can return markdown-wrapped JSON (Pitfall 6); stripping fences prevents silent fallback for all dynamic translations
- `LanguageProvider` nests INSIDE `ThemeProvider` (not outside) — ThemeProvider must wrap everything for dark mode to work; LanguageProvider inside is safe and allows future theme-aware language features

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## Known Stubs

None — the implementation is complete. `staticDict` has 154 real translation entries. `useTranslation()` is fully wired with real cache, real static dict lookup, and real async batch to `/api/translate`. The `/api/translate` endpoint itself is Plan 03 (independent parallel plan).

## User Setup Required

None — no external service configuration required for this plan. The `/api/translate` route (Plan 03) will require Anthropic integration key in the platform admin panel, but that is pre-existing configuration.

## Next Phase Readiness

- `lib/i18n/language-context.tsx` and `lib/i18n/use-translation.ts` ready for import by Plans 03, 04, 05
- Plan 03 (`/api/translate` route) can proceed in parallel — it only needs `staticDict` shape (done) and DB migration (its own task)
- Plan 04 (`LanguageToggle`, `TranslationLoadingOverlay`) can proceed — imports `useLanguage` and `pendingCount`
- Plan 05 (string wrapping pass) can proceed — imports `useTranslation` and calls `t()` on UI strings

---
*Phase: 12-i18n-translation-system*
*Completed: 2026-04-24*

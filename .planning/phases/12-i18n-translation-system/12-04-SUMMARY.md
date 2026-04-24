---
phase: 12-i18n-translation-system
plan: "04"
subsystem: i18n, ui-components
tags: [i18n, language-toggle, translation-overlay, topbar, bottom-nav, app-layout, react-context, accessibility]

requires:
  - phase: 12-i18n-translation-system
    plan: "01"
    provides: Wave 0 test stubs for language-toggle and translation-loading-overlay
  - phase: 12-i18n-translation-system
    plan: "02"
    provides: lib/i18n/language-context.tsx with useLanguage(), Language type, pendingCount

provides:
  - LanguageToggle component — cycle EN->PT->ES->EN on click, 2-letter badge, mounted guard
  - TranslationLoadingOverlay component — fixed bottom-right corner, Loader2 spinner, role=status aria-live=polite
  - Topbar updated with LanguageToggle before ThemeToggle (desktop)
  - BottomNav updated with LanguageToggle after NAV_ITEMS map (mobile)
  - App authenticated layout mounts TranslationLoadingOverlay as sibling to {children}

affects:
  - 12-05-PLAN (string wrapping pass — LanguageToggle visible, overlay mounted, translation UX complete)
  - All authenticated app pages — TranslationLoadingOverlay renders from app/(app)/layout.tsx

tech-stack:
  added: []
  patterns:
    - "LanguageToggle mounted guard: useState(false) + useEffect(() => setMounted(true), []) — same pattern as ThemeToggle"
    - "Cycle-on-click: CYCLE array with indexOf + modulo advance, calls setLanguage(next)"
    - "pendingCount (not isTranslating boolean) for overlay visibility — prevents premature dismiss on concurrent batches"
    - "TranslationLoadingOverlay renders null when pendingCount === 0 — zero overhead for EN users"

key-files:
  created:
    - components/app-shell/language-toggle.tsx
    - components/i18n/translation-loading-overlay.tsx
  modified:
    - components/app-shell/topbar.tsx
    - components/app-shell/bottom-nav.tsx
    - app/(app)/layout.tsx
    - tests/unit/components/language-toggle.test.tsx
    - tests/unit/components/translation-loading-overlay.test.tsx

key-decisions:
  - "TranslationLoadingOverlay uses pendingCount (integer counter) not isTranslating (boolean) — prevents premature overlay dismissal when concurrent translation batches are in flight (RESEARCH Pattern 3)"
  - "LanguageToggle mounted guard renders null before mount — prevents SSR hydration mismatch with localStorage (RESEARCH Pitfall 1)"
  - "LanguageToggle placed in BottomNav OUTSIDE the NAV_ITEMS.map() callback — it is a button not a nav link (RESEARCH Pitfall 4)"
  - "TranslationLoadingOverlay mounted in app/(app)/layout.tsx alongside BottomNav — ensures overlay is in-tree for all authenticated pages so I18N-07 can trigger"

requirements-completed:
  - I18N-01
  - I18N-07

duration: 6min
completed: "2026-04-24"
---

# Phase 12 Plan 04: LanguageToggle and TranslationLoadingOverlay UI Components

**LanguageToggle cycling EN/PT/ES with 2-letter badge and mounted guard; TranslationLoadingOverlay fixed corner indicator using pendingCount for I18N-07; both wired into topbar, bottom-nav, and app layout**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-24T17:24:50Z
- **Completed:** 2026-04-24T17:31:08Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- `components/app-shell/language-toggle.tsx` — LanguageToggle with CYCLE pattern (EN->PT->ES->EN), 2-letter badge (`text-xs font-bold`), SSR-safe mounted guard (renders null before mount), correct aria-labels per language
- `components/i18n/translation-loading-overlay.tsx` — fixed bottom-right corner overlay with Loader2 spinner, "Translating..." text, `role="status"` `aria-live="polite"`, renders null when `pendingCount === 0`, uses `bottom-20 md:bottom-4` responsive positioning for mobile bottom-nav clearance
- `components/app-shell/topbar.tsx` — LanguageToggle imported and rendered BEFORE ThemeToggle in desktop header's `flex items-center gap-1` section
- `components/app-shell/bottom-nav.tsx` — LanguageToggle imported and rendered AFTER the `NAV_ITEMS.map()` call (outside the loop) wrapped in `min-h-[44px] min-w-[44px]` touch target div
- `app/(app)/layout.tsx` — TranslationLoadingOverlay imported and mounted as sibling to {children} and BottomNav in the authenticated app shell
- All 8 component tests GREEN: 5 LanguageToggle tests covering cycle behavior, aria-labels, badge display; 3 TranslationLoadingOverlay tests covering render on pendingCount>0, null on pendingCount=0, role/aria-live

## Task Commits

1. **Task 1: Implement LanguageToggle and TranslationLoadingOverlay** - `33cff9a` (feat)
2. **Task 2: Wire LanguageToggle into topbar/bottom-nav; mount TranslationLoadingOverlay in app layout** - `69ef13d` (feat)

## Files Created/Modified

- `components/app-shell/language-toggle.tsx` — 'use client', CYCLE/LABELS/ARIA_LABELS constants, mounted guard, cycle-on-click with setLanguage, ghost/icon Button with 2-letter badge
- `components/i18n/translation-loading-overlay.tsx` — 'use client', pendingCount from useLanguage(), null guard, fixed corner position, Loader2 spinner, "Translating..." text, role=status aria-live=polite
- `components/app-shell/topbar.tsx` — added LanguageToggle import + `<LanguageToggle />` before `<ThemeToggle />`
- `components/app-shell/bottom-nav.tsx` — added LanguageToggle import + wrapper div with touch target + `<LanguageToggle />` after NAV_ITEMS.map
- `app/(app)/layout.tsx` — added TranslationLoadingOverlay import + `<TranslationLoadingOverlay />` sibling to children
- `tests/unit/components/language-toggle.test.tsx` — replaced stubs with real assertions: findByRole with aria-label, fireEvent click, setLanguageMock called with correct next language
- `tests/unit/components/translation-loading-overlay.test.tsx` — replaced stubs with real assertions: text content, null container, role/aria-live attributes

## Decisions Made

- Used `pendingCount` counter (not `isTranslating` boolean) to control overlay — prevents premature dismissal when multiple concurrent translation batches are in flight (RESEARCH Pattern 3)
- Mounted guard renders `null` before `useEffect` fires — prevents SSR hydration mismatch from localStorage-driven language state (RESEARCH Pitfall 1)
- LanguageToggle added outside `NAV_ITEMS.map()` in BottomNav — it's a button action, not a nav link; adding to the array would break TypeScript types (RESEARCH Pitfall 4)
- Overlay positioned at `bottom-20 md:bottom-4` — clears the 56px BottomNav height on mobile while sitting at standard `bottom-4` on desktop

## Deviations from Plan

**Pre-merge required:** The worktree branch (worktree-agent-a85668b6) was at the base commit `a93c262` before Phase 12 work. A `git merge main` fast-forward was needed to bring in Plans 01 and 02 artifacts (lib/i18n/language-context.tsx, test stubs, etc.) before implementation could proceed.

No other deviations — plan executed exactly as written after merge.

## Known Stubs

None — LanguageToggle and TranslationLoadingOverlay are fully implemented. Both components are wired into the live app shell. TranslationLoadingOverlay will only appear when dynamic translations are fetched (Plan 12-03 route must be deployed for overlay to trigger on first session).

## User Setup Required

None.

## Self-Check: PASSED

Files created:
- `components/app-shell/language-toggle.tsx` — exists
- `components/i18n/translation-loading-overlay.tsx` — exists

Commits:
- `33cff9a` — feat(12-04): implement LanguageToggle and TranslationLoadingOverlay components
- `69ef13d` — feat(12-04): wire LanguageToggle into topbar and bottom-nav; mount TranslationLoadingOverlay in app layout

Tests: 8/8 GREEN

---
*Phase: 12-i18n-translation-system*
*Completed: 2026-04-24*

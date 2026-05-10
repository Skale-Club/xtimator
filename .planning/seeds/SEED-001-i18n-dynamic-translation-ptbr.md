---
id: SEED-001
status: harvested
planted: 2026-04-22
planted_during: v1.1 — Dark-first UX & Modern Redesign (all 9 phases complete)
harvested_during: v1.2 Brand Identity & Global Reach (Phase 12)
harvested: 2026-04-24
trigger_when: when starting a milestone focused on internationalization, Brazilian/Latin American market expansion, or multi-language support
scope: Medium
---

# SEED-001: Sistema de Tradução Dinâmica (i18n EN→PT-BR + ES)

## Why This Matters

Xtimator targets US-based service businesses, but there are large Brazilian and
Latin American markets (construction, landscaping, cleaning, etc.) that could benefit from
the platform. Offering native Portuguese and Spanish experiences removes friction for BR/LATAM
users and opens two additional markets without rewriting the app.

## When to Surface

**Trigger:** When a milestone targets internationalization, Brazilian market expansion, or
multi-language user experience.

This seed should be presented during `/gsd:new-milestone` when:
- The milestone name or goals mention "pt-br", "português", "español", "spanish", "internacionalização", "i18n", "Brazil", or "Latin America"
- A feature request for language switching is being scoped
- The team is preparing a BR or LATAM market go-to-market push

## Architecture (Pre-Designed — Use As-Is)

The user has already designed the full architecture. Implement exactly this:

### Frontend

- **`LanguageProvider`** wraps the app in `App.tsx` (equivalent: `app/layout.tsx`)
- **`LanguageContext`** stores current language in `localStorage` as key `language`, values `'en'` | `'pt'` | `'es'`
- **`useTranslation()` hook** exposes `t(text: string): string`
  - If language is `'en'`: returns `text` unchanged
  - If language is `'pt'` or `'es'`: resolves via priority chain:
    1. In-memory cache (browser session)
    2. Static dictionary in `translations.ts`
    3. API `/api/translate` — batched, debounced 50ms

### API Route

- Route registered in `server/routes.ts` (or Next.js `app/api/translate/route.ts`)
- Implementation in `translate.ts`

### Backend Logic

1. Check `translations` table for existing translation
2. If found → return from DB
3. If not found → call `getActiveAIClient()` (already exists from Phase 08) → request EN→PT-BR or EN→ES translation depending on `target_language`
4. Save with `onConflictDoNothing()`
5. Return: `{ "translations": { "Contact Us": "Fale Conosco" } }` (or `"Contáctenos"` for ES)

### Database

- Table: `translations`
- Migration: `0019_add_translations_table.sql`
- Unique index on: `(source_text, source_language, target_language)` — prevents duplicate translations

### Cache Strategy

| Layer | Duration | Location |
|-------|----------|----------|
| Memory | Browser session | `useTranslation` hook |
| Persistent | Until manually cleared | `translations` DB table |

### UI

- **`LanguageToggle`** component in Navbar — cycles `EN` / `PT` / `ES` via `setLanguage()`
- **`TranslationLoadingOverlay`** in `App.tsx` — shown while dynamic translations are fetching

## Scope Estimate

**Medium** — 1 full phase, ~3-4 plans:
1. DB migration + backend `/api/translate` route
2. `useTranslation` hook + `LanguageContext` + `translations.ts` static dictionary
3. `LanguageToggle` in Navbar + `TranslationLoadingOverlay`
4. Coverage pass: wrap all user-facing strings with `t()`

## Breadcrumbs

Related code in current codebase:

- `app/(auth)/layout.tsx:15` — `--platform-primary` CSS var pattern (same dynamic config approach)
- `app/admin/branding/actions.ts` — `getActiveAIClient()` pattern to reuse for AI translation calls
- `.planning/phases/08-platform-admin-panel-for-centralized-api-integrations/` — established AI client abstraction
- `.planning/STATE.md:61` — Decision D-04: `app/page.tsx` redirects to `/auth/login`; no landing page yet

## Notes

- `getActiveAIClient()` from Phase 08 is the exact hook needed for the translate API — reuse it.
- Static `translations.ts` dictionary should be seeded with the most common UI strings for both
  PT-BR and ES to minimize AI calls on first load.
- The 50ms batch debounce prevents N individual API calls on initial page render.

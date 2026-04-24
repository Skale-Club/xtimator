# Phase 12: i18n Translation System - Context

**Gathered:** 2026-04-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Add EN/PT-BR/ES language switching to the authenticated app with:
- Client-side `LanguageContext` + `useTranslation()` hook
- Static `translations.ts` dictionary (~80 common strings, no API call)
- `/api/translate` route with AI fallback + DB cache for strings not in static dict
- `LanguageToggle` in authenticated app topbar (alongside existing `ThemeToggle`)
- `TranslationLoadingOverlay` for first-session dynamic fetch
- `translations` DB table with duplicate-prevention index

**English-first:** all UI built and tested in English; PT-BR and ES layer on top via hook.

Out of scope:
- Landing page translation (server component — defer to v1.3 when SSR i18n is designed)
- Admin panel translation (platform owner surface, EN-only)
- `/estimate/*` share page translation (client-facing, EN-only for v1.2)
- Per-user language preference in DB (localStorage covers v1.2)
- Language auto-detection from browser locale (manual toggle covers v1.2)
- Translation admin UI (view/edit cached translations — deferred to v2)

</domain>

<decisions>
## Implementation Decisions

### Architecture (LOCKED — from SEED-001, implement exactly as specified)
- **D-01:** `LanguageContext` stores current language in `localStorage` under key `language`, values `'en'` | `'pt'` | `'es'`. Default: `'en'`.
- **D-02:** `useTranslation()` hook exposes `t(text: string): string`. If language is `'en'` → returns `text` unchanged (zero overhead). If `'pt'` or `'es'` → resolves via priority chain: (1) in-memory session cache → (2) static `translations.ts` dictionary → (3) `/api/translate` API.
- **D-03:** `LanguageProvider` wraps the app in `app/layout.tsx` (root layout, wraps everything). Toggle only appears in authenticated app topbar — admin and estimate share page see no toggle and default to `'en'`.
- **D-04:** `/api/translate` route at `app/api/translate/route.ts`. Implementation: check `translations` DB table → if found return cached → if not call `getIntegrationKey('anthropic')` + Claude → save with `onConflictDoNothing()` → return `{ translations: { [source]: translated } }`.
- **D-05:** Requests to `/api/translate` are batched and debounced 50ms. Multiple `t()` calls on the same render fire a single batched request.
- **D-06:** `translations` DB table — migration `20260424000001_add_translations_table.sql`. Schema: `id BIGSERIAL PK, source_text TEXT NOT NULL, source_language TEXT NOT NULL DEFAULT 'en', target_language TEXT NOT NULL, translated_text TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now()`. Unique index on `(source_text, source_language, target_language)`.
- **D-07:** `TranslationLoadingOverlay` shown while first-session dynamic translations are fetching. Subsequent navigations to already-translated pages show text instantly (in-memory cache hit).

### `t()` Wrapping Scope
- **D-08:** Wrap common high-frequency UI strings only — target ~80 strings covering: all navbar items, buttons (Save, Cancel, Delete, Create, Edit, Submit, Back, Next), status labels (Active, Draft, Sent, Pending, Cancelled), form field labels, section headings (Dashboard, Clients, Projects, Estimates, Settings), empty state messages, error messages, and modal titles.
- **D-09:** Rare strings (admin panel content, legal copy, error stack traces, placeholder text) are NOT wrapped — they remain hardcoded EN and are explicitly excluded from i18n scope.
- **D-10:** The static `translations.ts` dictionary covers all ~80 wrapped strings for both PT-BR and ES. Goal: zero `/api/translate` API calls for a typical authenticated session flow (dashboard → project → estimate workflow).

### Language Toggle
- **D-11:** `LanguageToggle` component placed in `components/app-shell/topbar.tsx` alongside the existing `ThemeToggle`. Cycles EN → PT → ES → EN on click. Displays current language code as a 2-letter badge.
- **D-12:** Toggle also added to `components/app-shell/bottom-nav.tsx` (mobile) for parity.

### Landing Page
- **D-13:** Landing page (`app/page.tsx` and `components/landing/`) is explicitly OUT OF SCOPE for translation in this phase. It is a server component and the client-side hook approach does not apply cleanly. Deferred to v1.3 when SSR i18n can be properly designed.

### Claude's Discretion
- Exact Claude model and prompt for translation (use `claude-haiku-*` for low-latency, low-cost translation calls)
- In-memory cache implementation (Map vs WeakRef vs module-level object)
- How the 50ms debounce batch is assembled (setTimeout + accumulator pattern or a small utility)
- Whether `LanguageToggle` uses a `DropdownMenu` (showing all 3 options) or a cycle-on-click button
- RLS policy on `translations` table (platform-wide read, service-role write — no per-tenant isolation needed)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project core
- `.planning/PROJECT.md` — vision, v1.2 milestone goal, English-first constraint
- `.planning/REQUIREMENTS.md` — I18N-01 through I18N-08 (acceptance criteria)
- `.planning/ROADMAP.md` §"Phase 12" — canonical scope and success criteria
- `CLAUDE.md` — tech stack constraints, GSD workflow enforcement

### Pre-designed architecture (MANDATORY)
- `.planning/seeds/SEED-001-i18n-dynamic-translation-ptbr.md` — full architecture spec; implement exactly as described

### Existing code (read before planning)
- `app/layout.tsx` — root layout; `LanguageProvider` wraps `ThemeProvider` here
- `components/app-shell/topbar.tsx` — `ThemeToggle` placement shows where `LanguageToggle` slots in
- `components/app-shell/bottom-nav.tsx` — mobile nav for parity toggle placement
- `app/api/generate-estimate/route.ts` — `getIntegrationKey('anthropic')` pattern to reuse for translate route
- `lib/platform-config.ts` — `getIntegrationKey()` source; translate route uses same pattern
- `supabase/migrations/20260422000001_theme_preference.sql` — migration file format to follow
- `lib/supabase/server.ts` + `lib/supabase/service.ts` — client patterns for DB access in API route

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`getIntegrationKey('anthropic')`** (`lib/platform-config.ts`) — already handles encrypted key retrieval; translate route uses this directly, no new AI client setup needed
- **`components/app-shell/theme-toggle.tsx`** — pattern to follow for `LanguageToggle` (client component, side-effects via context)
- **`components/ui/dropdown-menu.tsx`** — available for LanguageToggle if dropdown variant is preferred over cycle-click
- **Supabase server client** (`lib/supabase/server.ts`) — use in API route for DB reads; service client for writes

### Established Patterns
- **Context + localStorage persistence** — `theme_preference` in Phase 9 is the direct analogue: cookie/localStorage persistence, SSR-safe hydration. LanguageContext follows the same shape.
- **API route pattern** — `app/api/generate-estimate/route.ts` shows the full pattern: auth check → `getIntegrationKey` → Claude call → return structured response
- **Supabase migration naming** — `YYYYMMDDHHMMSS_description.sql` or `YYYYMMDD000001_description.sql`

### Integration Points
- `app/layout.tsx:27` — wrap `ThemeProvider` children with `LanguageProvider`
- `components/app-shell/topbar.tsx:28` — add `LanguageToggle` next to `ThemeToggle`
- `app/api/` — new `translate/route.ts` alongside existing routes
- `supabase/migrations/` — new `20260424000001_add_translations_table.sql`

</code_context>

<specifics>
## Specific Ideas

- Architecture is pre-designed in SEED-001 — follow it exactly, no deviation
- Static dictionary should seed ALL ~80 common strings for both PT-BR and ES before shipping — the goal is zero API calls for a typical dashboard session
- `useTranslation()` must return `text` unchanged when language is `'en'` — no overhead, no network call, no cache lookup
- Translation API should use `claude-haiku` (fast, cheap) not `claude-sonnet` — translations are short strings, not complex generation
- The `TranslationLoadingOverlay` should be subtle (spinner or shimmer text) not a full-page block — it should not disrupt the UX for EN users who never trigger it

</specifics>

<deferred>
## Deferred Ideas

- **Landing page translation** — Server component architecture makes client-side hooks incompatible. Defer to v1.3 with proper SSR i18n design (next-intl or equivalent).
- **Admin panel translation** — Platform owner surface; EN-only acceptable for v1.2.
- **`/estimate/*` share page translation** — Client-facing but low priority; EN-only for v1.2.
- **Per-user language preference in DB** — localStorage covers v1.2; DB persistence deferred.
- **Language auto-detection from browser locale** — Manual toggle covers v1.2.
- **Translation admin UI** — View/edit cached translations in admin panel — deferred to v2.

</deferred>

---

*Phase: 12-i18n-translation-system*
*Context gathered: 2026-04-24*

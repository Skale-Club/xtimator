# Requirements: v1.2 Brand Identity & Global Reach

**Milestone goal:** Establish Xtimator's public presence with a branded dark-mode marketing landing page using #406EF1 design system applied globally, and enable the app for BR/LATAM markets with a full EN/PT-BR/ES translation system (English-first).

**Key constraints:**
- English-first: all UI built and tested in English; PT-BR and ES are layered on top
- Landing page must use design skills: `skills.sh/vercel-labs` + `skills.sh/nextlevelbuilder/ui-ux-pro-max`
- i18n architecture pre-designed (SEED-001) — implement exactly as specified
- `#406EF1` primary color applied across entire app (landing + authenticated + admin)

---

## v1.2 Requirements

### Landing Page

- [x] **LAND-01**: Visitor can see a hero section with a strong headline, subheadline, and a signup/login CTA button
- [x] **LAND-02**: Visitor can read a "How It Works" section showing the 3-step flow (record audio on site → add photos → receive AI-generated estimate)
- [x] **LAND-03**: Visitor can explore a features/benefits grid highlighting AI generation, branded PDF output, shareable links, and mobile-first use
- [x] **LAND-04**: Landing page is fully responsive and functions correctly on iOS Safari and Android Chrome
- [x] **LAND-05**: Landing page uses dark theme with `#406EF1` as primary color and near-black background; visual quality meets production standards (using vercel-labs + ui-ux-pro-max skills)

### Brand Identity

- [x] **BRAND-01**: All authenticated app pages render with `#406EF1` as the global primary color (`--primary` CSS token updated in `app/globals.css`)
- [x] **BRAND-02**: Admin panel uses `#406EF1` as the default platform primary color (CSS fallback in `--platform-primary` updated from `220 91% 60%` to `226 85% 60%`)
- [x] **BRAND-03**: Auth pages (login, signup, reset-password) use `#406EF1` as the default primary color (fallback in auth layout updated)

### i18n — Translation System

- [x] **I18N-01**: User can switch the app language between English (EN), Portuguese/Brazil (PT), and Spanish (ES) from a language toggle component in the navbar
- [x] **I18N-02**: Selected language is persisted in `localStorage` under key `language` and restored on page reload without flicker
- [x] **I18N-03**: All user-visible text strings in the authenticated app and landing page are wrapped in `t()` for translation; English strings are returned unchanged
- [x] **I18N-04**: A static `translations.ts` dictionary provides immediate PT-BR and ES translations for the most commonly used UI strings (no API call needed)
- [ ] **I18N-05**: Strings not found in the static dictionary are automatically translated by AI via `/api/translate` — requests are batched and debounced 50ms; translated strings are saved to the `translations` DB table with `onConflictDoNothing()`
- [x] **I18N-06**: Translated strings are cached in-memory for the duration of the browser session, preventing redundant `/api/translate` calls for already-resolved strings
- [ ] **I18N-07**: A `TranslationLoadingOverlay` component is shown while dynamic translations are being fetched in the current session
- [ ] **I18N-08**: The `translations` DB table stores entries with a unique index on `(source_text, source_language, target_language)` to prevent duplicate rows

---

## Future Requirements (Deferred)

- Pricing section on landing page — deferred until pricing model is defined
- Testimonials / social proof section — deferred to v1.3
- Per-user language preference saved to DB — localStorage covers v1.2
- Language auto-detection from browser locale — manual toggle covers v1.2
- Translation admin UI (view/edit cached translations) — deferred to v2

## Out of Scope

- Pricing section on landing page — pricing model not yet defined
- Client portal (clients log in) — public share link covers v1 use case
- Per-tenant language settings — app-level toggle covers this milestone
- QuickBooks integration — deferred to v2
- Offline PWA mode — deferred to v2
- Dashboard charts/analytics — deferred to v2
- Estimate templates — deferred to v2
- Multi-user/team accounts — deferred to v2

---

## Traceability

| REQ-ID | Feature Area | Phase | Status |
|--------|-------------|-------|--------|
| BRAND-01 | Brand Identity | Phase 10 | Pending |
| BRAND-02 | Brand Identity | Phase 10 | Pending |
| BRAND-03 | Brand Identity | Phase 10 | Pending |
| LAND-01 | Landing Page | Phase 11 | Pending |
| LAND-02 | Landing Page | Phase 11 | Pending |
| LAND-03 | Landing Page | Phase 11 | Pending |
| LAND-04 | Landing Page | Phase 11 | Pending |
| LAND-05 | Landing Page | Phase 11 | Pending |
| I18N-01 | i18n | Phase 12 | Pending |
| I18N-02 | i18n | Phase 12 | Pending |
| I18N-03 | i18n | Phase 12 | Pending |
| I18N-04 | i18n | Phase 12 | Pending |
| I18N-05 | i18n | Phase 12 | Pending |
| I18N-06 | i18n | Phase 12 | Pending |
| I18N-07 | i18n | Phase 12 | Pending |
| I18N-08 | i18n | Phase 12 | Pending |

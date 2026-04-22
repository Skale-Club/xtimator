# Roadmap: EstimateBuilder Pro

## Milestones

- ✅ **v1.0 MVP** — Phases 1-8 (shipped 2026-04-21) · [archive](milestones/v1.0-ROADMAP.md)
- ✅ **v1.1 Dark-first UX & Modern Redesign** — Phase 9 (shipped 2026-04-22) · [archive](milestones/v1.1-ROADMAP.md)
- 🔧 **v1.2 Brand Identity & Global Reach** — Phases 10-12 (active)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-8) — SHIPPED 2026-04-21</summary>

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 1 | Foundation and Auth | 4/4 | 2026-04-10 |
| 2 | Company Onboarding | 3/3 | 2026-04-10 |
| 3 | Dashboard and Client Management | 3/3 | 2026-04-10 |
| 4 | Project Creation and Workspace | 3/3 | 2026-04-10 |
| 5 | Audio Recording and Photo Management | 4/4 | 2026-04-10 |
| 6 | AI Estimate Generation and Editor | 3/3 | 2026-04-10 |
| 7 | PDF Sharing Email and Settings | 4/4 | 2026-04-10 |
| 8 | Platform Admin Panel | 8/8 | 2026-04-21 |

</details>

<details>
<summary>✅ v1.1 Dark-first UX & Modern Redesign (Phase 9) — SHIPPED 2026-04-22</summary>

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 9 | Dark-first UX & Modern Redesign | 8/8 | 2026-04-22 |

</details>

### v1.2 Brand Identity & Global Reach

- [ ] **Phase 10: Global Brand Tokens** — Apply #406EF1 as the default primary color across all app surfaces (globals.css + layout fallbacks)
- [ ] **Phase 11: Marketing Landing Page** — Build the dark-mode public landing page (Hero+CTA, How It Works, Features/Benefits) using #406EF1 design system
- [ ] **Phase 12: i18n Translation System** — Add EN/PT-BR/ES language switching with static dictionary, AI on-demand translation, DB cache, and navbar toggle

---

## Phase Details

### Phase 10: Global Brand Tokens
**Goal**: Every app surface renders with #406EF1 as the default primary color without any component rewrites
**Depends on**: Nothing (token-only change)
**Requirements**: BRAND-01, BRAND-02, BRAND-03
**Success Criteria** (what must be TRUE):
  1. Authenticated app pages display interactive elements (buttons, links, focus rings) in #406EF1 blue
  2. Admin panel accent color defaults to #406EF1 when no runtime override is configured
  3. Auth pages (login, signup, reset-password) render their primary action buttons in #406EF1
**Plans**: TBD

### Phase 11: Marketing Landing Page
**Goal**: A visitor landing on the root URL sees a professional, dark-mode marketing page that explains the product and drives sign-up
**Depends on**: Phase 10
**Requirements**: LAND-01, LAND-02, LAND-03, LAND-04, LAND-05
**Success Criteria** (what must be TRUE):
  1. Visitor navigating to / sees a hero section with headline, subheadline, and a signup/login CTA — not a redirect to /auth/login
  2. Visitor can read the "How It Works" 3-step section (record audio → add photos → receive AI estimate)
  3. Visitor can browse a features/benefits grid (AI generation, branded PDF, shareable link, mobile-first)
  4. Landing page renders correctly on iOS Safari and Android Chrome at all breakpoints
  5. Visual design uses dark near-black background, #406EF1 primary, #7FA4F4 secondary, and meets production visual quality standards
**Plans**: TBD
**UI hint**: yes

### Phase 12: i18n Translation System
**Goal**: A user can switch the app between English, Portuguese (Brazil), and Spanish at any time and see translated UI text with no flicker or redundant API calls
**Depends on**: Phase 11
**Requirements**: I18N-01, I18N-02, I18N-03, I18N-04, I18N-05, I18N-06, I18N-07, I18N-08
**Success Criteria** (what must be TRUE):
  1. User can tap the language toggle in the navbar to cycle between EN, PT, and ES; selected language persists across page reloads without flicker
  2. English strings return immediately unchanged; PT-BR and ES strings appear from the static dictionary with no network call for common UI text
  3. Strings absent from the static dictionary are automatically translated by AI via /api/translate (batched, 50ms debounce) and the translated text appears in the UI
  4. A loading overlay is shown during the first dynamic translation fetch in a session; subsequent navigation to already-translated pages shows text instantly
  5. The translations DB table stores entries and rejects duplicates; a second visit after translation resolves from cache, not a repeat API call
**Plans**: TBD

---

## Progress

| Phase | Milestone | Plans | Status | Completed |
|-------|-----------|-------|--------|-----------|
| 1. Foundation and Auth | v1.0 | 4/4 | Complete | 2026-04-10 |
| 2. Company Onboarding | v1.0 | 3/3 | Complete | 2026-04-10 |
| 3. Dashboard and Client Management | v1.0 | 3/3 | Complete | 2026-04-10 |
| 4. Project Creation and Workspace | v1.0 | 3/3 | Complete | 2026-04-10 |
| 5. Audio Recording and Photo Management | v1.0 | 4/4 | Complete | 2026-04-10 |
| 6. AI Estimate Generation and Editor | v1.0 | 3/3 | Complete | 2026-04-10 |
| 7. PDF Sharing Email and Settings | v1.0 | 4/4 | Complete | 2026-04-10 |
| 8. Platform Admin Panel | v1.0 | 8/8 | Complete | 2026-04-21 |
| 9. Dark-first UX & Modern Redesign | v1.1 | 8/8 | Complete | 2026-04-22 |
| 10. Global Brand Tokens | v1.2 | 0/TBD | Not started | - |
| 11. Marketing Landing Page | v1.2 | 0/TBD | Not started | - |
| 12. i18n Translation System | v1.2 | 0/TBD | Not started | - |

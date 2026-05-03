# Roadmap: Xtimator

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

- [x] **Phase 10: Global Brand Tokens** — Apply #406EF1 as the default primary color across all app surfaces (globals.css + layout fallbacks) (completed 2026-04-22)
- [x] **Phase 11: Marketing Landing Page** — Build the dark-mode public landing page (Hero+CTA, How It Works, Features/Benefits) using #406EF1 design system (completed 2026-04-24)
- [x] **Phase 12: i18n Translation System** — Add EN/PT-BR/ES language switching with static dictionary, AI on-demand translation, DB cache, and navbar toggle (completed 2026-04-24)

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
**Plans**: 1 plan

Plans:
- [x] 10-01-PLAN.md — CSS token surgery: test scaffold + apply #406EF1 across all scopes

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
**Plans**: 2 plans

Plans:
- [x] 11-01-PLAN.md - Public root route + landing baseline + baseline coverage
- [x] 11-02-PLAN.md - Mobile responsiveness + visual polish + mobile Playwright coverage
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
**Plans**: 5 plans

Plans:
- [x] 12-01-PLAN.md — DB migration (translations table) + Wave 0 test scaffolds
- [x] 12-02-PLAN.md — i18n core: LanguageContext, useTranslation hook, static dictionary (~80 strings), layout wiring
- [x] 12-03-PLAN.md — /api/translate route: DB cache, Claude haiku AI, onConflict insert
- [x] 12-04-PLAN.md — LanguageToggle + TranslationLoadingOverlay + topbar/bottom-nav wiring
- [x] 12-05-PLAN.md — t() string wrapping pass across authenticated app client components

### Phase 13: Visual identity polish — robust favicon and app icons across all surfaces

**Goal:** Browser tabs, Apple touch surfaces, and manifest-driven install flows all resolve a single brand-consistent icon set from App Router metadata files with no duplicate asset sources or manual head tags
**Requirements**: TBD
**Depends on:** Phase 12
**Plans:** 1/2 plans executed (manual smoke approval still pending on 13-02)

Plans:
- [x] 13-01-PLAN.md — Canonical App Router icon assets + manifest wiring + public metadata routes + regression tests
- [ ] 13-02-PLAN.md — Icon smoke checklist + human verification checkpoint

### Phase 14: Auth system hardening — fix URL routing inconsistency, redirect bugs, error handling, and OAuth loading state

**Goal:** Every auth redirect in the codebase points to a URL that actually exists, all error-handling gaps are patched, and the auth flow works end-to-end with no dead-end 404s or stuck UI states
**Requirements**: none (bug-fix phase)
**Depends on:** Phase 13
**Plans:** 3/3 plans complete (completed 2026-05-01)

Plans:
- [x] 14-01-PLAN.md — Fix isPublicRoute + all /auth/* redirect and href references in production code (BUG-01, BUG-02, BUG-03)
- [x] 14-02-PLAN.md — updatePassword company check + getClaims error handling + OAuth button loading reset + proxy try/catch (BUG-04, BUG-05, BUG-06, BUG-07)
- [x] 14-03-PLAN.md — Fix all Playwright E2E tests and unit tests to use /login, /signup, /reset-password

### Phase 15: Owner Admin Panel — Customer Dashboard, SEO, LP Control, Blog, and Extended Branding

**Goal:** The SaaS owner (skale.club@gmail.com) can manage the entire platform from a single admin section: monitor registered customers, configure global SEO metadata, edit landing page content, publish blog posts, and set system-wide branding including logo, brand colors, and favicon.

**Depends on:** Phase 14

**Requirements:** ADMIN-10, ADMIN-11, ADMIN-12, ADMIN-13, ADMIN-14

**Success Criteria** (what must be TRUE):
  1. Admin can open `/admin` and see a dashboard card with total registered companies, total users, and estimates generated in the last 30 days
  2. Admin can edit global SEO fields (site title, meta description, OG image, canonical URL) at `/admin/seo` and the landing page `<head>` reflects changes on next render
  3. Admin can edit every text section of the landing page (hero headline, subheadline, CTA label, How It Works steps, features list) at `/admin/landing` and changes persist and render immediately on the public page
  4. Admin can create, edit, publish and delete blog posts at `/admin/blog`; published posts render at `/blog/[slug]` with individual SEO metadata
  5. Admin can upload a favicon (`.ico` / `.png`) at `/admin/branding`; the favicon displays in browser tabs after upload; logo and primary color fields already present are preserved and enhanced with a color picker

**Plans:** 4/5 plans executed

Plans:
- [x] 15-01-PLAN.md — DB migration + packages + platform-config extensions + zod schemas + Wave 0 test stubs
- [x] 15-02-PLAN.md — Customer dashboard at /admin + extended admin nav (7 items, exact-match fix)
- [ ] 15-03-PLAN.md — SEO editor at /admin/seo + favicon upload in /admin/branding + root generateMetadata
- [x] 15-04-PLAN.md — Landing page content editor at /admin/landing + props-driven landing sections
- [x] 15-05-PLAN.md — Blog system: admin CRUD at /admin/blog + public pages at /blog/[slug]

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
| 10. Global Brand Tokens | v1.2 | 1/1 | Complete    | 2026-04-22 |
| 11. Marketing Landing Page | v1.2 | 2/2 | Complete    | 2026-04-24 |
| 12. i18n Translation System | v1.2 | 5/5 | Complete    | 2026-04-24 |
| 13. Visual identity polish | post-v1.2 | 1/2 | Awaiting human verification | — |
| 14. Auth system hardening | post-v1.2 | 3/3 | Complete | 2026-05-01 |
| 15. Owner Admin Panel | v1.3 | 4/5 | In Progress|  |

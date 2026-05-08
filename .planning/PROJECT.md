# Xtimator

## What This Is

Xtimator is a SaaS web application for US-based service businesses (construction, landscaping, plumbing, electrical, HVAC, cleaning, painting, etc.) to create professional, AI-powered estimates and quotes. A business owner visits a job site, records an audio walkthrough, takes photos, and the AI generates a complete, professionally formatted estimate — ready to send as a branded PDF or shareable link.

The platform includes:
- **Voice-first project onboarding** — record job site audio, AI auto-transcribes and generates the estimate draft without manual navigation
- **Super-admin layer** — centralized API credential management and runtime branding/content configuration (no redeployment needed)
- **Owner admin panel** — customer dashboard, SEO, landing page CMS, blog, extended branding controls
- **Public marketing presence** — dark-mode landing page at `/` with EN/PT-BR/ES translation support

## Core Value

A business owner can go from job site audio recording to a sent, professional estimate in under 5 minutes without touching a keyboard.

## Current Milestone: v1.3 Smart Pricing

**Goal:** Empresas cadastram sua tabela de preços real e a IA usa esses preços como âncora na geração de orçamentos, com fallback automático para senso comum quando vazio ou sem match, e o editor exibe a origem de cada preço.

**Target features:**
- Price book CRUD em `/settings/price-book` — categorias livres, item + unidade + preço, entrada manual + import CSV
- Integração com pipeline da IA: price book injetado no prompt antes da geração; fallback para senso comum quando sem match
- Editor de orçamento: badge/ícone por linha indicando origem (price book ✓ vs IA ⚡)
- Price book opcional: empresas sem preenchimento continuam funcionando como antes

**Key constraints:**
- Ajuste manual de preço no editor é exceção per-cliente, não retroalimenta o price book (intencional)
- RLS por company_id — cada empresa vê e edita apenas seus próprios preços
- Import CSV cobre empresas com tabelas preexistentes

## Current State

**Version:** v1.3 Smart Pricing — IN PROGRESS (3/5 phases complete)
**Phases complete:** 21/23 | **Plans:** 62/62 (Phase 21: 3) | **Build:** passing
**Last shipped:** Phase 21 — CSV Import (2026-05-08)
**Tech stack:** Next.js 16 (App Router), TypeScript strict, Tailwind 4, shadcn/ui (New York), Supabase (Auth + DB + Storage), @react-pdf/renderer, Resend, Anthropic Claude, OpenAI Whisper, next-themes
**Test coverage:** 250+ unit tests passing, integration tests, E2E with Playwright (mobile + landing page + voice flow coverage)
**Deployment target:** Vercel

### What's Live
- **Auth:** Email/password + Google OAuth, session persistence, password reset, middleware protection
- **Onboarding:** Multi-step wizard (business info, industry, color, logo, address, defaults)
- **Dashboard:** Stats, project list, search/filter/sort, quick actions
- **Client management:** CRUD with logo upload, contact info, project association
- **Project workspace:** 5-tab workspace (Overview, Audio, Photos, Estimate, Send), activity timeline
- **Voice-first capture:** Full-screen recorder (`/projects/[id]/capture`), 10-min hard cap with color-escalating timer, SVG progress ring, multi-stage stepper (Saving → Transcribing → Analyzing → Generating), Whisper transcript reveal, auto-fire estimate generation on transcription complete
- **AI pipeline:** Claude Vision photo analysis + Claude estimate generation (tool_use), structured JSON persistence, version management, retry/manual fallback
- **Estimate editor:** Inline editing, real-time recalculation, drag reorder, discount/tax, auto-save
- **PDF:** Branded via @react-pdf/renderer — logo, colors, line items, totals, terms, page numbers
- **Share/email:** Public share link + branded share page, accept/decline, Resend email delivery
- **Settings:** Company info, logo, branding, defaults, notifications, account
- **Platform admin:** API credentials (AES-256-GCM encrypted), branding, admins management
- **Owner admin:** Customer dashboard, SEO editor, landing page CMS, blog (CRUD + public `/blog/[slug]`), favicon upload
- **Sidebar:** Paginated projects list, real-time sync on creation, empty state
- **Navigation:** Skeleton loading states, streaming Suspense, React cache() for auth/company queries
- **Landing page:** Public dark-mode marketing page — Hero (#406EF1 glow), How It Works, Features, CTA, footer
- **i18n:** EN/PT-BR/ES — LanguageContext + useTranslation(), 192-entry static dict, /api/translate (Claude Haiku + DB cache), LanguageToggle in navbar + mobile bottom-nav
- **Brand:** #406EF1 primary across all surfaces (landing, authenticated app, admin)
- **Icons:** App Router-owned favicon, SVG/PNG app icons, manifest metadata
- **Price book:** `/settings/price-book` — CRUD for company-scoped pricing (category + name + unit + unit_price + notes), search, alphabetical category grouping, AlertDialog delete confirmation, EmptyState explaining optionality. Underlying `company_price_book` table with RLS isolation per company; `estimate_items.price_source` column ready for AI anchoring (Phase 22)
- **CSV import:** "Import CSV" button in price book header + EmptyState triggers a Dialog modal — client-side papaparse parse, two-stage pick→preview with per-row error indicators, server-side dedup by (name, category), single bulk `supabase.insert()`. Downloadable 4-column template at `/price-book-template.csv`. (PB-05)

## Requirements

### Validated (v1.0)

- ✓ AUTH-01–07: Email/password sign-up, sign-in, Google OAuth, session persistence, password reset, post-signup redirect, sign-out — v1.0
- ✓ ONBOARD-01–08: Multi-step onboarding wizard (business info, industry, color, logo, address, defaults, skip option) — v1.0
- ✓ DASH-01–08: Dashboard with stats, project list, search/filter/sort, quick actions, delete confirm — v1.0
- ✓ CLIENT-01–06: Client CRUD with logo upload, contact info, project association — v1.0
- ✓ PROJ-01–08: 3-step project wizard (client selection/inline creation, details, auto-name, confirmation, workspace redirect) — v1.0
- ✓ WS-01–03: 5-tab project workspace (Overview, Audio, Photos, Estimate, Send), activity timeline, status updates — v1.0
- ✓ AUDIO-01–10: MediaRecorder with waveform, timer, live transcript preview, Whisper transcription, editable transcript, delete/re-record, multi-recording concatenation, mobile support — v1.0
- ✓ PHOTO-01–11: Multi-file upload, camera capture, drag-and-drop, compression, sortable grid, lightbox, captions, 20-photo limit — v1.0
- ✓ AI-01–10: Claude Vision photo analysis, Claude estimate generation with tool_use, structured JSON persistence, math validation, progress indicator, version management, retry/manual fallback — v1.0
- ✓ EDIT-01–12: Inline estimate editor with real-time recalculation, drag reorder, discount/tax, auto-save, version selector — v1.0
- ✓ PDF-01–03: Branded PDF via @react-pdf/renderer with logo, colors, line items, totals, terms, page numbers — v1.0
- ✓ SHARE-01–07: Public share link, branded share page, accept/decline, view logging, activity timeline, email notifications — v1.0
- ✓ EMAIL-01–06: Resend email delivery, compose form, PDF attachment option, mark-as-sent, status update — v1.0
- ✓ SET-01–06: Company info/logo/branding/defaults/notifications/account settings — v1.0
- ✓ ADMIN-01–14: Platform admin panel (super-admin gate, integrations CRUD with encrypted keys, branding config, admins management, auth dark pass, full env-var and identity decoupling) — v1.0

### Validated (v1.1)

- ✓ THEME-01–08: Dark mode default with SSR cookie hydration, 3-way user toggle (dark/light/system) persisted to `companies.theme_preference`, forced-light `/estimate/*` scope, semantic status palette, survey-style onboarding, full UI primitives + overlays redesign — v1.1

### Validated (v1.2)

- ✓ BRAND-01–03: Global brand token update — #406EF1 as `--primary`/`--platform-primary` default across entire app (landing + authenticated + admin) — v1.2
- ✓ LAND-01–05: Landing page — Hero+CTA, How It Works, Features/Benefits, dark mode, #406EF1 design system, fully responsive on iOS/Android — v1.2
- ✓ I18N-01–08: i18n system — LanguageContext (EN/PT/ES), `useTranslation()` hook, 192-entry static dictionary, `/api/translate` AI on-demand with DB cache, `LanguageToggle` in navbar + mobile bottom-nav; English-first — v1.2
- ✓ ICON-01–02: App Router-owned favicon, SVG/PNG app icons, manifest metadata, regression suite — v1.2
- ✓ AUTH-HARDEN-01–07: Auth redirect consistency, password recovery, OAuth error handling, middleware hardening, full Playwright auth coverage — v1.2
- ✓ ADMIN-EXT-01–05: Owner admin panel — customer dashboard, SEO editor, landing page CMS, blog CRUD + public pages, favicon upload, extended branding — v1.2
- ✓ PROJ-10–12: Sidebar projects panel — paginated list, active highlight, real-time sync on project creation — v1.2
- ✓ PERF-01–03: Skeleton loading states, Suspense streaming, React cache() for auth/company, HoverPrefetchLink — v1.2
- ✓ P18-01–09: Voice-first project onboarding — 1-step wizard, full-screen capture route, 10-min recording with color timer + SVG ring, multi-stage stepper, auto-estimate generation — v1.2

### Validated (v1.3 — in progress)

- ✓ Phase 19 — Price Book DB Foundation: `company_price_book` table with RLS isolation, `estimate_items.price_source` CHECK column, regenerated TypeScript types (PB-DB infrastructure prerequisite for PB-01..07, AIPRICE-03, EDITPRICE-01/02) — Phase 19, 2026-05-06
- ✓ PB-01, PB-02, PB-03, PB-04, PB-06, PB-07: Price Book CRUD UI — `/settings/price-book` route with grouped list, search, add/edit dialog (Combobox category autocomplete), delete with AlertDialog confirmation, optionality EmptyState, Settings entry-point card — Phase 20, 2026-05-07
- ✓ PB-05: CSV Import — two-stage Dialog (pick → preview), client-side parse with papaparse, server-side dedup, single bulk insert, invalid-row error indicators, downloadable template — Phase 21, 2026-05-08

### Active (v1.3)

- [ ] Production Supabase migration applied and first super-admin bootstrapped
- [ ] Vercel deployment pipeline configured and first production deploy successful
- [ ] AI estimate precision improvements (SEED-003: price book optional per company)
- [ ] Plain-text estimate output for SMS/WhatsApp/email inline (SEED-004)

### Out of Scope

- Pricing section on landing page — deferred (pricing model not yet defined)
- Client portal (clients log in) — public share link covers v1 use case
- Per-tenant language settings — app-level toggle covers this milestone
- QuickBooks integration — deferred to v2
- Offline PWA mode — deferred to v2
- Dashboard charts/analytics — deferred to v2
- Estimate templates — deferred to v2 (SEED-004 covers plain-text variant)
- Multi-user/team accounts — deferred to v2
- Per-tenant API keys — platform shared credentials via admin panel covers v1

## Context

- **Target market:** United States only. USD, US formats, US market pricing.
- **Primary use case:** Field-first — business owner on a job site on their phone.
- **AI pipeline:** Claude API (estimate generation + photo analysis) + OpenAI Whisper (audio transcription).
- **Storage:** Supabase Storage (logos, audio, photos, PDFs, platform brand assets).
- **Email:** Resend API — centralized via platform admin, no per-tenant key needed.
- **Platform admin:** AES-256-GCM encrypted API credentials in `platform_integrations`; branding in `platform_branding` singleton (id=1); super-admin gate via `platform_admins` table + proxy middleware.
- **Voice-first flow:** `/projects/new` → client select → `/projects/[id]/capture` (full-screen, escapes app shell) → Whisper → Claude → auto-redirect to estimate editor.
- **Codebase:** 54 plans shipped, 200+ commits, TypeScript strict throughout.
- **Theme system:** `next-themes` with `eb-theme` cookie SSR hydration; `[data-theme]` scoped-dark CSS-var pattern for admin/auth; `[data-theme="light"]` forced-light wrapper for public estimate view.
- **i18n:** `LanguageContext` + `useTranslation()` hook, 192-entry static `translations.ts`, `/api/translate` with Claude Haiku + DB cache (translations table, unique index on source_text+lang pair).
- **Seeds planted:** SEED-003 (price book per company, optional), SEED-004 (plain-text estimate output).

## Constraints

- **Tech Stack:** Next.js 14+ (App Router), TypeScript strict, Tailwind CSS, shadcn/ui, react-hook-form + zod
- **Database:** Supabase PostgreSQL with RLS on all tables
- **AI:** Anthropic Claude claude-sonnet-4-20250514 for estimate generation and photo analysis
- **Audio transcription:** OpenAI Whisper API (server-side)
- **PDF:** @react-pdf/renderer (server-side generation)
- **Mobile:** Audio recording and camera capture work on iOS Safari and Android Chrome
- **Security:** Service role key never exposed to browser; all AI calls server-side via API routes; API credentials encrypted at rest (AES-256-GCM)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Next.js App Router (not Pages) | Modern routing, server components, API routes co-located | ✓ Confirmed — no issues |
| Supabase for auth + DB + storage | Single vendor reduces integration complexity | ✓ Confirmed — worked well |
| Claude for estimate generation and photo analysis | Avoid mixing AI vendors; Claude Vision capable | ✓ Confirmed — tool_use pattern solid |
| Whisper for audio transcription | Best-in-class accuracy for field audio | ✓ Confirmed |
| @react-pdf/renderer for PDF | No headless browser in serverless | ✓ Confirmed — works on Vercel |
| Resend for email | Simple API, great deliverability | ✓ Confirmed |
| AES-256-GCM for API key encryption | Standard, auditable, no Vault dependency | ✓ Confirmed — 12-byte IV per call |
| Singleton platform_branding (id=1) | Null-safe loader fallback from t=0 | ✓ Confirmed — avoids null checks everywhere |
| Last-admin BEFORE DELETE trigger | Descriptive error message vs opaque constraint | ✓ Confirmed |
| server-only marker + vitest alias | Enforces server/client boundary at both build and test | ✓ Confirmed — caught real violations |
| Deny-all RLS by omission on platform tables | Platform secrets accessible only via service role | ✓ Confirmed — cleanest posture |
| YOLO execution mode | Spec was comprehensive; minimal approval gates needed | ✓ Confirmed |
| `theme_preference` nullable TEXT + CHECK constraint | Enum-like enforcement without a PG enum type; NULL = system default | ✓ Confirmed |
| `eb-theme` cookie httpOnly:false | next-themes needs document.cookie access pre-hydration for zero-FOUC | ✓ Confirmed |
| Full-screen (capture) route group | Escape app shell for voice recorder; router.push from wizard | ✓ Confirmed — clean UX break |
| Eager project draft creation at wizard step 1 | Allows redirect to /capture before user fills project details | ✓ Confirmed — drives AI auto-generate flow |
| pg_cron primary + Vercel cron fallback for orphan cleanup | Works with and without pg_cron extension enabled | ✓ Confirmed |
| React cache() for auth/company queries | Dedupes server component data fetching per request | ✓ Confirmed — eliminates redundant round-trips |
| useTranslation() hook with LanguageContext | All i18n calls consistent; server-side strings handled separately | ✓ Confirmed |
| Claude Haiku for /api/translate | Cheapest capable model for translation; cached in DB | ✓ Confirmed — cost-effective |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each milestone** (via /gsd:complete-milestone):
1. Full review of all sections
2. Core Value check
3. Audit Out of Scope
4. Update Context

---
*Last updated: 2026-05-06 — after v1.2 milestone (Phases 10-18 shipped)*

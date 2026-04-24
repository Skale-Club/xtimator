# Xtimator

## What This Is

Xtimator is a SaaS web application for US-based service businesses (construction, landscaping, plumbing, electrical, HVAC, cleaning, painting, etc.) to create professional, AI-powered estimates and quotes. A business owner visits a job site, records an audio walkthrough, takes photos, and the AI generates a complete, professionally formatted estimate ready to send as a branded PDF or shareable link.

The platform includes a super-admin layer for centralized API credential management and runtime branding configuration, enabling the platform owner to manage integrations (Resend, Anthropic, OpenAI) and global identity (app name, logo, primary color) from a UI without code changes or redeployment.

## Core Value

A business owner can go from job site audio recording to a sent, professional estimate in under 5 minutes without touching a keyboard.

## Current Milestone: v1.2 Brand Identity & Global Reach

**Goal:** Establish Xtimator's public presence with a branded dark-mode marketing landing page using #406EF1 design system applied globally, and enable the app for BR/LATAM markets with a full EN/PT-BR/ES translation system (English-first).

**Target features:**
- Landing page (Hero+CTA, How It Works, Features/Benefits) — dark mode, #406EF1 primary, modern design using vercel-labs + ui-ux-pro-max skills
- Global brand token update — #406EF1 as `--primary` / `--platform-primary` default across landing, authenticated app, and admin panel
- i18n system — `useTranslation()` hook, `LanguageContext` (EN/PT/ES), `/api/translate` AI on-demand with DB cache, static `translations.ts` dictionary
- Language toggle (EN/PT/ES) in navbar with localStorage persistence

**Key constraints:**
- English-first: all UI built and tested in English; PT-BR and ES are layered on top
- Landing page must use design skills: `skills.sh/vercel-labs/agent-skills/web-design-guidelines` + `skills.sh/nextlevelbuilder/ui-ux-pro-max-skill/ui-ux-pro-max`
- i18n architecture pre-designed (SEED-001) — implement exactly as specified

## Current State

**Version:** v1.2 Brand Identity & Global Reach — in progress (Phase 11 complete 2026-04-24)
**Phases complete:** 11/12 | **Plans:** 42/42 | **Build:** passing
**Tech stack:** Next.js 16 (App Router), TypeScript strict, Tailwind 4, shadcn/ui (New York), Supabase (Auth + DB + Storage), React PDF, Resend, Anthropic Claude, OpenAI Whisper, next-themes
**Test coverage:** 218 unit tests passing, integration tests, E2E with Playwright (mobile + landing page coverage added Phase 11)
**Deployment target:** Vercel
**Theme system:** Dark mode default, user-persisted toggle (dark/light/system), SSR cookie hydration, forced-light `/estimate/*` scope
**Landing page:** Public dark-mode marketing page at `/` — Hero (#406EF1 glow), How It Works, Features, CTA band, footer

## Requirements

### Validated (v1.0 + v1.1)

- v AUTH-01–07: Email/password sign-up, sign-in, Google OAuth, session persistence, password reset, post-signup redirect, sign-out — v1.0
- v ONBOARD-01–08: Multi-step onboarding wizard (business info, industry, color, logo, address, defaults, skip option) — v1.0
- v DASH-01–08: Dashboard with stats, project list, search/filter/sort, quick actions, delete confirm — v1.0
- v CLIENT-01–06: Client CRUD with logo upload, contact info, project association — v1.0
- v PROJ-01–08: 3-step project wizard (client selection/inline creation, details, auto-name, confirmation, workspace redirect) — v1.0
- v WS-01–03: 5-tab project workspace (Overview, Audio, Photos, Estimate, Send), activity timeline, status updates — v1.0
- v AUDIO-01–10: MediaRecorder with waveform, timer, live transcript preview, Whisper transcription, editable transcript, delete/re-record, multi-recording concatenation, mobile support — v1.0
- v PHOTO-01–11: Multi-file upload, camera capture, drag-and-drop, compression, sortable grid, lightbox, captions, 20-photo limit — v1.0
- v AI-01–10: Claude Vision photo analysis, Claude estimate generation with tool_use, structured JSON persistence, math validation, progress indicator, version management, retry/manual fallback — v1.0
- v EDIT-01–12: Inline estimate editor with real-time recalculation, drag reorder, discount/tax, auto-save, version selector — v1.0
- v PDF-01–03: Branded PDF via @react-pdf/renderer with logo, colors, line items, totals, terms, page numbers — v1.0
- v SHARE-01–07: Public share link, branded share page, accept/decline, view logging, activity timeline, email notifications — v1.0
- v EMAIL-01–06: Resend email delivery, compose form, PDF attachment option, mark-as-sent, status update — v1.0
- v SET-01–06: Company info/logo/branding/defaults/notifications/account settings — v1.0
- v ADMIN-01–14: Platform admin panel (super-admin gate, integrations CRUD with encrypted keys, branding config, admins management, auth dark pass, full env-var and identity decoupling) — v1.0
- v THEME-01–08: Dark mode default with SSR cookie hydration, 3-way user toggle (dark/light/system) persisted to `companies.theme_preference`, forced-light `/estimate/*` scope, semantic status palette, survey-style onboarding, full UI primitives + overlays redesign on shared design-token vocabulary — v1.1

### Active (v1.2)

- [x] LAND-01–05: Landing page — Hero+CTA, How It Works, Features/Benefits, dark mode, #406EF1 design system, responsive — Validated in Phase 11: Marketing Landing Page
- [x] BRAND-01–03: Global brand token update — #406EF1 as `--primary`/`--platform-primary` default across entire app (landing + authenticated + admin) — Validated in Phase 10: Global Brand Tokens
- [ ] I18N-01–10: i18n system — LanguageContext (EN/PT/ES), `useTranslation()` hook, static dictionary, `/api/translate` AI on-demand with DB cache, language toggle in navbar; English-first
- [ ] Production Supabase migration applied and first super-admin bootstrapped
- [ ] Vercel deployment pipeline configured and first production deploy successful

### Out of Scope

- Pricing section on landing page — deferred (pricing model not yet defined)
- Client portal (clients log in) — public share link covers v1 use case
- Per-tenant language settings — app-level toggle covers this milestone
- QuickBooks integration — deferred to v2
- Offline PWA mode — deferred to v2
- Dashboard charts/analytics — deferred to v2
- Estimate templates — deferred to v2
- Multi-user/team accounts — deferred to v2
- Per-tenant API keys — platform shared credentials via admin panel covers v1

## Context

- **Target market:** United States only. USD, US formats, US market pricing.
- **Primary use case:** Field-first — business owner on a job site on their phone.
- **AI pipeline:** Claude API (estimate generation + photo analysis) + OpenAI Whisper (audio transcription).
- **Storage:** Supabase Storage (logos, audio, photos, PDFs, platform brand assets).
- **Email:** Resend API — centralized via platform admin, no per-tenant key needed.
- **Platform admin:** AES-256-GCM encrypted API credentials in  table; branding in  singleton (id=1); super-admin gate via  table + proxy middleware.
- **Deployment:** Vercel. ENV vars: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, APP_ENCRYPTION_KEY, DATABASE_URL.
- **Codebase:** 40 plans shipped, 190+ commits, TypeScript strict throughout.
- **Theme system:** `next-themes` with `eb-theme` cookie SSR hydration; `[data-theme]` scoped-dark CSS-var pattern for admin/auth; `[data-theme="light"]` forced-light wrapper for public estimate view.

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
| Next.js App Router (not Pages) | Modern routing, server components, API routes co-located | Confirmed — no issues |
| Supabase for auth + DB + storage | Single vendor reduces integration complexity | Confirmed — worked well |
| Claude for estimate generation and photo analysis | Avoid mixing AI vendors; Claude Vision capable | Confirmed — tool_use pattern solid |
| Whisper for audio transcription | Best-in-class accuracy for field audio | Confirmed |
| @react-pdf/renderer for PDF | No headless browser in serverless | Confirmed — works on Vercel |
| Resend for email | Simple API, great deliverability | Confirmed |
| AES-256-GCM for API key encryption | Standard, auditable, no Vault dependency | Confirmed — 12-byte IV per call |
| Singleton platform_branding (id=1) | Null-safe loader fallback from t=0 | Confirmed — avoids null checks everywhere |
| Last-admin BEFORE DELETE trigger | Descriptive error message vs opaque constraint | Confirmed |
| server-only marker + vitest alias | Enforces server/client boundary at both build and test | Confirmed — caught real violations |
| Deny-all RLS by omission on platform tables | Platform secrets accessible only via service role | Confirmed — cleanest posture |
| YOLO execution mode | Spec was comprehensive; minimal approval gates needed | Confirmed |
| `theme_preference` nullable TEXT + CHECK constraint on companies | Enum-like enforcement without a PG enum type; NULL = system default | Confirmed |
| `eb-theme` cookie httpOnly:false | next-themes needs document.cookie access pre-hydration for zero-FOUC | Confirmed |
| Cookie written after DB update | Prevents cookie/DB desync on partial failure | Confirmed |
| Primitives consume Plan-06 tokens via Tailwind arbitrary-value syntax | Avoids dark:* variants that don't fire inside [data-theme] scopes | Confirmed |
| `useSurveyState` hook pattern for survey onboarding | Decouples step navigation from form logic; submission contract unchanged | Confirmed |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each milestone** (via /gsd:complete-milestone):
1. Full review of all sections
2. Core Value check
3. Audit Out of Scope
4. Update Context

---
*Last updated: 2026-04-24 — Phase 11 complete (Marketing Landing Page)*

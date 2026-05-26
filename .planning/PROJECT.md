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

## Last Milestone: v3.1 Production Go-Live (rescoped) ✅ (shipped 2026-05-15)

Phase 61 only — production database foundation. Built cross-platform RLS audit infrastructure (`supabase/audits/`), recovered 9 missing migrations (entire v3.0 monetization schema was on disk but never applied to DB!), wrote production bootstrap runbook (`supabase/PROD-BOOTSTRAP.md`). Phases 62-65 (Vercel deploy + Stripe live + monitoring + UAT) **deferred to v3.2** — Vercel Free Hobby plan blocks commercial SaaS use AND has 10s function timeout that breaks AI routes. Tracked in **SEED-018: Production Hosting + Deployment**.

## Last Milestone: v3.0 Monetization ✅ (shipped 2026-05-14)

Complete subscription system: Free/Trial/Pro/Business tiers, `usage_events` tracking, `checkQuota`/`recordUsage` enforcement across all AI routes and WhatsApp handler, Stripe checkout + portal + webhook lifecycle, `/settings/billing` UI with trial banner and 402 upgrade modal, hourly trial expiry cron + T-3/T-0 warning emails, admin force-tier + bonus credits + MRR view. 6 phases, 24/24 requirements satisfied.

## Last Milestone: v4.0 Multi-Tenancy ✅ (shipped 2026-05-26)

Multi-company foundation, Switcher UI, full RLS rewrite (46 policies / 13 tables), server-action sweep (11 files codemodded), billing per-company (already per-company at the data layer), and multi-company access on the `companies` table via OR-extended RLS. A user can now own and operate multiple companies end-to-end via the Switcher UI, with correct tenant scoping at the DB layer, the action layer, and the UI layer. DROP COLUMN `companies.user_id` deferred to v5+ cleanup. Full archive: [.planning/milestones/v4.0-ROADMAP.md](milestones/v4.0-ROADMAP.md). 6 phases (79, 80, 81, 82, 83, 84, 85), 16 plans, 11 new test files, 98/98 tests green, 4 prod migrations applied.

## Next Milestone

Run `/gsd:new-milestone` to define the next cycle. Candidates surfaced during v4.0 work:
- **v4.1 Inngest self-hosted on Hetzner** — placeholder phase 999.1 in current roadmap; aligned with SEED-018 (production hosting).
- **v4.2 Cleanup of `companies.user_id`** — picks up where Phase 85 stopped; depends on refactoring auth.ts redirect, company.ts mode:'first', and inngest transcribe-audio attribution off the legacy column.
- **v5.0 Admin/Member roles + invites** — opens `company_members.role` to non-owner tiers; needs a full product pass on permissions matrix.
- **MCP Server (SEED-030 trigger)** — locked decisions captured in `.planning/seeds/SEED-030-mcp-server-xtimator.md`; activates once the core estimates pipeline is end-to-end stable in production.

## Archived Milestone Context: v4.0 Multi-Tenancy (Multiple Companies per User)

**Goal:** A single user can own and switch between multiple companies; every tenant-scoped surface (projects, clients, estimates, price book, integrations, billing, notifications) is gated by the active company instead of `auth.uid()`.

**Target features:**
- **Schema:** `company_members(user_id, company_id, role)` join table + idempotent migration that backfills 1 owner membership per existing `companies.user_id`
- **Active company tracking:** session cookie holds `active_company_id`; server actions derive company from cookie, not from the authenticated user
- **Switcher UI:** topbar dropdown lists all companies the user belongs to, marks active, switches via server action (set cookie + revalidate)
- **"Add company" flow:** dropdown's Add company entry-point invokes onboarding in "create new" mode (no longer overwrites existing company)
- **RLS rewrite:** every tenant-scoped table (projects, clients, estimates, estimate_items, estimate_templates, company_price_book, integrations, notifications, custom_domains, whatsapp_settings, etc.) gates by membership of the active company instead of `user_id`
- **Billing per-company:** `tier`, `tier_trial_ends_at`, Stripe customer id, usage_events all move to per-company semantics; trial clock starts on company creation, not user signup
- **Server-action sweep:** ~20 server actions in `lib/actions/*.ts` rewritten to derive company id from the active session

**Locked decisions:**
- **Roles:** Owner only for this milestone (no Admin/Member tier)
- **Invites/teams:** explicitly out of scope (future milestone) — one user can own multiple companies, but a company has exactly one user
- **Stripe Connect:** stays per-company (already aligned)
- **Backwards compat:** zero re-onboarding — migration auto-creates 1 owner membership per existing company

**Progress (2026-05-26):**
- ✅ **Phase 79: Foundation (schema + cookie + active company resolution)** — shipped 2026-05-25. `company_members(user_id, company_id, role)` table live in prod (3 owners backfilled), RLS enabled; `getActiveCompanyId` / `getActiveCompany` helpers; `createOrUpdateCompany(mode: 'first' | 'add')`; `app/(app)/layout.tsx` switched to active-company resolvers. No UI in this phase by design. 4/4 plans, 15 commits, 38/38 tests green.
- ✅ **Phase 81: Company Switcher UI + Add Company flow** — shipped 2026-05-26. `getMembershipCompanies()` query, `switchActiveCompany()` server action with discriminated-union return, CompanySelector wired with `useTransition` and mounted in BOTH sidebar render trees (collapsed + expanded), onboarding `?mode=add` threading end-to-end (page → survey → `createOrUpdateCompany`). 4/4 plans, 13 commits, 31/31 Phase 81 tests green. Mobile switcher deferred (SWITCH-15).
- ✅ **Phase 82: RLS rewrite** — shipped 2026-05-26. 46 tenant-scoped policies across 13 tables (clients/projects/estimates/estimate_items/estimate_sections/estimate_activity/recordings/photos/company_price_book/price_book_folders/price_book_imports/estimate_deliveries/estimate_signatures/tour_events) now gate by `company_members` membership. In-migration DO $$ assertion. Static-contract test 6/6 green.
- ✅ **Phase 83: Server-action sweep** — shipped 2026-05-26. 11 server-action files codemodded to derive company via `getActiveCompanyId()` + `.eq('id', activeCompanyId)`. 3 files allowlisted (auth.ts redirect, company.ts mode:'first', active-company.ts internal). Static-contract test 24/24 green.
- ✅ **Phase 84: Billing per-company** — closed as already-shipped-by-prior-work. All billing columns live on `companies` (Phase 55+58+70), `usage_events` keyed by `company_id` (Phase 56), `/settings/billing` scopes via `getActiveCompany()` post Phase 79. No code change needed.
- ✅ **Phase 85: Multi-company access on companies** — shipped 2026-05-26. `companies_*` RLS extended with OR-clause for `company_members` membership; `mode:'add'` now sets `user_id: claims.sub` (latent bug fix). DROP COLUMN deferred to v5+ — chain of legacy readers (auth.ts, company.ts mode:'first', inngest transcribe attribution) keeps the column alive for backwards compat.

**v4.0 status:** All target features either shipped or correctly scoped out. Foundation (79), Switcher UI (81), RLS rewrite (82), server-action sweep (83), billing per-company (84 — pre-shipped), multi-company access on companies (85). A user can now own and operate multiple companies end-to-end via the Switcher UI, with correct tenant scoping at the DB layer, the action layer, and the UI layer.

**Out of scope (captured for future milestones):**
- Inviting other users to existing companies
- Role-based permissions (Admin vs Member)
- Cross-company analytics in admin panel
- Per-user "default company" preference (cookie is sufficient for v4.0)

## Previous Milestone (in progress): v3.1.1 Quality & Polish + Hetzner Readiness

**Goal:** Validate the entire app stack against the recovered DB schema (v3.0 monetization was never functionally tested before Phase 61), fix any bugs that surface, and ship the deploy artifacts (Dockerfile + `/api/health` + runbook) needed to make the future Hetzner Cloud migration mechanical instead of exploratory.

**Target features:**
- **UAT v2.2** — manual exercise of PDF attachment delivery + WhatsApp status flow against localhost
- **UAT v3.0** — manual exercise of tier enforcement, Stripe checkout (test mode), billing UI, trial banner, 402 upgrade modal, trial expiry cron, admin force-tier
- **End-to-end smoke** — signup → onboarding → audio capture → AI estimate → share link
- **Bug triage** — every bug found gets fixed (critical) or documented in `.planning/known-issues.md` (non-critical)
- **Hetzner readiness** — `Dockerfile` + `/api/health` endpoint + `HETZNER-DEPLOY.md` runbook so v3.2 (deploy) is mostly mechanical

**Hosting decision (locked for v3.2):** Hetzner Cloud VPS (CX22/CX32, ~€4-7/mo). Coolify or Docker + Caddy for the Next.js host + cron + reverse proxy. Supabase stays managed (no DB migration needed). See **SEED-018**.

**Last shipped:** Phase 70 — Stripe Connect Customer Payments (2026-05-17)

### What Phase 70 Adds (opt-in only — zero impact on companies that don't connect)
- **Settings → Payments** sub-page with one-click "Connect Stripe Account" (OAuth Standard) + Disconnect
- **"Pay $X" button** on shared estimates when company has Stripe connected (and estimate is unpaid)
- **Stripe Checkout** on the business's connected account (direct charges, 0% application fee, funds settle to business's Stripe balance)
- **Webhook auto-marks** estimates as paid (`payment_status`, `paid_at`, `payment_amount_cents`) on `checkout.session.completed` from connected accounts
- **Branded emails** via Resend: business owner receives "You received $X" notification, customer receives "Payment confirmation" receipt
- **Success/cancel banners** on share page after Stripe redirect; "Paid" badge on dashboard estimate list
- **Admin gate**: platform owner adds `stripe_connect_client_id` via `/admin/integrations`; without it, feature degrades gracefully to "contact support" message
- **Setup runbook**: `docs/STRIPE-CONNECT-OWNER-SETUP.md` (8 sections, 184 lines) for the manual Stripe Dashboard configuration the owner does once

## Current State

**Version:** v2.1 WhatsApp Launch-Readiness — ✅ COMPLETE
**Phases complete:** 52/52 | **Build:** passing | **Tests:** 170/170 passing across all v2.1 suites
**Last shipped:** Phase 54 — WhatsApp Status Flow (2026-05-13)
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
- **Price book:** `/settings/price-book` — CRUD for company-scoped pricing (category + name + unit + unit_price + notes), search, alphabetical category grouping, AlertDialog delete confirmation, EmptyState explaining optionality. Underlying `company_price_book` table with RLS isolation per company.
- **CSV import:** "Import CSV" button in price book header + EmptyState triggers a Dialog modal — client-side papaparse parse, two-stage pick→preview with per-row error indicators, server-side dedup by (name, category), single bulk `supabase.insert()`. Downloadable 4-column template at `/price-book-template.csv`. (PB-05)
- **Multi-provider AI + price anchoring:** `lib/ai/` abstraction layer (`AIProvider` interface + `AnthropicAdapter` + `GeminiAdapter` with `gemini-2.5-flash`). `getAIProvider()` reads active provider from `platform_integrations` (zero env vars). Price book injected as system prompt context; `price_source` tagged per line item and persisted to `estimate_items`. Admin panel: Gemini key card + live provider switch.
- **Estimate editor price badges:** "Price book" (`CheckCircle2`, secondary variant) and "AI estimate" (`Zap`, outline) badges per line item. "Edited" badge on manual unit_price override; `price_source = null` on save. Null-safe for pre-v1.3 estimates.

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

### Validated (v1.4)

- ✓ BULKPRICE-01, BULKPRICE-02, BULKPRICE-03: Bulk Price Adjustment — `bulkAdjustSchema` (z.coerce.number, -100 to +500), `bulkAdjustPriceBookCategory` server action (`.upsert()` atomicity, per-item computed prices), `BulkAdjustDialog` (live useMemo preview, green/red color coding), "Adjust %" button on each category header (unfiltered items guard) — Phase 26, 2026-05-08
- ✓ PLAINTEXT-01, PLAINTEXT-02, PLAINTEXT-04: Plain Text Tab + Copy UI — `buildItemsBreakdown()` pure utility, `PlainTextCard` component in Send tab (editable textarea, clipboard copy + toast, RotateCcw reset), full data chain wired through workspace (owner_name + 4 template columns from company), `key={estimate.id}` version-change guard — Phase 25, 2026-05-08
- ✓ PLAINTEXT-03, PLAINTEXT-05: Estimate Template Engine — 4 nullable TEXT columns on `companies` (`estimate_template_greeting/opener/closer/signature`), `resolveTemplate()` pure utility with `TEMPLATE_DEFAULTS` fallback, zod schema, `getEstimateTemplateSettings()` query, `saveEstimateTemplate` server action (empty→null coercion), `EstimateTemplateForm` (4 textareas + variable docs + live preview), `/settings/estimate-templates` sub-route page, Estimate Templates card on `/settings` — Phase 24, 2026-05-08

### Validated (v1.3)

- ✓ Phase 19 — Price Book DB Foundation: `company_price_book` table with RLS isolation, `estimate_items.price_source` CHECK column, regenerated TypeScript types (PB-DB infrastructure prerequisite for PB-01..07, AIPRICE-03, EDITPRICE-01/02) — Phase 19, 2026-05-06
- ✓ PB-01, PB-02, PB-03, PB-04, PB-06, PB-07: Price Book CRUD UI — `/settings/price-book` route with grouped list, search, add/edit dialog (Combobox category autocomplete), delete with AlertDialog confirmation, optionality EmptyState, Settings entry-point card — Phase 20, 2026-05-07
- ✓ PB-05: CSV Import — two-stage Dialog (pick → preview), client-side parse with papaparse, server-side dedup, single bulk insert, invalid-row error indicators, downloadable template — Phase 21, 2026-05-08
- ✓ AIPRICE-01/02/03: AI Price Anchoring — multi-provider layer (Claude + Gemini), price book injected as prompt context, price_source tagged + persisted, fallback to market rates when empty, admin provider selector — Phase 22, 2026-05-08
- ✓ EDITPRICE-01/02: Estimate Editor Price Badges — "Price book" (CheckCircle2, secondary) + "AI estimate" (Zap, outline) badges per line item; "Edited" badge on manual override; price_source=null on save; null-safe for pre-v1.3 estimates — Phase 23, 2026-05-08

### Validated (v3.0)

- ✓ TIER-01..04: Subscription schema (6 companies columns + usage_events table) + lib/entitlements.ts (Free/Trial/Pro/Business, number|null limits) + 14-day trial on signup — Phases 55-56, 2026-05-13
- ✓ QUOTA-01..06: checkQuota + recordUsage with idempotency; enforced in generate-estimate, analyze-photos, WhatsApp handler; HTTP 402 on quota exceeded — Phases 56-57, 2026-05-14
- ✓ STRIPE-01..04: Checkout session + Customer Portal + webhook handler (4 lifecycle events, idempotent via processed_stripe_events) — Phase 58, 2026-05-14
- ✓ BILLING-01..05: /settings/billing page (plan card + usage meters + upgrade CTA) + trial banner (<3 days) + 402 upgrade toast — Phase 59, 2026-05-14
- ✓ TRIAL-01..02: Hourly cron trial expiry + daily T-3/T-0 Resend warning emails — Phase 60, 2026-05-14
- ✓ ADMIN-BILLING-01..03: Admin force-tier + bonus credits + MRR view at /admin/billing — Phase 60, 2026-05-14

### Pending (production infra)

- [ ] Production Supabase migrations applied (all phases 19–60)
- [ ] Stripe products + price IDs configured in Stripe Dashboard (STRIPE_PRO_PRICE_ID, STRIPE_BUSINESS_PRICE_ID env vars)
- [ ] Stripe webhook endpoint registered and STRIPE_WEBHOOK_SECRET set
- [ ] First super-admin bootstrapped in production
- [ ] Vercel deployment pipeline configured and first production deploy successful

### Out of Scope

- Pricing section on landing page — deferred (pricing model not yet defined)
- Client portal (clients log in) — public share link covers v1 use case
- Per-tenant language settings — app-level toggle covers this milestone
- QuickBooks integration — deferred to v2
- Offline PWA mode — deferred to v2
- Dashboard charts/analytics — deferred to v2
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
- **Seeds harvested:** SEED-001 (i18n → v1.2), SEED-002 (brand identity → v1.2), SEED-003 (price book → v1.3), SEED-004 (plain-text estimate → v1.4), SEED-005 (multi-modal input → v1.5/v1.6), SEED-006 (iterative refinement → v1.8), SEED-007 (frictionless client → v1.5/v1.7), SEED-008 (WhatsApp → v2.0), SEED-009 (custom domain → v1.9), SEED-010 (debounce → v2.1), SEED-011 (WhatsApp polish → v2.1), SEED-012 (Redis rate limiting → v2.1), SEED-013 (monetization → v3.0), SEED-014 (error handling → v2.1), SEED-016 (per-estimate language → v2.1).
- **Seeds cancelled:** SEED-015 (WhatsApp channel completeness — all gaps harvested across v2.1/v2.2; provider abstraction gap dropped as unnecessary).
- **Seeds dormant:** none — all 16 seeds resolved.

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
*Last updated: 2026-05-20 — v4.0 Multi-Tenancy milestone started (v3.1.1 still in progress)*

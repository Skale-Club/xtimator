# Roadmap: Xtimator

## Milestones

- ✅ **v1.0 MVP** — Phases 1-8 (shipped 2026-04-21) · [archive](milestones/v1.0-ROADMAP.md)
- ✅ **v1.1 Dark-first UX & Modern Redesign** — Phase 9 (shipped 2026-04-22) · [archive](milestones/v1.1-ROADMAP.md)
- ✅ **v1.2 Brand Identity & Global Reach** — Phases 10-18 (shipped 2026-05-06) · [archive](milestones/v1.2-ROADMAP.md)
- ✅ **v1.3 Smart Pricing** — Phases 19-23 (shipped 2026-05-08) · [archive](milestones/v1.3-ROADMAP.md)
- ✅ **v1.4 Estimate Plain Text & Pricing Tools** — Phases 24-26 (shipped 2026-05-08) · [archive](milestones/v1.4-ROADMAP.md)
- ✅ **v1.5 Zero-friction Project Onboarding** — Phases 27-30 (shipped 2026-05-09)
- ✅ **v1.6 Multi-modal Project Input** — Phases 31-33 (shipped 2026-05-09)
- ✅ **v1.7 Client-Project Quick Actions** — Phase 34 (shipped 2026-05-09)
- ✅ **v1.8 Iterative Estimate Refinement** — Phases 35-37 (shipped 2026-05-09)
- ✅ **v1.9 Custom Domain Support** — Phases 38-39 (shipped 2026-05-10)
- ✅ **v2.0 WhatsApp Estimate Channel** — Phases 40-45 (shipped 2026-05-10)
- ✅ **v2.1 WhatsApp Launch-Readiness** — Phases 46-52 (shipped 2026-05-11)
- ✅ **v2.2 WhatsApp Channel Polish** — Phases 53-54 (shipped 2026-05-13)
- ✅ **v3.0 Monetization** — Phases 55-60 (shipped 2026-05-14) · [archive](milestones/v3.0-ROADMAP.md)
- 🚧 **v3.1 Production Go-Live** — Phases 61-65 (started 2026-05-15)

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

<details>
<summary>✅ v1.2 Brand Identity & Global Reach (Phases 10-18) — SHIPPED 2026-05-06</summary>

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 10 | Global Brand Tokens | 1/1 | 2026-04-22 |
| 11 | Marketing Landing Page | 2/2 | 2026-04-24 |
| 12 | i18n Translation System | 5/5 | 2026-04-24 |
| 13 | Visual Identity Polish (favicon + app icons) | 2/2 | 2026-05-05 |
| 14 | Auth System Hardening | 3/3 | 2026-05-01 |
| 15 | Owner Admin Panel | 5/5 | 2026-05-03 |
| 16 | Sidebar Projects Panel | 3/3 | 2026-05-03 |
| 17 | Navigation Performance | 3/3 | 2026-05-05 |
| 18 | Voice-First Project Onboarding | 3/3 | 2026-05-05 |

</details>

<details>
<summary>✅ v1.3 Smart Pricing (Phases 19-23) — SHIPPED 2026-05-08</summary>

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 19 | Price Book DB Foundation | 2/2 | 2026-05-07 |
| 20 | Price Book CRUD UI | 3/3 | 2026-05-07 |
| 21 | CSV Import | 3/3 | 2026-05-08 |
| 22 | AI Price Anchoring | 3/3 | 2026-05-08 |
| 23 | Estimate Editor Price Badges | 2/2 | 2026-05-08 |

</details>

<details>
<summary>✅ v1.4 Estimate Plain Text & Pricing Tools (Phases 24-26) — SHIPPED 2026-05-08</summary>

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 24 | Estimate Template Engine + Settings Page | 3/3 | 2026-05-08 |
| 25 | Plain Text Tab + Copy UI | 2/2 | 2026-05-08 |
| 26 | Bulk Price Adjustment | 2/2 | 2026-05-08 |

</details>

### v1.5 Zero-friction Project Onboarding (Phases 27-30)

- [x] **Phase 27: Capture Schema Migration** — Make `recordings.storage_path` nullable and `projects.client_id` optional so text-path and client-optional flows are unblocked (completed 2026-05-08)
- [x] **Phase 28: Unified Capture Screen** - Redesign the capture screen with audio, text description, and photo upload as co-equal inputs; enable Generate Estimate from any combination (completed 2026-05-09)
- [x] **Phase 29: Frictionless Project Creation & Client Linking** — Remove mandatory client step from project wizard; add New Project button on client detail page; show Link Client card in project Overview when no client is set
 (completed 2026-05-09)
- [x] **Phase 30: AI Client Extraction** — After estimate generation, surface a non-blocking toast when AI detects a client name in content, letting the user accept or dismiss the suggested link
 (completed 2026-05-09)

### v1.6 Multi-modal Project Input (Phases 31-33)

- [x] **Phase 31: Wizard Modality Selection** — Add second step to project wizard with 3 modality choice cards (Audio/Text/Photos); redirect to appropriate route based on selection; store input_mode on project (1 plan) (completed 2026-05-09)
- [ ] **Phase 32: Text Input Route** — New `/projects/[id]/describe` route with large textarea; save text as transcript; "Generate Estimate" button triggers same pipeline as audio (1 plan)
  - [x] 32-01-PLAN.md — Route shell + TextDescribe component + generate pipeline wiring
- [ ] **Phase 33: Photos Input Route** — New `/projects/[id]/photos-input` route with direct upload; "Generate from Photos" button prominent when photos added; Claude Vision pipeline
  - [x] 33-01-PLAN.md — Route shell + PhotosInput component + generate pipeline wiring

### v1.9 Custom Domain Support (Phases 38-39)

- [x] **Phase 38: Custom Domain DB + Settings UI** — Add `custom_domain` column to companies table; add domain input field + DNS/CNAME setup instructions to settings page; companies without a domain configured are unaffected (completed 2026-05-10)
- [x] **Phase 39: Subdomain Routing + White-label Estimate View** — Detect custom host in `proxy.ts`; rewrite requests to `/estimate/{token}` without redirect; hide "Generated by Xtimator" footer when estimate is served from a custom domain (completed 2026-05-10)

### v2.0 WhatsApp Estimate Channel (Phases 40-45)

- [x] **Phase 40: Webhook Infrastructure** — DB tables (`company_whatsapp`, `whatsapp_sessions`, deduplication), `WhatsAppProvider` interface + `MetaAdapter` skeleton, `POST /api/webhooks/whatsapp` with HMAC-SHA256, `GET` hub.challenge verification, proxy.ts bypass, admin panel Meta token card (completed 2026-05-10)
- [ ] **Phase 41: Generate-Estimate Service Extraction** — Extract business logic from `app/api/generate-estimate/route.ts` into `lib/services/generate-estimate.ts` callable with `(companyId, projectId)` — no auth context required; API route becomes a thin wrapper; enables webhook handler to invoke the pipeline directly
- [ ] **Phase 42: Inbound Processing** — `lib/whatsapp/handler.ts` state machine (awaiting_input state); audio messages → Whisper → estimate; text messages → transcript → estimate; photo messages → Claude Vision → estimate; sends confirmation summary to owner; session created and transitioned to awaiting_confirm
- [ ] **Phase 43: Confirmation Flow** — `awaiting_confirm` state machine — "send" / "cancel" command parsing; session expiry at 30 minutes with expiry notification; `pg_cron` or Vercel cron cleanup; `lib/whatsapp/formatter.ts` confirmation message builder
- [ ] **Phase 44: Outbound Client Delivery** — Deliver estimate to client as share link (default) or formatted text per `company_whatsapp.delivery_format`; update estimate + project status to "sent"; confirm delivery to owner via WhatsApp
- [ ] **Phase 45: Settings UI + Admin Token** — `/settings/integrations` page with WhatsApp Connect Card (connect / verify OTP / disconnect / delivery format selector); Settings entry card; admin panel Meta access token card; `POST /api/settings/whatsapp` connect/verify/delete routes

### v2.1 WhatsApp Launch-Readiness (Phases 46-52) — ✅ SHIPPED 2026-05-11

- [x] **Phase 46: Typed Error Handling Foundation** — `lib/errors/` with `XtimatorError` class, type+surface composite codes, `asResponse()` wrapper, WhatsApp adapter (`handleWhatsAppError`), `throwIf*` helpers; foundation for all other v2.1 phases (SEED-014 harvested)
- [x] **Phase 47: Redis + Rate Limiting Infrastructure** — Upstash Redis client in `lib/redis.ts`; `lib/ratelimit.ts` with `rateLimit(limitName, identifier)`; applied to generate-estimate, webhooks/whatsapp, analyze-photos, translate (SEED-012 harvested)
- [x] **Phase 48: WhatsApp Multi-Message Debounce** — Redis-backed buffer per phone_number; PUSH on inbound, 5s silence wait, GET+process all together; new `processInboundMessages()` accepts array; generate ONE estimate from aggregated input (SEED-010 harvested)
- [x] **Phase 49: WhatsApp Typing + Read Receipts** — `markMessageAsRead()` + `sendTypingIndicator()` in `lib/whatsapp/client.ts`; called after dedup pass and before heavy processing; re-send typing before 25s timeout (SEED-011 harvested)
- [x] **Phase 50: WhatsApp OTP Number Verification** — Two-step setup flow: submit credentials → status=pending → 6-digit code via WhatsApp → verify → status=active; schema columns (verification_code, attempts, expires); UI second step in `WhatsAppConnectCard` (SEED-015 Gap 2 harvested)
- [x] **Phase 51: WhatsApp Pre-Send Edit Commands** — Structured parser for `edit total/timeline/payment/summary`, `client`, `regenerate` commands; mutations on estimate; re-send updated summary; session stays in awaiting_confirm. Section/item-level edits deferred (SEED-015 Gap 1 partial)
- [x] **Phase 52: Per-Estimate Language Selection** — `language` column on estimates (default 'en'), `preferred_language` on clients, `default_estimate_language` on companies; cascade resolver; AI prompt parameterized; WhatsApp formatter localized; auto-learn client preference after send (SEED-016 backend harvested)

### v2.2 WhatsApp Channel Polish (Phases 53-54)

- [x] **Phase 53: PDF Attachment Delivery** — Add `pdf_attachment` as a third `delivery_format` option; generate PDF via existing `/api/estimates/[id]/pdf` endpoint; upload to `estimates-pdf` Supabase Storage with 24h signed URL; send to client via Meta API `type: "document"`; degrade to `share_link` on any failure (SEED-015 Gap 3) (completed 2026-05-11)
- [x] **Phase 54: WhatsApp Status Flow** — Wire full `pending → verified → active → suspended` pipeline post-OTP; clear UI labels in `WhatsAppConnectCard`; admin/owner suspend and reactivate action; `handler.ts` gate enforces `status = 'active'` (SEED-015 Gap 5) (completed 2026-05-13)

<details>
<summary>✅ v3.0 Monetization (Phases 55-60) — SHIPPED 2026-05-14</summary>

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 55 | Schema + Tier Definitions | 2/2 | 2026-05-13 |
| 56 | Usage Tracking | 1/1 | 2026-05-14 |
| 57 | Enforcement Layer | 2/2 | 2026-05-14 |
| 58 | Stripe Integration | 2/2 | 2026-05-14 |
| 59 | Billing UI | 2/2 | 2026-05-14 |
| 60 | Trial Automation + Admin Tooling | 2/2 | 2026-05-14 |

</details>

### v3.1 Production Go-Live (Phases 61-65)

- [x] **Phase 61: Production Database Foundation** — Provision production Supabase project, apply all migrations from phases 1-60, bootstrap first super-admin, enable PITR, verify RLS active across all tables (PROD-DB-01..05) (completed 2026-05-15)
- [ ] **Phase 62: Vercel Deployment + Custom Domain** — Link Vercel project to GitHub `Skale-Club/xtimator`, configure auto-deploy on `main`, attach `xtimator.com` with SSL, populate all env vars in production, enable PR preview deployments (PROD-DEPLOY-01..05)
- [ ] **Phase 63: Stripe Live Mode Activation** — Create Stripe live products + recurring prices for Pro/Business, register live webhook on `xtimator.com/api/webhooks/stripe`, configure live secret key in admin panel, set webhook secret + price IDs in Vercel env (PROD-STRIPE-01..05)
- [ ] **Phase 64: Monitoring + Backup & Resilience** — Integrate Sentry + Vercel Analytics, ship `/api/health` endpoint, register external uptime monitor with email alerts, verify daily Supabase backups, ship status page, write incident runbook (PROD-MONITOR-01..05, PROD-BACKUP-01..03)
- [ ] **Phase 65: Production UAT + Bug Triage** — Manually validate v2.2 + v3.0 features in prod, run end-to-end smoke test (signup → audio → estimate → upgrade → real payment), triage every bug found, fix criticals, document non-criticals (PROD-UAT-01..04)

### Phase 61: Production Database Foundation
**Goal**: The production Supabase project exists with full schema, the first super-admin can sign in, point-in-time recovery is on, and RLS posture is verified — every downstream phase has a real database to talk to
**Depends on**: None (foundational; first phase of v3.1)
**Requirements**: PROD-DB-01, PROD-DB-02, PROD-DB-03, PROD-DB-04, PROD-DB-05
**Success Criteria** (what must be TRUE):
  1. A new Supabase project (separate from dev) is provisioned and the connection string + service role key are recorded in a secure secrets store
  2. Every migration from phases 1 through 60 has been applied to the production database — `supabase migration list --db-url <PROD_URL>` shows zero pending migrations and the schema matches dev
  3. The email `skale.club@gmail.com` exists in `platform_admins` in production and can sign in to `/admin` once the app is deployed
  4. PITR is visibly enabled in the Supabase dashboard with at least 7 days of retention
  5. An automated RLS audit query confirms every tenant table has policies scoped to `companies.user_id` and every platform table is deny-all by omission
**Plans**: 5 plans
Plans:
- [x] 61-01-PLAN.md — Validation infra: rls-audit.sql + EXPECTED-POSTURE.md + run-prod-readiness.sh (validated against dev)
- [ ] 61-02-PLAN.md — Provision prod Supabase project (us-east-1, Free tier, pg_cron) + capture secrets to .env.production + invite super-admin
- [ ] 61-03-PLAN.md — Apply all 21 migrations via bunx supabase db push + verify 5 storage buckets + seed result
- [ ] 61-04-PLAN.md — Verify super-admin seed (fallback re-run if needed) + document PROD-DB-04 PITR deferral (Free tier daily backups)
- [ ] 61-05-PLAN.md — Run RLS audit against prod, commit snapshot + PROD-BOOTSTRAP.md runbook + composite readiness pass

### Phase 62: Vercel Deployment + Custom Domain
**Goal**: Pushing to `main` deploys the app to `https://xtimator.com` with HTTPS, the production environment carries every secret the app needs, and PRs get preview URLs automatically
**Depends on**: Phase 61 (the deployed app needs a real production database to talk to)
**Requirements**: PROD-DEPLOY-01, PROD-DEPLOY-02, PROD-DEPLOY-03, PROD-DEPLOY-04, PROD-DEPLOY-05
**Success Criteria** (what must be TRUE):
  1. Pushing a commit to `main` on `Skale-Club/xtimator` triggers a Vercel production build that succeeds and serves the new commit
  2. Visiting `https://xtimator.com` in a browser loads the marketing landing page over HTTPS with a valid SSL certificate
  3. The production deployment has every required env var set (Supabase URL + anon + service role, Anthropic key, OpenAI key, Resend key, Stripe webhook secret, encryption key, app URL) — verified by a successful production build that does not throw startup env validation errors
  4. The production build passes `bunx tsc --noEmit` and `bunx next lint` without errors
  5. Opening a pull request on the repo automatically creates a Vercel preview deployment whose URL is posted as a PR comment

### Phase 63: Stripe Live Mode Activation
**Goal**: The deployed app accepts real payments — Pro and Business subscriptions can be purchased, the live webhook fires successfully, and tier upgrades persist to the database
**Depends on**: Phase 62 (the live webhook URL `https://xtimator.com/api/webhooks/stripe` must be reachable before Stripe will accept it)
**Requirements**: PROD-STRIPE-01, PROD-STRIPE-02, PROD-STRIPE-03, PROD-STRIPE-04, PROD-STRIPE-05
**Success Criteria** (what must be TRUE):
  1. Stripe Pro ($29/mo) and Business ($99/mo) products with recurring monthly prices exist in the Stripe live dashboard, and their `price_*` IDs are recorded
  2. A live webhook endpoint pointing to `https://xtimator.com/api/webhooks/stripe` is registered in Stripe with the four lifecycle events (`checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`) and shows status "Enabled"
  3. `STRIPE_WEBHOOK_SECRET` (whsec_*), `STRIPE_PRO_PRICE_ID`, and `STRIPE_BUSINESS_PRICE_ID` are set in the Vercel production environment and a redeploy has picked them up
  4. The Stripe live secret key (`sk_live_*`) is stored encrypted in `platform_integrations` via `/admin/integrations` — production database contains zero `sk_test_*` rows
  5. Sending a Stripe CLI test event (`stripe events resend <event_id>` from live mode) to the production webhook returns HTTP 200 and updates the corresponding `companies.tier` row

### Phase 64: Monitoring + Backup & Resilience
**Goal**: Production failures are visible (Sentry + uptime alerts + Vercel Analytics), data loss is recoverable (verified backups + PITR), and the operator has a runbook + status page for the first incident
**Depends on**: Phase 61 (DB must exist for /api/health DB check), Phase 62 (deployed app must exist for Sentry + uptime monitor to point at)
**Requirements**: PROD-MONITOR-01, PROD-MONITOR-02, PROD-MONITOR-03, PROD-MONITOR-04, PROD-MONITOR-05, PROD-BACKUP-01, PROD-BACKUP-02, PROD-BACKUP-03
**Success Criteria** (what must be TRUE):
  1. A thrown error in any production server action or API route appears in the Sentry dashboard with a readable stack trace pointing at the original TypeScript source (source maps uploaded)
  2. Vercel Analytics shows live Core Web Vitals (LCP, FID/INP, CLS) for `xtimator.com` within 24 hours of first traffic
  3. An external uptime monitor (UptimeRobot or BetterStack) is hitting `https://xtimator.com/api/health` every 5 minutes, and a forced 5xx (or domain takedown drill) sends an alert email to the operator within 2 minutes
  4. `GET /api/health` returns HTTP 200 with a JSON body confirming database connectivity (e.g. `{ ok: true, db: "ok" }`)
  5. The Supabase dashboard shows daily snapshot retention plus PITR; a sample restore-readiness check (verifying a recent snapshot exists and is downloadable) passes
  6. A status page is reachable at `xtimator.com/status` (or `status.xtimator.com`) showing API + DB + payment system health from the same `/api/health` signal
  7. `.planning/runbook.md` exists and covers deploy rollback, secret rotation, DB restore from PITR, Stripe webhook resync, and super-admin lockout recovery — each section has executable commands, not prose

### Phase 65: Production UAT + Bug Triage
**Goal**: A real user can complete the full Xtimator journey on production — signup through real payment — with every v2.2 and v3.0 feature working, and any bugs found are either fixed or documented
**Depends on**: Phase 61 (DB), Phase 62 (deployed app), Phase 63 (live payments), Phase 64 (monitoring catches anything UAT misses)
**Requirements**: PROD-UAT-01, PROD-UAT-02, PROD-UAT-03, PROD-UAT-04
**Success Criteria** (what must be TRUE):
  1. Every v2.2 feature has been manually exercised in production and works — WhatsApp PDF attachment delivery is received by a real client phone, WhatsApp status flow shows correct labels and the suspend/reactivate action persists
  2. Every v3.0 feature has been manually exercised in production and works — quota enforcement returns 402 on AI routes when exceeded, Stripe checkout completes with a real card, billing UI reflects the new tier, trial banner shows for new accounts, trial expiry cron downgrades a fixture account, admin force-tier and bonus credits update the right rows
  3. A complete end-to-end smoke run is documented: a brand-new account signs up on `xtimator.com`, completes onboarding, captures audio at a real or mock job site, gets an AI-generated estimate, sends a share link, watches trial countdown, hits the upgrade modal, completes a real Stripe payment, and lands back in the app on the Pro tier
  4. `.planning/known-issues.md` exists; every UAT-discovered bug is in it; every bug marked critical has a linked fix commit on `main`; non-critical bugs are scoped, prioritized, or explicitly deferred — the milestone does not close with unresolved criticals



## Phase Details

### Phase 24: Estimate Template Engine + Settings Page
**Goal**: Companies can define and save a plain-text estimate template with named variables
**Depends on**: Phase 7 (Settings infrastructure), Phase 20 (Price Book settings page pattern)
**Requirements**: PLAINTEXT-03, PLAINTEXT-05
**Success Criteria** (what must be TRUE):
  1. Owner can navigate to `/settings/estimate-templates` and see a form with greeting, opener, closer, and signature fields
  2. Owner can type `{client_name}`, `{company_name}`, `{owner_name}`, `{total}`, and `{items_breakdown}` as live variables and the UI identifies them as valid
  3. Saved template persists across browser sessions and is scoped to the company (not shared across companies)
  4. A company with no saved template gets a sensible default so the plain-text feature works out of the box
**Plans**: 3 plans
Plans:
- [x] 24-01-PLAN.md — Migration + pure utility (resolveTemplate, TEMPLATE_DEFAULTS, zod schema, CompanySettings extension, query function) with TDD
- [x] 24-02-PLAN.md — Server action (saveEstimateTemplate) + client form component (EstimateTemplateForm)
- [x] 24-03-PLAN.md — Settings sub-route page + loading skeleton + /settings entry card
**UI hint**: yes

### Phase 25: Plain Text Tab + Copy UI
**Goal**: Users can view, edit, and copy a plain-text version of any estimate in one tap
**Depends on**: Phase 24 (template engine must exist to drive text output)
**Requirements**: PLAINTEXT-01, PLAINTEXT-02, PLAINTEXT-04
**Success Criteria** (what must be TRUE):
  1. "Plain Text" card is visible in the Send tab below the EstimatePreview/SendForm grid
  2. The card shows the estimate rendered using the company template with all variables resolved (client name, totals, line items, etc.)
  3. User can edit the rendered text directly in the preview without that edit affecting the saved template
  4. Clicking the copy button places the current text on the clipboard and shows a confirmation toast
**Plans**: 2 plans
Plans:
- [x] 25-01-PLAN.md — buildItemsBreakdown utility function + unit tests (TDD RED→GREEN)
- [x] 25-02-PLAN.md — PlainTextCard component + data chain wiring (page.tsx → ProjectWorkspace → SendTab → PlainTextCard)
**UI hint**: yes

### Phase 26: Bulk Price Adjustment
**Goal**: Users can raise or lower all prices in a price book category with one confirmed action
**Depends on**: Phase 20 (Price Book CRUD UI — needs existing items to adjust), Phase 19 (price_source column in place)
**Requirements**: BULKPRICE-01, BULKPRICE-02, BULKPRICE-03
**Success Criteria** (what must be TRUE):
  1. From the price book page, user can select a category and enter a percentage adjustment (positive or negative)
  2. Before confirming, user sees a table comparing current unit prices vs projected new prices for every item in that category
  3. After confirming, all item prices in that category update simultaneously — no partial saves leave some items at old prices
**Plans**: 2 plans
Plans:
- [x] 26-01-PLAN.md — bulkAdjustSchema + bulkAdjustPriceBookCategory server action (test-first: Wave 0 RED stubs + Wave 1 implementation)
- [x] 26-02-PLAN.md — BulkAdjustDialog component + PriceBookList wiring (Adjust % button + live preview table)

### Phase 27: Capture Schema Migration
**Goal**: The database schema supports text-only recordings (no audio file) and projects without a linked client
**Depends on**: Phase 18 (capture route exists), Phase 4 (projects schema baseline)
**Requirements**: (infrastructure prerequisite — unblocks CAPTURE-02, CAPTURE-04, CLIENTASSOC-01, CLIENTASSOC-04)
**Success Criteria** (what must be TRUE):
  1. A recording row can be inserted with a non-null transcript but a null storage_path, and the application does not error on such rows
  2. A project can be created and saved without a client_id value, and no constraint violation is raised
  3. Existing recordings with audio files and existing projects with clients continue to load and render correctly
**Plans**: 1 plan
Plans:
- [x] 27-01-PLAN.md — DB migration (nullable storage_path) + TypeScript type propagation + optional clientId schema + caller null-guards

### Phase 28: Unified Capture Screen
**Goal**: Users can provide audio, typed description, or photos as co-equal inputs on the capture screen — alone or combined — and generate an estimate from any combination
**Depends on**: Phase 27 (nullable storage_path and optional client_id must exist)
**Requirements**: CAPTURE-01, CAPTURE-02, CAPTURE-03, CAPTURE-04
**Success Criteria** (what must be TRUE):
  1. The audio recorder remains the visually dominant element on the capture screen, with recording controls unchanged from the current full-screen UX
  2. A user who types a job description and taps Generate Estimate — without recording any audio — gets a generated estimate using that text as the input
  3. A user who uploads one or more photos — without recording audio or typing text — can tap Generate Estimate and receive an estimate derived from those photos
  4. The Generate Estimate button is disabled when the capture screen has no transcript, no typed description, and no photos; it becomes enabled the moment any one of those inputs is present
**Plans**: 1 plan
Plans:
- [x] 28-01-PLAN.md - Multi-modal capture UI: generate-estimate guard fix, createTextRecording, description textarea, photo upload, GenerateEstimate button

### Phase 29: Frictionless Project Creation & Client Linking
**Goal**: Users can create a project without selecting a client upfront, and can link a client at any point from multiple entry surfaces
**Depends on**: Phase 27 (optional client_id schema), Phase 28 (capture screen accepts client-less projects)
**Requirements**: CLIENTASSOC-01, CLIENTASSOC-02, CLIENTASSOC-04
**Success Criteria** (what must be TRUE):
  1. A user can complete the new project wizard and reach the capture screen without selecting or creating a client — the client field is optional, not blocking
  2. On any client detail page, a "New Project" button creates a new project pre-linked to that client and navigates directly to the capture screen without showing a client selection step
  3. A project with no linked client shows a visible "Link client" card in the Overview tab, and the user can link a client from that card
  4. A project that already has a linked client does not show the "Link client" card in Overview
**Plans**: 1 plan
Plans:
- [x] 29-01-PLAN.md - Make client optional in wizard, add New Project button on client detail, add Link Client card in Overview
**UI hint**: yes

### Phase 30: AI Client Extraction
**Goal**: After estimate generation, users are offered a non-blocking opportunity to link the AI-detected client name to an existing client record
**Depends on**: Phase 28 (estimate generation must have run), Phase 29 (client linking surface must exist)
**Requirements**: CLIENTASSOC-03
**Success Criteria** (what must be TRUE):
  1. When the AI detects a client name in the transcript, description, or photo analysis, a toast notification appears after estimate generation with the detected name — it does not interrupt or block the estimate editor
  2. The user can accept the suggestion, which links the project to the matching existing client (or prompts to create one if no match exists), or dismiss it with no change to any record
  3. If the AI does not detect a client name, no toast appears and the flow is identical to today
**Plans**: 1 plan
Plans:
- [x] 30-01-PLAN.md - AI client extraction output, conservative client matching, and non-blocking suggestion toast

### Phase 31: Wizard Modality Selection
**Goal**: Users choose their preferred input modality (audio, text, or photos) as the second step of project creation, with each choice leading to a dedicated capture route
**Depends on**: Phase 28 (unified capture screen exists), Phase 29 (client-optional wizard exists)
**Requirements**: WIZARD-01, WIZARD-02, WIZARD-03, WIZARD-04
**Success Criteria** (what must be TRUE):
  1. After selecting a client (or skipping), the user sees 3 large clickable cards labeled "Audio", "Text", and "Photos" — each with an icon and a one-line use case description
  2. Clicking the Audio card navigates to `/projects/[id]/capture` (existing route)
  3. Clicking the Text card navigates to `/projects/[id]/describe` (new route)
  4. Clicking the Photos card navigates to `/projects/[id]/photos-input` (new route)
  5. The selected modality is stored in the project record as `input_mode` and persists across sessions
**Plans**: 1 plan
Plans:
- [x] 31-01-PLAN.md — Database migration + types + schema + StepModalitySelect component + 2-step wizard + action updates
**UI hint**: yes

### Phase 32: Text Input Route
**Goal**: Users can type a job description and generate an estimate without recording any audio
**Depends on**: Phase 31 (wizard redirects to this route), Phase 27 (text-only recordings supported)
**Requirements**: TEXT-01, TEXT-02, TEXT-03, TEXT-04, TEXT-05
**Success Criteria** (what must be TRUE):
  1. The `/projects/[id]/describe` route displays a textarea with placeholder text showing example job descriptions
  2. The textarea is large enough for at least 10 lines of input with comfortable line height
  3. Clicking "Save & Generate Estimate" creates a recording with the typed text as `transcript` (no storage_path, no duration_seconds)
  4. The estimate generation pipeline runs identically to the audio route — the only difference is the text origin
  5. The route is mobile-responsive with touch-friendly tap targets (minimum 44px)
**Plans**: 1 plan
Plans:
- [x] 32-01-PLAN.md — Route shell + TextDescribe component + generate pipeline wiring

### Phase 33: Photos Input Route
**Goal**: Users can upload photos and generate an estimate without recording audio or typing text
**Depends on**: Phase 31 (wizard redirects to this route), Phase 27 (photos-only flow supported)
**Requirements**: PHOTO-01, PHOTO-02, PHOTO-03, PHOTO-04
**Success Criteria** (what must be TRUE):
  1. The `/projects/[id]/photos-input` route displays a direct photo upload zone without requiring navigation through the workspace
  2. The PhotoDropZone component is reused from the existing workspace
  3. A "Generate from Photos" button is visible and prominent as soon as at least 1 photo is uploaded
  4. Clicking the button runs the Claude Vision pipeline to analyze the photos and generate the estimate (no transcript required)
  5. The user lands in the estimate editor with the generated result, same as audio/text flows
**Plans**: 1 plan
Plans:
- [x] 33-01-PLAN.md — Route shell + PhotosInput component + generate pipeline wiring

### v1.7 Client-Project Quick Actions (Phase 34)

- [x] **Phase 34: Client-Project Quick Actions Verification** — Verify all CLIENTASSOC features work correctly; address any gaps (completed 2026-05-09)
   - [x] 34-01-PLAN.md — Verification plan (4 human checkpoint tasks)

### v1.8 Iterative Estimate Refinement (Phases 35-37)

- [x] **Phase 35: Text Refinement** — Add text input refinement panel to estimate editor, new API endpoint `/api/estimates/[id]/refine`, AI refinement prompt, new version creation
   - [x] 35-01-PLAN.md — Text refinement panel + API endpoint + AI integration (COMPLETE)
- [x] **Phase 36: Voice Refinement** — Inline voice recorder (~30s), Whisper transcription, same refinement pipeline
   - [x] 36-01-PLAN.md — VoiceRefineRecorder + voice API route + panel wiring (COMPLETE 2026-05-09)
- [x] **Phase 37: Photo Refinement** — Photo upload, Claude Vision analysis, auto-generate instruction
   - [x] 37-01-PLAN.md — Photo upload section in refine panel + Claude Vision API route

### Phase 38: Custom Domain DB + Settings UI
**Goal**: Company owners can enter and save a custom domain from settings, and see DNS/CNAME instructions — companies without a domain configured are completely unaffected
**Depends on**: Phase 7 (Settings infrastructure), Phase 27 (DB migration pattern)
**Requirements**: DOMAIN-01, DOMAIN-02, DOMAIN-05
**Success Criteria** (what must be TRUE):
  1. Owner can navigate to `/settings` (or a settings sub-section) and see a "Custom Domain" field where they can enter a domain such as `estimates.mycompany.com` and save it
  2. After saving a domain, the page shows DNS/CNAME setup instructions explaining which record to add and what value to point it to (Vercel's CNAME target)
  3. A company that leaves the custom domain field empty continues to generate and share estimates on `xtimator.com/estimate/{token}` — no change to any existing behavior
  4. The saved domain persists across sessions and is scoped to the company (not shared across companies)
**Plans**: 2 plans

Plans:
- [x] 40-01-PLAN.md — DB migration (3 WA tables + RLS + purge) + lib/whatsapp/ modules (types, verify, client) + unit tests
- [x] 40-02-PLAN.md — Webhook route (GET challenge + POST HMAC handler + dedup stub) + proxy.ts bypass
**UI hint**: yes

### Phase 39: Subdomain Routing + White-label Estimate View
**Goal**: Requests arriving at a company's custom domain render the correct estimate directly — no redirect, no Xtimator branding in the footer
**Depends on**: Phase 38 (custom_domain column must exist and be populated)
**Requirements**: DOMAIN-03, DOMAIN-04
**Success Criteria** (what must be TRUE):
  1. A browser request to `estimates.mycompany.com/estimate/{token}` renders the estimate page with the company's logo, name, and colors — without redirecting to xtimator.com
  2. The "Generated by Xtimator" footer is absent when the estimate is served from a custom domain; only company branding is visible
  3. The same share token accessed via `xtimator.com/estimate/{token}` continues to render normally with the Xtimator footer intact — no regression for standard links
**Plans**: 1 plan
Plans:
- [x] 39-01-PLAN.md — proxy.ts custom host detection + EstimateView white-label prop + estimate page header wiring + unit tests
**UI hint**: yes

### Phase 40: Webhook Infrastructure
**Goal**: The system can receive, verify, and route inbound WhatsApp messages — the security and data foundation for every subsequent phase
**Depends on**: Phase 39 (last shipped phase; no functional dependency)
**Requirements**: WA-01, WA-02, WA-03, WA-04
**Success Criteria** (what must be TRUE):
  1. A `GET /api/webhooks/whatsapp` request from Meta with correct `hub.verify_token` returns the `hub.challenge` value and is not redirected to login by `proxy.ts`
  2. A `POST /api/webhooks/whatsapp` request with a valid HMAC-SHA256 `X-Hub-Signature-256` header is accepted; a request with an invalid or missing signature is rejected with HTTP 401
  3. A second inbound POST carrying the same `wamid.*` message ID as a previously processed message is silently discarded — no duplicate estimate is created
  4. The `company_whatsapp` and `whatsapp_sessions` tables exist in Supabase with correct RLS policies; the Meta access token can be stored and retrieved via the admin panel `platform_integrations` card
**Plans**: 2 plans

Plans:
- [x] 40-01-PLAN.md — DB migration (3 WA tables + RLS + purge) + lib/whatsapp/ modules (types, verify, client) + unit tests
- [ ] 40-02-PLAN.md — Webhook route (GET challenge + POST HMAC handler + dedup stub) + proxy.ts bypass

### Phase 41: Generate-Estimate Service Extraction
**Goal**: The estimate generation pipeline is callable without an authenticated user session, enabling the webhook handler to invoke it using only a companyId
**Depends on**: Phase 40 (infrastructure must exist; service client pattern established)
**Requirements**: (internal prerequisite — enables WA-07, WA-08, WA-09)
**Success Criteria** (what must be TRUE):
  1. `lib/services/generate-estimate.ts` exports a function callable with `(companyId: string, projectId: string)` that runs the full estimate generation pipeline and persists the result to the database
  2. The existing `POST /api/generate-estimate` route calls this service function after its auth check — behavior from the authenticated UI path is unchanged
  3. Unit tests exercise the service function directly without an HTTP request or auth context
**Plans**: 2 plans

Plans:
- [ ] 40-01-PLAN.md — DB migration (3 WA tables + RLS + purge) + lib/whatsapp/ modules (types, verify, client) + unit tests
- [ ] 40-02-PLAN.md — Webhook route (GET challenge + POST HMAC handler + dedup stub) + proxy.ts bypass

### Phase 42: Inbound Processing
**Goal**: An owner can send audio, text, or a photo to the registered WhatsApp number and receive an estimate confirmation summary in reply — without opening the app
**Depends on**: Phase 40 (webhook route + DB tables), Phase 41 (generate-estimate service callable without auth)
**Requirements**: WA-07, WA-08, WA-09, WA-10
**Success Criteria** (what must be TRUE):
  1. Owner sends a voice note via WhatsApp — the bot transcribes it via Whisper, generates an estimate, and replies with a formatted summary of sections and total within the Meta 20-second response window (fire-and-forget async)
  2. Owner sends a text message describing a job — the bot generates an estimate from that text and replies with a confirmation summary
  3. Owner sends a photo of a job site — the bot analyzes it via Claude Vision, generates an estimate, and replies with a confirmation summary
  4. The reply summary presents the estimate total and a brief line-item breakdown, followed by "send" and "cancel" instructions
**Plans**: 2 plans

Plans:
- [ ] 40-01-PLAN.md — DB migration (3 WA tables + RLS + purge) + lib/whatsapp/ modules (types, verify, client) + unit tests
- [ ] 40-02-PLAN.md — Webhook route (GET challenge + POST HMAC handler + dedup stub) + proxy.ts bypass

### Phase 43: Confirmation Flow
**Goal**: After receiving an estimate summary, the owner can confirm or cancel via a WhatsApp reply, and sessions that go unanswered expire automatically
**Depends on**: Phase 42 (inbound processing must create sessions in awaiting_confirm state)
**Requirements**: WA-11, WA-12, WA-13
**Success Criteria** (what must be TRUE):
  1. Owner replies "send" in the confirmation window — the session transitions to delivery and the owner receives a confirmation that the estimate is being sent to the client
  2. Owner replies "cancel" — the draft project and estimate are discarded and the bot confirms cancellation; no orphan records remain
  3. A session with no owner response expires after 30 minutes — the bot sends an expiry notification and the session is cleaned up from the database
**Plans**: 2 plans

Plans:
- [ ] 40-01-PLAN.md — DB migration (3 WA tables + RLS + purge) + lib/whatsapp/ modules (types, verify, client) + unit tests
- [ ] 40-02-PLAN.md — Webhook route (GET challenge + POST HMAC handler + dedup stub) + proxy.ts bypass

### Phase 44: Outbound Client Delivery
**Goal**: After the owner confirms, the estimate is delivered to the client via the company's configured format and the owner is notified of successful delivery
**Depends on**: Phase 43 (confirmation flow must have triggered "send")
**Requirements**: WA-14, WA-15
**Success Criteria** (what must be TRUE):
  1. When delivery format is "share link" (default), the client receives a WhatsApp message containing the public estimate URL (`xtimator.com/estimate/{token}`) — no template approval required
  2. The estimate and project records are updated to status "sent" after successful delivery
  3. The owner receives a WhatsApp confirmation message that the estimate was delivered to the client
**Plans**: 2 plans

Plans:
- [ ] 40-01-PLAN.md — DB migration (3 WA tables + RLS + purge) + lib/whatsapp/ modules (types, verify, client) + unit tests
- [ ] 40-02-PLAN.md — Webhook route (GET challenge + POST HMAC handler + dedup stub) + proxy.ts bypass

### Phase 45: Settings UI + Admin Token
**Goal**: Owners can connect, verify, and configure their WhatsApp Business number from the settings page, and admins can manage the Meta access token
**Depends on**: Phase 40 (company_whatsapp table and API routes must exist)
**Requirements**: WA-05, WA-06
**Success Criteria** (what must be TRUE):
  1. Owner navigates to `/settings/integrations`, sees a WhatsApp card, enters their Business phone number, receives a verification code, and confirms — the number shows as "Active" with a green indicator
  2. Owner clicks "Disconnect" and confirms the AlertDialog — the number is removed and future messages from that number are silently ignored
  3. Active connection card shows a delivery format selector (share link / formatted text); the selected format is persisted and respected by the outbound delivery flow
**Plans**: 2 plans

Plans:
- [ ] 40-01-PLAN.md — DB migration (3 WA tables + RLS + purge) + lib/whatsapp/ modules (types, verify, client) + unit tests
- [ ] 40-02-PLAN.md — Webhook route (GET challenge + POST HMAC handler + dedup stub) + proxy.ts bypass
**UI hint**: yes

### Phase 46: Typed Error Handling Foundation
**Goal**: Establish a typed error class with type+surface composite codes, status mappings, user message lookup, and adapters for HTTP responses and WhatsApp messages
**Depends on**: None (foundational)
**Requirements**: Derived from SEED-014
**Success Criteria** (what must be TRUE):
  1. Any handler can `throw new XtimatorError('tier_limit', 'estimates', 'msg', cause?, meta?)` and the caller wrapping with `asResponse(err)` gets correct HTTP status + JSON body
  2. WhatsApp handler can `handleWhatsAppError(err, fromPhone)` and the user receives a contextual message based on the error code
  3. ZodError is auto-translated to 400 with the invalid fields list
  4. Internal errors return generic message to user but log full stack server-side
**Plans**: 1 plan

### Phase 47: Redis + Rate Limiting Infrastructure
**Goal**: Provision Upstash Redis and ship `rateLimit(name, identifier)` applied to the four most-expensive endpoints + a per-IP middleware in proxy.ts
**Depends on**: Phase 46 (uses XtimatorError for 429 responses)
**Requirements**: Derived from SEED-012
**Success Criteria**:
  1. `lib/redis.ts` exposes a single Upstash client; env vars validated at startup
  2. `rateLimit('userEstimatePerHour', userId)` returns `{ allowed, retryAfter }` via sliding window (INCR + EXPIRE NX)
  3. Hitting an endpoint past the limit returns HTTP 429 with `Retry-After` header
  4. Per-IP middleware in proxy.ts blocks abusive bursts before they reach any route
**Plans**: 1 plan

### Phase 48: WhatsApp Multi-Message Debounce
**Goal**: When a user sends multiple messages within 5 seconds, buffer them in Redis and process the entire batch as one estimate
**Depends on**: Phase 47 (Redis client must exist)
**Requirements**: Derived from SEED-010
**Success Criteria**:
  1. User sends 5 messages in quick succession — system waits 5s after the last, then processes ALL together
  2. `processInboundMessage()` accepts an array of messages and generates ONE estimate
  3. If a message arrives during processing, it starts a new buffer (no data loss)
  4. Buffer has 2-minute TTL safety net
**Plans**: 1 plan

### Phase 49: WhatsApp Typing + Read Receipts
**Goal**: Mark inbound messages as read (blue checks) and show typing indicator during AI processing
**Depends on**: Phase 46 (errors)
**Requirements**: Derived from SEED-011
**Success Criteria**:
  1. Immediately after dedup passes, blue checks appear on the user's phone (<1s)
  2. Before heavy processing, typing indicator appears in the chat
  3. If processing exceeds 25s, typing indicator is re-sent before timeout
  4. Meta API failures on these calls are silently swallowed (fire-and-forget)
**Plans**: 1 plan

### Phase 50: WhatsApp OTP Number Verification
**Goal**: Require proof of ownership via WhatsApp-delivered code before activating a number
**Depends on**: Phase 46 (errors), Phase 49 (sendWhatsAppMessage)
**Requirements**: Derived from SEED-015 Gap 2
**Success Criteria**:
  1. User submits credentials → status='pending' → 6-digit code sent via WhatsApp
  2. User enters code → server validates (10min TTL, max 3 attempts) → status='active'
  3. Wrong/expired code shows clear error; after 3 attempts, row is reset
  4. Inbound webhook only accepts messages from numbers with status='active'
**Plans**: 1 plan

### Phase 51: WhatsApp Pre-Send Edit Commands
**Goal**: Owner can edit the estimate via structured WhatsApp commands while in awaiting_confirm, instead of canceling and starting over
**Depends on**: Phase 46 (errors), Phase 48 (debounce)
**Requirements**: Derived from SEED-015 Gap 1
**Success Criteria**:
  1. Owner can `edit total 450` / `edit section 1 "X"` / `edit item 2.3 price 85`
  2. Owner can `add item ...` / `remove item ...` / `regenerate` / `client "Name" 555...`
  3. After every successful edit, the updated summary is re-sent; session stays in awaiting_confirm
  4. Invalid commands return a contextual error explaining the right syntax
**Plans**: 1 plan

### Phase 52: Per-Estimate Language Selection
**Goal**: An estimate can be generated in EN, PT-BR, or ES regardless of the user's app language; English-first cascade resolves the default
**Depends on**: Phase 46 (errors)
**Requirements**: Derived from SEED-016
**Success Criteria**:
  1. Schema adds `estimates.language` (required, default 'en'), `clients.preferred_language` (nullable), `companies.default_estimate_language` (nullable)
  2. `generateEstimateForProject()` accepts a language parameter; AI prompt generates in target language with locale-aware formatting
  3. `EstimatePDF` is i18n-aware; renders in the estimate's language
  4. WhatsApp formatter uses estimate.language for client-facing message
  5. Generate-estimate UI exposes a "Generate in:" dropdown with cascade-resolved default
  6. After sending, if `clients.preferred_language` is null, auto-set to the estimate's language
**Plans**: 1 plan

### Phase 53: PDF Attachment Delivery
**Goal**: Clients can receive their estimate as a PDF document via WhatsApp — a third delivery option alongside share link and formatted text
**Depends on**: Phase 44 (outbound delivery branching in confirm.ts), Phase 45 (delivery_format selector UI), Phase 50 (status=active gate already in place)
**Requirements**: WAPDF-01, WAPDF-02, WAPDF-03, WAPDF-04
**Success Criteria** (what must be TRUE):
  1. Owner can select "PDF attachment" as the delivery format in WhatsApp settings — the option appears alongside "Share link" and "Formatted text" in the selector
  2. When delivery format is set to pdf_attachment and the owner confirms send, the client receives a WhatsApp document message with a descriptive filename (e.g. `Estimate-ClientName-2026-05-11.pdf`) and a caption from the company name
  3. The PDF is the same branded document generated by the existing `/api/estimates/[id]/pdf` endpoint — line items, totals, company logo, and colors are correct
  4. If PDF generation, Supabase Storage upload, or the Meta document API call fails for any reason, the send completes anyway using the share_link fallback — the owner is not left with a failed delivery
**Plans**: 2 plans
Plans:
- [x] 53-01-PLAN.md — Wave 0 test stubs + DB migration (extend delivery_format CHECK) + lib/whatsapp/pdf-delivery.ts helper (generateAndUploadEstimatePDF + buildPdfFilename)
- [x] 53-02-PLAN.md — confirm.ts handleSend pdf_attachment branch + WhatsAppConnectCard third SelectItem

### Phase 54: WhatsApp Status Flow
**Goal**: The WhatsApp connection status pipeline is fully wired — UI shows accurate labels, transitions follow the correct sequence, admins can suspend and reactivate, and the message handler enforces the active gate
**Depends on**: Phase 50 (OTP verification established pending→active path), Phase 45 (WhatsAppConnectCard UI)
**Requirements**: WASTATUS-01, WASTATUS-02, WASTATUS-03, WASTATUS-04
**Success Criteria** (what must be TRUE):
  1. The WhatsApp Connect Card displays one of four human-readable labels — "Pending", "Verified", "Active", or "Suspended" — matching the current database status value; no raw enum values are shown to the user
  2. After OTP verification completes (Phase 50 flow), the status automatically transitions to `active` without requiring a separate admin approval step
  3. An owner (or admin) can set the connection status to `suspended` from the settings UI, and a suspended connection can be reactivated back to `active` — both actions persist correctly and are reflected immediately in the UI
  4. An inbound WhatsApp message from a number whose `company_whatsapp.status` is `pending`, `verified`, or `suspended` is silently ignored by the handler — no estimate is created, no reply is sent
**Plans**: 2 plans
Plans:
- [x] 54-01-PLAN.md — updateWhatsAppStatus server action + unit tests (WASTATUS-02, WASTATUS-03, WASTATUS-04)
- [x] 54-02-PLAN.md — WhatsAppConnectCard: StatusBadge + Suspend/Reactivate buttons (WASTATUS-01, WASTATUS-03)

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
| 10. Global Brand Tokens | v1.2 | 1/1 | Complete | 2026-04-22 |
| 11. Marketing Landing Page | v1.2 | 2/2 | Complete | 2026-04-24 |
| 12. i18n Translation System | v1.2 | 5/5 | Complete | 2026-04-24 |
| 13. Visual Identity Polish | v1.2 | 2/2 | Complete | 2026-05-05 |
| 14. Auth System Hardening | v1.2 | 3/3 | Complete | 2026-05-01 |
| 15. Owner Admin Panel | v1.2 | 5/5 | Complete | 2026-05-03 |
| 16. Sidebar Projects Panel | v1.2 | 3/3 | Complete | 2026-05-03 |
| 17. Navigation Performance | v1.2 | 3/3 | Complete | 2026-05-05 |
| 18. Voice-First Project Onboarding | v1.2 | 3/3 | Complete | 2026-05-05 |
| 19. Price Book DB Foundation | v1.3 | 2/2 | Complete | 2026-05-07 |
| 20. Price Book CRUD UI | v1.3 | 3/3 | Complete | 2026-05-07 |
| 21. CSV Import | v1.3 | 3/3 | Complete | 2026-05-08 |
| 22. AI Price Anchoring | v1.3 | 3/3 | Complete | 2026-05-08 |
| 23. Estimate Editor Price Badges | v1.3 | 2/2 | Complete | 2026-05-08 |
| 24. Estimate Template Engine + Settings Page | v1.4 | 3/3 | Complete | 2026-05-08 |
| 25. Plain Text Tab + Copy UI | v1.4 | 2/2 | Complete | 2026-05-08 |
| 26. Bulk Price Adjustment | v1.4 | 2/2 | Complete | 2026-05-08 |
| 27. Capture Schema Migration | v1.5 | 1/1 | Complete | 2026-05-08 |
| 28. Unified Capture Screen | v1.5 | 1/1 | Complete | 2026-05-09 |
| 29. Frictionless Project Creation & Client Linking | v1.5 | 1/TBD | Complete | 2026-05-09 |
| 30. AI Client Extraction | v1.5 | 1/1 | Complete | 2026-05-09 |
| 31. Wizard Modality Selection | v1.6 | 1/1 | Complete | 2026-05-09 |
| 32. Text Input Route | v1.6 | 1/1 | Complete | 2026-05-09 |
| 33. Photos Input Route | v1.6 | 1/1 | Complete | 2026-05-09 |
| 34. Client-Project Quick Actions Verification | v1.7 | 1/1 | Complete | 2026-05-09 |
| 35. Text Refinement | v1.8 | 1/1 | Complete | 2026-05-09 |
| 36. Voice Refinement | v1.8 | 1/1 | Complete | 2026-05-09 |
| 37. Photo Refinement | v1.8 | 1/1 | Complete | 2026-05-09 |
| 38. Custom Domain DB + Settings UI | v1.9 | 2/2 | Complete | 2026-05-10 |
| 39. Subdomain Routing + White-label Estimate View | v1.9 | 1/1 | Complete | 2026-05-10 |
| 40. Webhook Infrastructure | v2.0 | 2/2 | Complete | 2026-05-10 |
| 41. Generate-Estimate Service Extraction | v2.0 | 1/1 | Complete | 2026-05-10 |
| 42. Inbound Processing | v2.0 | 1/1 | Complete | 2026-05-10 |
| 43. Confirmation Flow | v2.0 | 2/2 | Complete | 2026-05-10 |
| 44. Outbound Client Delivery | v2.0 | 1/1 | Complete | 2026-05-10 |
| 45. Settings UI + Admin Token | v2.0 | 1/1 | Complete | 2026-05-10 |
| 46. Typed Error Handling Foundation | v2.1 | 1/1 | Complete | 2026-05-11 |
| 47. Redis + Rate Limiting Infrastructure | v2.1 | 1/1 | Complete | 2026-05-11 |
| 48. WhatsApp Multi-Message Debounce | v2.1 | 1/1 | Complete | 2026-05-11 |
| 49. WhatsApp Typing + Read Receipts | v2.1 | 1/1 | Complete | 2026-05-11 |
| 50. WhatsApp OTP Number Verification | v2.1 | 1/1 | Complete | 2026-05-11 |
| 51. WhatsApp Pre-Send Edit Commands | v2.1 | 1/1 | Complete | 2026-05-11 |
| 52. Per-Estimate Language Selection | v2.1 | 1/1 | Complete | 2026-05-11 |
| 53. PDF Attachment Delivery | v2.2 | 2/2 | Complete    | 2026-05-11 |
| 54. WhatsApp Status Flow | v2.2 | 2/2 | Complete    | 2026-05-13 |
| 55. Schema + Tier Definitions | v3.0 | 2/2 | Complete    | 2026-05-13 |
| 56. Usage Tracking | v3.0 | 1/1 | Complete    | 2026-05-14 |
| 57. Enforcement Layer | v3.0 | 1/2 | Complete    | 2026-05-14 |
| 58. Stripe Integration | v3.0 | 2/2 | Complete    | 2026-05-14 |
| 59. Billing UI | v3.0 | 1/2 | Complete    | 2026-05-14 |
| 60. Trial Automation + Admin Tooling | v3.0 | 1/2 | Complete    | 2026-05-14 |
| 61. Production Database Foundation | v3.1 | 1/5 | Complete    | 2026-05-15 |
| 62. Vercel Deployment + Custom Domain | v3.1 | 0/TBD | Not started | - |
| 63. Stripe Live Mode Activation | v3.1 | 0/TBD | Not started | - |
| 64. Monitoring + Backup & Resilience | v3.1 | 0/TBD | Not started | - |
| 65. Production UAT + Bug Triage | v3.1 | 0/TBD | Not started | - |

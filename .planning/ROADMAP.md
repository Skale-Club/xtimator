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
- ✅ **v3.1 Production Go-Live (rescoped)** — Phase 61 only (shipped 2026-05-15) · 4 phases deferred to v3.2 · [archive](milestones/v3.1-ROADMAP.md)
- 🚧 **v3.1.1 MVP Launch Prep + Future-Proofing** — Phases 66-72 (started 2026-05-15, rescoped same day for Inngest + Storage abstraction)

> **Phase numbering note:** v3.1.1 starts at **Phase 66**, not 62. Phases 62-65 are reserved as DEFERRED placeholders for the v3.2 Production Deploy milestone (Vercel→Hetzner deploy + Stripe live + monitoring + UAT in prod). Skipping past 62-65 keeps the global phase counter unambiguous and prevents number reuse confusion when v3.2 begins.

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

<details>
<summary>✅ v3.1 Production Go-Live (rescoped) — Phase 61 only · SHIPPED 2026-05-15</summary>

| Phase | Name | Plans | Status |
|-------|------|-------|--------|
| 61 | Production Database Foundation | 5/5 | Complete 2026-05-15 |
| 62 | Vercel Deployment + Custom Domain | — | DEFERRED → v3.2 |
| 63 | Stripe Live Mode Activation | — | DEFERRED → v3.2 |
| 64 | Monitoring + Backup & Resilience | — | DEFERRED → v3.2 |
| 65 | Production UAT + Bug Triage | — | DEFERRED → v3.2 |

[Full archive: milestones/v3.1-ROADMAP.md](milestones/v3.1-ROADMAP.md)

</details>

### v3.1.1 MVP Launch Prep + Future-Proofing (Phases 66-69)

- [x] **Phase 66: Storage Abstraction Layer** — Ship `lib/storage/` with a `StorageProvider` interface, a Supabase implementation (default), and an S3-compatible skeleton (`@aws-sdk/client-s3`) gated behind `STORAGE_PROVIDER=s3`. Migrate every `supabase.storage.from(...)` call site (audio, photos, PDFs, logos, WhatsApp inbound media, branding assets) to the new `storage.*` API. Validate the S3 path with a local MinIO smoke test. Ship `docs/STORAGE-MIGRATION.md` so the future Hetzner Object Storage swap is a 1-line provider change. (STORAGE-01..07) (completed 2026-05-15)
- [x] **Phase 67: Inngest Background AI Job Processing** — Install Inngest, register worker functions at `/api/inngest`, and refactor the three AI routes (`generate-estimate`, `transcribe`, `analyze-photos`) plus the WhatsApp inbound handler so the long-running Anthropic / OpenAI / Vision calls run as Inngest jobs (idempotent via `step.run()` + `idempotencyKey`). Frontend polls job status via `GET /api/jobs/[jobId]` so the capture stepper UI shows live "Saving / Transcribing / Analyzing / Generating" progress. Document the local dev workflow (`npx inngest-cli dev` alongside `npm run dev`). (INNGEST-01..08) (completed 2026-05-15)
- [x] **Phase 68: Hetzner Cloud Deploy-Readiness Artifacts** — Ship the future-Hetzner deploy artifacts but do not activate them: `Dockerfile` (multi-stage, Node 22 alpine, non-root, <500 MB), `next.config.mjs` set to `output: 'standalone'`, `docker-compose.yml` with Caddy reverse proxy + automatic Let's Encrypt HTTPS, `app/api/health/route.ts` returning `{ ok, db, storage, commit }` (uses the new `storage.*` API for the storage check), and `docs/HETZNER-DEPLOY.md` runbook. Validate locally with `docker build` + `docker run`. (HETZNER-01..06) (completed 2026-05-15)
- [x] **Phase 69: UAT Validation + Bug Triage + Perf Audit** — Owner manually exercises every refactored surface against localhost: v2.2 WhatsApp polish (PDF + status flow), v3.0 monetization (tiers, Stripe test mode, billing UI, trial automation, admin tooling, 402 modal), Inngest happy path + 8-min long-audio (the timeout-killer test that would have failed on Vercel Free without Inngest), every storage path post-refactor, end-to-end happy path, multi-modal capture, i18n smoke. Critical bugs get fixed in this milestone with linked commits; non-critical findings land in `.planning/known-issues.md`. Lighthouse + bundle-size audit captured. (UAT-V22-01..02 + UAT-V30-01..06 + UAT-INNGEST-01..02 + UAT-STORAGE-01 + UAT-E2E-01..03 + FIX-01..02 + PERF-01..02) (completed 2026-05-15)
- [x] **Phase 70: Stripe Connect — Optional Customer Payments on Estimates** — Ship an entirely-optional Stripe Connect Standard integration so service businesses can connect their existing Stripe account once (via OAuth in Settings → Payments) and instantly get a "Pay Now" button on every shared estimate. Customer clicks → Stripe Checkout (hosted by Stripe, on the business's connected account) → pays full amount → webhook marks `estimates.payment_status = 'paid'`, emails business owner, emails customer branded receipt, shows banner on share page after redirect. Zero application fee (Xtimator already monetizes via SaaS plans). Everything works perfectly without Stripe connected — no broken UI, no upsell nag, share/PDF/email flows unchanged. Harvests SEED-020. (CONNECT-01..09) (completed 2026-05-17)
- [x] **Phase 71: Glassmorphism Structural Redesign — All Surfaces** — Ship a complete visual overhaul taking Xtimator from "functional SaaS" to "premium Stripe-Dashboard-tier" without changing information architecture, navigation, or copy. New design system layer (glass surface tokens + vibrant gradient palette + typography upgrade) extends — does not replace — existing semantic tokens. Every surface a paying customer sees gets refactored across 5 waves: (1) foundation + reference page, (2) marketing/auth/onboarding, (3) app shell + dashboard + collections, (4) project workspace + capture + editor, (5) share page + settings + admin + billing. Brand identity preserved (#406EF1, dark-first, logo, wordmark intact). Reference: Stripe Dashboard. Harvests SEED-022. (REDESIGN-01..10) (completed 2026-05-17)
- [x] **Phase 72: Admin Menu Performance — Instant Navigation** — Eliminate perceived lag on admin menu opens (both client admin `/admin/*` and app shell nav) by fixing layout-blocking Promise.all() with Suspense boundaries, adding skeleton loading states, fixing N+1 decrypt pattern in integrations page, adding ISR caching to force-dynamic admin pages where safe, and lazy-loading heavy page components. Target: menus open and render skeleton within 100ms of click; no layout shift or blank flash. (PERF-ADMIN-01..06) (completed 2026-05-18)

### Phase 71: Glassmorphism Structural Redesign — All Surfaces
**Goal**: Every surface a paying Xtimator customer touches feels premium and modern — frosted-glass cards, vibrant brand-tinted gradients on hero zones, stronger typography hierarchy, generous whitespace — without changing information architecture, navigation, or copy. Information stays where it is; presentation gets a Stripe-Dashboard-tier overhaul.
**Depends on**: Phase 70 (Stripe Connect UI surfaces are now landed and can be styled into the new design system in the same pass)
**Requirements**: REDESIGN-01, REDESIGN-02, REDESIGN-03, REDESIGN-04, REDESIGN-05, REDESIGN-06, REDESIGN-07, REDESIGN-08, REDESIGN-09, REDESIGN-10
**Success Criteria** (what must be TRUE):
  1. New glass surface tokens (`--glass-bg`, `--glass-bg-strong`, `--glass-border`, `--glass-blur`) and vibrant gradient palette (`--gradient-brand`, `--gradient-hero`, `--gradient-success`, `--gradient-warning`, `--gradient-danger`) ship in `app/globals.css` and are documented in a `/admin/design-system` reference page that renders every primitive and pattern variant
  2. Every shadcn primitive in `components/ui/*` gains optional glass/gradient variants without breaking existing call sites — `<Card variant="glass">`, `<Button variant="primary">` with gradient bg + shimmer hover, `<Dialog>` with backdrop-blur, `<Input>` with gradient focus border, `<Badge>` with gradient status variants, `<Tabs>` with gradient indicator
  3. Marketing + auth surfaces (`/`, `/blog/[slug]`, `/login`, `/signup`, `/reset-password`, `/onboarding/*` 5-step wizard) all use the new glass + gradient system; hero zones gain `--gradient-hero` radial backdrop; auth pages get glass card on gradient backdrop
  4. App shell (sidebar, top bar, bottom-nav, settings dropdown, language toggle, theme toggle) renders with glass surfaces and gradient highlight on active nav items; dashboard + collections (`/dashboard`, `/clients`, `/projects`) use glass stat cards with gradient top borders and glass list rows
  5. Project surfaces (`/projects/[id]` workspace 5 tabs, `/projects/[id]/capture` + `/describe` + `/photos-input`, estimate editor inline) all redesigned; capture screen gains gradient progress ring + glass stepper card; estimate editor gets glass row cards
  6. Customer-facing share page (`/estimate/[token]`) and "Pay Now" surfaces from Phase 70 use the new glass + gradient styling — Pay Now button gets brand gradient + subtle shimmer; success banner gets glass + success gradient
  7. Settings surfaces (every `/settings/*` sub-page including new `/settings/payments` from Phase 70) and admin surfaces (every `/admin/*` sub-page) use the new system; billing page tier cards get prominent gradients per tier (Free/Pro/Business)
  8. Brand identity unchanged — `#406EF1` is still the primary, logo + wordmark are byte-identical, dark mode is still default, scoped themes (`[data-theme="dark-auth"]`, forced-light `/estimate/*`) still work
  9. Playwright visual snapshot baselines updated for every redesigned surface (expected — every existing snapshot WILL break and must be re-minted; no false-positive regressions allowed in the test suite after wave 5 lands)
  10. Performance: Lighthouse Performance + Accessibility scores stay ≥ 80 on `/` and `/dashboard` after redesign; First Load JS for `/dashboard` stays under 500 KB; `backdrop-filter: blur()` restricted to top surfaces only (hero, modals, sidebar — NOT every list row) so mid-range mobile GPUs stay smooth; `prefers-reduced-transparency` honored with solid-bg fallback
**Plans**: TBD (estimated 10 plans across 5 waves — see SEED-022 for wave breakdown)
**UI hint**: yes (this entire phase is UI — run `/gsd:ui-phase 71` to generate UI-SPEC.md BEFORE planning)

### Phase 72: Admin Menu Performance — Instant Navigation
**Goal**: Eliminate the perceived lag when opening admin menus in both the super-admin panel (`/admin/*`) and the client-facing app shell. Menus must open and render a skeleton within 100ms of click; no blank flash or layout shift. Root causes identified: (1) layout-level `Promise.all()` with no Suspense boundaries blocks the entire layout render including nav; (2) admin pages use `force-dynamic` with no caching, regenerating expensive queries on every navigation; (3) integrations page has an N+1 decrypt + `getUserById()` pattern; (4) admins page fetches 1000 users on load; (5) no loading skeletons — blank screen feels broken.
**Depends on**: Phase 71 (glassmorphism redesign landed; skeletons must match new glass design tokens)
**Requirements**: PERF-ADMIN-01, PERF-ADMIN-02, PERF-ADMIN-03, PERF-ADMIN-04, PERF-ADMIN-05, PERF-ADMIN-06
**Success Criteria** (what must be TRUE):
  1. `app/admin/layout.tsx` and `app/(app)/layout.tsx` wrap slow data-fetching sections in `<Suspense>` with skeleton fallbacks — nav and topbar render immediately while page content loads behind a skeleton
  2. Admin pages that had `force-dynamic` now use `revalidate` (ISR) or React cache with appropriate TTLs where data freshness allows; pages that must stay dynamic ship with `loading.tsx` skeleton files so Next.js streaming kicks in
  3. `app/admin/integrations/page.tsx` N+1 decrypt + `getUserById()` loop replaced with a single JOIN query + batch decrypt — page load time drops from O(n) round-trips to O(1)
  4. `app/admin/admins/page.tsx` drops the `listUsers({ perPage: 1000 })` call; replaced with a paginated fetch (first 50) + server-side search, or a cached count query — no unbounded user list load on every nav
  5. Every admin page (`/admin/*`) and every app-shell nav transition shows a skeleton within 100ms — measured by adding `loading.tsx` to every admin route segment that lacks one
  6. No regressions: all existing admin CRUD actions (invite admin, suspend/reactivate, branding update, billing view) continue to work correctly after the caching and query changes
**Plans**: 3 plans in `.planning/phases/72-admin-menu-performance/`
Plans:
- [x] 72-01-PLAN.md — 10 loading.tsx skeleton files for all admin routes + revalidate=60 ISR on 4 stable admin pages (PERF-ADMIN-01, PERF-ADMIN-02)
- [x] 72-02-PLAN.md — Admin layout Suspense boundary + app shell getBranding parallelized with getCachedCompany (PERF-ADMIN-03, PERF-ADMIN-06)
- [x] 72-03-PLAN.md — integrations N+1 getUserById batch fix + admins page listUsers(1000) replaced with bounded getUserById per row (PERF-ADMIN-04, PERF-ADMIN-05, PERF-ADMIN-06)

### Phase 66: Storage Abstraction Layer
**Goal**: Every storage call site in the app routes through a `lib/storage/` provider interface so swapping Supabase Storage for an S3-compatible backend (Hetzner Object Storage, MinIO, etc.) is a 1-line provider change. Default provider stays Supabase; the S3 path ships as a working skeleton validated against MinIO. Sequenced first because doing the refactor under live customer load (post-launch) is much riskier than now during a clean window — and Phase 67 (Inngest) workers can use the new `storage.*` API from day one with no follow-up refactor.
**Depends on**: Phase 61 (production database foundation; clean baseline before refactor)
**Requirements**: STORAGE-01, STORAGE-02, STORAGE-03, STORAGE-04, STORAGE-05, STORAGE-06, STORAGE-07
**Success Criteria** (what must be TRUE):
  1. `lib/storage/index.ts` exports a `StorageProvider` interface with `upload`, `download`, `getSignedUrl`, `delete`, and `list` methods; `lib/storage/supabase-provider.ts` implements it and is the default `storage` export
  2. Running `grep -r "supabase.storage.from" app/ lib/ components/` returns zero hits outside `lib/storage/` — every audio, photo, PDF, logo, branding asset, and WhatsApp media call site uses the new `storage.*` API
  3. All signed URLs include an explicit `expiresInSeconds` value, all keys follow the `{company_id}/{type}/{timestamp}-{filename}` convention, and no caller relies on Supabase-specific `transformOptions` or on-the-fly resize endpoints
  4. With `STORAGE_PROVIDER=s3` set against a local MinIO container, upload + signed URL + download + delete all complete successfully end-to-end (smoke proof the abstraction holds), then Supabase is restored as the default
  5. `docs/STORAGE-MIGRATION.md` ships with provisioning steps, the exact `aws s3 sync` command, the endpoint swap procedure, and the documented 800 MB Supabase storage usage trigger threshold
**Plans**: 3 plans in `.planning/phases/66-storage-abstraction-layer/`
Plans:
- [x] 66-01-PLAN.md — Wave 0 RED contract tests + StorageProvider interface + Supabase provider + buildStorageKey helper (STORAGE-01, STORAGE-02, STORAGE-04)
- [x] 66-02-PLAN.md — Migrate all 8 production call sites (logos → audio → photos → pdfs → wa-media) + 3 affected tests (STORAGE-03, STORAGE-04)
- [x] 66-03-PLAN.md — S3 provider skeleton + STORAGE_PROVIDER env gate + MinIO smoke script + docs/STORAGE-MIGRATION.md runbook (STORAGE-05, STORAGE-06, STORAGE-07)

### Phase 67: Inngest Background AI Job Processing
**Goal**: All long-running AI calls (estimate generation, audio transcription, photo analysis) run as Inngest background jobs so the API routes return in under 1 second — unblocking the Vercel Free 10-second function timeout while keeping the same UX (live "Saving / Transcribing / Analyzing / Generating" progress) via job-status polling. Inngest is forward-compatible with the future Hetzner host (no swap needed at migration time).
**Depends on**: Phase 66 (Inngest worker functions consume the new `storage.*` API from day one — no follow-up refactor required)
**Requirements**: INNGEST-01, INNGEST-02, INNGEST-03, INNGEST-04, INNGEST-05, INNGEST-06, INNGEST-07, INNGEST-08
**Success Criteria** (what must be TRUE):
  1. `POST /api/generate-estimate`, `POST /api/transcribe`, and `POST /api/analyze-photos` each return `{ jobId }` in under 1 second — the actual Anthropic / Whisper / Vision call runs inside an Inngest worker function and `usage_events` is recorded only on job success
  2. The capture screen displays a live "Saving / Transcribing / Analyzing / Generating" stepper driven by `GET /api/jobs/[jobId]` polling, and the user lands in the estimate editor when the final job completes — same UX as today, no perceivable regression
  3. Every external AI call inside an Inngest function is wrapped in `step.run()` with an explicit `idempotencyKey` so a retry never double-charges Anthropic / OpenAI
  4. The WhatsApp inbound handler dispatches Whisper / Vision work via Inngest instead of awaiting it inline — the webhook ack returns to Meta in well under 10 seconds even on long voice notes
  5. A developer running `npx inngest-cli dev` alongside `npm run dev` sees jobs land at `localhost:8288` with full execution traces; the local workflow is documented in repo (e.g. `docs/INNGEST-LOCAL-DEV.md` or README addendum)
**Plans**: 5 plans in `.planning/phases/67-inngest-background-ai-jobs/`
Plans:
- [x] 66-01-PLAN.md — Wave 0 RED test stubs + verify usage_events idempotency UNIQUE index
- [x] 66-02-PLAN.md — Inngest install + client + serve handler + 4 worker functions (generateEstimateJob, transcribeAudioJob, analyzePhotosJob, whatsAppProcessJob)
- [ ] 66-03-PLAN.md — Refactor 3 AI routes to dispatch + create new /api/transcribe + /api/jobs/[jobId] proxy
- [ ] 66-04-PLAN.md — Refactor lib/whatsapp/handler.ts:processInboundMessages to dispatch via Inngest
- [ ] 66-05-PLAN.md — useJobStatus hook + capture-recorder.tsx polling + docs/INNGEST-LOCAL-DEV.md
**UI hint**: yes

### Phase 68: Hetzner Cloud Deploy-Readiness Artifacts
**Goal**: The repository ships every artifact required to deploy to a Hetzner Cloud VPS (Dockerfile, docker-compose with Caddy, `/api/health`, runbook) so the future v3.2 deploy is mechanical — but nothing is activated in this milestone. Local Docker build is proven to boot the app correctly. Sequenced after Storage + Inngest so the `/api/health` storage check uses the new `storage.*` API and the Docker image bundles the Inngest worker route.
**Depends on**: Phase 66 (the `/api/health` storage check uses the new `storage.*` API), Phase 67 (Dockerfile must include the Inngest worker route in its standalone output)
**Requirements**: HETZNER-01, HETZNER-02, HETZNER-03, HETZNER-04, HETZNER-05, HETZNER-06
**Success Criteria** (what must be TRUE):
  1. `next.config.mjs` is set to `output: 'standalone'` and `npm run build` produces `.next/standalone/server.js`; the Dockerfile is a multi-stage Node 22 alpine build that runs as a non-root user, exposes port 3000, and produces an image under 500 MB
  2. A developer can run `docker build -t xtimator . && docker run -p 3000:3000 --env-file .env.local xtimator` on Windows / macOS / Linux — the app boots, `/api/health` returns 200 with `{ ok, db, storage, commit }`, and a fresh signup + login flow completes against dev Supabase
  3. `docker-compose.yml` at the repo root brings up the Next.js service plus a Caddy reverse proxy with automatic Let's Encrypt HTTPS, an env file mount, and `restart: unless-stopped`
  4. `app/api/health/route.ts` returns 200 with `{ ok: true, db: 'ok', storage: 'ok', commit: '<sha>' }` — DB connectivity verified by a SELECT against `companies`, storage verified via a `storage.list(...)` call against the configured provider, commit SHA read from `process.env.GIT_SHA`
  5. `docs/HETZNER-DEPLOY.md` is a runbook a developer can follow end-to-end (provision CX22 → Docker + Caddy install → DNS A record → populate `.env.production` on server → `docker compose up -d` → `/api/health` smoke → UFW firewall → cert renewal verification → daily off-server backup of `.env.production`) — placeholder syntax only for any secret values, never real keys
**Plans**: TBD

### Phase 69: UAT Validation + Bug Triage + Perf Audit
**Goal**: Every refactored surface is exercised by a human against localhost — v2.2 WhatsApp polish, the v3.0 monetization stack, the new Inngest background pipeline, every storage path post-refactor, end-to-end happy path, multi-modal capture, i18n smoke. Critical bugs are fixed in this milestone with linked commits; non-critical findings are documented. Lighthouse + bundle-size audit captured. The milestone exits clean only when `.planning/known-issues.md` has a verdict for every UAT test. Sequenced last because it validates every refactor + artifact above.
**Depends on**: Phase 66 (storage refactor must be in place to validate UAT-STORAGE-01), Phase 67 (Inngest must be wired to validate UAT-INNGEST-01..02), Phase 68 (Docker artifacts available; UAT can optionally run against the Dockerized localhost build)
**Requirements**: UAT-V22-01, UAT-V22-02, UAT-V30-01, UAT-V30-02, UAT-V30-03, UAT-V30-04, UAT-V30-05, UAT-V30-06, UAT-INNGEST-01, UAT-INNGEST-02, UAT-STORAGE-01, UAT-E2E-01, UAT-E2E-02, UAT-E2E-03, FIX-01, FIX-02, PERF-01, PERF-02
**Success Criteria** (what must be TRUE):
  1. Every v2.2 + v3.0 + Inngest + Storage UAT test (`UAT-V22-*`, `UAT-V30-*`, `UAT-INNGEST-*`, `UAT-STORAGE-01`, `UAT-E2E-*`) has a pass-or-fail verdict line in `.planning/known-issues.md` — no silent successes
  2. The full happy path is observed in one sitting: brand-new account signs up, completes onboarding, captures audio at a fixture job site, the AI generates an estimate via Inngest, the owner sends a share link to a fixture client, the client opens the share page and accepts; multi-modal variants (text-only, photos-only, audio+photos+text) all produce sensible estimates; switching language to PT-BR and ES translates the dashboard, capture screen, and billing page without crashes
  3. The 8-minute long-audio test completes successfully via Inngest — proving the timeout-killer that would have failed on Vercel Free without the background-job refactor; tier enforcement (free 402, pro/business higher caps), Stripe test-mode happy path, Customer Portal, trial automation (T-3/T-0 emails arrive), admin force-tier + bonus credits + MRR view all observable
  4. Every storage path validated post-refactor — audio upload, photo upload, PDF generation, logo upload, and WhatsApp inbound media — uses the new `storage.*` API and works against Supabase
  5. Every critical bug surfaced is fixed in this milestone with a linked commit reference; every non-critical finding is captured in `.planning/known-issues.md` with severity, repro steps, and a proposed fix direction; the file exists at milestone close even on a "zero bugs found" outcome
  6. Lighthouse scores >= 80 in Performance and Accessibility on `/` (landing) and `/dashboard` (authenticated); `npm run build` reports First Load JS for `/dashboard` under 500 KB or the rationale is captured in `.planning/known-issues.md`
**Plans**: TBD
**UI hint**: yes

### Phase 70: Stripe Connect — Optional Customer Payments on Estimates
**Goal**: Any service business that connects their Stripe account once via OAuth in Settings → Payments gets a "Pay Now" button on every shared estimate. Customer pays the full estimate total via Stripe Checkout hosted on the business's connected account; webhook marks the estimate paid, emails business owner, emails customer branded receipt, shows banner on share page. The integration is 100% optional — companies without Stripe connected see zero Stripe UI anywhere and all existing share/PDF/email flows work unchanged. Application fee is 0% (provider keeps 100%; Xtimator monetizes via SaaS plans only). Harvests SEED-020.
**Depends on**: Phase 7 (estimate share page exists), Phase 58 (Stripe client + webhook infrastructure exists for SaaS billing)
**Requirements**: CONNECT-01, CONNECT-02, CONNECT-03, CONNECT-04, CONNECT-05, CONNECT-06, CONNECT-07, CONNECT-08, CONNECT-09
**Success Criteria** (what must be TRUE):
  1. A business owner can navigate to Settings → Payments, click "Connect Stripe Account", complete Stripe OAuth (test mode in dev), and return to a page showing "Connected ✓ as [account display name]" with a Disconnect button — `companies.stripe_account_id` is populated and `stripe_connect_status = 'active'`
  2. On a shared estimate page (`/estimate/[token]`), if the owning company has `stripe_account_id` AND `payment_status != 'paid'`, a "Pay $X" button is rendered using the estimate total; clicking it creates a Stripe Checkout Session on the connected account (via `stripeAccount` option) and redirects the customer to the Stripe-hosted payment page
  3. On the same shared estimate page, if the company has no `stripe_account_id` OR `payment_status == 'paid'`, no Pay Now button is shown and the existing share UI (accept/decline, PDF download, branded view) renders exactly as before — confirmed via two snapshot tests, one with Stripe connected and one without
  4. When the customer completes payment on Stripe Checkout, the `checkout.session.completed` webhook (received with `event.account = acct_xxx`) is matched to the company by `stripe_account_id`, the estimate is found by `metadata.estimate_id`, and the row is updated: `payment_status = 'paid'`, `stripe_checkout_session_id`, `stripe_payment_intent_id`, `paid_at`, `payment_amount_cents`
  5. After payment, the business owner receives a Resend email "You received $X from [customer]" with a link to the estimate, and the customer receives a Resend branded receipt email "Payment confirmation — $X paid to [business]"; the customer is redirected back to `/estimate/[token]?stripe=success` where a green "✓ Payment received — thank you!" banner is shown and the Pay Now button is gone
  6. A business owner can click Disconnect in Settings → Payments and `stripe_account_id` is cleared, `stripe_connect_status = 'disconnected'` — existing paid estimates retain their `paid` status; new shared estimates simply lose the Pay Now button (graceful degrade, no errors)
  7. The platform owner can add a `stripe_connect_client_id` (`ca_...`) value via `/admin/integrations` (managed via existing `platform_integrations` table pattern); when this is unset, Settings → Payments shows "Stripe Connect not yet enabled on the platform — contact support" and never attempts an OAuth redirect that would 404
**Plans**: TBD


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
- [x] 40-02-PLAN.md — Webhook route (GET challenge + POST HMAC handler + dedup stub) + proxy.ts bypass

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
| 62. Vercel Deployment + Custom Domain | v3.1 | 0/TBD | DEFERRED → v3.2 | - |
| 63. Stripe Live Mode Activation | v3.1 | 0/TBD | DEFERRED → v3.2 | - |
| 64. Monitoring + Backup & Resilience | v3.1 | 0/TBD | DEFERRED → v3.2 | - |
| 65. Production UAT + Bug Triage | v3.1 | 0/TBD | DEFERRED → v3.2 | - |
| 66. Storage Abstraction Layer | v3.1.1 | 3/3 | Complete    | 2026-05-15 |
| 67. Inngest Background AI Job Processing | v3.1.1 | 5/5 | Complete    | 2026-05-15 |
| 68. Hetzner Cloud Deploy-Readiness Artifacts | v3.1.1 | 2/3 | Complete    | 2026-05-15 |
| 69. UAT Validation + Bug Triage + Perf Audit | v3.1.1 | 0/TBD | Complete    | 2026-05-15 |
| 70. Stripe Connect — Customer Payments | v3.1.1 | 5/5 | Complete    | 2026-05-17 |
| 71. Glassmorphism Structural Redesign | v3.1.1 | 11/11 | Complete    | 2026-05-17 |

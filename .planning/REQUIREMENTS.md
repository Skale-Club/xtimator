# Requirements: v3.1.1 MVP Launch Prep + Future-Proofing

**Goal:** Make the codebase ready to deploy on Vercel Free as MVP (Inngest unblocks AI timeouts, storage abstraction unblocks future migration), validate everything still works after the refactors, and ship the Hetzner Cloud artifacts so the eventual self-hosted migration is mechanical.

**Started:** 2026-05-15
**Status:** Defining requirements (rescoped after Inngest + Storage decisions)

## Why this milestone (the gap Phase 61 exposed + decisions made during discuss)

Phase 61 discovered that 9 migrations from phases 43-60 — including the entire v3.0 monetization schema — were never applied to the database. With migrations now applied, the v3.0 work can finally be validated.

Two architectural decisions during discuss expanded the scope from "pure UAT" to "MVP launch prep":

1. **Vercel Free for MVP** (user choice) → AI routes (`/api/generate-estimate`, `/api/transcribe`, `/api/analyze-photos`) will hit the 10s function timeout. **Inngest** background jobs is the only viable fix that's also forward-compatible with Hetzner.
2. **Hetzner future migration** (target_host locked in SEED-018) → Storage abstraction layer now (instead of refactoring later under launch pressure) makes the Supabase Storage → Hetzner Object Storage swap trivial.

Doing both refactors before any production deploy means the launch (separate v3.2 milestone) is "ship + smoke" not "build new things in front of customers".

---

## v1 Requirements (this milestone)

### INNGEST — Background AI Job Processing

- [ ] **INNGEST-01**: `inngest` SDK installed; `lib/inngest/client.ts` exports configured client; `app/api/inngest/route.ts` registers worker functions and is publicly reachable
- [x] **INNGEST-02**: `/api/generate-estimate` POST returns `{ jobId }` in <1s — actual estimate generation moved to `generateEstimateJob` Inngest function (no timeout); `usage_events` recorded only on job success
- [x] **INNGEST-03**: `/api/transcribe` POST returns `{ jobId }` in <1s — Whisper call moved to `transcribeAudioJob` Inngest function; result polled via `GET /api/jobs/:id` or pushed via SSE
- [x] **INNGEST-04**: `/api/analyze-photos` POST returns `{ jobId }` — Vision call moved to `analyzePhotosJob` Inngest function
- [x] **INNGEST-05**: Frontend polls job status via `GET /api/jobs/[jobId]` — capture flow shows "Processing… (Saving / Transcribing / Analyzing / Generating)" stepper with real Inngest status feed
- [ ] **INNGEST-06**: Inngest functions are idempotent — `step.run()` blocks used for each external call so retries don't double-charge AI providers; explicit `idempotencyKey` per job
- [x] **INNGEST-07**: WhatsApp inbound handler refactored — long-running Whisper/Vision calls in `lib/whatsapp/handler.ts` dispatched via Inngest, not awaited inline (still <10s for the webhook ack)
- [x] **INNGEST-08**: Local dev workflow documented — `npx inngest-cli dev` runs alongside `npm run dev`, jobs visible in dashboard at `localhost:8288`

### STORAGE — Storage Provider Abstraction (forward-compat with Hetzner Object Storage)

- [x] **STORAGE-01**: `lib/storage/index.ts` exports `StorageProvider` interface — methods: `upload(bucket, path, body, opts)`, `download(bucket, path)`, `getSignedUrl(bucket, path, expiresInSeconds)`, `delete(bucket, path)`, `list(bucket, prefix)`
- [x] **STORAGE-02**: `lib/storage/supabase-provider.ts` implements `StorageProvider` against `supabase.storage` — used by default `storage` export
- [x] **STORAGE-03**: All call sites migrated from `supabase.storage.from(...)` direct calls to the new `storage.*` API — verified by `grep -r "supabase.storage.from" app/ lib/ components/` returning zero hits outside `lib/storage/`
- [x] **STORAGE-04**: S3-friendly conventions enforced — key naming `{company_id}/{type}/{timestamp}-{filename}`, all signed URLs use explicit `expiresInSeconds`, no use of Supabase `transformOptions` or on-the-fly resize endpoints
- [x] **STORAGE-05**: `lib/storage/s3-provider.ts` skeleton implements the same interface against `@aws-sdk/client-s3` — gated behind feature flag `STORAGE_PROVIDER=s3` env var, not active by default
- [x] **STORAGE-06**: `docs/STORAGE-MIGRATION.md` documents the future Supabase → Hetzner Object Storage migration — provisioning steps, exact `aws s3 sync` command, endpoint swap procedure, threshold to trigger (800 MB Supabase storage usage)
- [x] **STORAGE-07**: Smoke test — temporarily set `STORAGE_PROVIDER=s3` pointing to a local MinIO container, confirm upload + signed URL + download + delete work, then restore Supabase as default

### HETZNER — Hetzner Cloud Deploy Readiness

- [x] **HETZNER-01**: `Dockerfile` ships at repo root — multi-stage build (deps → build → runtime), Node 22 alpine base, builds Next.js standalone output, exposes port 3000, runs as non-root user, image size under 500MB
- [x] **HETZNER-02**: `next.config.mjs` set to `output: 'standalone'` — verified `npm run build` produces `.next/standalone/server.js`
- [x] **HETZNER-03**: `docker-compose.yml` ships at repo root — Next.js service + Caddy reverse proxy with automatic HTTPS via Let's Encrypt, env file mounted, restart policy unless-stopped
- [x] **HETZNER-04**: `app/api/health/route.ts` returns 200 with JSON body `{ ok: true, db: 'ok', storage: 'ok', commit: '<sha>' }` — DB connectivity via SELECT against `companies`, storage via list-bucket call, commit SHA from `process.env.GIT_SHA`
- [x] **HETZNER-05**: `docs/HETZNER-DEPLOY.md` runbook ships — provisioning CX22, install Docker + Caddy, DNS A record, populate `.env.production` on server, `docker compose up -d`, verify `/api/health`, UFW firewall, cert renewal verification, daily off-server backup of `.env.production`
- [ ] **HETZNER-06**: Local Docker build validated — `docker build -t xtimator . && docker run -p 3000:3000 --env-file .env.local xtimator` boots the app, `/api/health` returns 200, signup + login work against the dev Supabase

### UAT — Validation Against Refactored Stack

- [ ] **UAT-V22-01**: PDF attachment delivery exercised end-to-end against localhost — owner sets `delivery_format=pdf_attachment`, sends estimate via WhatsApp, real client phone receives the PDF attachment and a follow-up share link
- [ ] **UAT-V22-02**: WhatsApp status flow exercised — verified→active auto-promotion fires, suspend/reactivate buttons work and persist, status badge reflects current state
- [ ] **UAT-V30-01**: Tier enforcement validated — free tier hits 402 on AI routes when monthly quota exhausted; pro/business tier respect their higher caps; WhatsApp gate blocks free tier BEFORE any Meta download
- [ ] **UAT-V30-02**: Stripe checkout (test mode) flow completes — `/settings/billing` → upgrade modal → Stripe Checkout → webhook fires → `companies.tier` updates → user redirected back to billing page showing new tier
- [ ] **UAT-V30-03**: Trial flow validated — new signup gets 14-day trial with Pro entitlements, trial banner appears <3 days remaining, trial expiry cron downgrades to free at T-0, T-3 + T-0 warning emails actually arrive in inbox
- [ ] **UAT-V30-04**: Stripe Customer Portal works — user can change subscription, cancel, view invoices via "Manage Subscription" button
- [ ] **UAT-V30-05**: Admin tooling validated — super-admin can force-tier any company, grant bonus credits, MRR view at `/admin/billing` shows correct totals
- [ ] **UAT-V30-06**: 402 upgrade modal triggers correctly — any AI route returning 402 shows the upgrade toast/modal in the UI, not a raw error
- [ ] **UAT-INNGEST-01**: Audio capture happy path — record 2-min audio at fixture job site, observe Inngest dashboard show `transcribeAudioJob` then `generateEstimateJob` complete, capture stepper UI updates accordingly, estimate appears in editor
- [ ] **UAT-INNGEST-02**: Long audio (8-min) — confirms estimate generation completes (would have timed out on Vercel Free without Inngest)
- [ ] **UAT-STORAGE-01**: All storage paths validated post-refactor — audio upload + photo upload + PDF generation + logo upload + WhatsApp inbound media — every flow uses new `storage.*` API and works against Supabase
- [ ] **UAT-E2E-01**: Full happy path — brand-new account signs up, completes onboarding, captures audio, AI generates estimate (via Inngest), owner sends share link, fixture client opens share page and accepts
- [ ] **UAT-E2E-02**: Multi-modal capture validated — text-only, photos-only, audio+photos+text combined all produce sensible estimates
- [ ] **UAT-E2E-03**: i18n smoke — switch language to PT-BR and ES, confirm critical surfaces (dashboard, capture, billing) translate without crashes

### FIX — Bug Triage

- [ ] **FIX-01**: All bugs found in UAT triaged — critical (blocks core flow) → fixed in this milestone with linked commit; non-critical → captured in `.planning/known-issues.md` with severity, repro steps, proposed fix direction
- [ ] **FIX-02**: `.planning/known-issues.md` exists at milestone close, regardless of zero-bug or N-bug outcome

### PERF — Performance Audit (light-touch)

- [ ] **PERF-01**: Lighthouse run against landing page (`/`) and one authenticated page (`/dashboard`) — score >= 80 in Performance and Accessibility on both, regressions documented in `.planning/known-issues.md` if not
- [ ] **PERF-02**: Bundle size check — `npm run build` output, total First Load JS for `/dashboard` under 500 KB or noted with rationale

### REDESIGN — Glassmorphism Structural Redesign (Phase 71)

- [x] **REDESIGN-01**: New design system layer ships in `app/globals.css` — glass surface tokens (`--glass-bg`, `--glass-bg-strong`, `--glass-bg-light`, `--glass-border`, `--glass-blur`, `--glass-blur-strong`) and vibrant gradient palette (`--gradient-brand`, `--gradient-hero`, `--gradient-success`, `--gradient-warning`, `--gradient-danger`) added ON TOP of existing semantic tokens (no replacement, no breakage of scoped themes)
- [x] **REDESIGN-02**: Every shadcn primitive in `components/ui/*` gains optional glass/gradient variants without breaking existing call sites; new `<Card variant="glass">`, `<Button variant="primary">` with gradient bg + shimmer hover, `<Dialog>` with backdrop-blur, `<Input>` with gradient focus border, `<Badge>` gradient status variants, `<Tabs>` with gradient indicator
- [x] **REDESIGN-03**: `/admin/design-system` reference page renders every primitive variant + every glass pattern (hero zone, stat card, modal, sidebar, toast, empty state, loading skeleton) so designers/devs can audit at a glance
- [x] **REDESIGN-04**: Marketing + auth surfaces redesigned — `/`, `/blog/[slug]`, `/login`, `/signup`, `/reset-password`, `/onboarding/*` 5-step wizard all use the new glass + gradient system; hero zones use `--gradient-hero` radial backdrop; auth pages get glass card on gradient backdrop. **Marketing portion complete in 71-03; auth/onboarding portion complete in 71-04.**
- [x] **REDESIGN-05**: App shell + collections redesigned — sidebar (glass surface + gradient active nav highlight), top bar, bottom-nav, dashboard (glass stat cards + gradient top borders), `/clients`, `/projects` (glass list rows). **Complete: app shell (71-05) + collections (71-06).**
- [x] **REDESIGN-06**: Project surfaces redesigned — `/projects/[id]` workspace 5 tabs, capture screens (`/capture` gradient progress ring + glass stepper, `/describe`, `/photos-input`), estimate editor inline (glass row cards)
- [x] **REDESIGN-07**: Customer-facing surfaces redesigned — `/estimate/[token]` share page with glass overall + gradient Pay Now button (brand gradient + shimmer) + glass success banner (success gradient); PDF preview pane glass-styled
- [x] **REDESIGN-08**: Settings + admin + billing redesigned — every `/settings/*` sub-page (including `/settings/payments` from Phase 70), every `/admin/*` sub-page; `/settings/billing` tier cards get prominent per-tier gradients (Free neutral, Pro brand, Business premium). **Complete in 71-10: 8 settings sub-pages + 10 admin sub-pages glass-styled; TierCard component ships per-tier gradient escalation (Free=glass outline, Pro=stat+primary, Business=glass+gradient-premium top+premium CTA). REDESIGN-10 numeric perf gates deferred to v3.1.1 deploy milestone — see 71-PERF-BASELINE.md for rationale and structural gates verification.**
- [x] **REDESIGN-09**: Playwright visual snapshot baselines updated for every redesigned surface — all existing snapshots WILL break and are re-minted in this phase; CI shows zero false-positive visual regressions after wave 5 lands
- [x] **REDESIGN-10**: Performance + accessibility gates — Lighthouse Performance + Accessibility scores stay ≥ 80 on `/` and `/dashboard` after redesign; First Load JS for `/dashboard` stays under 500 KB; `backdrop-filter: blur()` restricted to top surfaces only (hero, modals, sidebar) so mid-range mobile GPUs stay smooth; `prefers-reduced-transparency` honored with solid-bg fallback; brand identity unchanged (#406EF1 primary, dark-first default, logo + wordmark byte-identical, scoped themes still work)

### CONNECT — Stripe Connect Customer Payments (optional integration)

- [x] **CONNECT-01**: DB migration adds `companies.stripe_account_id` (TEXT NULL), `stripe_connect_status` (TEXT NULL, values: `pending`|`active`|`disconnected`), `stripe_connected_at` (TIMESTAMPTZ NULL), `stripe_account_email` (TEXT NULL), `stripe_account_display_name` (TEXT NULL); and `estimates.payment_status` (TEXT NOT NULL DEFAULT `'unpaid'`), `stripe_checkout_session_id` (TEXT NULL), `stripe_payment_intent_id` (TEXT NULL), `paid_at` (TIMESTAMPTZ NULL), `payment_amount_cents` (INTEGER NULL). RLS unchanged (company-scoped via existing policies). Supabase TypeScript types regenerated.
- [x] **CONNECT-02**: Platform integration key `stripe_connect_client_id` (`ca_...`) is settable via `/admin/integrations` (encrypted via existing AES-GCM platform_config pattern); when null, all Connect UI surfaces show a friendly "Stripe Connect not yet enabled on the platform — contact support" state and never redirect to a broken OAuth URL.
- [x] **CONNECT-03**: Settings → Payments page (`/settings/payments`) renders one of three states: (a) not connected → "Connect Stripe Account" button that initiates OAuth, (b) connected → "Connected ✓ as [display name]" + email + Disconnect button, (c) platform not configured → friendly message. Linked from main Settings page.
- [x] **CONNECT-04**: OAuth flow works end-to-end against Stripe test mode: `GET /api/stripe/connect/initiate` generates a CSRF state token (signed/stored), redirects to `connect.stripe.com/oauth/authorize`; `GET /api/stripe/connect/callback` verifies state, exchanges code for `stripe_user_id`, fetches account details (`email`, `display_name`), persists to companies row, redirects back to Settings → Payments with success toast.
- [x] **CONNECT-05**: Disconnect action (`POST /api/stripe/connect/disconnect`) clears `stripe_account_id`, sets `stripe_connect_status = 'disconnected'`, optionally calls Stripe OAuth deauthorize endpoint. Existing paid estimates retain their paid status; the company simply loses the ability to accept new payments until reconnecting.
- [x] **CONNECT-06**: Public estimate share page (`/estimate/[token]`) conditionally renders a "Pay $X" button when (company has `stripe_account_id` AND `estimate.payment_status != 'paid'`); button is absent in all other cases (no Stripe, already paid). Two snapshot/component tests cover both branches.
- [x] **CONNECT-07**: `POST /api/estimate/[token]/pay` creates a Stripe Checkout Session on the connected account (using `stripeAccount` header option), with `line_items` derived from estimate total, `metadata.estimate_id`, `success_url = /estimate/[token]?stripe=success&session_id={CHECKOUT_SESSION_ID}`, `cancel_url = /estimate/[token]?stripe=canceled`. Returns redirect URL; client redirects customer to Stripe.
- [x] **CONNECT-08**: Existing `/api/webhooks/stripe` handler branches on `event.account` — when present, treats as a connected-account event, finds company by `stripe_account_id`, finds estimate by `metadata.estimate_id`, updates estimate columns (`payment_status='paid'`, `stripe_checkout_session_id`, `stripe_payment_intent_id`, `paid_at`, `payment_amount_cents`), and dispatches two Resend emails (business owner notification + customer branded receipt). Idempotent via existing `stripe_processed_events` table.
- [x] **CONNECT-09**: After successful payment, customer is redirected to `/estimate/[token]?stripe=success` where a green banner ("✓ Payment received — thank you!") renders, the Pay Now button is gone, and the page is otherwise unchanged. A separate cancel path (`?stripe=canceled`) shows a neutral "Payment canceled — you can try again anytime" inline message without altering estimate state.

---

## Out of Scope (deferred to v3.2 / future)

- **Actual Vercel deploy** (v3.2 — separate milestone "MVP Launch"; this milestone is prep only, no production deploy)
- **Stripe live mode webhook** (v3.2 — depends on real public URL)
- **Sentry / external uptime monitoring** (v3.2 — needs deployed app)
- **Status page** (v3.2)
- **Production UAT against real domain** (v3.2)
- **Migration to Hetzner Object Storage** (deferred — abstraction layer is in place; trigger is 800 MB Supabase storage usage)
- **Migration to Hetzner Cloud VPS** (deferred — runbook ships in this milestone; trigger is when Vercel Free limits hurt)
- **BullMQ + Redis** (alternative to Inngest, considered for far-future Hetzner setup; not now)
- **Onboarding & Growth features** (separate milestone post v3.2)
- **Team accounts / multi-seat** (v4.0)
- **Test coverage push to >80%** (UAT in this milestone is the pragmatic check)
- **Accessibility WCAG-AA full audit** (light-touch only in PERF-01)
- **Load testing** (v3.2+)
- **Supabase backup automation** (Phase 61 confirmed daily backups exist on Free tier)

---

## Key Decisions (Critical)

1. **Vercel Free is the MVP host** — user choice, accepted ToS risk + Inngest mitigates the 10s timeout. Stripe live mode requires real domain so it stays deferred to v3.2.
2. **Inngest is the AI timeout fix and stays even after Hetzner migration** — because it gives retries, observability, concurrency limits, step functions. Future option to swap for BullMQ + Redis on Hetzner is explicitly deferred.
3. **Storage abstraction is mandatory before production deploy** — refactoring storage calls under live customer load is much riskier than doing it now during a clean refactor.
4. **Hetzner artifacts ship now but don't activate** — Dockerfile, docker-compose, runbook all in repo so v3.2 deploy is "follow the doc" not "figure it out".
5. **No actual deploy in this milestone** — every UAT runs against localhost. v3.2 is the milestone where the bits actually leave the laptop.
6. **`output: 'standalone'`** for Next.js — required for the Docker image to be small and self-contained.
7. **`known-issues.md` is the milestone's source of truth** — every UAT test produces an entry (pass or fail). No silent "I tested it and it works".
8. **Numbering skips 62-65** — those slots are reserved as DEFERRED placeholders for the v3.2 deploy milestone (Vercel deploy + Stripe live + monitoring + production UAT).

---

## Traceability

Coverage: 39/39 (100%) — every v1 requirement maps to exactly one phase, no orphans, no duplicates.

| Requirement | Phase | Status |
|-------------|-------|--------|
| STORAGE-01 | Phase 66 | Complete |
| STORAGE-02 | Phase 66 | Complete |
| STORAGE-03 | Phase 66 | Complete |
| STORAGE-04 | Phase 66 | Complete |
| STORAGE-05 | Phase 66 | Complete |
| STORAGE-06 | Phase 66 | Complete |
| STORAGE-07 | Phase 66 | Complete |
| INNGEST-01 | Phase 67 | Pending |
| INNGEST-02 | Phase 67 | Complete |
| INNGEST-03 | Phase 67 | Complete |
| INNGEST-04 | Phase 67 | Complete |
| INNGEST-05 | Phase 67 | Complete |
| INNGEST-06 | Phase 67 | Pending |
| INNGEST-07 | Phase 67 | Complete |
| INNGEST-08 | Phase 67 | Complete |
| HETZNER-01 | Phase 68 | Complete |
| HETZNER-02 | Phase 68 | Complete |
| HETZNER-03 | Phase 68 | Complete |
| HETZNER-04 | Phase 68 | Complete |
| HETZNER-05 | Phase 68 | Complete |
| HETZNER-06 | Phase 68 | Pending |
| UAT-V22-01 | Phase 69 | Pending |
| UAT-V22-02 | Phase 69 | Pending |
| UAT-V30-01 | Phase 69 | Pending |
| UAT-V30-02 | Phase 69 | Pending |
| UAT-V30-03 | Phase 69 | Pending |
| UAT-V30-04 | Phase 69 | Pending |
| UAT-V30-05 | Phase 69 | Pending |
| UAT-V30-06 | Phase 69 | Pending |
| UAT-INNGEST-01 | Phase 69 | Pending |
| UAT-INNGEST-02 | Phase 69 | Pending |
| UAT-STORAGE-01 | Phase 69 | Pending |
| UAT-E2E-01 | Phase 69 | Pending |
| UAT-E2E-02 | Phase 69 | Pending |
| UAT-E2E-03 | Phase 69 | Pending |
| FIX-01 | Phase 69 | Pending |
| FIX-02 | Phase 69 | Pending |
| PERF-01 | Phase 69 | Pending |
| PERF-02 | Phase 69 | Pending |
| CONNECT-01 | Phase 70 | Complete |
| CONNECT-02 | Phase 70 | Complete |
| CONNECT-03 | Phase 70 | Complete |
| CONNECT-04 | Phase 70 | Complete |
| CONNECT-05 | Phase 70 | Complete |
| CONNECT-06 | Phase 70 | Complete |
| CONNECT-07 | Phase 70 | Complete |
| CONNECT-08 | Phase 70 | Complete |
| CONNECT-09 | Phase 70 | Complete |
| REDESIGN-01 | Phase 71 | Complete |
| REDESIGN-02 | Phase 71 | Complete |
| REDESIGN-03 | Phase 71 | Complete |
| REDESIGN-04 | Phase 71 | Complete |
| REDESIGN-05 | Phase 71 | Complete |
| REDESIGN-06 | Phase 71 | Complete |
| REDESIGN-07 | Phase 71 | Complete |
| REDESIGN-08 | Phase 71 | Complete |
| REDESIGN-09 | Phase 71 | Complete |
| REDESIGN-10 | Phase 71 | Complete |

### TOUR-FIX — Tour & Tooltip System QA (Phase 75)

- [x] **TOUR-FIX-01**: Audit doc lists every ContextualTooltip mount point + every TourStep with: target selector, trigger condition, dismiss rule, intended side. Lives at `tests/visual/tour-inventory.md`.
- [x] **TOUR-FIX-02**: No tooltip or spotlight appears on initial page load, refresh, or unrelated navigation unless explicitly triggered. Verified by Playwright spec opening every authenticated page and asserting tooltip surfaces are not visible by default.
- [x] **TOUR-FIX-03**: Tooltip positioning respects the `side` prop and auto-flips to opposite side when there's not enough viewport room (Floating UI behavior). No tooltip overflows the viewport.
- [x] **TOUR-FIX-04**: Dismissed tooltips persist as seen in localStorage (or DB if cross-device sync desired). Once dismissed, never reappear unless user clicks "Restart tour" in `TourHelpButton`.
- [ ] **TOUR-FIX-05**: `prefers-reduced-motion` honored on every tour animation; `prefers-reduced-transparency` honored on spotlight overlay backdrop; ESC key dismisses spotlight; focus trap removed when spotlight closes.
- [x] **TOUR-FIX-06**: Unit tests for the tour state machine (start, advance, prev, dismiss, restart, edge cases like advancing past last step) and tooltip persistence layer (seen flag set/read/cleared). Minimum 8 cases passing.
- [ ] **TOUR-FIX-07**: Manual UAT — exercise every tooltip + every tour step in EN, PT, and ES. Confirm strings translated, position correct, no overlap with sticky topbar or hero gradient, animation gated by motion preference. Findings logged in `.planning/known-issues.md` if any.
| TOUR-FIX-01 | Phase 75 | Complete |
| TOUR-FIX-02 | Phase 75 | Complete |
| TOUR-FIX-03 | Phase 75 | Complete |
| TOUR-FIX-04 | Phase 75 | Complete |
| TOUR-FIX-05 | Phase 75 | Pending |
| TOUR-FIX-06 | Phase 75 | Complete |
| TOUR-FIX-07 | Phase 75 | Pending |

### PB-CSV — Price Book CSV Pro (Phase 76)

- [ ] **PB-CSV-01**: CSV import is a 4-step wizard (Upload · Map columns · Preview+edit · Confirm+result) with a visible step indicator. Closing mid-wizard offers "Save progress" so reopening returns to the same step.
- [ ] **PB-CSV-02**: Column header auto-detection — alias dictionary maps common spreadsheet names (item/service/desc → name; price/cost/rate → unit_price; category/group → folder; uom/qty unit → unit). Owner can override every mapping via dropdown. Unmapped columns shown as "Skip".
- [ ] **PB-CSV-03**: Preview table allows per-row inline editing of name/unit/unit_price/folder. Validation errors (negative price, empty name, malformed currency) shown inline with red border + tooltip; rows with unresolved errors blocked from import (greyed out checkbox).
- [ ] **PB-CSV-04**: Locale-aware currency parsing accepts US (`$1,234.56`), BR (`R$ 1.234,56`), plain (`1234`, `1234.5`), and quoted variants. UI shows detected locale guess; owner can override (US / BR / Custom decimal + thousands separator).
- [ ] **PB-CSV-05**: Duplicate resolution — when input row collides with existing (name+folder), user picks global strategy: Skip · Update · Import as new with suffix. Per-row override available in preview table.
- [ ] **PB-CSV-06**: Dry-run summary card BEFORE any DB write — shows N to insert, N to update, N to skip, N new folders to create. Single "Confirm import" button commits.
- [ ] **PB-CSV-07**: `price_book_imports` table tracks every batch with imported row IDs and folder IDs. "Undo last import" button reverts the batch (5-min eligibility window). Toast confirms undo with rows-removed count.
- [ ] **PB-CSV-08**: Large files (>200 rows) show streaming progress UI ("Importing X of Y…") with cancel button. Server action chunks inserts (50 at a time) so UI ticks update via React state polling or server-sent events.
- [ ] **PB-CSV-09**: When any row fails server-side validation, response includes a downloadable `import-errors.csv` with the failed rows + extra `error_reason` column. Same column layout as input so user can fix and re-upload.
- [ ] **PB-CSV-10**: Test coverage — unit: auto-detect aliases (8 cases), locale parsing (12 cases), dedupe strategies × scenarios (≥6 cases), wizard state machine (≥6 cases). Playwright E2E spec walks the full happy path with a 50-row fixture file. All passing.
| PB-CSV-01 | Phase 76 | Pending |
| PB-CSV-02 | Phase 76 | Pending |
| PB-CSV-03 | Phase 76 | Pending |
| PB-CSV-04 | Phase 76 | Pending |
| PB-CSV-05 | Phase 76 | Pending |
| PB-CSV-06 | Phase 76 | Pending |
| PB-CSV-07 | Phase 76 | Pending |
| PB-CSV-08 | Phase 76 | Pending |
| PB-CSV-09 | Phase 76 | Pending |
| PB-CSV-10 | Phase 76 | Pending |

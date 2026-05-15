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
- [ ] **INNGEST-08**: Local dev workflow documented — `npx inngest-cli dev` runs alongside `npm run dev`, jobs visible in dashboard at `localhost:8288`

### STORAGE — Storage Provider Abstraction (forward-compat with Hetzner Object Storage)

- [x] **STORAGE-01**: `lib/storage/index.ts` exports `StorageProvider` interface — methods: `upload(bucket, path, body, opts)`, `download(bucket, path)`, `getSignedUrl(bucket, path, expiresInSeconds)`, `delete(bucket, path)`, `list(bucket, prefix)`
- [x] **STORAGE-02**: `lib/storage/supabase-provider.ts` implements `StorageProvider` against `supabase.storage` — used by default `storage` export
- [x] **STORAGE-03**: All call sites migrated from `supabase.storage.from(...)` direct calls to the new `storage.*` API — verified by `grep -r "supabase.storage.from" app/ lib/ components/` returning zero hits outside `lib/storage/`
- [x] **STORAGE-04**: S3-friendly conventions enforced — key naming `{company_id}/{type}/{timestamp}-{filename}`, all signed URLs use explicit `expiresInSeconds`, no use of Supabase `transformOptions` or on-the-fly resize endpoints
- [x] **STORAGE-05**: `lib/storage/s3-provider.ts` skeleton implements the same interface against `@aws-sdk/client-s3` — gated behind feature flag `STORAGE_PROVIDER=s3` env var, not active by default
- [x] **STORAGE-06**: `docs/STORAGE-MIGRATION.md` documents the future Supabase → Hetzner Object Storage migration — provisioning steps, exact `aws s3 sync` command, endpoint swap procedure, threshold to trigger (800 MB Supabase storage usage)
- [x] **STORAGE-07**: Smoke test — temporarily set `STORAGE_PROVIDER=s3` pointing to a local MinIO container, confirm upload + signed URL + download + delete work, then restore Supabase as default

### HETZNER — Hetzner Cloud Deploy Readiness

- [ ] **HETZNER-01**: `Dockerfile` ships at repo root — multi-stage build (deps → build → runtime), Node 22 alpine base, builds Next.js standalone output, exposes port 3000, runs as non-root user, image size under 500MB
- [ ] **HETZNER-02**: `next.config.mjs` set to `output: 'standalone'` — verified `npm run build` produces `.next/standalone/server.js`
- [ ] **HETZNER-03**: `docker-compose.yml` ships at repo root — Next.js service + Caddy reverse proxy with automatic HTTPS via Let's Encrypt, env file mounted, restart policy unless-stopped
- [ ] **HETZNER-04**: `app/api/health/route.ts` returns 200 with JSON body `{ ok: true, db: 'ok', storage: 'ok', commit: '<sha>' }` — DB connectivity via SELECT against `companies`, storage via list-bucket call, commit SHA from `process.env.GIT_SHA`
- [ ] **HETZNER-05**: `docs/HETZNER-DEPLOY.md` runbook ships — provisioning CX22, install Docker + Caddy, DNS A record, populate `.env.production` on server, `docker compose up -d`, verify `/api/health`, UFW firewall, cert renewal verification, daily off-server backup of `.env.production`
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
| INNGEST-08 | Phase 67 | Pending |
| HETZNER-01 | Phase 68 | Pending |
| HETZNER-02 | Phase 68 | Pending |
| HETZNER-03 | Phase 68 | Pending |
| HETZNER-04 | Phase 68 | Pending |
| HETZNER-05 | Phase 68 | Pending |
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

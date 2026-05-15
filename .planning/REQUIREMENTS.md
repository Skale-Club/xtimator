# Requirements: v3.1.1 Quality & Polish + Hetzner Readiness

**Goal:** Validate the entire app stack against the recovered DB schema (v3.0 monetization was never functionally tested before Phase 61), fix any bugs that surface, and ship the deploy artifacts (Dockerfile + `/api/health` + runbook) needed to make the future Hetzner Cloud migration mechanical instead of exploratory.

**Started:** 2026-05-15
**Status:** Roadmap complete — phases 66, 67, 68 defined

## Why this milestone (the gap Phase 61 exposed)

Phase 61 discovered that 9 migrations from phases 43-60 — including the entire v3.0 monetization schema (`companies.tier`, `usage_events`, `processed_stripe_events`, etc.) — **were never applied to the database**. The features "shipped" but never functioned end-to-end. With migrations now applied, the v3.0 work can be validated for the first time. Doing this BEFORE paying for hosting and exposing real customers protects the launch.

In parallel, the v3.2 hosting decision is locked: **Hetzner Cloud VPS** (~€4-7/mo). Producing the Docker artifacts + health endpoint + runbook now means v3.2 is "follow the runbook" not "figure out how to deploy" — typically a 1-day vs 1-week difference.

---

## v1 Requirements (this milestone)

### UAT-V22 — v2.2 Manual Validation (WhatsApp Channel Polish)

- [ ] **UAT-V22-01**: PDF attachment delivery exercised end-to-end against localhost — owner sets `delivery_format=pdf_attachment`, sends estimate via WhatsApp, real client phone receives the PDF attachment and a follow-up share link
- [ ] **UAT-V22-02**: WhatsApp status flow exercised — verified→active auto-promotion fires, suspend/reactivate buttons work and persist, status badge reflects current state
- [ ] **UAT-V22-03**: Bug or no-bug verdict captured for every UAT-V22 test in `.planning/known-issues.md`

### UAT-V30 — v3.0 Manual Validation (Monetization)

- [ ] **UAT-V30-01**: Tier enforcement validated — free tier hits 402 on AI routes when monthly quota exhausted; pro/business tier respect their higher caps; WhatsApp gate blocks free tier BEFORE any Meta download
- [ ] **UAT-V30-02**: Stripe checkout (test mode) flow completes — `/settings/billing` → upgrade modal → Stripe Checkout → webhook fires → `companies.tier` updates → user redirected back to billing page showing new tier
- [ ] **UAT-V30-03**: Trial flow validated — new signup gets 14-day trial with Pro entitlements, trial banner appears <3 days remaining, trial expiry cron downgrades to free at T-0, T-3 + T-0 warning emails actually arrive in inbox
- [ ] **UAT-V30-04**: Stripe Customer Portal works — user can change subscription, cancel, view invoices via "Manage Subscription" button
- [ ] **UAT-V30-05**: Admin tooling validated — super-admin can force-tier any company, grant bonus credits, MRR view at `/admin/billing` shows correct totals
- [ ] **UAT-V30-06**: 402 upgrade modal triggers correctly — any AI route returning 402 shows the upgrade toast/modal in the UI, not a raw error
- [ ] **UAT-V30-07**: Bug or no-bug verdict captured for every UAT-V30 test in `.planning/known-issues.md`

### UAT-E2E — End-to-End Smoke Test

- [ ] **UAT-E2E-01**: Full happy path executed against localhost — brand-new account signs up, completes onboarding (business info + industry + color + logo), captures audio at fixture job site, AI generates estimate, owner sends share link to fixture client email, client opens share page and accepts
- [ ] **UAT-E2E-02**: Multi-modal capture validated — text-only project, photos-only project, and audio+photos+text combined all produce sensible estimates
- [ ] **UAT-E2E-03**: i18n smoke — switch language to PT-BR and ES, confirm critical surfaces (dashboard, capture, billing) translate without crashes

### FIX — Bug Triage

- [ ] **FIX-01**: All bugs found in UAT triaged: critical (blocks core flow) → fixed in this milestone with linked commit; non-critical → captured in `.planning/known-issues.md` with severity, repro steps, and proposed fix direction
- [ ] **FIX-02**: `.planning/known-issues.md` exists at milestone close, regardless of zero-bug or N-bug outcome

### HETZNER — Hetzner Cloud Deploy Readiness

- [ ] **HETZNER-01**: `Dockerfile` ships at repo root — multi-stage build (deps → build → runtime), Node 22 alpine base, builds Next.js standalone output, exposes port 3000, runs as non-root user, image size under 500MB
- [ ] **HETZNER-02**: `next.config.mjs` set to `output: 'standalone'` — verified `npm run build` produces `.next/standalone/server.js`
- [ ] **HETZNER-03**: `docker-compose.yml` ships at repo root — Next.js service + Caddy reverse proxy with automatic HTTPS via Let's Encrypt, env file mounted, restart policy unless-stopped
- [ ] **HETZNER-04**: `app/api/health/route.ts` returns 200 with JSON body `{ ok: true, db: 'ok', commit: '<sha>' }` — DB connectivity verified by a single SELECT against `companies`; commit SHA from `process.env.GIT_SHA` (set at build time)
- [ ] **HETZNER-05**: `HETZNER-DEPLOY.md` runbook ships under `docs/` — step-by-step: provision CX22, install Docker + Caddy, set DNS A record, populate `.env.production` on server, `docker compose up -d`, verify `/api/health` returns 200, configure UFW firewall, set up automated cert renewal verification, daily off-server backup of `.env.production`
- [ ] **HETZNER-06**: Local Docker build validated — `docker build -t xtimator . && docker run -p 3000:3000 --env-file .env.local xtimator` boots the app, `/api/health` returns 200, signup + login work against the dev Supabase

### PERF — Performance Audit (light-touch)

- [ ] **PERF-01**: Lighthouse run against landing page (`/`) and one authenticated page (`/dashboard`) — score >= 80 in Performance and Accessibility on both, regressions documented in `.planning/known-issues.md` if not
- [ ] **PERF-02**: Bundle size check — `npm run build` output, total First Load JS for `/dashboard` under 500 KB or noted with rationale

---

## Out of Scope (deferred)

- **Vercel deployment** (v3.2 — see SEED-018; we're not deploying to Vercel)
- **Stripe live mode webhook** (v3.2 — see SEED-017; depends on real public URL)
- **Sentry / external uptime monitoring** (v3.2 — needs deployed app)
- **Status page** (v3.2)
- **Production UAT against real domain** (v3.2)
- **Onboarding & Growth features** (pricing landing section, email drip, conversion metrics — separate milestone post v3.2)
- **Team accounts / multi-seat** (v4.0 — major schema rewrite, defer until customer demand validates it)
- **Test coverage push to >80%** (deferred; UAT in this milestone is the pragmatic check)
- **Accessibility WCAG-AA full audit** (light-touch only in PERF-01)
- **Load testing** (defer to v3.2+)

---

## Key Decisions (Critical)

1. **No new features** — pure validation + deploy prep. Any "while we're here" feature work goes to a separate milestone.
2. **Hetzner Cloud locked as v3.2 host** — Docker artifacts in this milestone are Hetzner-shaped (multi-stage Dockerfile + docker-compose + Caddy), not Vercel-shaped (vercel.json stays for the cron job definitions but won't be the deploy target).
3. **Supabase stays managed** — no DB migration to self-hosted Postgres in v3.2. Hetzner hosts the Next.js app + cron + Caddy only.
4. **`output: 'standalone'`** for Next.js — required for the Docker image to be small and self-contained without `node_modules`.
5. **`/api/health` is part of v3.1.1, not v3.2** — health endpoint must exist before deploy so the runbook can use it as the smoke check.
6. **`known-issues.md` is the milestone's source of truth** — every UAT test produces an entry (pass or fail). No silent "I tested it and it works".
7. **UAT against localhost is enough** — no staging environment yet; the Hetzner deploy in v3.2 is itself the staging validation.
8. **Phase numbering skips 62-65** — v3.1.1 starts at Phase 66. Phases 62-65 are reserved as DEFERRED placeholders for v3.2 (Vercel→Hetzner deploy, Stripe live, monitoring, production UAT). Skipping past keeps the global counter unambiguous and prevents number reuse confusion when v3.2 begins.
9. **Track ordering: Hetzner artifacts FIRST, then UAT against the Dockerized build** — Phase 66 ships the Dockerfile so Phase 67 UAT exercises the same artifact that will deploy to Hetzner. Catches "works on host machine, breaks in container" issues before they become production problems.

---

## Traceability

All 21 v1 requirements are mapped to exactly one phase. Coverage: 21/21.

| Requirement | Phase | Status |
|-------------|-------|--------|
| HETZNER-01 | Phase 66 | Pending |
| HETZNER-02 | Phase 66 | Pending |
| HETZNER-03 | Phase 66 | Pending |
| HETZNER-04 | Phase 66 | Pending |
| HETZNER-05 | Phase 66 | Pending |
| HETZNER-06 | Phase 66 | Pending |
| PERF-01 | Phase 66 | Pending |
| PERF-02 | Phase 66 | Pending |
| UAT-V22-01 | Phase 67 | Pending |
| UAT-V22-02 | Phase 67 | Pending |
| UAT-V22-03 | Phase 67 | Pending |
| UAT-V30-01 | Phase 67 | Pending |
| UAT-V30-02 | Phase 67 | Pending |
| UAT-V30-03 | Phase 67 | Pending |
| UAT-V30-04 | Phase 67 | Pending |
| UAT-V30-05 | Phase 67 | Pending |
| UAT-V30-06 | Phase 67 | Pending |
| UAT-V30-07 | Phase 67 | Pending |
| UAT-E2E-01 | Phase 68 | Pending |
| UAT-E2E-02 | Phase 68 | Pending |
| UAT-E2E-03 | Phase 68 | Pending |
| FIX-01 | Phase 68 | Pending |
| FIX-02 | Phase 68 | Pending |

### Coverage Summary

- **Phase 66 (Hetzner Deploy Artifacts + Perf Audit):** 8 requirements (HETZNER-01..06, PERF-01..02) — all autonomous code work
- **Phase 67 (v2.2 + v3.0 Manual UAT):** 10 requirements (UAT-V22-01..03, UAT-V30-01..07) — all human-driven validation with checkpoint tasks
- **Phase 68 (End-to-End Smoke + Bug Triage Closeout):** 5 requirements (UAT-E2E-01..03, FIX-01..02) — mixed: human smoke + bug fix code work + closeout doc

**Total mapped:** 23 requirement entries (21 unique requirements; UAT-V22-03 and UAT-V30-07 close out their own categories, FIX-01 and FIX-02 cross-cut Phases 67-68 outputs but are owned by Phase 68 as the closeout phase).

> **Note:** UAT-V22-03 and UAT-V30-07 are bookkeeping requirements ("verdict captured for every test in known-issues.md") and live in Phase 67 because that's where the verdicts are produced. FIX-01 and FIX-02 are owned by Phase 68 because that's the milestone-close phase that owns the final state of `known-issues.md`.

# Requirements: v3.1 Production Go-Live

**Goal:** Move Xtimator from dev/test into real production — real payments, monitoring, and complete UAT — unlocking the first paying customer.

**Started:** 2026-05-15
**Status:** Roadmapped — 5 phases (61–65)

---

## v1 Requirements (this milestone)

### PROD-DEPLOY — Vercel Deployment + Custom Domain

- [ ] **PROD-DEPLOY-01**: Vercel project linked to GitHub `Skale-Club/xtimator`, auto-deploy on push to `main`
- [ ] **PROD-DEPLOY-02**: Custom domain `xtimator.com` configured with SSL/HTTPS via Vercel
- [ ] **PROD-DEPLOY-03**: All required env vars configured in Vercel production environment (Supabase, Anthropic, OpenAI, Resend, Stripe webhook secret, encryption key, app URL)
- [ ] **PROD-DEPLOY-04**: Production build passes type-check and lint without errors
- [ ] **PROD-DEPLOY-05**: Preview deployments enabled for all PRs (auto-built on PR open)

### PROD-DB — Supabase Production Setup

- [ ] **PROD-DB-01**: Production Supabase project provisioned (separate org/project from dev)
- [ ] **PROD-DB-02**: All migrations from phases 1-60 applied successfully to production database
- [ ] **PROD-DB-03**: First super-admin (skale.club@gmail.com) bootstrapped in `platform_admins` production table
- [ ] **PROD-DB-04**: PITR (Point-in-Time Recovery) enabled with 7-day retention minimum
- [ ] **PROD-DB-05**: RLS policies verified active on all tables via automated check (deny-all on platform tables, scoped to `companies.user_id` on tenant tables)

### PROD-STRIPE — Live Mode Activation

- [ ] **PROD-STRIPE-01**: Stripe live mode webhook for `https://xtimator.com/api/webhooks/stripe` created with events: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`
- [ ] **PROD-STRIPE-02**: Stripe Pro ($29/mo) and Business ($99/mo) products + recurring prices created in live mode
- [ ] **PROD-STRIPE-03**: `STRIPE_WEBHOOK_SECRET` (live mode `whsec_*`) configured in Vercel production env vars
- [ ] **PROD-STRIPE-04**: `STRIPE_PRO_PRICE_ID` and `STRIPE_BUSINESS_PRICE_ID` configured in Vercel production env vars
- [ ] **PROD-STRIPE-05**: Stripe live secret key (`sk_live_*`) registered in `/admin/integrations` (encrypted via AES-256-GCM, no `sk_test_*` in production DB)

### PROD-MONITOR — Observability

- [ ] **PROD-MONITOR-01**: Sentry integrated for runtime error tracking (server actions, API routes, client components) with source maps uploaded
- [ ] **PROD-MONITOR-02**: Vercel Analytics enabled for performance metrics and Core Web Vitals
- [ ] **PROD-MONITOR-03**: External uptime monitoring configured (UptimeRobot or BetterStack) — checks `xtimator.com` and `xtimator.com/api/health` every 5 min
- [ ] **PROD-MONITOR-04**: Critical alerts wired to email — triggered by 5xx error rate >1%, downtime >2min, payment webhook failures
- [ ] **PROD-MONITOR-05**: `/api/health` endpoint returns 200 with DB connectivity check

### PROD-UAT — End-to-End Validation

- [ ] **PROD-UAT-01**: Manual UAT of v2.2 features completed — PDF attachment delivery (WAPDF-01..04), WhatsApp status flow (WASTATUS-01..04). All flows verified working in production.
- [ ] **PROD-UAT-02**: Manual UAT of v3.0 features completed — tier enforcement on all AI routes, Stripe checkout flow, billing UI, trial banner, 402 upgrade modal, trial expiry cron, admin force-tier. All flows verified.
- [ ] **PROD-UAT-03**: End-to-end smoke test executed in production: signup → onboarding → audio capture → AI estimate → share link → trial countdown → upgrade flow → real payment → tier upgraded
- [ ] **PROD-UAT-04**: All bugs found during UAT triaged — critical fixed, non-critical documented in `.planning/known-issues.md`

### PROD-BACKUP — Resilience & Documentation

- [ ] **PROD-BACKUP-01**: Supabase automated daily backups verified (PITR + daily snapshot retention confirmed in dashboard)
- [ ] **PROD-BACKUP-02**: Status page created at `status.xtimator.com` (or `xtimator.com/status`) — minimal version showing API + DB + payment system status
- [ ] **PROD-BACKUP-03**: Incident runbook written (`.planning/runbook.md`) covering: deploy rollback, secret rotation, DB restore, Stripe webhook resync, super-admin lockout recovery

---

## Out of Scope (deferred to future milestones)

- Multi-region deployment (single us-east-1 region for v3.1 — sufficient for US-only target market)
- Advanced monitoring dashboards (Grafana, Datadog) — Sentry + Vercel Analytics enough for v3.1
- Load testing at scale — defer until first 100 paying customers
- DR drill (full restore exercise) — runbook documented in v3.1, drill in v3.2
- A/B testing infrastructure — defer to growth milestone (v3.2)
- Per-tenant region routing — single region sufficient

---

## Key Decisions (Critical)

1. **Single Stripe live webhook for one domain** — `xtimator.com` only, no staging webhook in live mode (use test mode for staging)
2. **Supabase production = separate project** — clean separation from dev DB; never share creds; migrations applied via `supabase db push --db-url <PROD_URL>`
3. **Sentry over self-hosted** — managed service, free tier covers <5k events/mo (v3.1 scale)
4. **Email-only alerting first** — Slack integration deferred until team grows beyond solo
5. **Status page minimal** — single endpoint health check, no historical uptime graphs in v3.1

---

## Traceability

Every v1 requirement is mapped to exactly one phase. Coverage: 27/27 (100%).

| Requirement | Phase | Status |
|-------------|-------|--------|
| PROD-DB-01 | Phase 61 | Pending |
| PROD-DB-02 | Phase 61 | Pending |
| PROD-DB-03 | Phase 61 | Pending |
| PROD-DB-04 | Phase 61 | Pending |
| PROD-DB-05 | Phase 61 | Pending |
| PROD-DEPLOY-01 | Phase 62 | Pending |
| PROD-DEPLOY-02 | Phase 62 | Pending |
| PROD-DEPLOY-03 | Phase 62 | Pending |
| PROD-DEPLOY-04 | Phase 62 | Pending |
| PROD-DEPLOY-05 | Phase 62 | Pending |
| PROD-STRIPE-01 | Phase 63 | Pending |
| PROD-STRIPE-02 | Phase 63 | Pending |
| PROD-STRIPE-03 | Phase 63 | Pending |
| PROD-STRIPE-04 | Phase 63 | Pending |
| PROD-STRIPE-05 | Phase 63 | Pending |
| PROD-MONITOR-01 | Phase 64 | Pending |
| PROD-MONITOR-02 | Phase 64 | Pending |
| PROD-MONITOR-03 | Phase 64 | Pending |
| PROD-MONITOR-04 | Phase 64 | Pending |
| PROD-MONITOR-05 | Phase 64 | Pending |
| PROD-BACKUP-01 | Phase 64 | Pending |
| PROD-BACKUP-02 | Phase 64 | Pending |
| PROD-BACKUP-03 | Phase 64 | Pending |
| PROD-UAT-01 | Phase 65 | Pending |
| PROD-UAT-02 | Phase 65 | Pending |
| PROD-UAT-03 | Phase 65 | Pending |
| PROD-UAT-04 | Phase 65 | Pending |

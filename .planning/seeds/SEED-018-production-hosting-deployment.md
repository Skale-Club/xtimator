---
id: SEED-018
status: dormant
planted: 2026-05-15
planted_during: v3.1 Production Go-Live (Phase 61 complete)
trigger_when: When budget allows commercial hosting OR when first paying customer signals readiness for production
scope: Medium
---

# SEED-018: Production Hosting + Deployment

## Why This Matters

The entire v3.0 monetization work (and v2.x WhatsApp features) cannot reach real users without a commercial-grade hosting environment. **Vercel Free (Hobby) plan is not viable for Xtimator** — two hard blockers:

1. **Commercial use prohibited by ToS** — Hobby is "personal, non-commercial projects only". Xtimator is a paid SaaS. Using Hobby = ToS violation.
2. **10-second function timeout** — `/api/generate-estimate` (Claude) routinely takes 20–60s; Whisper transcription of long audio idem. Routes will time out.

Result: Phase 62 (deploy) and dependents (63 Stripe live, 64 Sentry/uptime, 65 UAT in prod) are blocked until hosting is decided.

## When to Surface

**Trigger:** When you're ready to commit ~$20–50/mo recurring for hosting, OR when the first paying customer is in motion (revenue justifies infra).

This seed should surface during `/gsd:new-milestone` when:
- Milestone involves production go-live or launch
- Milestone involves first paying customer
- Milestone explicitly named "production deployment" or similar

## Hosting Options Evaluated

| Option | Pros | Cons | Cost |
|--------|------|------|------|
| **Vercel Pro** | Same dev experience as today; preview deployments; 60s function timeout; Fluid Compute (5min); team features | Most expensive option | $20/mo per member |
| **Cloudflare Workers + Pages** | Generous free tier; sub-50ms cold start; 30s CPU time; pay-per-use | Different runtime (Workers vs Node.js); some Next.js features need adapter; learning curve | $0–5/mo for low traffic |
| **Render** | Simple Docker-style deploys; persistent disk option; good for hybrid (Next + workers); free static + paid backend | Function cold starts higher than Vercel; less Next.js polish | $7/mo (web service) |
| **Railway** | Easy multi-service (Next + workers + cron); good DX; usage-based | No CDN; not optimized for Next.js | $5+ usage |
| **Self-hosted (Hetzner/Fly.io)** | Cheapest at scale; full control | Requires ops competence; no managed Postgres tier; CI/CD work | $5–20/mo for VPS |

**Recommendation when ready: Vercel Pro** ($20/mo). Same DX as dev, zero migration, longest function timeout, best Next.js integration. Cost easily covered by the first 1 paying Pro customer ($29/mo).

## What Needs to Be Done (when triggered)

This seed graduates into a milestone (v3.2 or similar) covering the deferred Phase 62-65 work:

### Phase 62: Vercel Deployment + Custom Domain
- Sign up Vercel Pro
- Connect Vercel to `Skale-Club/xtimator` repo
- Configure auto-deploy on `main`
- Attach `xtimator.com` domain (DNS A/CNAME records)
- Enable HTTPS (auto via Vercel)
- Populate ALL env vars in production (Supabase, Stripe, Anthropic, OpenAI, Resend, encryption key, app URL)
- Verify production build passes
- Enable PR preview deployments

### Phase 63: Stripe Live Mode Activation (SEED-017)
- See SEED-017 for full procedure
- Live products + price IDs in Stripe Dashboard
- Live webhook on `https://xtimator.com/api/webhooks/stripe`
- Live secret key in `/admin/integrations`
- Vercel env vars: `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID`, `STRIPE_BUSINESS_PRICE_ID`

### Phase 64: Monitoring + Backup & Resilience
- Sentry integration (errors)
- Vercel Analytics (web vitals)
- External uptime monitor (UptimeRobot or BetterStack) hitting `/api/health`
- Email alerts on 5xx/downtime
- ~~Supabase backup verification~~ (will be done before this seed graduates — see "Partial work done now")
- ~~Incident runbook~~ (already exists at `supabase/PROD-BOOTSTRAP.md`)

### Phase 65: Production UAT + Bug Triage
- Manually validate v2.2 + v3.0 features in prod
- End-to-end smoke test (signup → audio → estimate → upgrade → real payment)
- Triage discovered bugs into known-issues.md

## Scope Estimate

**Medium** — 3-4 phases (62, 63, 64.partial, 65), 1-2 weeks once hosting is signed up. Small if Vercel Pro is chosen (no migration). Larger if alternative host requires Next.js adapter work.

## Breadcrumbs

- `app/api/generate-estimate/route.ts` — long-running route that needs >10s timeout
- `app/api/transcribe/route.ts` — Whisper call, also long-running
- `vercel.json` — already has cron job definitions referenced in code
- `supabase/PROD-BOOTSTRAP.md` — runbook (Phase 61) covers DB side
- SEED-017 — the Stripe live webhook seed that's also waiting on this
- `.env.local` — current env var set; Vercel needs same keys (minus DATABASE_URL which is in `.env.production`)
- `next.config.js` / `next.config.mjs` — may need adapter config if non-Vercel host chosen

## Notes

- **Don't host on Vercel Free.** ToS violation + 10s timeout. Either upgrade or pick alternative.
- **Stripe Tax** — when activating live mode, also enable Stripe Tax for US sales tax compliance (ties to SEED-013 open question 7).
- **DNS** — `xtimator.com` is currently parked / pointing where? Confirm before scheduling deploy work.
- **Phase 61 readiness gate** (`node supabase/audits/run-prod-readiness.mjs`) should be re-run as the first step of Phase 62 to confirm DB hasn't drifted.

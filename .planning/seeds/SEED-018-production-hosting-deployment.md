---
id: SEED-018
status: dormant
planted: 2026-05-15
planted_during: v3.1 Production Go-Live (Phase 61 complete)
trigger_when: When Vercel Free limits hurt the product OR first paying customer signals serious revenue OR ToS enforcement scare
scope: Medium
target_host: Hetzner Cloud (decided 2026-05-15)
mvp_path: Vercel Free + Inngest (decided 2026-05-15)
---

# SEED-018: Hetzner Cloud Migration (post-MVP)

> **Two decisions captured (2026-05-15):**
>
> **MVP path:** Vercel Free + Inngest background jobs. Inngest unblocks the 10s function timeout for AI routes (`/api/generate-estimate`, `/api/transcribe`, `/api/analyze-photos`) and is forward-compatible with any future host. ToS risk on Hobby plan accepted while user count is zero / pre-revenue.
>
> **Future target:** Hetzner Cloud VPS (CX22/CX32, ~€4-7/mo) + Docker + Caddy. Inngest stays (their value isn't just timeout-bypass — it's retries, observability, step functions). Supabase stays managed. Hetzner Object Storage for files (see SEED-019).

## Why This Seed Exists

The Vercel Free + Inngest MVP path works but has 3 latent risks:

1. **ToS violation** — Hobby is "personal, non-commercial". When you have a paying customer, you're operating in violation. Vercel rarely enforces, but the risk is real.
2. **Bandwidth cap** — 100 GB/mo. With first wave of users + WhatsApp media + PDFs, this can be hit faster than expected.
3. **No SLA** — Hobby has no support. Production incident at 2am = problem.

Hetzner migration removes all three at €4-7/mo (vs Vercel Pro $20/mo).

## When to Surface

**Trigger (any of):**
- Vercel sends warning email about commercial use OR Hobby limits hit
- First paying customer + you want SLA peace of mind
- Bandwidth or function-invocation count crosses 70% of Free limits
- v3.2 milestone explicitly named "self-host migration"

This seed should surface during `/gsd:new-milestone` when:
- Milestone involves production scaling
- Milestone involves cost optimization
- Milestone explicitly named "hosting migration"

## Migration Pre-Work (already done in v3.1.1)

Before this seed graduates, v3.1.1 will have shipped:
- ✅ `Dockerfile` + `docker-compose.yml` + Caddy reverse proxy config
- ✅ `app/api/health/route.ts` returning DB + storage health
- ✅ `docs/HETZNER-DEPLOY.md` runbook
- ✅ Inngest integration (zero code change to migrate — just update Inngest dashboard URL)
- ✅ Storage abstraction layer (`lib/storage/`) — swap Supabase Storage for Hetzner Object Storage in 1 line (see SEED-019)

This means migration day is "follow the runbook" not "figure out how to deploy".

## What Needs to Be Done (when triggered)

Single phase, ~1 day of work given the prep:

1. Provision Hetzner CX22 (or CX32) in Falkenstein/Helsinki
2. Install Docker + Docker Compose + Caddy via cloud-init or runbook steps
3. Set DNS A record (`xtimator.com` → server IP)
4. Copy `.env.production` to server (NEVER via git — use scp + secrets manager)
5. `docker compose up -d` — Next.js + Caddy come up, HTTPS auto-provisions via Let's Encrypt
6. Update Inngest dashboard: callback URL → new Hetzner domain
7. Smoke test: `curl https://xtimator.com/api/health` returns 200, signup + estimate flow works
8. Update Vercel webhook integrations to point at new domain (if any external services)
9. Configure UFW firewall (allow 22, 80, 443; drop rest)
10. Set up automated `.env.production` backup to off-server location
11. Configure Vercel project to "redirect" or 410 — optional, depends on traffic split strategy
12. Monitor for 48h, then decommission Vercel project

## Hosting Options (re-evaluated 2026-05-15)

| Option | Pros | Cons | Cost |
|--------|------|------|------|
| Vercel Pro | Same DX as today; preview deployments; 60s timeout (Fluid Compute 5min); team features | Most expensive | $20/mo per member |
| **Hetzner Cloud (chosen for v3.2)** | Cheapest at scale; full control; EU-friendly | Requires ops competence (mitigated by runbook) | **€4-7/mo VPS** |
| Cloudflare Workers + Pages | Generous free tier; sub-50ms cold start | Different runtime; some Next.js features need adapter | $0–5/mo |
| Render | Simple Docker-style deploys; persistent disk | Higher cold starts | $7/mo (web service) |
| Railway | Easy multi-service; good DX | No CDN; not optimized for Next.js | $5+ usage |

**Decision rationale:** Hetzner is the cheapest viable option, has zero vendor lock-in (Docker is portable to any VPS), and the artifacts shipping in v3.1.1 make it mechanical. Vercel Pro would also work but $20/mo vs €5/mo over 12 months = $180 saved, with the only cost being one day of migration work that's already pre-planned.

## Scope Estimate

**Small** — single phase, ~1 day of work, since v3.1.1 ships all the artifacts. Without that prep this would be Medium-Large (3-5 days).

## Breadcrumbs

- `Dockerfile`, `docker-compose.yml` (will exist after v3.1.1 Phase 68)
- `docs/HETZNER-DEPLOY.md` (will exist after v3.1.1 Phase 68)
- `app/api/health/route.ts` (will exist after v3.1.1 Phase 68)
- `lib/storage/` (will exist after v3.1.1 Phase 67) — already abstracted, just swap provider
- `app/api/inngest/route.ts` (will exist after v3.1.1 Phase 66) — Inngest config takes a callback URL change only
- SEED-017 — Stripe live webhook (also waits for production URL — happens same day as Hetzner go-live)
- SEED-019 — Hetzner Object Storage migration (sibling, can happen same day or later)
- `.env.local` — current env var set; Hetzner needs same keys via `.env.production` on the server

## Notes

- **Vercel Free risk is acceptable PRE-revenue.** Once first paying customer signs up, this seed jumps to top priority.
- **Stripe Tax** — when activating live mode (separate seed), enable Stripe Tax for US sales tax compliance.
- **DNS** — `xtimator.com` is currently parked / pointing where? Confirm before scheduling deploy work.
- **Phase 61 readiness gate** (`node supabase/audits/run-prod-readiness.mjs`) re-run at start of migration to confirm DB hasn't drifted.
- **No DB migration** — Supabase stays managed throughout. Hetzner hosts only the Next.js app + Caddy + cron.

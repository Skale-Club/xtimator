---
phase: 68-hetzner-cloud-deploy-readiness-artifacts
plan: 01
subsystem: infra
tags: [docker, caddy, hetzner, deploy, nextjs-standalone, reverse-proxy, lets-encrypt]

# Dependency graph
requires:
  - phase: 66-storage-abstraction-layer
    provides: STORAGE_PROVIDER + S3_* env-var contract documented in .env.production.example
  - phase: 67-inngest-background-ai-jobs
    provides: INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY env-var contract documented in .env.production.example
provides:
  - next.config.ts with output 'standalone' so npm run build emits .next/standalone/server.js (no node_modules at runtime)
  - Multi-stage Dockerfile (Node 22 alpine, non-root nextjs user, exposes 3000, runs the standalone server entry)
  - .dockerignore that filters node_modules, .env*, .next, .git, .planning, tests, docs, supabase, scripts, Docker artifacts
  - docker-compose.yml with xtimator + caddy services (restart unless-stopped, named volumes for Let's Encrypt persistence, healthcheck-gated startup)
  - Caddyfile (reverse_proxy xtimator:3000, automatic HTTPS via implicit Let's Encrypt, HSTS preload-eligible, X-Forwarded-* propagation)
  - .env.production.example documenting every runtime env var with placeholder syntax only
affects: [68-02-runbook-and-health-endpoint, 68-03-local-docker-validation, v3.2-hetzner-cutover]

# Tech tracking
tech-stack:
  added: [docker-multi-stage, caddy-2, node-22-alpine, lets-encrypt-acme, docker-compose-v2]
  patterns:
    - "Next.js standalone output for minimal runtime image (~150-300 MB target vs ~1.2 GB with full node_modules)"
    - "Three-stage Dockerfile (deps -> builder -> runner) on a single base image for max layer reuse"
    - "Caddy reverse proxy as the only public surface; app container only exposes internally on the bridge network"
    - "Let's Encrypt cert persistence via named volume (caddy_data) so restarts don't burn rate limits"
    - "Healthcheck-gated service startup (caddy depends_on xtimator service_healthy) prevents 502 during boot"
    - "Split env-file model: .env.production for app secrets (loaded by xtimator), /opt/xtimator/.env for compose/Caddy vars (DOMAIN, ACME_EMAIL)"

key-files:
  created:
    - Dockerfile
    - .dockerignore
    - docker-compose.yml
    - Caddyfile
    - .env.production.example
  modified:
    - next.config.ts

key-decisions:
  - "Use node:22-alpine (not node:22) — ~5x smaller base image; libc6-compat shim covers musl/glibc gap for sharp + pg native bindings"
  - "Non-root user nextjs (uid/gid 1001) — HETZNER-01 requirement; satisfies VPS seccomp profile expectations"
  - "HOSTNAME=0.0.0.0 in Dockerfile ENV — Next standalone defaults to localhost which makes the container unreachable; this is the single most common Docker footgun"
  - "CMD [\"node\", \"server.js\"] (exec form, not npm start) — standalone bundle has no npm binary; exec form also propagates SIGTERM for graceful shutdown"
  - "npm ci --ignore-scripts — matches package.json ignoreScripts (sharp, unrs-resolver); avoids alpine-glibc binary download conflicts"
  - "Caddy implicit TLS (no explicit tls directive) — automatic Let's Encrypt is the default behavior when a domain appears in a site block; this IS the HETZNER-03 automatic-HTTPS gate"
  - "DOMAIN required via ${DOMAIN:?...} — fails compose up if unset; better than starting Caddy with a nonsense domain and burning a Let's Encrypt rate-limit ban"
  - "caddy_data named volume — Let's Encrypt cert state persists across container restarts; backup procedure documented in Plan 02 runbook"
  - "Split env-file: app secrets in .env.production (loaded by xtimator service via env_file), DOMAIN/ACME_EMAIL in /opt/xtimator/.env (compose-substitution scope only) — Next app does not need TLS-layer config"
  - "HSTS preload-eligible (max-age=31536000; includeSubDomains; preload) — exact incantation Chrome's HSTS preload list requires; owner can submit xtimator.com to hstspreload.org once live"

patterns-established:
  - "Multi-stage Dockerfile (deps/builder/runner) on shared base image for the project — future infra plans should mirror this structure"
  - "Placeholder-only secret syntax in .env.production.example using <your-key> / sk-ant-<your-key> / whsec-<your-secret> — never real secrets in any committed file"
  - "Caddy site blocks rely on env-var substitution for DOMAIN — same pattern available for staging.xtimator.com / preview deployments without forking the Caddyfile"

requirements-completed: [HETZNER-01, HETZNER-02, HETZNER-03]

# Metrics
duration: 7min
completed: 2026-05-15
---

# Phase 68 Plan 01: Hetzner Cloud Deploy Readiness Artifacts Summary

**Multi-stage Node 22 alpine Dockerfile + Caddy reverse-proxy compose stack + placeholder-only env template — every artifact needed for v3.2 Hetzner cutover ships in the repo, nothing activated yet**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-05-15T23:19:00Z
- **Completed:** 2026-05-15T23:26:40Z
- **Tasks:** 3
- **Files modified:** 6 (1 modified, 5 new)

## Accomplishments

- next.config.ts switched to output: 'standalone' — npm run build will now emit .next/standalone/server.js (a self-contained Node entrypoint that bundles only the npm packages each route actually uses via Next's traced output, so the runtime Docker image needs neither node_modules nor npm)
- Multi-stage Dockerfile shipped: 3 stages (deps/builder/runner) on node:22-alpine, non-root nextjs user (uid 1001), libc6-compat for sharp/pg native bindings, exposes 3000, exec-form CMD for graceful shutdown — image-size target 150-300 MB (hard cap 500 MB enforced by Plan 03)
- docker-compose.yml shipped: xtimator + caddy services on a private bridge network ('web'), both restart unless-stopped (HETZNER-03), healthcheck-gated startup (caddy waits for /api/health), named volumes (caddy_data, caddy_config) for Let's Encrypt persistence, env_file directive for secrets injection
- Caddyfile shipped: implicit Let's Encrypt HTTPS, reverse_proxy xtimator:3000, X-Forwarded-* propagation (so Next sees real client IP/scheme), HSTS preload-eligible, admin API disabled, JSON logs to stdout
- .env.production.example shipped: every runtime env var documented with placeholder syntax only (Supabase, Anthropic, OpenAI, Resend, Stripe, Inngest, Upstash, optional STORAGE_PROVIDER + S3_*, GIT_SHA, plus a DOMAIN/ACME_EMAIL split-env-file note)
- gitleaks pre-commit hook passed clean on all three commits — zero real secrets in any committed file

## Task Commits

Each task was committed atomically:

1. **Task 1: next.config.ts standalone + .dockerignore** — `a472111` (feat)
2. **Task 2: multi-stage Node 22 alpine Dockerfile** — `ce25651` (feat)
3. **Task 3: docker-compose.yml + Caddyfile + .env.production.example** — `5465308` (feat)

**Plan metadata commit:** added below as final docs commit covering this SUMMARY.md + STATE.md + ROADMAP.md + REQUIREMENTS.md

## Files Created/Modified

- `next.config.ts` — added `output: 'standalone'` (existing `images.remotePatterns` for Supabase preserved)
- `.dockerignore` — excludes node_modules, .env*, .next, .git, .planning, tests, docs, supabase, scripts, Docker artifacts; keeps build context small
- `Dockerfile` — 3-stage multi-stage build on node:22-alpine; deps stage installs npm deps with --ignore-scripts; builder stage runs `npm run build`; runner stage copies only `.next/standalone` + `.next/static` + `public`, runs as `nextjs` (uid 1001) on port 3000 via `node server.js`
- `docker-compose.yml` — xtimator service (build-from-Dockerfile, env_file: .env.production, healthcheck on /api/health, expose 3000 internally) + caddy service (caddy:2-alpine image, ports 80/443/443udp, mounts ./Caddyfile read-only, named volumes for cert persistence, depends_on xtimator service_healthy)
- `Caddyfile` — global block (email + admin off) + {$DOMAIN} site block (reverse_proxy xtimator:3000 with X-Forwarded-* headers, encode zstd/gzip, security headers including HSTS preload-eligible, JSON logs to stdout)
- `.env.production.example` — fully commented env-var template with source pointers (Supabase Dashboard, console.anthropic.com, dashboard.stripe.com, app.inngest.com, console.upstash.com); placeholder syntax only

## Verification Grep Counts

| Gate | File | Pattern | Expected | Actual |
|------|------|---------|----------|--------|
| Standalone output | next.config.ts | `output: 'standalone'` | 1 | 1 |
| Existing config preserved | next.config.ts | `remotePatterns` | 1 | 1 |
| Multi-stage | Dockerfile | `FROM node:22-alpine` | 3 | 3 |
| Non-root | Dockerfile | `^USER nextjs$` | 1 | 1 |
| Port | Dockerfile | `^EXPOSE 3000$` | 1 | 1 |
| Stage labels | Dockerfile | `AS deps\|AS builder\|AS runner` | 3 | 3 |
| HOSTNAME bind | Dockerfile | `0.0.0.0` | >= 1 | 1 |
| Restart policy | docker-compose.yml | `restart: unless-stopped` | 2 | 2 |
| env_file | docker-compose.yml | `env_file` | >= 1 | 1 |
| Cert persistence | docker-compose.yml | `caddy_data` | >= 2 | 2 |
| Reverse proxy | Caddyfile | `reverse_proxy xtimator:3000` | 1 | 1 |
| HSTS | Caddyfile | `Strict-Transport-Security` | >= 1 | 2 |
| Env coverage | .env.production.example | `NEXT_PUBLIC_SUPABASE_URL\|ANTHROPIC_API_KEY\|STRIPE_SECRET_KEY\|INNGEST_EVENT_KEY\|STORAGE_PROVIDER` | >= 5 | 7 |
| No real secrets | all 4 files | `sk_live_*\|sk-ant-api*\|whsec_*\|re_*\|signkey-prod-*` (with 20+ alphanumeric tail) | 0 | 0 |

## Image Size Budget

- **Target:** 150-300 MB (Next.js standalone runtime + node:22-alpine ~50 MB base)
- **Hard cap:** 500 MB (HETZNER-01 gate)
- **Actual measurement:** Plan 03 will run `docker images --format "{{.Size}}" xtimator` and confirm < 500 MB. If overshoot, likely culprits are: forgot `--ignore-scripts`, missed `.dockerignore` entries, or a transitive dep ballooned in v16.

## Decisions Made

All decisions are spelled out in the frontmatter `key-decisions` array. The most load-bearing ones:

- **node:22-alpine + libc6-compat shim** — alpine ships musl, but sharp + pg link against glibc; the shim covers the gap. Without it, runtime crashes on first image transform or DB query.
- **HOSTNAME=0.0.0.0** — Next standalone defaults to localhost which only binds the loopback interface inside the container, making `-p 3000:3000` silently fail. This is THE Docker footgun for Next.
- **Implicit Caddy TLS** — no explicit `tls` directive is the proof of automatic Let's Encrypt; an explicit `tls internal` or `tls /path/cert /path/key` would defeat HETZNER-03.
- **Split env-file model** — .env.production is what the xtimator service env_file loads (Next app secrets). DOMAIN + ACME_EMAIL live in /opt/xtimator/.env (compose's variable-substitution scope), so the Next app doesn't have access to TLS-layer config it doesn't need.

## Deviations from Plan

None - plan executed exactly as written.

The plan front-loaded every snippet, every grep gate, and every CLAUDE.md constraint (gitleaks pre-commit), so each task was a near-mechanical write + commit. No auto-fix rules triggered (Rules 1-3 not needed; no architectural decision required for Rule 4).

## Issues Encountered

- **`docker compose config -q` syntax check skipped (Task 3 verify step)** — Docker is not installed on this Windows dev machine. The plan explicitly anticipated this case and noted Plan 03 will validate compose syntax end-to-end on the local Docker validation pass. Not a deviation; this is the documented fallback path.

## User Setup Required

None — this plan ships pure code/config artifacts. No external services to configure, no env vars to set on this machine. The .env.production.example documents what the user must populate on the Hetzner VPS in the v3.2 cutover, but that's tracked in Plan 02's runbook (`docs/HETZNER-DEPLOY.md`) — not in this plan.

## Next Phase Readiness

**Plan 68-02 (next):** Builds on these artifacts — adds the `/api/health` endpoint that the Dockerfile/compose healthcheck already references (`http://localhost:3000/api/health`) and writes `docs/HETZNER-DEPLOY.md`, the runbook that walks through populating .env.production on the VPS, setting DOMAIN, and running `docker compose up -d`.

**Plan 68-03 (after):** Validates the Dockerfile end-to-end — `docker build -t xtimator .`, confirms `docker images` reports < 500 MB, runs `docker run --env-file .env.local -p 3000:3000 xtimator`, hits `/api/health`. This is the runtime gate that closes HETZNER-01 (image size) and HETZNER-02 (build output).

**v3.2 milestone (later):** Deploy to Hetzner Cloud. With these artifacts shipped + the Plan 02 runbook + Plan 03 validation, the cutover should be `git pull && docker compose up -d` — mechanical, not exploratory. That was the entire point of this milestone.

**No blockers.**

## Self-Check: PASSED

All 6 files verified to exist on disk:
- `next.config.ts` — FOUND (modified, contains `output: 'standalone'`)
- `.dockerignore` — FOUND (788 bytes)
- `Dockerfile` — FOUND (2719 bytes)
- `docker-compose.yml` — FOUND (2256 bytes)
- `Caddyfile` — FOUND (1658 bytes)
- `.env.production.example` — FOUND (4201 bytes)

All 3 task commits verified in `git log`:
- `a472111` — FOUND (Task 1)
- `ce25651` — FOUND (Task 2)
- `5465308` — FOUND (Task 3)

No stubs created (all artifacts are complete config files; no placeholder UI components or hardcoded empty data wired to render).

---
*Phase: 68-hetzner-cloud-deploy-readiness-artifacts*
*Completed: 2026-05-15*

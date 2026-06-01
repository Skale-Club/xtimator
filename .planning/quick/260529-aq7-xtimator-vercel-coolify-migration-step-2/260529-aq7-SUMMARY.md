---
phase: quick-260529-aq7
plan: 01
subsystem: deploy
tags: [migration, coolify, docker, github-actions, crons, csp]
requires:
  - Phase 68 deploy-readiness artifacts (Dockerfile multi-stage build)
  - lib/auth/cron-auth.ts (Bearer CRON_SECRET contract)
provides:
  - node:24-alpine container build on all stages
  - in-sync npm package-lock.json (authoritative lockfile)
  - .github/workflows/cron-jobs.yml (4 scheduled cron jobs off Vercel)
  - vercel.json without crons array
  - CSP report-only policy without va.vercel-scripts.com
affects:
  - Coolify build path (§3+)
  - Vercel teardown (§7)
tech-stack:
  added: []
  patterns:
    - GitHub Actions scheduled workflow mirrors supabase-keepalive.yml house style (retry loop, write-out http_code, secret-via-env)
key-files:
  created:
    - .github/workflows/cron-jobs.yml
  modified:
    - Dockerfile
    - package-lock.json
    - vercel.json
    - next.config.ts
  deleted:
    - bun.lock
    - docker-compose.yml
    - Caddyfile
decisions:
  - Deploy target is the SHARED Coolify host (Traefik + Let's Encrypt), NOT the Phase 68 dedicated-VM Caddy/compose stack — Caddyfile + docker-compose.yml deleted
  - The 4 Vercel crons migrate to a single GitHub Actions scheduled workflow that maps github.event.schedule -> endpoint via bash case, with a workflow_dispatch fallback that runs all four
  - bun.lock removed (nothing consumes it; Coolify builds via Dockerfile/npm ci against package-lock.json); vercel.json Bun build/dev/install commands left for §7 teardown
metrics:
  duration: ~10m
  completed: 2026-05-29
  tasks: 3
  files: 8
  commits: 3
---

# Phase quick-260529-aq7 Plan 01: Xtimator Vercel→Coolify Migration Step 2 Summary

Made the Xtimator repo container-ready for the shared Coolify host: bumped the Dockerfile base image to node:24-alpine across all stages, resynced the npm lockfile and dropped bun.lock, migrated the 4 Vercel crons to a GitHub Actions scheduled workflow (with the crons array stripped from vercel.json), and deleted the obsolete Phase 68 Caddy/compose artifacts plus the dead va.vercel-scripts.com CSP entry. Pure repo edits — no Coolify-side config, DNS, or cutover.

## What Was Built

### Task 1 — Dockerfile node:24-alpine + lockfile sync + drop bun.lock (`3368069`)
- All three `FROM node:22-alpine` stages (deps, builder, runner) bumped to `node:24-alpine` so the shared Coolify host reuses a single base layer across apps.
- Everything else in the Dockerfile preserved verbatim: `libc6-compat` shim, `npm ci --ignore-scripts`, non-root `nextjs` user (uid/gid 1001), `USER nextjs`, `EXPOSE 3000`, `HEALTHCHECK ... /api/health`, `CMD ["node","server.js"]`, all comments.
- `npm install --package-lock-only --ignore-scripts` regenerated package-lock.json (drift existed → the regeneration IS the fix so `npm ci` resolves cleanly in the container).
- Deleted stale `bun.lock` via `git rm` (nothing reads it; Coolify uses the Dockerfile/npm path).

### Task 2 — GitHub Actions cron workflow + strip vercel.json crons (`9cf0262`)
- New `.github/workflows/cron-jobs.yml` mirroring the supabase-keepalive house style: `workflow_dispatch:` + 4 UTC `- cron:` schedules.
- Single `run-crons` job (ubuntu-latest, timeout 5m, `permissions: contents: read`) with a bash `case "$SCHEDULE"` mapping each schedule string to its endpoint, and a default branch (empty SCHEDULE on manual dispatch) that runs ALL four endpoints.
- Each call: GET against `${{ secrets.SITE_URL }}` (trailing slash stripped) + path, `Authorization: Bearer ${{ secrets.CRON_SECRET }}` — secret + URL passed via step `env:` (never inlined into the run script), `--silent --show-error --write-out "%{http_code}" --max-time 30`, 3-attempt retry loop with backoff, 200 = success else `::error::` + non-zero exit. Empty SITE_URL/CRON_SECRET guarded with `::error::` + exit 1.
- Schedule → endpoint map: `0 1 * * *` expire-trials, `0 3 * * *` cleanup-orphan-projects, `0 4 * * *` cleanup-whatsapp-sessions, `0 9 * * *` trial-warning-emails.
- Stripped the entire `"crons": [...]` array from vercel.json; `framework`/`buildCommand`/`devCommand`/`installCommand` preserved; JSON remains valid (validated via `ConvertFrom-Json`).

### Task 3 — Delete Caddy/compose artifacts + clean CSP (`4df1855`)
- `git rm docker-compose.yml` and `git rm Caddyfile` (shared Coolify host uses Traefik + Let's Encrypt; a stray compose file can also derail Coolify build-pack auto-detection).
- Removed ` https://va.vercel-scripts.com` from the `cspReportOnly` script-src line; everything else in next.config.ts (output standalone, images.remotePatterns, securityHeaders, headers()) untouched.

## Verification

File-content + lockfile checks only (NO Docker on this machine — confirmed). All three tasks' automated PowerShell `<verify>` checks ran and printed `OK`:
- Dockerfile: 3× `FROM node:24-alpine`, 0× `node:22-alpine`; libc6-compat, USER nextjs, HEALTHCHECK /api/health, CMD node server.js all present.
- bun.lock, docker-compose.yml, Caddyfile: all absent.
- package-lock.json: regenerated and now in sync.
- cron-jobs.yml: 4 endpoints, 4 schedules, `secrets.CRON_SECRET`, `secrets.SITE_URL`, `Authorization: Bearer`, `workflow_dispatch` all present; zero real secrets.
- vercel.json: valid JSON, no `crons` key, `framework` retained.
- next.config.ts: no `va.vercel-scripts.com`; output standalone + remotePatterns + js.stripe.com retained.
- gitleaks pre-commit hook passed on all 3 commits ("no leaks found").

## Deviations from Plan

None — plan executed exactly as written. The package-lock.json regeneration in Task 1 produced a diff (expected per the plan's "if diff: the regenerated lock IS the fix" branch), which was staged and committed.

## Follow-ups / Out of Scope

- **§4 (CRITICAL — flag for the Coolify-side setup):** The Coolify app MUST be created with the build pack explicitly set to **"Dockerfile"** so Coolify uses our multi-stage build instead of auto-detecting (Nixpacks/heuristics). Deleting docker-compose.yml in Task 3 removes one auto-detection trap, but the build pack still has to be set to Dockerfile by hand. NOT done in this plan.
- §7 Vercel teardown: vercel.json still carries the Bun `buildCommand`/`devCommand`/`installCommand`; full removal of vercel.json is deferred to §7.
- §3, §5, §6: Coolify app/env capture, DNS, and cutover are out of scope here.

## Self-Check: PASSED

- Created/modified files all FOUND: .github/workflows/cron-jobs.yml, Dockerfile, package-lock.json, vercel.json, next.config.ts, SUMMARY.md
- Deleted files all GONE: bun.lock, docker-compose.yml, Caddyfile
- Commits all FOUND: 3368069, 9cf0262, 4df1855

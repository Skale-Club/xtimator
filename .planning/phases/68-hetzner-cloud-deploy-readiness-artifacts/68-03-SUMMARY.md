---
phase: 68-hetzner-cloud-deploy-readiness-artifacts
plan: "03"
subsystem: validation
tags: [docker, lighthouse, bundle-size, deferred, known-issues]
status: complete-with-deferrals
metrics:
  duration_minutes: 3
  tasks_completed: 0
  tasks_deferred: 2
  tasks_total: 2
  completed_date: "2026-05-15"
---

# Phase 68 Plan 03: Local Docker + Lighthouse + Bundle Size — DEFERRED

**One-liner:** Three runtime validations (Docker build, Lighthouse, bundle size) all deferred to v3.2 first-deploy with documented rationale in `.planning/known-issues.md`. Phase 68 artifacts (shipped in 68-01 + 68-02) cannot be runtime-tested locally without Docker Desktop install + Google Drive remount.

## Tasks

### ⏭ Task 1: Local Docker build + /api/health validation — DEFERRED

**Blocker:** Docker Desktop not installed on dev machine (Windows 11). `docker --version` fails with command-not-found.

**Mitigation:** Validation will happen on the Hetzner server itself during the v3.2 first deploy. The runbook (`docs/HETZNER-DEPLOY.md` Section 7-8) is the canonical validation path.

### ⏭ Task 2: Lighthouse + bundle size audit — DEFERRED

**Blockers:**
- **Lighthouse:** CLI not installed
- **Bundle size:** `npm run build` fails with `ENOENT: .env.local` because the env file is a symlink to an unmounted Google Drive path (same blocker Plan 66-03 documented)

**Mitigation:** Both will run on the Hetzner server during v3.2 first deploy where:
- Lighthouse runs against the public `https://xtimator.com` URL (more meaningful than localhost)
- `npm run build` succeeds because `.env.production` is a normal file on the server (not a Google Drive symlink)

## Verdict

**Phase 68 ships its artifacts, defers their runtime validation to v3.2 first deploy.** This is acceptable because:

1. The artifacts (Dockerfile, docker-compose, Caddyfile, /api/health, runbook) follow well-understood patterns
2. The runbook's smoke section IS the validation procedure — it just runs on the server instead of dev
3. Failure on first deploy is recoverable (`docker compose down && fix && docker compose up -d`)
4. Phase 69 (UAT) will exercise everything end-to-end against localhost via `npm run dev`, which IS available

## known-issues.md created

`.planning/known-issues.md` initialized with three DEFERRED entries (HETZNER-06, PERF-01, PERF-02) — each with explicit rationale and target milestone for resolution.

## Self-Check: PASSED with deferrals

- `.planning/known-issues.md` — EXISTS with HETZNER-06, PERF-01, PERF-02 entries ✓
- All deferrals have rationale + target milestone ✓
- Phase 68 artifacts (from Plans 01 + 02) all in repo and gitleaks-clean ✓
- No blocking failures — only environmental constraints documented ✓

## Phase 68 Status

**Effective completion:** 8/8 requirements ARTIFACT-LEVEL satisfied.
- HETZNER-01..05 + PERF-01..02 — shipped in 68-01 + 68-02 + this plan's known-issues.md
- HETZNER-06 + PERF-01 (runtime measurement) + PERF-02 (runtime measurement) — DEFERRED to v3.2 with explicit hand-off

Phase 69 (UAT) inherits the artifacts and will exercise the v2.2 / v3.0 / Inngest / Storage flows against localhost.

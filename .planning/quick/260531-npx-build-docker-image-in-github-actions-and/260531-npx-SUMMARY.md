---
phase: quick-260531-npx
plan: 01
subsystem: ci-deploy
tags: [github-actions, docker, ghcr, coolify, deploy]
requires: [Dockerfile, .github/workflows/cron-jobs.yml]
provides: [ci-build-and-push, coolify-deploy-webhook, deploy-docs]
affects: [.github/workflows, README-DEPLOY.md]
tech-stack:
  added: [docker/build-push-action@v6, docker/login-action@v3, docker/setup-buildx-action@v3]
  patterns: [build-on-CI-not-VPS, GHCR-via-GITHUB_TOKEN, graceful-secret-skip]
key-files:
  created:
    - .github/workflows/build-deploy.yml
    - README-DEPLOY.md
  modified: []
decisions:
  - "Registry = GHCR via built-in GITHUB_TOKEN — no extra CI registry secret"
  - "5 NEXT_PUBLIC_* are public build args; 4 from vars.*, SITE_URL hardcoded to https://xtimator.com to avoid the literal \\n bug"
  - "Coolify step skips gracefully (exit 0) when COOLIFY_WEBHOOK_XTIMATOR is absent"
metrics:
  duration: ~3m
  completed: 2026-05-31
  tasks: 3
  files: 2
---

# Phase quick-260531-npx Plan 01: CI Docker Build + GHCR Push + Coolify Pull Summary

CI pipeline that builds the Xtimator Docker image on GitHub runners, pushes it to `ghcr.io/skale-club/xtimator` (`:latest` + `:<sha>`), and pings a Coolify deploy webhook — moving the OOM-heavy `next build` off the 8GB CX32 VPS into CI, plus deploy docs that double as a sibling-app template.

> ## ⚠️ DO NOT `git push` THESE COMMITS YET
>
> Commits stay **LOCAL** until a human has, in order:
> 1. **Rebooted / recovered the saturated CX32 VPS**, AND
> 2. **Disabled Coolify git auto-deploy / source-build for Xtimator.**
>
> Pushing to `main` while Coolify still source-builds will re-trigger an on-VPS
> `next build`, which re-OOMs and re-freezes the entire server (Coolify + every
> app on the box). Only after BOTH steps are done is it safe to push. After the
> push, Coolify only ever PULLS the prebuilt image — it never compiles on the
> VPS again.

## What was built

- **`.github/workflows/build-deploy.yml`** — `on: push (main) + workflow_dispatch`,
  `permissions: contents:read + packages:write`, single `build-and-push` job
  (ubuntu-latest, 30m timeout). Steps: checkout → buildx → GHCR login (via
  `GITHUB_TOKEN`) → `docker/build-push-action@v6` (both `:latest` and `:<sha>`
  tags, `type=gha` layer cache, all 5 `NEXT_PUBLIC_*` build args) → Coolify
  webhook POST with retry/backoff that skips gracefully when the secret is
  absent. Top `env:` block + header comment make it a copy-paste template
  (change only IMAGE_NAME, SITE_URL, and the COOLIFY_WEBHOOK_<APP> secret name).
- **`README-DEPLOY.md`** — flow diagram, prominent CRITICAL pre-push ordering,
  one-time Coolify reconfiguration checklist, GitHub Variables/Secrets tables,
  per-app rollout matrix, and an out-of-scope follow-ups list. Placeholders only.

## Key decisions

- `NEXT_PUBLIC_SITE_URL` is hardcoded in `env.SITE_URL` (not read from `vars.*`)
  to guarantee no stray newline/quote like the old Coolify `\n` is reintroduced.
- The 4 other `NEXT_PUBLIC_*` come from Actions Variables (`vars.*`) since they
  are public, not secrets.
- GHCR push uses the built-in `GITHUB_TOKEN`; the `read:packages` PAT lives only
  in Coolify (for PULL), never in CI.

## Verification

- Task 1 verify: `build-deploy.yml OK` (job + `packages:write` present).
- Task 3 full structural validation: **`WORKFLOW VALID`** — YAML parses;
  `push.main` + `workflow_dispatch`; correct permissions; all 3 docker actions;
  both image tags; all 5 build args; `type=gha` cache; Coolify webhook ref; no
  real secret literals. `js-yaml` is installed locally so no fallback was needed.
- Task 2 verify: `README-DEPLOY.md OK` (all required sections present, no leaked
  secrets).
- gitleaks pre-commit hook passed on both commits.

## Deviations from Plan

None — plan executed exactly as written. Task 3 is validation-only (no file
change), so it carries no commit.

## Known Stubs

None.

## Human follow-ups (out of scope here)

- Coolify panel reconfiguration (Docker Image type, GHCR private registry,
  disable source build, copy deploy webhook → set `COOLIFY_WEBHOOK_XTIMATOR`).
- VPS swap tuning on the CX32.
- Container resource limits per app in Coolify.
- Hetzner CPU/memory/disk alerts.

## Commits

- `387dec3` ci(quick-260531-npx): add build-deploy workflow (GHCR build + Coolify pull)
- `8d5c64f` docs(quick-260531-npx): add README-DEPLOY (CI->GHCR->Coolify flow)

## Self-Check: PASSED

- Files exist: `.github/workflows/build-deploy.yml`, `README-DEPLOY.md`, SUMMARY.md.
- Commits exist: `387dec3`, `8d5c64f`.

---
phase: quick-260530-asz
plan: 01
subsystem: infra
tags: [docker, coolify, nextjs, next-public, build-args, supabase, turnstile]

# Dependency graph
requires: []
provides:
  - "Dockerfile builder stage wires 5 NEXT_PUBLIC_* vars as build args promoted to ENV before `npm run build`"
  - "Coolify-built images inline real client-side config (Supabase URL/keys, site URL, Turnstile site key) into the browser bundle"
affects: [coolify-deploy, self-hosting, docker-build]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "NEXT_PUBLIC_* inlined at build time: ARG (no default) + ENV promotion before `next build`"

key-files:
  created: []
  modified: [Dockerfile]

key-decisions:
  - "ARG declarations left empty (no defaults) so a missing build arg yields an empty value that fails loudly at app boot rather than baking a stale default into the client bundle"
  - "NEXT_PUBLIC_* treated as non-secret build args (public by definition, embedded in client JS) — no real values committed; ENV lines only reference the matching $ARG"

patterns-established:
  - "Docker build-arg wiring: bare ARG + ENV=$ARG block placed between NEXT_TELEMETRY_DISABLED and RUN npm run build"

requirements-completed: [DOCKER-NEXTPUBLIC-01]

# Metrics
duration: ~3min
completed: 2026-05-30
---

# Quick Task 260530-asz: Dockerfile NEXT_PUBLIC_* Build Args Summary

**Builder stage now declares 5 bare `ARG NEXT_PUBLIC_*` and promotes each to `ENV` before `npm run build`, so Next.js inlines Supabase + Turnstile client config into the Coolify-built browser bundle.**

## Performance

- **Duration:** ~3 min
- **Completed:** 2026-05-30T07:49:52-04:00
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Added explanatory comment covering the non-obvious Next.js build-time inlining behavior and the Coolify `--build-arg` requirement
- Added 5 bare `ARG NEXT_PUBLIC_*` declarations (no defaults) so missing values fail loudly
- Added 5 `ENV NEXT_PUBLIC_*=$NEXT_PUBLIC_*` promotions, all positioned before `RUN npm run build`
- Verified by file inspection that the deps stage, runner stage, `node:24-alpine` base, HEALTHCHECK, and `CMD ["node", "server.js"]` are untouched, and no real values are hardcoded

## Task Commits

Each task was committed atomically:

1. **Task 1: Add 5 NEXT_PUBLIC_* ARG + ENV promotions to builder stage** - `381bd78` (fix)

## Files Created/Modified
- `Dockerfile` - Inserted a 5×ARG + 5×ENV NEXT_PUBLIC_* block (with explanatory comment) between `ENV NEXT_TELEMETRY_DISABLED=1` and `RUN npm run build` in the builder stage

## Decisions Made
- ARG lines kept empty (no defaults) — a missing Coolify build arg produces an empty value that surfaces at app boot, avoiding a silently stale baked-in default.
- NEXT_PUBLIC_* are public by definition (embedded in client JS), so they are safe as build args; no real values were committed (ENV lines reference only the matching $ARG).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- The plan's inline verify command initially printed FAIL when run directly via the shell: PowerShell consumed the `$` in the embedded regex (`ENV NAME=$NAME`), corrupting the pattern. This was a shell-escaping artifact, not a Dockerfile defect. Re-ran the identical script from a temporary `.cjs` file (file removed afterward), which printed `PASS` — confirming the Dockerfile is correct.

## User Setup Required

Coolify must supply the 5 vars as Docker **build arguments** (not just runtime env) for the affected service:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`

These are public client values, not secrets. If any is missing at build time, the corresponding client feature (browser Supabase client / Turnstile widget) will be `undefined` in the shipped bundle.

## Next Phase Readiness
- Dockerfile is ready for Coolify builds once the 5 build args are configured. Full runtime confirmation requires an actual `docker build` with the args supplied (out of scope for this file-only change).

## Self-Check: PASSED
- FOUND: Dockerfile (modified, ARG/ENV block present)
- FOUND: commit 381bd78
- FOUND: .planning/quick/260530-asz-fix-dockerfile-builder-add-next-public-b/260530-asz-SUMMARY.md

---
*Phase: quick-260530-asz*
*Completed: 2026-05-30*

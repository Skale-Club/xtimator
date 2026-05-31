---
phase: quick-260531-mlx
plan: 01
subsystem: auth
tags: [oauth, redirect, coolify, proxy, hetzner]
requires: []
provides:
  - "resolveBaseUrl(request) — canonical base-URL resolver with sanitization + 3-tier fallback"
  - "OAuth callback redirects that target the public domain behind a reverse proxy"
affects:
  - "app/(auth)/callback/route.ts"
tech-stack:
  added: []
  patterns:
    - "Synchronous base-URL resolver reading from the passed Request (no next/headers async call)"
    - "Defensive env normalization: trim newline, strip surrounding quotes, strip trailing slash"
key-files:
  created:
    - lib/utils/site-url.ts
    - tests/unit/site-url.test.ts
  modified:
    - app/(auth)/callback/route.ts
decisions:
  - "resolveBaseUrl is synchronous (takes Request directly) vs resolveIssuer() which is async via next/headers — callback already holds request"
  - "normalize() strips surrounding single/double quotes in addition to whitespace + trailing slash to defend against the quoted Coolify env value"
  - "Scope kept tight: lib/utils/share-link.ts and lib/actions/auth.ts resetPassword left unchanged (optional per brief)"
metrics:
  duration: ~6m
  completed: 2026-05-31
  tasks: 2
  files: 3
---

# Phase quick-260531-mlx Plan 01: Fix OAuth login redirect to 0.0.0.0:3000 Summary

Added a synchronous `resolveBaseUrl(request)` helper that resolves the canonical public base URL (sanitized `NEXT_PUBLIC_SITE_URL` → `X-Forwarded-Proto/Host` → request origin) and wired the OAuth callback's four redirects to use it, so post-OAuth users land on `https://xtimator.com` instead of the Coolify-internal `https://0.0.0.0:3000`.

## What Was Built

- **`lib/utils/site-url.ts`** — `resolveBaseUrl(request: Request): string` with a `normalize()` sanitizer (trims whitespace incl. trailing `\n`, strips surrounding single/double quotes, strips a trailing slash, returns null when empty). Three-tier precedence mirrors `lib/oauth/issuer.ts`, but synchronous since the caller already holds the `Request`.
- **`app/(auth)/callback/route.ts`** — imports `resolveBaseUrl`, computes `const baseUrl = resolveBaseUrl(request)` once, and uses `baseUrl` for all four `new URL(path, ...)` redirects (recovery, dashboard, onboarding, `/?auth=login` fallback). The internal `origin` from `new URL(request.url)` is no longer used in redirect construction.
- **`tests/unit/site-url.test.ts`** — 7 vitest cases covering clean env, trailing newline, surrounding quotes, trailing slash, whitespace-only fall-through, proxy-header fallback, and last-resort request-origin.

## Verification

- `npx vitest run tests/unit/site-url.test.ts` — 7/7 pass.
- Grep of `app/(auth)/callback/route.ts` for `origin` — only a clarifying comment remains; no redirect constructs against the internal origin.
- `npx tsc --noEmit` — the two files in this change introduce zero new errors (verified against baseline; see Deferred Issues).

## Deviations from Plan

None — plan executed exactly as written. TDD flow followed (RED commit `1ca8769`, GREEN commit `6b4aacf`); no refactor commit needed.

## Deferred Issues

`npx tsc --noEmit` reports 6 pre-existing type errors in unrelated files (`components/landing/auth-dialog.tsx`, `components/onboarding/onboarding-survey.tsx`, `tests/unit/components/onboarding-survey.test.tsx`) concerning a `subdomain` form field. Verified present on the baseline commit before this change via `git stash`. Out of scope; logged to `deferred-items.md`.

## Human Follow-up (infra — out of scope for code)

The Coolify env var `NEXT_PUBLIC_SITE_URL` reportedly contains a literal trailing newline and/or surrounding quotes. Set it to exactly `https://xtimator.com` (no quotes, no trailing whitespace) in the Coolify UI, then **rebuild** — `NEXT_PUBLIC_*` are inlined at Docker build time (Dockerfile build args), so a runtime-only change will not take effect until the next build. The code sanitization here is a defensive belt-and-suspenders measure, not a replacement for fixing the env var.

## Commits

- `1ca8769` test(quick-260531-mlx): add failing tests for resolveBaseUrl sanitization + fallback
- `6b4aacf` feat(quick-260531-mlx): add resolveBaseUrl helper with sanitization + 3-tier fallback
- `90bbe67` fix(quick-260531-mlx): build OAuth callback redirects against canonical base URL

## Self-Check: PASSED

- FOUND: lib/utils/site-url.ts
- FOUND: tests/unit/site-url.test.ts
- FOUND: app/(auth)/callback/route.ts (modified)
- FOUND commit: 1ca8769
- FOUND commit: 6b4aacf
- FOUND commit: 90bbe67

---
phase: quick-260531-rqa
plan: 01
subsystem: server-side-url-resolution
tags: [coolify, redirects, oauth, base-url, app-origin]
requires: []
provides:
  - "lib/utils/site-url.ts: resolveBaseUrl (APP_ORIGIN-first 4-tier) + getCanonicalBaseUrl"
affects:
  - "all server-side redirect construction behind the Coolify reverse proxy"
tech-stack:
  added: []
  patterns:
    - "APP_ORIGIN runtime (non-inlined) env tier wins over build-inlined NEXT_PUBLIC_SITE_URL"
    - "getCanonicalBaseUrl() for request-less modules; resolveBaseUrl(req) for route handlers"
    - "DB-first branding.canonicalBaseUrl preserved; env fallbacks flow through getCanonicalBaseUrl()"
key-files:
  created:
    - .planning/quick/260531-rqa-bulletproof-server-side-base-url-resolut/deferred-items.md
  modified:
    - lib/utils/site-url.ts
    - tests/unit/site-url.test.ts
    - app/demo/route.ts
    - app/api/stripe/connect/initiate/route.ts
    - app/api/estimate/[token]/pay/route.ts
    - app/api/stripe/connect/callback/route.ts
    - lib/oauth/issuer.ts
    - tests/unit/oauth-issuer.test.ts
    - lib/whatsapp/send-estimate.ts
    - app/api/estimates/[id]/send-sms/route.ts
    - lib/whatsapp/confirm.ts
    - app/api/cron/trial-warning-emails/route.ts
    - lib/billing/connect-webhook.ts
    - lib/actions/auth.ts
decisions:
  - "issuer.ts reads explicit env vars directly (APP_ORIGIN ?? NEXT_PUBLIC_APP_URL ?? NEXT_PUBLIC_SITE_URL) rather than calling getCanonicalBaseUrl() — the latter never returns null and would collapse the VERCEL_ENV/VERCEL_URL/header branches"
  - "oauth-issuer test isolation extended to back up + delete APP_ORIGIN and NEXT_PUBLIC_SITE_URL (additive, prevents real-env leakage); coverage strengthened with 2 new precedence tests"
metrics:
  duration: ~6 min
  tasks: 3
  files: 14
  completed: 2026-05-31
---

# Phase quick-260531-rqa Plan 01: Bulletproof Server-Side Base-URL Resolution Summary

Hardened `lib/utils/site-url.ts` with a runtime, non-inlined `APP_ORIGIN` tier and a new request-less `getCanonicalBaseUrl()`, then routed every server-side redirect and env-based base-URL read through these helpers so no route emits `https://0.0.0.0:3000` behind the Coolify reverse proxy — while preserving DB-first `platform_branding.canonical_base_url`.

## 🚨 HUMAN FOLLOW-UPS (NOT done by this plan)

1. **NO `git push` was performed by this plan. Push is a HUMAN GATE.** Before pushing:
   confirm the VPS is recovered AND Coolify's Docker-Image / on-VPS source-build path
   is **disabled** — images must build in **GitHub Actions → GHCR → Coolify pulls**.
   An on-VPS `next build` OOM-froze prod 2026-05-31. Commits are LOCAL only.
2. **Coolify runtime env (primary lever, no rebuild):** set `APP_ORIGIN=https://xtimator.com`
   (runtime, non-inlined) on the Xtimator service, then restart the container. This is
   read at runtime by both `resolveBaseUrl()` and `getCanonicalBaseUrl()`.
3. **GitHub Actions build Variable:** set `NEXT_PUBLIC_SITE_URL=https://xtimator.com`
   (build-inlined) so build-time inlined reads also resolve to the canonical domain.
4. **Supabase Auth:** set the Site URL and add `https://xtimator.com/callback` to the
   redirect allowlist — required now that `resetPassword()` builds its `redirectTo` from
   `getCanonicalBaseUrl()`.

(Placeholders/canonical values only above — no secrets.)

## What Was Built

### Task 1 — Harden `lib/utils/site-url.ts` (commit `d444988`)
- `resolveBaseUrl(request)` precedence is now 4-tier: **APP_ORIGIN** (runtime) → `NEXT_PUBLIC_SITE_URL` (build-inlined) → proxy headers (`x-forwarded-proto`/`-host` || `host`) → `new URL(request.url).origin` (last resort).
- New exported `getCanonicalBaseUrl(): string`: APP_ORIGIN → NEXT_PUBLIC_SITE_URL → NEXT_PUBLIC_APP_URL (legacy alias) → `'https://xtimator.com'` (literal final fallback). Never returns null.
- Reuses the existing private `normalize()` (trim, strip quotes, strip trailing slash, handle Coolify trailing newline) for every tier.
- Tests: 7 existing pass unchanged; +9 new (APP_ORIGIN precedence/normalization on `resolveBaseUrl`, full `getCanonicalBaseUrl` describe block). 16 site-url tests green (TDD RED proven before implementing).

### Task 2 — Redirect bases via `resolveBaseUrl(req)` (commit `f14c5f0`)
- `app/demo/route.ts`: `const origin = resolveBaseUrl(request)` (all 4 redirects build off it).
- `app/api/stripe/connect/initiate/route.ts`: single `const base = resolveBaseUrl(req)` drives the OAuth `redirect_uri` AND the auth/onboarding/error bounces.
- `app/api/estimate/[token]/pay/route.ts`: `const origin = resolveBaseUrl(req)` for Stripe `success_url`/`cancel_url`; literal `{CHECKOUT_SESSION_ID}` template untouched.
- `app/api/stripe/connect/callback/route.ts`: `new URL(req.url)` kept for searchParams; redirect base is `const base = resolveBaseUrl(req)` for `settingsUrl` + both early bounces.
- `new URL(req.url)` survives only for searchParams/path parsing in these files (verified by grep). `npx tsc --noEmit` reports no errors in the 4 touched files.

### Task 3 — Unify env reads via `getCanonicalBaseUrl()` (commit `4c83a82`)
- `lib/oauth/issuer.ts`: explicit tier now reads `process.env.APP_ORIGIN ?? NEXT_PUBLIC_APP_URL ?? NEXT_PUBLIC_SITE_URL` then `normalize()`. The `VERCEL_ENV==='production'` canonical branch, `VERCEL_URL` preview branch, and async `next/headers` fallback are **unchanged and still reachable** (deliberately did NOT call `getCanonicalBaseUrl()` here, which would short-circuit those branches).
- `lib/whatsapp/send-estimate.ts` & `app/api/estimates/[id]/send-sms/route.ts`: `branding.canonicalBaseUrl ?? getCanonicalBaseUrl()` (DB-first preserved).
- `lib/whatsapp/confirm.ts` (`buildShareUrl`), `app/api/cron/trial-warning-emails/route.ts`, `lib/billing/connect-webhook.ts`, `lib/actions/auth.ts` (`resetPassword`): now use `getCanonicalBaseUrl()`.
- Client-side `window.location.origin` usages: untouched.
- 26 tests green (16 site-url + 10 oauth-issuer).

## Verification

- `npx vitest run tests/unit/site-url.test.ts tests/unit/oauth-issuer.test.ts` → **26 passed** (16 site-url + 10 oauth-issuer).
- `npx tsc --noEmit` → **no new errors** in any touched file. (Pre-existing unrelated errors in `onboarding-survey` files — see Deferred Issues.)
- Grep: the 4 Part-2 files contain no `new URL(...).origin` used as a redirect base.
- Grep: the 7 Part-3 files have no `process.env.NEXT_PUBLIC_APP_URL` base-URL *fallback* (the one remaining `issuer.ts` reference is the intentional explicit-env chain, not a default).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] oauth-issuer test isolation hardened for new multi-env read**
- **Found during:** Task 3.
- **Issue:** issuer.ts now also reads `APP_ORIGIN` and `NEXT_PUBLIC_SITE_URL`; the existing test only backed up/deleted `NEXT_PUBLIC_APP_URL`/`VERCEL_*`, so a leaked real-env `APP_ORIGIN` could make tests flaky.
- **Fix:** extended `envBackup` + delete set to include `APP_ORIGIN` and `NEXT_PUBLIC_SITE_URL`; added 2 additive precedence tests (`1d`, `1e`). Coverage strengthened, not weakened.
- **Files modified:** `tests/unit/oauth-issuer.test.ts`
- **Commit:** `4c83a82`

## Deferred Issues (out of scope — logged in deferred-items.md)

- `app/api/billing/create-portal-session/route.ts` and `app/api/billing/create-checkout-session/route.ts` still interpolate `process.env.NEXT_PUBLIC_APP_URL` directly into Stripe URLs with no fallback. **Not in this plan's file list** — left untouched. A future task could route them through `getCanonicalBaseUrl()`.
- Pre-existing `tsc` errors in `components/onboarding/onboarding-survey.tsx` and its test (missing `subdomain` field) — unrelated to base-URL work, predate this plan.

## Self-Check: PASSED

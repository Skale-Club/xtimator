---
phase: 1001-seo-foundation-crawlability-structured-data-content-architec
plan: "04"
subsystem: seo-operations
tags: [seo, cacheability, lighthouse, core-web-vitals, release-gates]
requires: [1001-01, 1001-02, 1001-03]
provides: [cacheable-homepage, seo-smoke-gate, lighthouse-gate, seo-runbook]
affects: [homepage, release-process, search-operations]
tech-stack:
  added: [lighthouse, chrome-launcher]
  patterns: [client-auth-enhancement, responsive-next-images, executable-seo-gates]
key-files:
  created: [scripts/seo-smoke.mjs, docs/seo-launch-runbook.md]
  modified: [app/page.tsx, components/landing/top-nav-auth.tsx, scripts/lighthouse.mjs]
key-decisions:
  - "Public homepage rendering is request-independent; signed-in navigation resolves after hydration."
  - "The release gate uses an explicit desktop Lighthouse profile; mobile field data is tracked separately."
requirements-completed: [SEO-05, SEO-06]
duration: 35 min
completed: 2026-07-05
---

# Phase 1001 Plan 04: Cacheability and SEO Operations Summary

The acquisition homepage is statically revalidated, preserves authenticated
navigation through a client enhancement, and now has executable metadata,
cache-policy, and Lighthouse release gates plus a 30/60/90-day operating runbook.

## Tasks

1. Removed request-bound auth/theme reads from public rendering, deferred the auth
   dialog, and optimized landing imagery and above-the-fold rendering.
2. Added pinned Lighthouse tooling, production SEO smoke checks, package scripts,
   and a launch/measurement runbook.

## Task Commits

1. **Restore acquisition page cacheability** — `62f7254f`
2. **Add SEO release gates** — `1646fd16`
3. **Preserve static landing HTML** — `950a9226`

## Files Created/Modified

- `scripts/seo-smoke.mjs` — validates production crawl, metadata, schema, and cache policy.
- `docs/seo-launch-runbook.md` — launch checks, owners, incident response, and 30/60/90-day measurement.
- `app/page.tsx` — statically revalidated acquisition page without request-bound auth.
- `components/landing/landing-page.tsx` — browser query handling without a static-render bailout.
- `scripts/lighthouse.mjs` — executable desktop release thresholds for representative URLs.

## Verification

- `npx vitest run tests/unit/seo/home-cacheability.test.ts` — 4/4 passed.
- `npx tsc --noEmit -p tsconfig.ci.json` — passed.
- `npm run build` — passed; homepage is static with five-minute revalidation.
- Local SEO smoke — all assertions passed.
- Lighthouse desktop — homepage 98/89/100/100; industry page 100/89/100/100.
- Mobile homepage lab baseline — 80 Performance; retained in the runbook for
  continued improvement and field-data comparison.

## Deviations from Plan

- **Rule 1 — performance:** Removed costly hero entry animation and optimized
  near-fold remote images after mobile Lighthouse identified LCP/network waste.
- **Rule 1 — rendering:** Replaced `useSearchParams` with browser URL parsing so
  the static HTML contains the complete acquisition page instead of a client
  rendering bailout.
- **Environment:** Used `next start` for local verification because the raw
  standalone directory did not include copied static assets.
- **External setup:** Search Console verification/submission and Meta rescraping
  remain owner actions documented in `1001-USER-SETUP.md`.

## Self-Check: PASSED

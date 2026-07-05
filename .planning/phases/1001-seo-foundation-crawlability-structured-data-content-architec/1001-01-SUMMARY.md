---
phase: 1001-seo-foundation-crawlability-structured-data-content-architec
plan: "01"
subsystem: seo
tags: [nextjs, metadata, robots, sitemap, crawlability]
requires: []
provides: [route-indexing-policy, robots-route, sitemap-route, canonical-helper]
affects: [public-pages, private-route-layouts, blog-query]
tech-stack:
  added: []
  patterns: [native-next-metadata-routes, explicit-public-allowlist, inherited-private-noindex]
key-files:
  created: [lib/seo/route-policy.ts, lib/seo/metadata.ts, app/robots.ts, app/sitemap.ts]
  modified: [lib/queries/blog.ts]
key-decisions:
  - "Robots is crawl guidance; private segment metadata emits noindex while auth remains authoritative."
  - "Sitemap is an allowlist of public routes and published content."
requirements-completed: [SEO-01, SEO-02]
duration: 8 min
completed: 2026-07-05
---

# Phase 1001 Plan 01: Crawlability Foundation Summary

Native Next.js robots and sitemap routes now share one canonical URL resolver, while private application route families inherit an explicit noindex policy.

## Tasks

1. Added the shared route policy and applied private robots metadata across application, auth, capture, admin, demo, estimate-token, invite, OAuth, offline, and onboarding surfaces.
2. Added dynamic robots/sitemap routes backed by published blog posts and an explicit public allowlist.

## Verification

- `npx vitest run tests/unit/seo/route-policy.test.ts tests/unit/seo/metadata-routes.test.ts` — 12/12 passed.
- `npx tsc --noEmit -p tsconfig.ci.json` — passed.

## Deviations from Plan

- **Rule 2 — missing critical detail:** Extended `getBlogPosts` with `updated_at` and a configurable page size so sitemap can include every published post with a meaningful last-modified value.

## Self-Check: PASSED

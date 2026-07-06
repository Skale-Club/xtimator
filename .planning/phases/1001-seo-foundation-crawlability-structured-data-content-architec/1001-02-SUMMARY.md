---
phase: 1001-seo-foundation-crawlability-structured-data-content-architec
plan: "02"
subsystem: seo
tags: [open-graph, twitter, json-ld, schema-org, metadata]
requires: [1001-01]
provides: [complete-social-metadata, organization-schema, software-schema, article-schema]
affects: [root-layout, homepage, blog]
tech-stack:
  added: []
  patterns: [public-metadata-factory, safe-json-ld-serialization]
key-files:
  created: [components/seo/json-ld.tsx, lib/seo/structured-data.ts]
  modified: [app/layout.tsx, app/page.tsx, app/blog/page.tsx, app/blog/[slug]/page.tsx]
key-decisions:
  - "Descriptions are normalized and capped at 160 characters."
  - "fb:app_id is emitted only when NEXT_PUBLIC_FACEBOOK_APP_ID contains a real value."
requirements-completed: [SEO-02, SEO-03]
duration: 7 min
completed: 2026-07-05
---

# Phase 1001 Plan 02: Social Metadata and Structured Data Summary

Public pages now emit self-canonicals, complete Open Graph/Twitter metadata, and safe JSON-LD for the product, organization, website, articles, and breadcrumbs.

## Tasks

1. Replaced partial inherited metadata with a complete public metadata factory and route-specific blog metadata.
2. Added typed structured-data builders and safe server-rendered JSON-LD scripts.

## Verification

- `npx vitest run tests/unit/seo/public-metadata.test.ts tests/unit/seo/structured-data.test.tsx tests/unit/seo/metadata-routes.test.ts` — 7/7 passed.
- `npx tsc --noEmit -p tsconfig.ci.json` — passed.

## Deviations from Plan

- **Rule 1 — correctness:** Published blog lookup now explicitly filters `status='published'`, preventing draft slugs from becoming public SEO pages.

## Self-Check: PASSED

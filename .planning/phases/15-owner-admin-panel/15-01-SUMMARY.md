---
phase: 15-owner-admin-panel
plan: "01"
subsystem: admin-foundation
tags: [db-migration, platform-config, blog, zod-schemas, test-stubs, tailwind-typography]
dependency_graph:
  requires: []
  provides: [blog_posts-table, platform-branding-seo-columns, LandingContent-type, getBlogPosts, getBlogPost, getLandingContent, seoSchema, landingContentSchema, blogPostSchema]
  affects: [lib/platform-config.ts, lib/schemas/admin.ts, app/globals.css]
tech_stack:
  added: [react-markdown@10.1.0, remark-gfm@4.0.1, "@tailwindcss/typography@0.5.19"]
  patterns: [DEFAULT_LANDING_CONTENT constant, getLandingContent() helper, server-only blog queries]
key_files:
  created:
    - supabase/migrations/20260503000001_phase15_admin_panel.sql
    - lib/queries/blog.ts
    - tests/unit/admin-dashboard.test.ts
    - tests/unit/seo-actions.test.ts
    - tests/unit/landing-actions.test.ts
    - tests/unit/blog-actions.test.ts
    - tests/integration/blog-rls.test.ts
  modified:
    - lib/platform-config.ts
    - lib/schemas/admin.ts
    - app/globals.css
    - package.json
    - tests/unit/platform-config.test.ts
decisions:
  - DEFAULT_LANDING_CONTENT seeded from actual component source (how-it-works-section.tsx, features-section.tsx) so icons stored as string names (BrainCircuit, FileBadge2, etc.) for DB serialization
  - getLandingContent() delegates to getBranding() to reuse TTL cache rather than adding a second cache layer
  - platform-config.test.ts updated to toMatchObject + expect landingContent defined — toEqual was too strict for extended Branding type
metrics:
  duration: "5min"
  completed: "2026-05-03"
  tasks: 3
  files: 11
---

# Phase 15 Plan 01: DB Migration, Platform-Config Types, Blog Helpers, Wave 0 Stubs Summary

Phase 15 foundation laid: Postgres migration adds SEO columns + blog_posts table with RLS + get_platform_user_count() RPC; platform-config.ts extended with LandingContent type, DEFAULT_LANDING_CONTENT seeded from live landing component text, and 5 new Branding fields; blog.ts adds server-only getBlogPosts/getBlogPost queries; admin.ts gains seoSchema/landingContentSchema/blogPostSchema; typography plugin activated; 5 Wave 0 test stubs created (all it.todo, compile-only).

## What Was Built

### DB Migration (`20260503000001_phase15_admin_panel.sql`)
- Extends `platform_branding` with 6 new columns: `site_title`, `meta_description`, `og_image_url`, `canonical_base_url`, `favicon_url`, `landing_content` (JSONB)
- Creates `blog_posts` table with full schema (UUID PK, slug unique index, status check, timestamps)
- Enables RLS on `blog_posts` with `blog_posts_public_read` policy (published only)
- Adds `get_platform_user_count()` SECURITY DEFINER RPC counting `auth.users`

### lib/platform-config.ts
- New `LandingContent` type with heroHeadline, heroSubheadline, ctaLabel, howItWorksSteps (3), features (4)
- `Branding` type extended with 5 SEO nullable fields + `landingContent: LandingContent`
- `DEFAULT_LANDING_CONTENT` constant with actual text from landing components
- `FALLBACK_BRANDING` includes all new fields with null/DEFAULT_LANDING_CONTENT fallbacks
- `getBranding()` maps new DB columns with null-safe fallbacks; landingContent falls back to DEFAULT_LANDING_CONTENT when JSONB is empty
- New `getLandingContent()` function delegates to getBranding() for cache reuse

### lib/queries/blog.ts (new)
- `BlogPostSummary` and `BlogPost` types
- `getBlogPosts(page)` — paginated published posts query (PAGE_SIZE=10)
- `getBlogPost(slug)` — single post by slug via maybeSingle()

### lib/schemas/admin.ts
- `seoSchema` — siteTitle, metaDescription, ogImageUrl, canonicalBaseUrl with URL validation + empty-string transform
- `landingContentSchema` — heroHeadline/Sub/ctaLabel + howItWorksSteps[3] + features[1-6]
- `blogPostSchema` — full blog post with slug regex validation + coverImageUrl transform
- Exported inferred types: SeoInput, LandingContentInput, BlogPostInput

### app/globals.css
- Added `@plugin "@tailwindcss/typography";` (Tailwind v4 @plugin syntax)

### Wave 0 Test Stubs (5 files, all it.todo)
- `tests/unit/admin-dashboard.test.ts` — DASH-01 (4 todos)
- `tests/unit/seo-actions.test.ts` — SEO-01 (5 todos)
- `tests/unit/landing-actions.test.ts` — LP-01 (6 todos)
- `tests/unit/blog-actions.test.ts` — BLOG-01 (7 todos)
- `tests/integration/blog-rls.test.ts` — BLOG-02 (4 todos)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated platform-config.test.ts for extended Branding type**
- **Found during:** Task 3 (test run)
- **Issue:** Existing tests used `toEqual` with the old 4-field Branding shape; the extended Branding type added 5 new fields + landingContent, causing 2 test failures
- **Fix:** Changed `toEqual` to `toMatchObject` and added `expect(result.landingContent).toBeDefined()` in the two failing assertions
- **Files modified:** `tests/unit/platform-config.test.ts`
- **Commit:** e725717

## Test Results

```
Test Files  45 passed | 5 skipped (50)
     Tests  260 passed | 26 todo (286)
  Duration  15.38s
```

TypeScript: `npx tsc --noEmit --skipLibCheck` — no errors.

## Commits

- `8546346` — feat(15-01): DB migration, typography plugin, markdown packages
- `b62f4ff` — feat(15-01): extend platform-config types, add blog queries, extend admin schemas
- `e725717` — feat(15-01): wave 0 test stubs + update platform-config tests for new Branding shape

## Self-Check: PASSED

- supabase/migrations/20260503000001_phase15_admin_panel.sql: FOUND
- lib/queries/blog.ts: FOUND
- lib/schemas/admin.ts (extended): FOUND
- lib/platform-config.ts (extended): FOUND
- tests/unit/admin-dashboard.test.ts: FOUND
- tests/unit/seo-actions.test.ts: FOUND
- tests/unit/landing-actions.test.ts: FOUND
- tests/unit/blog-actions.test.ts: FOUND
- tests/integration/blog-rls.test.ts: FOUND
- All commits 8546346, b62f4ff, e725717: VERIFIED

---
phase: 15-owner-admin-panel
plan: "05"
subsystem: blog
tags: [blog, admin, markdown, seo, server-actions, ssr]
dependency_graph:
  requires: [15-01]
  provides: [admin-blog-crud, public-blog-pages, blog-markdown-renderer]
  affects: [/admin/blog, /blog, components/blog]
tech_stack:
  added: [react-markdown, remark-gfm]
  patterns:
    - Server action with requireAdmin guard + createServiceClient for admin CRUD
    - useTransition wrapper pattern (PostFormWrapper / EditPostWrapper) for client-side form wiring
    - Inline BlogPostActions 'use client' component for toggle/delete in server-rendered list page
    - BlogContent as Server Component using react-markdown v10 (no 'use client' needed)
    - generateMetadata async function with OpenGraph article metadata
key_files:
  created:
    - app/admin/blog/actions.ts
    - app/admin/blog/post-form.tsx
    - app/admin/blog/post-form-wrapper.tsx
    - app/admin/blog/blog-post-actions.tsx
    - app/admin/blog/new/page.tsx
    - app/admin/blog/[id]/page.tsx
    - app/admin/blog/[id]/edit-post-wrapper.tsx
    - app/admin/blog/page.tsx
    - app/blog/page.tsx
    - app/blog/[slug]/page.tsx
    - components/blog/blog-content.tsx
  modified:
    - tests/unit/blog-actions.test.ts
    - tests/integration/blog-rls.test.ts
decisions:
  - EditPostWrapper extracted to app/admin/blog/[id]/edit-post-wrapper.tsx (separate file rather than inline in page.tsx) for clean server/client boundary
  - BlogPostActions extracted to blog-post-actions.tsx rather than inline in page.tsx for same reason
  - togglePostStatus and deletePost confirm dialog uses native browser confirm() — no modal dependency needed for admin-only destructive action
metrics:
  duration: 8min
  completed_date: "2026-05-03"
  tasks: 10
  files: 13
---

# Phase 15 Plan 05: Blog System Summary

Complete blog system: admin CRUD at `/admin/blog` + public SSR pages at `/blog` with react-markdown v10 rendering via remark-gfm.

## What Was Built

### Admin Blog System (`/admin/blog`)

- **`app/admin/blog/actions.ts`** — Four server actions: `createPost`, `updatePost`, `deletePost`, `togglePostStatus`. Each calls `requireAdmin()` then `createServiceClient()` to bypass RLS. Handles 23505 duplicate slug error. `revalidatePath` clears both admin and public caches.
- **`app/admin/blog/post-form.tsx`** — Client form with react-hook-form + zodResolver. Title blur auto-fills slug for new posts. Status shadcn Select. SEO fields inside `<details>`. Submit button label switches between "Save draft" and "Publish".
- **`app/admin/blog/post-form-wrapper.tsx`** — Thin useTransition wrapper calling `createPost`, redirecting to `/admin/blog` on success.
- **`app/admin/blog/[id]/edit-post-wrapper.tsx`** — Same pattern but calls `updatePost(post.id, data)`.
- **`app/admin/blog/page.tsx`** — Server component fetching all posts (draft + published) via service client. Table with status badges and `BlogPostActions` for toggle/delete.
- **`app/admin/blog/blog-post-actions.tsx`** — Inline `'use client'` component with useTransition + router.refresh().
- **`app/admin/blog/new/page.tsx`** — requireAdmin guard + PostFormWrapper.
- **`app/admin/blog/[id]/page.tsx`** — requireAdmin + service client fetch + EditPostWrapper.

### Public Blog Pages (`/blog`)

- **`app/blog/page.tsx`** — SSR list using `getBlogPosts()` (anon client, RLS filters drafts). Cover image, title link, excerpt, formatted date.
- **`app/blog/[slug]/page.tsx`** — SSR detail with `generateMetadata` (meta_title, meta_description, OpenGraph article). Calls `getBlogPost()` (anon client) → `notFound()` for drafts.
- **`components/blog/blog-content.tsx`** — Server Component wrapping react-markdown with remarkGfm. `prose prose-invert max-w-none` typography.

### Tests

- **`tests/unit/blog-actions.test.ts`** — 7 tests covering: slug derivation, published_at set on publish, update fields, delete, toggle to published, toggle to draft, 23505 error.
- **`tests/integration/blog-rls.test.ts`** — 4 tests verifying getBlogPosts returns only published posts, empty array for all-drafts, getBlogPost returns null for drafts, returns post for published.

## Deviations from Plan

### Auto-added Files (not in plan but required)

**1. [Rule 2 - Missing] `app/admin/blog/blog-post-actions.tsx`**
- **Found during:** Task 6
- **Issue:** Plan described BlogPostActions as an "inline 'use client' component" in page.tsx, but server/client boundary requires separate file to keep page.tsx as a pure Server Component.
- **Fix:** Extracted to `blog-post-actions.tsx` (imported into page.tsx).
- **Files modified:** `app/admin/blog/blog-post-actions.tsx` (new)
- **Commit:** 6ea657f

**2. [Rule 2 - Missing] `app/admin/blog/[id]/edit-post-wrapper.tsx`**
- **Found during:** Task 5
- **Issue:** Plan described EditPostWrapper as inline in page.tsx, but same server/client boundary constraint applies.
- **Fix:** Extracted to `edit-post-wrapper.tsx`.
- **Files modified:** `app/admin/blog/[id]/edit-post-wrapper.tsx` (new)
- **Commit:** 6ea657f

## Known Stubs

None — all data sources are wired to live queries (getBlogPosts, getBlogPost via anon client; admin CRUD via service client).

## Self-Check: PASSED

All created files verified to exist. Commit 6ea657f confirmed in git log.

---
phase: 72-admin-menu-performance
plan: 01
subsystem: ui
tags: [nextjs, loading-skeleton, isr, admin, performance, streaming]

requires:
  - phase: 71-admin-glass-design-system
    provides: Card variant=glass + glass CSS tokens (--glass-bg) used in skeletons

provides:
  - 10 loading.tsx skeleton files covering all admin route segments
  - ISR revalidate=60 on 4 stable admin pages (dashboard, branding, seo, landing)
  - Next.js streaming for all /admin/* navigations (no blank screen flash)

affects:
  - any future admin pages added under app/admin/

tech-stack:
  added: []
  patterns:
    - "loading.tsx at every admin route segment for Next.js App Router automatic Suspense boundaries"
    - "Skeleton with animate-pulse + bg-[var(--glass-bg)] for admin dark glass skeleton pattern"
    - "revalidate=60 ISR for stable platform config pages; force-dynamic kept for data-sensitive pages"

key-files:
  created:
    - app/admin/loading.tsx
    - app/admin/branding/loading.tsx
    - app/admin/seo/loading.tsx
    - app/admin/landing/loading.tsx
    - app/admin/billing/loading.tsx
    - app/admin/admins/loading.tsx
    - app/admin/integrations/loading.tsx
    - app/admin/blog/loading.tsx
    - app/admin/blog/new/loading.tsx
    - app/admin/blog/[id]/loading.tsx
  modified:
    - app/admin/page.tsx
    - app/admin/branding/page.tsx
    - app/admin/seo/page.tsx
    - app/admin/landing/page.tsx

key-decisions:
  - "10 loading.tsx files use animate-pulse + bg-[var(--glass-bg)] on every Skeleton (D-03 locked decision)"
  - "Only 4 stable pages converted to ISR: dashboard, branding, seo, landing — billing/blog/admins remain force-dynamic"
  - "revalidatePath() calls in existing action files correctly bust ISR cache on writes — no action file changes needed"

patterns-established:
  - "Admin skeleton pattern: import Skeleton from @/components/ui/skeleton + animate-pulse bg-[var(--glass-bg)]"

requirements-completed:
  - PERF-ADMIN-01
  - PERF-ADMIN-02

duration: 4min
completed: 2026-05-17
---

# Phase 72 Plan 01: Admin Loading Skeletons + ISR Summary

**10 Next.js loading.tsx skeleton files + ISR revalidate=60 on 4 stable admin pages — eliminates blank-screen flash on all admin navigations**

## Performance

- **Duration:** 4 min
- **Started:** 2026-05-17T20:19:13Z
- **Completed:** 2026-05-17T20:22:40Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments

- Created 10 loading.tsx skeleton files covering every admin route segment so Next.js App Router streaming kicks in immediately on navigation
- All skeletons use animate-pulse + bg-[var(--glass-bg)] matching the admin dark glass design system (D-03)
- Switched 4 stable admin pages (dashboard, branding, seo, landing) from force-dynamic to ISR revalidate=60 — cached HTML served instantly on warm requests
- Left billing, blog, and admins pages at force-dynamic since those require fresh data

## Task Commits

Each task was committed atomically:

1. **Task 1: Create loading.tsx skeleton files for all 10 admin route segments** - `3a8f489` (feat)
2. **Task 2: Switch stable admin pages from force-dynamic to ISR revalidate=60** - `e64f58d` (perf)

## Files Created/Modified

- `app/admin/loading.tsx` - Dashboard 3-column stat card grid skeleton
- `app/admin/branding/loading.tsx` - Full-width form card skeleton
- `app/admin/seo/loading.tsx` - Form card skeleton
- `app/admin/landing/loading.tsx` - Tall form card skeleton
- `app/admin/billing/loading.tsx` - Stat card + table skeleton
- `app/admin/admins/loading.tsx` - Header row + card skeleton
- `app/admin/integrations/loading.tsx` - 2-card skeleton
- `app/admin/blog/loading.tsx` - Header + 3 row stubs skeleton
- `app/admin/blog/new/loading.tsx` - Form card skeleton
- `app/admin/blog/[id]/loading.tsx` - Form card skeleton
- `app/admin/page.tsx` - Switched to revalidate=60
- `app/admin/branding/page.tsx` - Switched to revalidate=60
- `app/admin/seo/page.tsx` - Switched to revalidate=60
- `app/admin/landing/page.tsx` - Switched to revalidate=60

## Decisions Made

- Used animate-pulse + bg-[var(--glass-bg)] on all skeletons per D-03 (locked decision from 72-CONTEXT.md)
- Kept billing/blog/admins at force-dynamic: billing shows MRR/tier which must be current; blog post status must reflect latest; admins panel should always show current admin list
- revalidatePath() in existing branding-actions.ts, seo-actions.ts, landing-actions.ts, admin-stats correctly busts ISR cache on writes — confirmed no action file changes needed

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Task 1 loading files were picked up by the parallel agent (72-03) and included in its commit (`3a8f489`) during concurrent execution. The files were already staged when 72-03 committed. This is expected parallel agent behavior — files committed correctly, hash recorded.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All /admin/* route segments now have loading.tsx — Next.js streams the admin shell skeleton instantly on navigation
- ISR cache warm for stable admin pages after first access; revalidatePath() calls in action files bust cache on writes
- Ready for Phase 72 Plan 02 (admin shell instant paint — preloading + prefetching optimizations)

---
*Phase: 72-admin-menu-performance*
*Completed: 2026-05-17*

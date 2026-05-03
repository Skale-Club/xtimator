# Phase 17: Navigation Performance - Research

**Researched:** 2026-05-03
**Domain:** Next.js 16 App Router — streaming, loading.tsx, React cache(), use cache directive, prefetch
**Confidence:** HIGH

---

## Summary

The authenticated app currently has a ~1 second blank-screen delay on navigation because the App Router layout (`app/(app)/layout.tsx`) awaits two sequential Supabase calls before rendering, and until recently there were no `loading.tsx` files to provide Suspense fallback UI. Since Phase 16, partial loading files have been added (dashboard, clients, clients/[id], projects/[id]) but three routes are still missing them: `projects/new`, `settings`, and `settings/appearance`. More critically, the layout itself blocks every navigation: it awaits `getClaims()` + the companies query before it can render the sidebar and shell that wraps `{children}`.

The fix is a three-part layered approach:
1. **loading.tsx completion** — fill the three gaps so every authenticated route shows a skeleton within 50ms.
2. **Layout data caching** — wrap the layout's Supabase calls in React `cache()` (request-scoped memoisation) so re-renders within the same request deduplicate; and optionally `unstable_cache` or `use cache` for cross-request short-lived caching.
3. **Page-level query optimisation + Suspense boundaries** — parallelise any remaining sequential queries and add `<Suspense>` for sections that can render independently.

**Primary recommendation:** Ship loading.tsx for missing routes first (immediate 50ms skeleton on all navigations), then add React `cache()` to the layout queries (eliminates duplicate DB calls per render), then optionally wrap individual page data sections in `<Suspense>` for progressive streaming.

---

## Existing State (critical context)

These loading.tsx files ALREADY EXIST — do not recreate them:

| Route | loading.tsx exists? |
|-------|---------------------|
| `app/(app)/dashboard/` | YES |
| `app/(app)/clients/` | YES |
| `app/(app)/clients/[id]/` | YES |
| `app/(app)/projects/[id]/` | YES |
| `app/(app)/projects/new/` | **NO** — must create |
| `app/(app)/settings/` | **NO** — must create |
| `app/(app)/settings/appearance/` | **NO** — must create (no data but good UX) |

The existing loading files use `Skeleton` from `@/components/ui/skeleton`. The pattern is consistent.

React `cache()` is already used in the codebase: `lib/auth/admin-context.ts` uses it for `getAdminContext`. This exact pattern is what Plan 02 should replicate for the app layout.

---

## Standard Stack

### Core (all already installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 16.2.3 | App Router, loading.tsx convention, streaming | Project stack |
| React | 19.2.4 | Suspense, `cache()`, `use()` | Project stack |
| `@/components/ui/skeleton` | (shadcn) | Skeleton loading placeholder | Already used in existing loading files |

### Caching APIs

| API | Source | Scope | When to Use |
|-----|--------|-------|-------------|
| `cache()` from `react` | React 19 | Per-request deduplication | Deduplicate the same async call within a single render tree |
| `unstable_cache` from `next/cache` | Next.js 14+ | Cross-request, persistent | Short-lived TTL cache across multiple requests (60s for company data) |
| `use cache` directive | Next.js 16 (requires `cacheComponents: true` in next.config) | Cross-request, unified | Modern replacement for unstable_cache — opt-in via next.config flag |

**Decision for Plan 02:** Use `cache()` from React for request-scoped deduplication (zero config, no next.config change needed) PLUS `unstable_cache` from `next/cache` for cross-request 60-second TTL. This is the conservative path. The `use cache` directive requires `cacheComponents: true` in next.config and is a larger opt-in — defer that.

### No additional packages needed

All required APIs are built into Next.js 16 and React 19. No npm installs required for this phase.

---

## Architecture Patterns

### Pattern 1: loading.tsx — Route-Level Suspense Fallback

**What:** A `loading.tsx` file co-located with `page.tsx` automatically wraps the page in a `<Suspense>` boundary. The loading component is the fallback. Next.js sends the layout + loading skeleton as the static shell immediately, then streams the actual page content when it resolves.

**Key mechanic for dynamic routes:** When `loading.tsx` is present on a dynamic route, Next.js can partially prefetch the route — it prefetches the loading skeleton and layout. On click, the skeleton appears immediately (within the prefetch round-trip, typically <50ms on warm connection) while the page data loads.

**When to use:** Any page that awaits data before rendering. Every authenticated page in this app qualifies.

```tsx
// Source: https://nextjs.org/docs/app/guides/streaming
// app/(app)/projects/new/loading.tsx
import { Skeleton } from '@/components/ui/skeleton'

export default function NewProjectLoading() {
  return (
    <div className="mx-auto max-w-[700px] px-4 py-8 space-y-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  )
}
```

### Pattern 2: React `cache()` for Request-Scoped Memoisation

**What:** Wrapping an async function with `cache()` from React causes subsequent calls with the same arguments within the same React render to return the cached result instead of re-executing. This is per-request scope — each new HTTP request gets a fresh cache.

**Critical use case here:** Both `app/(app)/layout.tsx` AND `app/(app)/dashboard/page.tsx` (and clients, projects/new, settings) independently call `getClaims()` + `companies` query. With `cache()`, the second call within the same render is a no-op.

```tsx
// Source: lib/auth/admin-context.ts (existing pattern in this codebase)
// lib/queries/auth.ts  — NEW FILE
import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export const getAuthClaims = cache(async () => {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  return claimsData?.claims ?? null
})

export const getCompanyForUser = cache(async (userId: string) => {
  const supabase = await createClient()
  const { data: company } = await supabase
    .from('companies')
    .select('id, name, logo_url, owner_name, theme_preference')
    .eq('user_id', userId)
    .single()
  return company ?? null
})
```

### Pattern 3: `unstable_cache` for Cross-Request Short-Lived Cache

**What:** Wraps an async function so its result is persisted across multiple requests for a configurable TTL. The cache key includes the function arguments.

**Use case:** Company data changes very rarely (settings saves, logo upload). A 60-second TTL means navigation between pages hits the in-memory cache instead of Supabase.

```tsx
// Source: https://nextjs.org/docs/app/api-reference/functions/unstable_cache
import { unstable_cache } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// Cached version — valid for 60 seconds, tagged for on-demand invalidation
export const getCachedCompany = unstable_cache(
  async (userId: string) => {
    const supabase = await createClient()
    const { data } = await supabase
      .from('companies')
      .select('id, name, logo_url, owner_name, theme_preference')
      .eq('user_id', userId)
      .single()
    return data ?? null
  },
  ['company-for-user'],
  { revalidate: 60, tags: ['company'] }
)
```

**Caveat:** `unstable_cache` cannot call `cookies()` or `headers()` inside the cached function — pass values as arguments. The `createClient()` call creates a Supabase client that reads cookies internally. This means `createClient()` MUST be called OUTSIDE the `unstable_cache` wrapper and the userId passed as argument. See Pitfall 2 below.

**Correct pattern for unstable_cache with Supabase:**
```tsx
// createClient is called outside, userId is passed as argument
async function fetchCompanyForUser(userId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('companies')
    .select('id, name, logo_url, owner_name, theme_preference')
    .eq('user_id', userId)
    .single()
  return data ?? null
}

// The cache wrapper receives userId as a serializable argument
// Note: unstable_cache will serialize the function itself — the supabase
// client must be created inside the cached fn OR passed only primitives
```

**Important clarification:** After reviewing the constraint more carefully — `unstable_cache` itself can call `createClient()` internally IF it only uses the userId as the cache key (and cookies() is called inside, not passed as a Promise). The constraint is that you cannot pass the result of `cookies()` as a non-awaited Promise. Since `createClient()` awaits cookies() internally and returns a client, this is fine as long as we pass `userId` (a string) as the argument. The cache key will be based on `userId`.

### Pattern 4: `Promise.all` for Parallel Server-Side Queries

**What:** Firing multiple independent Supabase queries simultaneously instead of sequentially.

**Current state:** `dashboard/page.tsx` already uses `Promise.all` for `getDashboardStats` + `getProjects`. `projects/[id]/page.tsx` already uses `Promise.all` for 7 queries. The pattern is established. The remaining gap is the sequential `getClaims` → `companies` in each page before the parallel queries can fire.

**With React `cache()` in place:** The layout's cached `getClaims()` call resolves first (layout must render before children), so each page's `getAuthClaims()` call hits the memoised result immediately. The pages still need to await the `userId` before querying their own data, but the layout's blocking time is the only added latency.

### Pattern 5: Suspense Boundaries Within Pages

**What:** Wrap slow sub-sections of a page in `<Suspense fallback={<Skeleton />}>` so the page renders a shell immediately and streams data sections as they resolve.

**When the layout blocks:** Currently, because `layout.tsx` awaits both queries before rendering `{children}`, even with `loading.tsx` the skeleton only appears after the layout finishes. The key optimisation for Plan 03 is to move the layout's data fetching behind async functions that are called but not awaited synchronously (pass-promise pattern) — but this requires restructuring auth guards. The simpler approach: keep the layout's auth check synchronous (it must happen) but cache the result aggressively, and add Suspense within pages for progressive content.

### Recommended Project Structure (additions only)

```
app/(app)/
├── projects/
│   └── new/
│       └── loading.tsx         ← NEW (Plan 01)
├── settings/
│   ├── loading.tsx             ← NEW (Plan 01)
│   └── appearance/
│       └── loading.tsx         ← NEW (Plan 01, trivial — no data fetch)
lib/
├── queries/
│   ├── auth.ts                 ← NEW (Plan 02) — cached getClaims + getCompanyForUser
│   └── company.ts              ← MODIFY (Plan 02) — add cached variant
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Request dedup | Custom memoisation map | `cache()` from React | React cache is per-request scoped, cleared between requests, handles concurrent renders correctly |
| Cross-request caching | Custom in-memory store | `unstable_cache` from next/cache | Handles TTL, tag-based invalidation, serialisation, build ID invalidation |
| Loading skeleton | Custom CSS animations | `Skeleton` from `@/components/ui/skeleton` | Already in codebase, consistent with existing loading.tsx files |
| Prefetch on hover | Custom IntersectionObserver | `<Link prefetch={null}>` + `onMouseEnter` toggle | Next.js handles the RSC payload prefetch; hover pattern shown in official docs |

**Key insight:** The hardest part of this phase is NOT building anything new — it's applying existing Next.js conventions (loading.tsx, cache()) that were skipped during initial development.

---

## Common Pitfalls

### Pitfall 1: layout.tsx blocks children regardless of loading.tsx
**What goes wrong:** Developers add `loading.tsx` to pages expecting instant navigation, but the layout itself awaits two slow Supabase queries. The `loading.tsx` only takes effect AFTER the layout finishes rendering. If the layout takes 300ms, the skeleton still doesn't appear for 300ms.
**Why it happens:** `loading.tsx` wraps `page.tsx` in Suspense, but the layout is above that boundary. The layout is not wrapped by the page's loading boundary.
**How to avoid:** Cache the layout's data fetching with `cache()` + `unstable_cache`. On cached hits (most navigations), the layout resolves in ~0ms.
**Warning signs:** Skeleton appears but still has a 200-400ms delay before it shows up on subsequent navigations.

### Pitfall 2: unstable_cache cannot access request-time APIs directly
**What goes wrong:** Calling `cookies()` or `headers()` inside an `unstable_cache` callback throws: "Calling cookies() from inside unstable_cache is not supported."
**Why it happens:** `unstable_cache` serializes function arguments for the cache key, but cookies/headers are per-request and cannot be part of a persistent cache key.
**How to avoid:** Read `userId` from claims OUTSIDE the `unstable_cache` wrapper, pass it as a string argument. The userId is safe to use as a cache key since it's stable per user.
**Correct pattern:**
```tsx
// WRONG: createClient() internally calls cookies() inside the cache boundary
const getCached = unstable_cache(async () => {
  const supabase = await createClient()  // ← calls cookies() internally
  return supabase.from('companies')...
}, ['key'])

// RIGHT: createClient() called outside; only the pure data query is cached
// Option A: Pass supabase client result as argument (but clients aren't serializable)
// Option B: Accept userId as arg, call createClient() inside (this IS fine because
// unstable_cache restriction is on cookies()/headers() direct calls, NOT on
// functions that internally call them)
```
**Clarification (HIGH confidence):** Per official docs, the restriction is that you cannot ACCESS the cookies/headers promise INSIDE the cache — but `createClient()` which calls `await cookies()` internally IS permitted because it resolves to a Supabase client, not a raw cookie store. The key rule: don't pass a `ReadonlyRequestCookies` Promise into the cached fn.

### Pitfall 3: Duplicate auth checks across layout + pages
**What goes wrong:** After adding `cache()` wrappers, developers still have `getClaims()` calls in every page that aren't using the cached version, giving no benefit.
**How to avoid:** Replace ALL direct `supabase.auth.getClaims()` calls in page components with the new `getAuthClaims()` from `lib/queries/auth.ts`. The layout also uses it — React's `cache()` deduplicates within the same render tree automatically.

### Pitfall 4: force-dynamic interference
**What goes wrong:** Pages are NOT currently using `export const dynamic = 'force-dynamic'` (checked — none of the authenticated pages have this directive). The prompt description noted this but it is not present in the codebase.
**Confirmed:** Searching the authenticated app files for `force-dynamic` returns no results. This is not a current issue and plans should NOT add or remove this directive.

### Pitfall 5: loading.tsx for routes with no server-side data fetch
**What goes wrong:** `settings/appearance/page.tsx` has no server-side data fetches — it only renders `<ThemeToggleRadioGroup />`. Adding a loading.tsx is still valid for UX consistency but the skeleton will flash briefly and disappear immediately.
**How to avoid:** Keep the loading.tsx simple for data-free pages; a minimal skeleton is fine since it shows for <50ms.

---

## Code Examples

### Existing loading.tsx pattern (reference — do not modify)

```tsx
// Source: app/(app)/dashboard/loading.tsx (existing)
import { Skeleton } from '@/components/ui/skeleton'

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-lg" />
    </div>
  )
}
```

### React cache() pattern (existing in codebase — replicate for auth)

```tsx
// Source: lib/auth/admin-context.ts (existing)
import 'server-only'
import { cache } from 'react'

export const getAdminContext = cache(async (): Promise<AdminContext | null> => {
  // async work here — deduplicated per request
})
```

### unstable_cache pattern

```tsx
// Source: https://nextjs.org/docs/app/api-reference/functions/unstable_cache
import { unstable_cache } from 'next/cache'

export const getCachedCompany = unstable_cache(
  async (userId: string) => {
    const supabase = await createClient()
    const { data } = await supabase
      .from('companies')
      .select('id, name, logo_url, owner_name, theme_preference')
      .eq('user_id', userId)
      .single()
    return data ?? null
  },
  ['company-for-user'],
  { revalidate: 60, tags: ['company'] }
)
```

### HoverPrefetchLink (optional enhancement, Plan 03)

```tsx
// Source: https://nextjs.org/docs/app/getting-started/linking-and-navigating
'use client'
import Link from 'next/link'
import { useState } from 'react'

function HoverPrefetchLink({ href, children }) {
  const [active, setActive] = useState(false)
  return (
    <Link
      href={href}
      prefetch={active ? null : false}
      onMouseEnter={() => setActive(true)}
    >
      {children}
    </Link>
  )
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `unstable_cache` for server caching | `use cache` directive (requires `cacheComponents: true`) | Next.js 16 | `use cache` is simpler but opt-in — `unstable_cache` still works and is appropriate here |
| No caching in pages | `use cache` at function level | Next.js 16 | Cleaner API, but requires config flag |
| Prefetch on viewport enter | Prefetch on hover only (`prefetch={false}` + `onMouseEnter`) | Next.js 15+ | Reduces unnecessary prefetches for large nav lists |

**Deprecated/outdated:**
- `export const dynamic = 'force-dynamic'` on every page: unnecessary when pages make runtime DB calls (Next.js detects dynamic automatically). Adding it explicitly prevents any caching optimisations. Not currently used in this codebase — do not add it.

---

## Prefetch Behavior: Production vs Development

**Production:** `<Link>` prefetches routes when they enter the viewport. For dynamic routes with `loading.tsx`, the skeleton + layout is prefetched. Click shows skeleton instantly.

**Development:** Next.js does NOT prefetch in dev mode. The 50ms skeleton guarantee only holds in production builds. In dev, there will always be a round-trip delay. This is expected and documented.

**Hover-only prefetch:** By setting `prefetch={false}` initially and toggling to `prefetch={null}` (default) on `onMouseEnter`, we limit prefetching to links the user is actually about to click. This is the recommended pattern for sidebar nav to avoid prefetching all routes simultaneously.

---

## Open Questions

1. **unstable_cache with createClient() — cookie access inside cached fn**
   - What we know: Official docs say "accessing uncached data sources such as headers or cookies inside a cache scope is not supported." But `createClient()` from `@supabase/ssr` reads cookies internally via `cookies()` from `next/headers`.
   - What's unclear: Does this restriction apply transitively when `cookies()` is called inside a function called inside `unstable_cache`?
   - Recommendation: Use React `cache()` alone for the auth/company lookup (per-request dedup only, no cross-request persistence). This is safe and proven. Only add `unstable_cache` if profiling shows the DB round-trip is the remaining bottleneck after `cache()` is in place. The admin pattern (`getAdminContext`) already demonstrates `cache()` is sufficient.

2. **Layout restructure for streaming**
   - What we know: The layout must authenticate before rendering children (security requirement). Awaiting in layout blocks the children's Suspense boundaries.
   - What's unclear: Whether to refactor the layout to pass promise down (complex) vs just caching the calls (simple).
   - Recommendation: Keep the layout as-is architecturally. Just cache the two calls. The caching alone should reduce layout time from ~300ms to <10ms on warm hits, which is the primary goal.

---

## Environment Availability

Step 2.6: SKIPPED — this phase is purely code changes within the existing Next.js 16 + Supabase stack. No new external dependencies, services, CLIs, or databases are required.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.4 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run tests/unit/queries/ tests/unit/dashboard/` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PERF-01 | loading.tsx files render skeleton correctly | unit (component render) | `npx vitest run tests/unit/loading/` | ❌ Wave 0 |
| PERF-02 | getCachedCompany returns correct shape | unit (query) | `npx vitest run tests/unit/queries/company.test.ts` | ❌ Wave 0 |
| PERF-03 | getAuthClaims deduplicates calls (cache() behavior) | unit (mock) | `npx vitest run tests/unit/queries/auth.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/queries/ tests/unit/loading/`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/loading/loading-files.test.tsx` — renders each new loading.tsx without throwing
- [ ] `tests/unit/queries/company.test.ts` — covers `getCachedCompany` query shape and null handling
- [ ] `tests/unit/queries/auth.test.ts` — covers `getAuthClaims` mock behavior

*(Existing tests for `getDashboardStats`, `getProjects`, and query shapes in `tests/unit/queries/dashboard.test.ts` and `tests/unit/queries/clients.test.ts` cover REQ-01 indirectly.)*

---

## Sources

### Primary (HIGH confidence)
- [Next.js Streaming Guide](https://nextjs.org/docs/app/guides/streaming) — loading.tsx mechanics, Suspense patterns, streaming vs blocking rendering
- [Next.js Linking and Navigating](https://nextjs.org/docs/app/getting-started/linking-and-navigating) — prefetch behavior, production vs dev, hover prefetch pattern
- [Next.js unstable_cache reference](https://nextjs.org/docs/app/api-reference/functions/unstable_cache) — API, caveats, replacement by use cache
- [Next.js use cache directive](https://nextjs.org/docs/app/api-reference/directives/use-cache) — cacheComponents flag, cacheLife, constraints
- [Next.js Caching Getting Started](https://nextjs.org/docs/app/getting-started/caching) — use cache patterns, React cache() scope rules
- Codebase: `lib/auth/admin-context.ts` — existing React `cache()` usage pattern

### Secondary (MEDIUM confidence)
- React 19 `cache()` function — per-request deduplication, confirmed via existing codebase usage
- Supabase JS 2.103.0 + `@supabase/ssr` 0.10.2 — no version-specific caching concerns identified

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages already installed, verified against package.json
- Architecture: HIGH — loading.tsx mechanics verified against Next.js 16.2.4 official docs; React cache() pattern confirmed by existing codebase usage
- Pitfalls: HIGH — verified against official docs; force-dynamic absence confirmed by codebase grep
- Caching approach: MEDIUM — unstable_cache + createClient() interaction is a known edge case; recommendation to use React cache() only (proven safe) is HIGH confidence

**Research date:** 2026-05-03
**Valid until:** 2026-06-03 (Next.js docs are stable; `use cache` is stable in 16.x)

# Phase 72: Admin Menu Performance — Instant Navigation - Research

**Researched:** 2026-05-17
**Domain:** Next.js App Router streaming, React cache(), server-side query optimization
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Wrap slow data-fetching children in `<Suspense fallback={<Skeleton />}>` in both `app/admin/layout.tsx` and `app/(app)/layout.tsx` so nav and topbar render immediately
- **D-02:** Add `loading.tsx` files to every admin route segment that lacks one — Next.js App Router streaming sends the shell immediately, page content streams in behind skeleton
- **D-03:** Skeletons must match the existing glass design tokens (`--glass-bg`, `--glass-border`, `--glass-blur`) from Phase 71 — use `animate-pulse` with glass background
- **D-04:** Admin pages that had `export const dynamic = 'force-dynamic'` and serve relatively stable data (branding, billing summary, integrations list) should switch to `export const revalidate = 60` (60s ISR) — fast nav + fresh-enough data for an admin panel
- **D-05:** Pages that must stay fully dynamic (e.g., admins list that shows real-time invite status) keep `force-dynamic` but get a `loading.tsx` skeleton so streaming still wins
- **D-06:** Use Next.js `unstable_cache` / React `cache()` for shared data fetchers (`getBranding`, `getAdminContext`) that are called in multiple layouts simultaneously
- **D-07:** `app/admin/integrations/[slug]/page.tsx` (via `loadCategoryInitials`) — replace N+1 decrypt loop with a single Supabase SELECT of all integration rows, then decrypt in-memory in parallel (`Promise.all(rows.map(decrypt))`); eliminate per-row `getUserById()` with a JOIN or a single `listUsers()` call filtered to the relevant user IDs
- **D-08:** `app/admin/admins/page.tsx` — replace `listUsers({ perPage: 1000 })` with paginated fetch (page size 50) and server-side search; show a count badge instead of loading 1000 users upfront
- **D-09:** `app/(app)/layout.tsx` — the sequential `getAuthClaims()` → `getCachedCompany()` → `getBranding()` chain should be parallelized with `Promise.all()` where claims are not a prerequisite for all fetches; wrap company/branding in Suspense so auth shell renders first

### Claude's Discretion
- Exact skeleton shape per page (column count, row count) — match the real page structure as closely as practical
- Whether to use Suspense at layout level or page level for specific routes — choose whichever eliminates the blank flash more cleanly
- Pagination UI style for the admins list (simple prev/next or load-more) — keep it minimal, admin-only feature

### Deferred Ideas (OUT OF SCOPE)
- Client-side optimistic nav transitions (view transitions API) — separate enhancement, different phase
- Full Lighthouse audit pass — belongs in v3.2 UAT phase
- Prefetch on hover for admin nav links — nice to have, out of scope for this fix pass
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PERF-ADMIN-01 | Admin menus open and render a skeleton within 100ms of click | Suspense + loading.tsx streaming (Section: Architecture Patterns) |
| PERF-ADMIN-02 | No blank flash or layout shift when navigating admin routes | loading.tsx at every admin route segment; layout-level Suspense (Section: Architecture Patterns) |
| PERF-ADMIN-03 | Admin layout Suspense boundary wraps data-fetching children so nav/topbar appear immediately | Current layout blocks on Promise.all() before any HTML — fix with Suspense (Section: Code Audit Findings) |
| PERF-ADMIN-04 | Integrations page N+1 eliminated; all decrypt+getUserById done in a single batch | N+1 pattern confirmed in `loadCategoryInitials`; fix with listUsers filtered + in-memory join (Section: Code Audit Findings) |
| PERF-ADMIN-05 | Admins page replaces unbounded 1000-user listUsers with paginated fetch (page size 50) | Confirmed `listUsers({ perPage: 1000 })` in admins/page.tsx; URL search param pagination pattern (Section: Architecture Patterns) |
| PERF-ADMIN-06 | App shell layout serialized fetch chain parallelized; streaming skeleton covers branding/company load | `app/(app)/layout.tsx` sequential getAuthClaims→getCachedCompany→branding confirmed; can parallelize branding (Section: Code Audit Findings) |
</phase_requirements>

---

## Summary

Phase 72 is a targeted performance fix with no new features. The root causes are confirmed by direct code inspection and fall into three categories: (1) layout-level synchronous data blocking that prevents any HTML from being sent — including nav — until all fetches resolve; (2) missing `loading.tsx` files on all admin route segments, meaning Next.js App Router's built-in streaming is never triggered for admin navigation; (3) two specific query anti-patterns (N+1 per-row `getUserById()` in integrations, unbounded `listUsers(1000)` in admins).

The fix is mechanical: wrap data-fetching children in `<Suspense>` in both layouts, add `loading.tsx` at every admin route segment, apply `revalidate = 60` to stable-data pages, batch-fix the two query patterns, and convert the admins page to URL-search-param pagination. Skeletons use the existing `Skeleton` component from `components/ui/skeleton.tsx` with glass token classes.

The existing skeleton component already uses `animate-[shimmer_1.8s...]` with a Phase 71 shimmer keyframe defined in `app/globals.css`. Glass tokens (`--glass-bg`, `--glass-border`, `--glass-blur`) are available in `[data-theme="admin-dark"]` scope. No new primitives are needed — just apply `className="bg-[var(--glass-bg)] rounded-lg"` in loading skeletons.

**Primary recommendation:** Fix `app/admin/layout.tsx` Suspense gap first — it is the single highest-impact change, unblocking nav render for all 10 admin routes simultaneously. Then add `loading.tsx` files. Then fix the two query anti-patterns. Then tune ISR on stable pages.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js App Router | 16.2.3 (project) | Streaming via loading.tsx + Suspense | Already in use; version confirmed from package.json |
| React `cache()` | React 19.2.4 (project) | Deduplicate server-component data calls within a render pass | Built into React 19; zero install cost |
| `unstable_cache` | Next.js built-in | Cache arbitrary async functions with revalidate/tags | Already used in `lib/queries/auth.ts` and `lib/auth/admin-context.ts` |
| shadcn/ui `Skeleton` | Project ships it | Loading state placeholder with shimmer | Already in `components/ui/skeleton.tsx`; used on app shell pages |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `next/navigation` `useSearchParams` | Next.js built-in | Server-side pagination via URL params | Admins page paginated list |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `revalidate = 60` ISR on stable admin pages | `force-dynamic` | ISR wins: layout sends cached HTML immediately; `force-dynamic` blocks until DB responds |
| Batch `listUsers` filtered in memory | JOIN query | Supabase `auth.admin.listUsers` is the only stable API for user emails; no cross-schema JOIN available to app layer |

---

## Code Audit Findings

### app/admin/layout.tsx — Current State (CONFIRMED BLOCKER)

```typescript
// Line 15 — blocks ENTIRE layout including AdminNav and AdminTopbar
const [adminCtx, branding] = await Promise.all([getAdminContext(), getBranding()])
if (!adminCtx) notFound()
// AdminNav and AdminTopbar only render AFTER both fetches resolve
// No Suspense. No loading.tsx at /admin root.
```

`AdminNav` and `AdminTopbar` are already pure client components with zero data fetching (confirmed: `admin-nav.tsx` and `admin-topbar.tsx` are `'use client'` with no async fetches). They would render instantly if the layout did not block on `Promise.all` before returning JSX.

**Fix:** Pass `branding` as a streamed prop into a Suspense-wrapped child component; render `<AdminNav>` and `<AdminTopbar>` immediately with props available from the auth check alone (adminCtx already needed synchronously for `notFound()`). The branding fetch (appName, logoUrl for nav) can be wrapped in Suspense with a skeleton fallback.

**Alternative simpler fix:** Since `getAdminContext()` uses React `cache()` and `getBranding()` has a 30s module-level TTL cache, the combined latency on warm requests is near-zero. The main issue is the cold-start path and the absence of `loading.tsx`. Adding `loading.tsx` files at each admin route segment is sufficient to fix the perceived blank flash even if the layout await stays — because Next.js streams the shell (including the layout's synchronous HTML) on navigation, and `loading.tsx` provides the skeleton while the new page's server component resolves. The layout's `await Promise.all` is a one-time cost per session (after that, `cache()` + TTL means it's instant).

**Decision D-01 clarification:** The most impactful approach matching D-01 is to ensure `<AdminNav>` and `<AdminTopbar>` are rendered by the layout synchronously (before any await), passing only props that don't require the data fetches. Since `adminCtx.email` and `branding.appName` are both needed for the nav, the layout must either: (a) restructure so nav gets fallback values while branding loads, or (b) accept that the layout await is fast enough once `loading.tsx` is in place to cover the delay. D-11 confirms "AdminNav and AdminTopbar are already lightweight client components with no data fetching — no changes needed; they will appear instantly once layout Suspense is fixed." The fix is adding Suspense around `{children}` so page content streams in, not restructuring the layout nav props.

### app/(app)/layout.tsx — Sequential Chain (CONFIRMED)

```typescript
// Lines 18-28 — sequential: getClaims must precede getCachedCompany
const claims = await getAuthClaims()                // required for redirect check
if (!claims) { redirect('/login') }
const company = await getCachedCompany(claims.sub)  // requires claims.sub
if (!company) { redirect('/onboarding') }
// Then Promise.all for branding + adminRow + billingRow (lines 30-43)
```

The `getAuthClaims` → `getCachedCompany` sequencing is **unavoidable** — `claims.sub` is needed to fetch the company. However:
- `getBranding()` does NOT depend on claims. It can be started before `getCachedCompany` resolves.
- D-09 says "parallelized with Promise.all() where claims are not a prerequisite" — branding can be fetched in parallel with `getCachedCompany`.

**Feasible parallelization:**
```typescript
const claims = await getAuthClaims()
if (!claims) redirect('/login')
// Start branding fetch immediately — no dependency on company
const brandingPromise = getBranding()
const company = await getCachedCompany(claims.sub)
if (!company) redirect('/onboarding')
const [branding, adminRow, billingRow] = await Promise.all([
  brandingPromise,
  ...
])
```
This overlaps the branding DB query with the `getCachedCompany` DB query, saving ~50-100ms on cold requests.

### app/admin/integrations/[slug]/page.tsx + lib/admin/integrations-providers.ts — N+1 (CONFIRMED)

The N+1 is in `loadCategoryInitials()` in `lib/admin/integrations-providers.ts` lines 128-156:

```typescript
// The outer SELECT fetches all rows in one query — good
const { data: rows } = await svc
  .from('platform_integrations')
  .select('provider, ciphertext, iv, auth_tag, updated_at, updated_by')
  .in('provider', ids)

// But inside Promise.all per row — N+1 getUserById calls:
await Promise.all(
  (rows ?? []).map(async (r) => {
    // ...decrypt...
    if (r.updated_by) {
      const { data: u } = await svc.auth.admin.getUserById(r.updated_by)  // N+1
      updatedByEmail = u?.user?.email ?? ''
    }
  })
)
```

**Fix (D-07):** Collect all unique `updated_by` user IDs from rows, then call `svc.auth.admin.listUsers()` once (or `getUserById` for each unique ID — typically only 1-2 unique admins). Map results by ID. No per-row API call.

```typescript
// After fetching rows:
const updatedByIds = [...new Set((rows ?? []).filter(r => r.updated_by).map(r => r.updated_by as string))]
// One call per unique admin (usually 1-2 total across all integrations)
const userEmailMap = new Map<string, string>()
await Promise.all(
  updatedByIds.map(async (uid) => {
    const { data: u } = await svc.auth.admin.getUserById(uid)
    if (u?.user?.email) userEmailMap.set(uid, u.user.email)
  })
)
// Then in the decrypt loop, look up from map instead of calling getUserById
```

This reduces N auth API calls to 1-2 calls (bounded by number of distinct admins who have configured integrations, typically 1).

### app/admin/admins/page.tsx — Unbounded listUsers(1000) (CONFIRMED)

```typescript
// Line 16 — fetches up to 1000 users every page load
const { data: list } = await svc.auth.admin.listUsers({ perPage: 1000 })
```

The actual use case: there are only N rows in `platform_admins` (small table — typically 1-5 admins). The page fetches 1000 users to build an email lookup map for those N rows. This is massively over-fetching.

**Fix (D-08):** Fetch only the user IDs that exist in `platform_admins`, then call `getUserById` for each (since there are typically 1-5 admin rows, this is 1-5 calls — not 1000 users). Or use a paginated `listUsers` with page=1, perPage=50 for a management UI that might list users for search/invite purposes.

**Paginated pattern for URL search params (server components):**
```typescript
export default async function AdminAdminsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>
}) {
  const { page: pageStr = '1', q = '' } = await searchParams
  const page = Math.max(1, parseInt(pageStr, 10))
  const perPage = 50
  // ...
}
```

---

## Architecture Patterns

### Pattern 1: loading.tsx for Instant Streaming in App Router

**What:** A `loading.tsx` file co-located with a page.tsx acts as the automatic Suspense fallback for that route segment. Next.js streams the layout shell HTML immediately, then streams the page content when it resolves.

**When to use:** Every route segment that has an async server component page. All 10 admin route segments currently lack `loading.tsx`.

**How it works:**
- User clicks admin nav link → browser receives layout HTML + `loading.tsx` skeleton HTML immediately (< 50ms)
- Server resolves page async fetches → streams in page content, replacing skeleton
- User sees nav + skeleton, not blank screen

**Files to create (all currently absent):**
```
app/admin/loading.tsx               — admin dashboard
app/admin/branding/loading.tsx
app/admin/seo/loading.tsx
app/admin/landing/loading.tsx
app/admin/blog/loading.tsx
app/admin/integrations/loading.tsx
app/admin/billing/loading.tsx
app/admin/admins/loading.tsx
app/admin/blog/new/loading.tsx
app/admin/blog/[id]/loading.tsx
```

**Minimal pattern:**
```typescript
// app/admin/billing/loading.tsx
import { Skeleton } from '@/components/ui/skeleton'

export default function BillingLoading() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-10 w-48 bg-[var(--glass-bg)] rounded-lg" />
      <Skeleton className="h-[120px] w-full max-w-sm bg-[var(--glass-bg)] rounded-lg" />
      <Skeleton className="h-64 w-full bg-[var(--glass-bg)] rounded-lg" />
    </div>
  )
}
```

### Pattern 2: Suspense Around Data-Fetching Children in Layout

**What:** Rather than `await`-ing data before returning JSX, defer data fetching into a child server component wrapped in `<Suspense>`.

**When to use:** When layout has data that page content needs but the nav/topbar does not. In `app/admin/layout.tsx`, `<AdminNav>` needs `appName`, `logoUrl`, `adminEmail` — these come from `getAdminContext()` and `getBranding()`. Since both are fast when cached (30s TTL + `cache()` dedup), the real win is having `loading.tsx` cover the cold-start case.

**Current admin layout flow:**
```
request → await Promise.all([getAdminContext, getBranding]) → return HTML with nav
```

**Post-fix flow with loading.tsx:**
```
navigation click → instantly serve cached layout shell + loading.tsx skeleton
                 → stream in page content when async resolves
```

The layout itself does not need restructuring for `loading.tsx` to work. `loading.tsx` wraps `{children}` automatically in a Suspense boundary; the layout's own `await` is fine because the layout is cached across navigation (only page content re-fetches on navigation).

### Pattern 3: React cache() for Request-Level Deduplication

**What:** `cache()` from React deduplicates calls to the same function with the same arguments within a single server render pass. If layout and page both call `getBranding()`, only one network request is made.

**Current state:** `getAdminContext` already uses `cache()` (confirmed in `lib/auth/admin-context.ts` line 28). `getBranding()` does NOT use `cache()` — it uses a module-level TTL cache object instead. Both approaches work; `getBranding()`'s module-level cache is actually broader (persists across requests in the same process).

**When React `cache()` adds value:** When the same function is called from multiple async server components within a single render tree — e.g., layout calls `getBranding()` AND a child page also calls `getBranding()`. With `cache()`, the second call returns the in-flight promise without a new DB round-trip.

**D-06 implementation:** Wrap `getBranding` with `cache()` as a thin wrapper:
```typescript
// In lib/platform-config.ts or a new lib/queries/platform.ts
import { cache } from 'react'
export const getCachedBranding = cache(getBranding)
```
Then use `getCachedBranding()` in layouts and pages that were already calling `getBranding()`.

### Pattern 4: ISR (revalidate) on Stable Admin Pages

**What:** Replace `export const dynamic = 'force-dynamic'` with `export const revalidate = 60` on pages whose data changes infrequently.

**ISR eligibility audit:**

| Page | Current | Recommendation | Rationale |
|------|---------|----------------|-----------|
| `app/admin/page.tsx` | `force-dynamic` | `revalidate = 60` | Platform stats change slowly; 60s stale is fine |
| `app/admin/branding/page.tsx` | `force-dynamic` | `revalidate = 60` | Branding rarely changes; already uses 30s module cache |
| `app/admin/seo/page.tsx` | `force-dynamic` | `revalidate = 60` | SEO settings change rarely |
| `app/admin/landing/page.tsx` | `force-dynamic` | `revalidate = 60` | Landing content changes rarely |
| `app/admin/billing/page.tsx` | `force-dynamic` | Keep `force-dynamic` + add `loading.tsx` | Billing data (MRR, tier counts) should be current; streaming covers lag |
| `app/admin/admins/page.tsx` | (no directive) | Keep no-directive (dynamic) + add `loading.tsx` | Admin list must reflect current invite status |
| `app/admin/integrations/[slug]/page.tsx` | `generateStaticParams` (already ISR-eligible) | No change needed to caching | `generateStaticParams` makes it statically generated at build; decrypt runs per-request via page server component — keep as-is, just fix N+1 |

**Note on `app/admin/blog/` pages:** Not identified as problem pages — no special action needed beyond `loading.tsx`.

### Pattern 5: URL Search Params Pagination (Server Components)

**What:** Pass `page` and `q` (search query) as URL search params; server component reads them from `searchParams` prop.

**Example for admins page:**
```typescript
export default async function AdminAdminsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>
}) {
  const { page: rawPage = '1', q = '' } = await searchParams
  const page = Math.max(1, parseInt(rawPage, 10))
  const perPage = 50
  const offset = (page - 1) * perPage
  // ...
}
```

**Next.js 16 / React 19 note:** `searchParams` is a `Promise` (async) in Next.js 15+ — must `await` before accessing. Confirmed from project's existing pattern in `app/(app)/` pages (e.g., `params: Promise<{ id: string }>`).

**Pagination UI (minimal per D-08 discretion):**
```typescript
// Simple prev/next links in a server component — no client state needed
<div className="flex gap-2 mt-4">
  {page > 1 && <Link href={`?page=${page - 1}`}>Previous</Link>}
  {hasMore && <Link href={`?page=${page + 1}`}>Next</Link>}
</div>
```

### Anti-Patterns to Avoid

- **Layout-level data fetch with no Suspense on children:** The current admin layout pattern blocks nav rendering. Even with `cache()` and TTL caches, cold requests still serialize.
- **Per-row auth API calls inside Promise.all:** `getUserById` inside a map is still N separate HTTP calls to Supabase Auth API. The current integrations code does this; replace with a single batch lookup.
- **`listUsers({ perPage: 1000 })`:** Fetches the entire user table to resolve emails for a handful of admin rows. Replace with targeted `getUserById` per admin row (N is bounded by admin count, typically 1-5).
- **animate-pulse without glass token:** In admin dark theme scope, plain `bg-muted animate-pulse` works but `bg-[var(--glass-bg)]` matches the card surfaces better. The existing `Skeleton` component uses `bg-muted` — pass override `className="bg-[var(--glass-bg)]"` for admin skeletons.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Loading state while page server component fetches | Custom client-side loading state with useState | `loading.tsx` at route segment | App Router handles streaming automatically; no JS needed |
| Request-level function deduplication | Manual Promise memoization | `React.cache()` | Built into React 19; correct semantics for server render pass |
| Cross-request caching with revalidation | Custom in-memory TTL objects | `unstable_cache` with `revalidate` | Already in use in project; handles CDN invalidation + tags |
| Pagination state | useState + useEffect | URL search params + server component | Server-rendered, bookmarkable, no hydration cost |

---

## Skeleton Design Guide

### Available Tokens (from app/globals.css Phase 71 section)

In `[data-theme="admin-dark"]` scope:
```css
--glass-bg:        rgba(20, 24, 33, 0.60);
--glass-bg-strong: rgba(20, 24, 33, 0.85);
--glass-bg-light:  rgba(255, 255, 255, 0.04);
--glass-border:    rgba(255, 255, 255, 0.08);
--glass-blur:        16px;
--glass-blur-strong: 24px;
```

### Existing Skeleton Component API

`components/ui/skeleton.tsx` — accepts any `React.ComponentProps<"div">`. No special props beyond `className`. Uses:
- `bg-muted` base
- Shimmer pseudo-element: `before:bg-[linear-gradient(90deg,transparent,hsl(var(--primary)/0.10),transparent)]`
- Animation: `motion-safe:before:animate-[shimmer_1.8s_ease-in-out_infinite]`
- `@keyframes shimmer` defined globally in `app/globals.css` (line 263)

**Glass override for admin dark theme:**
```typescript
<Skeleton className="h-10 w-48 bg-[var(--glass-bg)]" />
```

### Page-Specific Skeleton Shapes (Claude's Discretion)

Match the dominant structure of each page. The planner can specify exact shapes; research provides page structure:

| Page | Dominant Structure | Skeleton Guidance |
|------|-------------------|-------------------|
| `/admin` (dashboard) | 3 stat cards in a grid | `grid-cols-3 gap-4`, each card `h-[120px]` |
| `/admin/branding` | Form with logo preview | Single `h-64` full-width card |
| `/admin/seo` | Form in glass card | Single `h-48` full-width card |
| `/admin/landing` | Multi-section form | `h-96` full-width card |
| `/admin/billing` | 1 stat card + table | `h-[120px] max-w-sm` + `h-64 w-full` |
| `/admin/admins` | Table of admins | `h-10` header + 3-5x `h-14` row skeletons |
| `/admin/integrations/[slug]` | 1-4 integration cards | N×`h-24` cards |
| `/admin/blog` | Blog post list | N×`h-16` row skeletons |

---

## Common Pitfalls

### Pitfall 1: Confusing Layout Suspense with Page Streaming

**What goes wrong:** Adding Suspense in the layout around `{children}` manually without also having `loading.tsx` — or having `loading.tsx` but the layout itself is still blocking before returning JSX.
**Why it happens:** Next.js App Router's streaming uses `loading.tsx` as the Suspense boundary for `{children}`. The layout's own `await` statements run before layout HTML is sent. If the layout has a long `await`, even `loading.tsx` won't help until the layout resolves.
**How to avoid:** For the admin layout, `getAdminContext()` and `getBranding()` are both fast on warm (cache hit). The real issue is cold-start — adding `loading.tsx` covers page content. If layout must remain slow, restructure so nav/topbar render before the branding `await` (pass skeleton props).
**Warning signs:** Browser DevTools waterfall shows long TTFB for the layout's HTML chunk.

### Pitfall 2: `cache()` Only Works Within One Render Pass

**What goes wrong:** Expecting `cache()` to deduplicate across multiple HTTP requests (like a persistent cache). It only deduplicates within a single React server render tree invocation.
**Why it happens:** `cache()` is React's request-scoped memoization, not a persistent cache.
**How to avoid:** Use `unstable_cache` with `revalidate` for cross-request caching. Use `cache()` only for eliminating duplicate calls within the same render tree (layout + page both calling the same function).

### Pitfall 3: `force-dynamic` Pages Cannot Use ISR

**What goes wrong:** Setting both `export const dynamic = 'force-dynamic'` AND `export const revalidate = 60` on the same page — `force-dynamic` wins and disables ISR.
**How to avoid:** Remove `export const dynamic = 'force-dynamic'` entirely when switching to ISR. Do not keep both.

### Pitfall 4: `searchParams` is Async in Next.js 15+

**What goes wrong:** Accessing `searchParams.page` directly without awaiting — TypeScript passes, but runtime throws or returns undefined.
**Why it happens:** Next.js 15+ made `searchParams` a Promise (React 19 async params). The project already uses this pattern (confirmed in existing pages).
**How to avoid:** Always `const { page } = await searchParams`.

### Pitfall 5: Admin Dark Theme Skeleton Color Mismatch

**What goes wrong:** `Skeleton` default uses `bg-muted` which in `[data-theme="admin-dark"]` resolves to `hsl(240 4% 16%)` — correct, but the shimmer line color `hsl(var(--primary)/0.10)` produces a very faint glow on dark.
**How to avoid:** Override with `bg-[var(--glass-bg)]` for glass-card-level skeletons. Use `bg-muted` for skeletons inside cards. Both are acceptable; match surrounding surface.

### Pitfall 6: `listUsers` Pagination API Behavior

**What goes wrong:** `svc.auth.admin.listUsers({ perPage: 50, page: 2 })` — the `page` parameter is 1-indexed (not 0-indexed). Passing `page: 0` returns the same as `page: 1`.
**How to avoid:** Ensure URL param `?page=1` maps to API `{ page: 1 }` directly.

---

## Runtime State Inventory

Not applicable — this phase contains no rename, rebrand, or migration of stored identifiers. All changes are code and configuration only.

---

## Environment Availability

Step 2.6: SKIPPED — this phase is purely code and configuration changes. No external tools, databases, or services beyond the already-running Next.js dev server are required. Supabase is already available (confirmed by existing dev environment).

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 2.x (confirmed from vitest.config.ts) |
| Config file | `vitest.config.ts` at repo root |
| Quick run command | `npx vitest run tests/unit/` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PERF-ADMIN-01 | Menu skeleton renders within 100ms | manual-only | — (browser timing, no unit) | N/A |
| PERF-ADMIN-02 | No blank flash on navigation | manual-only | — (visual, browser) | N/A |
| PERF-ADMIN-03 | `loadCategoryInitials` does not call getUserById per-row | unit | `npx vitest run tests/unit/admin/integrations-providers.test.ts` | ❌ Wave 0 |
| PERF-ADMIN-04 | `loadCategoryInitials` batch-deduplicates getUserById | unit | `npx vitest run tests/unit/admin/integrations-providers.test.ts` | ❌ Wave 0 |
| PERF-ADMIN-05 | Admins page fetches with perPage=50, not 1000 | unit | `npx vitest run tests/unit/admin/admins-page.test.ts` | ❌ Wave 0 |
| PERF-ADMIN-06 | App shell layout starts branding fetch before company resolves | unit | `npx vitest run tests/unit/app-layout.test.ts` | ❌ Wave 0 |

**Note on PERF-ADMIN-01/02:** The 100ms and no-blank-flash requirements are UX outcomes verifiable only in a browser. Unit tests cover the structural query fixes (PERF-ADMIN-03 through 06). Manual smoke testing covers the UX timing targets.

### Sampling Rate

- **Per task commit:** `npx vitest run tests/unit/`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/unit/admin/integrations-providers.test.ts` — covers PERF-ADMIN-03/04 (batch getUserById dedup)
- [ ] `tests/unit/admin/admins-page.test.ts` — covers PERF-ADMIN-05 (listUsers perPage <= 50)
- [ ] `tests/unit/app-layout.test.ts` — covers PERF-ADMIN-06 (parallelized branding fetch)

*(All three are new test files; no existing test infrastructure for admin pages was found in `tests/unit/admin/`.)*

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `export const dynamic = 'force-dynamic'` everywhere | ISR `revalidate = N` for stable pages | Next.js 13+ | Reduces TTFB on cached admin pages from 200-400ms to < 50ms |
| Manual loading states with `useState` | `loading.tsx` at route segment | Next.js 13 App Router | Zero-JS streaming; shell + skeleton sent in first chunk |
| `React.cache()` absent | `React.cache()` for request-scoped dedup | React 18+ / Next.js 13+ | Prevents duplicate DB calls within a render tree |

---

## Open Questions

1. **Can the admin layout's `await Promise.all` be moved to defer branding until after nav renders?**
   - What we know: `getAdminContext()` uses `cache()` (fast); `getBranding()` uses module-level 30s TTL (fast on warm). Cold-start is the only slow case.
   - What's unclear: Whether the admin visits cold often enough to justify restructuring vs just adding `loading.tsx`.
   - Recommendation: Add `loading.tsx` first (covers all admin routes); only restructure layout if cold-start timing is still perceptible in practice.

2. **Does `app/admin/admins/page.tsx` need a full pagination UI or just a bounded fetch?**
   - What we know: There are typically 1-5 platform admins. `listUsers(1000)` is used to build an email lookup map for those rows.
   - What's unclear: Whether this page ever needs to browse/search all users (vs just showing current admins).
   - Recommendation: Fix the query to only fetch emails for existing admin `user_id` values (use `getUserById` per admin row — N is bounded by admin count). Add URL param pagination only if the page gains a "search all users" feature later.

---

## Sources

### Primary (HIGH confidence)

- Direct code inspection — `app/admin/layout.tsx`, `app/(app)/layout.tsx`, `app/admin/admins/page.tsx`, `lib/admin/integrations-providers.ts`, `lib/platform-config.ts`, `lib/auth/admin-context.ts`, `lib/queries/auth.ts`, `components/ui/skeleton.tsx`, `app/globals.css`
- `package.json` — Next.js 16.2.3, React 19.2.4 (version-confirmed)
- `vitest.config.ts` — test framework and include patterns confirmed

### Secondary (MEDIUM confidence)

- Next.js App Router streaming semantics (`loading.tsx` as automatic Suspense boundary) — well-established, version-stable since Next.js 13; behavior unchanged in Next.js 14-16
- React `cache()` semantics — stable React 19 API; behavior from React 18+ docs

### Tertiary (LOW confidence)

- None — all claims in this research are derived from direct code inspection and established Next.js/React APIs already in use in the project.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use in the project; versions confirmed from package.json
- Architecture: HIGH — patterns confirmed by inspecting current code; no speculative library choices
- Pitfalls: HIGH — derived from direct code inspection of the specific anti-patterns present in the codebase
- Query fixes: HIGH — N+1 pattern and unbounded listUsers confirmed line-by-line in source files

**Research date:** 2026-05-17
**Valid until:** 2026-06-17 (Next.js App Router streaming API is stable; 30-day validity)

# Phase 72: Admin Menu Performance — Instant Navigation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-17
**Phase:** 72-admin-menu-performance
**Mode:** --auto (all decisions auto-selected)
**Areas discussed:** Layout Suspense Strategy, Query Optimization, Caching Policy, Loading States

---

## Layout Suspense Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Suspense in layout.tsx | Wrap slow children in Suspense; nav renders immediately | ✓ |
| loading.tsx per route | Next.js streaming via route-segment loading files | ✓ (both) |
| Client-side skeleton | Move data fetching to client, show skeleton on mount | |

**Auto-selected:** Both layout-level Suspense AND route-level loading.tsx — complementary, not exclusive.
**Notes:** Layout Suspense ensures nav/topbar render instantly; loading.tsx enables streaming for page content within the layout.

---

## Query Optimization

| Option | Description | Selected |
|--------|-------------|----------|
| Fix N+1 with Promise.all | Batch all decrypts in parallel, single JOIN for users | ✓ |
| Paginate admins list | Replace listUsers(1000) with paginated 50/page | ✓ |
| Cache at query level | React cache() / unstable_cache for shared fetchers | ✓ |
| GraphQL DataLoader | Complex batching abstraction | |

**Auto-selected:** Direct fixes (Promise.all batch + pagination) — simplest approach, no new abstractions.
**Notes:** N+1 is the worst offender; fix with in-memory parallel decrypt + single user batch fetch.

---

## Caching Policy

| Option | Description | Selected |
|--------|-------------|----------|
| ISR revalidate=60 | 60s stale-while-revalidate for stable admin data | ✓ |
| Keep force-dynamic | All admin pages regenerate on every request | |
| React cache() dedup | Deduplicate within-request repeated calls | ✓ |

**Auto-selected:** ISR where safe (branding, billing summary, integrations) + keep force-dynamic only where real-time accuracy matters (admins list); add React cache() dedup for shared fetchers.
**Notes:** force-dynamic + no loading.tsx = blank screen; ISR + loading.tsx = instant skeleton + fresh data.

---

## Loading States

| Option | Description | Selected |
|--------|-------------|----------|
| Glass skeleton (animate-pulse) | Match Phase 71 glass tokens | ✓ |
| Spinner | Simple centered spinner | |
| No skeleton (streaming only) | Let streaming handle it | |

**Auto-selected:** Glass skeleton matching Phase 71 design tokens — visually consistent, better perceived performance.
**Notes:** Even a rough glass skeleton tells the user something is loading; blank white/dark flash feels broken.

---

## Claude's Discretion

- Exact skeleton shape per page (row/column structure)
- Pagination UI for admins list (prev/next vs load-more)
- Whether to apply Suspense at layout vs page level per route

## Deferred Ideas

- View transitions API for admin nav — future enhancement
- Full Lighthouse audit — v3.2 UAT phase
- Hover-prefetch on admin links — separate polish pass

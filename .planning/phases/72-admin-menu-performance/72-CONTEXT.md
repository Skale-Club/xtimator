# Phase 72: Admin Menu Performance — Instant Navigation - Context

**Gathered:** 2026-05-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Eliminate perceived lag when opening admin menus in both the super-admin panel (`/admin/*`) and the client-facing app shell navigation. This phase delivers performance fixes only — no new features, no visual redesign beyond matching existing glass tokens for skeletons.

</domain>

<decisions>
## Implementation Decisions

### Suspense Boundaries & Skeletons
- **D-01:** Wrap slow data-fetching children in `<Suspense fallback={<Skeleton />}>` in both `app/admin/layout.tsx` and `app/(app)/layout.tsx` so nav and topbar render immediately
- **D-02:** Add `loading.tsx` files to every admin route segment that lacks one — Next.js App Router streaming sends the shell immediately, page content streams in behind skeleton
- **D-03:** Skeletons must match the existing glass design tokens (`--glass-bg`, `--glass-border`, `--glass-blur`) from Phase 71 — use `animate-pulse` with glass background

### Caching Strategy
- **D-04:** Admin pages that had `export const dynamic = 'force-dynamic'` and serve relatively stable data (branding, billing summary, integrations list) should switch to `export const revalidate = 60` (60s ISR) — fast nav + fresh-enough data for an admin panel
- **D-05:** Pages that must stay fully dynamic (e.g., admins list that shows real-time invite status) keep `force-dynamic` but get a `loading.tsx` skeleton so streaming still wins
- **D-06:** Use Next.js `unstable_cache` / React `cache()` for shared data fetchers (`getBranding`, `getAdminContext`) that are called in multiple layouts simultaneously

### Query Fixes
- **D-07:** `app/admin/integrations/page.tsx` — replace N+1 decrypt loop with a single Supabase SELECT of all integration rows, then decrypt in-memory in parallel (`Promise.all(rows.map(decrypt))`); eliminate per-row `getUserById()` with a JOIN or a single `listUsers()` call filtered to the relevant user IDs
- **D-08:** `app/admin/admins/page.tsx` — replace `listUsers({ perPage: 1000 })` with paginated fetch (page size 50) and server-side search; show a count badge instead of loading 1000 users upfront
- **D-09:** `app/(app)/layout.tsx` — the sequential `getAuthClaims()` → `getCachedCompany()` → `getBranding()` chain should be parallelized with `Promise.all()` where claims are not a prerequisite for all fetches; wrap company/branding in Suspense so auth shell renders first

### Loading States
- **D-10:** Every admin page gets a `loading.tsx` at its route segment level — even 1-line files that return a glass skeleton div are enough for Next.js streaming to kick in
- **D-11:** AdminNav and AdminTopbar are already lightweight client components with no data fetching — no changes needed; they will appear instantly once layout Suspense is fixed

### Claude's Discretion
- Exact skeleton shape per page (column count, row count) — match the real page structure as closely as practical
- Whether to use Suspense at layout level or page level for specific routes — choose whichever eliminates the blank flash more cleanly
- Pagination UI style for the admins list (simple prev/next or load-more) — keep it minimal, admin-only feature

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

No external specs — requirements fully captured in decisions above.

### Key files to read before planning
- `app/admin/layout.tsx` — layout with blocking Promise.all(), no Suspense
- `app/(app)/layout.tsx` — app shell layout with 3 sequential fetches
- `app/admin/integrations/page.tsx` — N+1 decrypt + getUserById pattern
- `app/admin/admins/page.tsx` — listUsers({ perPage: 1000 }) unbounded fetch
- `app/admin/billing/page.tsx` — force-dynamic with 3 parallel queries
- `components/admin/admin-nav.tsx` — already lightweight, reference only
- `components/admin/admin-topbar.tsx` — already lightweight, reference only

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `getBranding()` in `lib/branding.ts` (or similar) — already cached 30s; can be wrapped in React cache() to deduplicate across layout calls
- `getAdminContext()` — already cached 60s; same dedup opportunity
- Skeleton components from shadcn/ui (`components/ui/skeleton.tsx`) — use for all loading states
- Glass CSS tokens from Phase 71 (`--glass-bg`, `--glass-border`, `--glass-blur`) — skeletons should use these

### Established Patterns
- Next.js App Router streaming: `loading.tsx` at route segment level triggers automatic Suspense + streaming
- React `cache()` deduplicates server-component data calls within a single render pass
- `unstable_cache` wraps arbitrary async functions with Next.js data cache (revalidate support)
- Existing `force-dynamic` pattern: 8 admin pages use it; evaluate each for ISR eligibility

### Integration Points
- `app/admin/layout.tsx` → wraps all `/admin/*` routes; fixing Suspense here unblocks all admin nav
- `app/(app)/layout.tsx` → wraps all authenticated app routes; fixing here unblocks app shell nav
- Admin pages each need their own `loading.tsx` sibling for per-route streaming
- Integrations page decryption: likely calls `lib/crypto.ts` or similar — keep decrypt logic, fix the query pattern

</code_context>

<specifics>
## Specific Ideas

- The slowness is perceived at menu open time because the *layout* blocks on data before rendering *any* HTML including the nav — fixing layout Suspense is the single highest-impact change
- Skeleton design: use `animate-pulse bg-[var(--glass-bg)]` with `rounded-lg` to match the glass cards from Phase 71
- For the admins page pagination: simple prev/next with URL search params (`?page=1`) keeps it server-rendered and cacheable

</specifics>

<deferred>
## Deferred Ideas

- Client-side optimistic nav transitions (view transitions API) — separate enhancement, different phase
- Full Lighthouse audit pass — belongs in v3.2 UAT phase
- Prefetch on hover for admin nav links — nice to have, out of scope for this fix pass

</deferred>

---

*Phase: 72-admin-menu-performance*
*Context gathered: 2026-05-17*

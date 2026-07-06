# Phase 150: Companies Admin Screen Overhaul - Research

**Researched:** 2026-07-05
**Domain:** Next.js 14 App Router server-side search/filter/pagination on an internal admin surface (Supabase PostgREST queries) — no new library, no new UI pattern; verbatim reuse of an existing in-codebase reference implementation.
**Confidence:** HIGH

## Summary

This phase has almost no genuine unknowns. `150-CONTEXT.md` and `150-UI-SPEC.md` (already approved) both lock the exact implementation shape by pointing at a working, shipped precedent — Phase 93's `app/admin/events/page.tsx` + `events-controls.tsx` + `lib/admin/events-helpers.ts`. Research confirms that precedent is sound, confirms the `companies`/`company_members` schema supports every filter/search requirement without a migration, and confirms no existing test coverage exists yet for `app/admin/companies/page.tsx` (a Wave 0 gap the planner must fill).

The one substantive judgment call left to research — email search resolution — is already correctly decided in CONTEXT.md: `companies` has its own `email` column, but it is a business-contact/branding field (used in `lib/actions/settings.ts`, WhatsApp intent router, etc.), NOT the account-holder's login email. The correct "search by associated email" implementation is the Phase-93 pattern: resolve email → `auth.admin.listUsers()` → user id → `company_members` → company ids → filter. Do not use `companies.email` for this search path; flagging this explicitly as a pitfall since the column name overlap is a real trap for an implementer skimming the schema.

**Primary recommendation:** Copy the Phase 93 Event Log page/controls/pagination structure into `app/admin/companies/page.tsx` + new `app/admin/companies/companies-controls.tsx`, replacing only the "All Companies" table's data source with a filtered/paginated `companies` query. Leave the Demo Accounts section, `HandoffButton`, and "Configure →" link completely untouched (different query, rendered above the new controls, never joins the paginated path).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Reuse the Phase-93 Event Log pattern verbatim (do not invent a new pagination approach)**

`app/admin/events/page.tsx` + `app/admin/events/events-controls.tsx` (Phase 93, ADMINLOG-01..05) is an EXISTING admin surface solving the exact same shape of problem (server-side search + multi-filter + pagination on an admin list). Mirror it:
- Server component reads `searchParams` (Next 14 Promise), builds a chainable Supabase query, applies `.eq()` per active filter, `.or()` for free-text search, then `.order().range(from, from+PAGE_SIZE-1)` with `{count:'exact'}`.
- A separate `'use client'` `CompaniesControls` component (mirroring `EventsControls`) owns the search input (Enter/blur commits) + `Select` filter dropdowns, pushing to `router.replace()` via `useSearchParams`, resetting `page` on any filter change.
- Prev/Next links built via a `pageUrl(p)` helper preserving all active params — no client-side pagination library.
- `PAGE_SIZE = 25` (smaller than the 50 used for events — companies rows are denser/wider; 25 keeps the table scannable). Claude's discretion if research finds a stronger reason to match 50.

**Email search resolution**

Companies have no `email` column [usable for account-holder search]. Mirror the Phase-93 `resolvedUserId` pattern: when the search term contains `@`, resolve it via `svc.auth.admin.listUsers()` → matching user id → look up that user's company ids via `company_members` → filter the companies query to those ids. When the term does NOT contain `@`, search `name` via `ilike`. Do not attempt a combined name-or-email single `.or()` — the two paths need different resolution steps first (mirrors why Phase 93 branches on `resolvedUserId` instead of folding email into `buildSearchOr`).

**Filters (ADMINCO-02) combine with AND**

- **Tier**: `Select` dropdown, options sourced from existing tier values (free/pro/business) — reuse whatever tier list constant the codebase already has (check `lib/entitlements.ts` / `BillingTier` in `lib/billing/billing-config.ts`), do not hardcode a duplicate list.
- **AI override**: a 3-state `Select` — "Any" / "Has override" / "Platform default" — maps to `.not('ai_model_override', 'is', null)` vs `.is('ai_model_override', null)`.
- **Demo vs real**: a 3-state `Select` — "Any" / "Demo" / "Real" — maps to `.not('demo_estimate_quota', 'is', null)` vs `.is('demo_estimate_quota', null)` (mirrors the existing `demoCompanies` filter already computed client-side in the current page — now pushed server-side into the query).

**Demo Accounts section stays OUTSIDE pagination**

The existing "Demo Accounts" grouping (Phase 149) stays as its own always-visible, unpaginated mini-table above the main list — it's a small, bounded set (street-sales demo accounts) and existing tests/UX depend on it appearing separately. Only the "All Companies" table below it gets search/filter/pagination. Do not fold demo accounts into the same paginated query — that would change existing behavior (ADMINCO-04 requires it keeps working unchanged).

### Claude's Discretion

- Exact column widths / responsive breakpoints for the table — follow existing admin table Tailwind conventions already in the file (`overflow-x-auto`, `text-sm`, `divide-y divide-border`).
- Whether to add a "clear filters" affordance (Phase 93 gates it behind `EmptyState actionLabel="Clear filters"` only when zero results) — reuse that exact pattern, do not add a separate always-visible clear button.
- i18n: wrap all new copy in `<T>`/`t()` per the rest of the admin panel (English source strings — admin panel is English-only, no locale toggle there).

**Note:** `150-UI-SPEC.md` (already approved) has since resolved all of the above discretion items concretely:
1. Refresh button: **included** in `CompaniesControls` (same `ml-auto`, `RefreshCw`, `h-8` as Event Log).
2. Zero-companies-at-all empty state: upgraded to full `EmptyState` component, icon `Building2`.
3. Column widths: kept identical to current page — no changes.
4. Clear-filters: gated behind `EmptyState actionLabel="Clear filters"` on zero-filtered-results only.
5. Sortable columns: **not added** — `.order('name', { ascending: true })` stays fixed.
6. `PAGE_SIZE = 25` is now stated as locked (not merely discretionary) in the UI-SPEC's pagination block section.
7. Filter `Select` widths: Tier `w-[120px]`, AI override `w-[160px]`, Demo/Real `w-[120px]`.

Treat the UI-SPEC's resolutions as authoritative — they supersede the "Claude's Discretion" framing in CONTEXT.md since that discretion has already been exercised and approved.

### Deferred Ideas (OUT OF SCOPE)

- Bulk actions (bulk tier change, bulk export) — captured as ADMINCOX-01 in REQUIREMENTS.md v2, out of scope here.
- Sortable columns beyond the current name-ascending order — not in the locked requirements (ADMINCO-01..04); if trivial to add via the same `.order()` call, Claude's discretion to include, but not required for phase completion. **Resolved by UI-SPEC: not added.**
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ADMINCO-01 | Super admin can search the Companies admin list by name or associated email and see live-filtered results. | Confirmed `companies.name` supports `ilike`; confirmed `companies` has no usable email-for-account-lookup column — search-by-email MUST resolve via `svc.auth.admin.listUsers()` → `company_members.company_id`, exactly as Phase 93 does for `pipeline_attempts.user_id`. See Code Examples and Common Pitfalls (companies.email trap). |
| ADMINCO-02 | Super admin can filter the Companies list by tier, whether an AI model override is set, and demo vs. real account. | Confirmed `companies.tier` (`BillingTier = 'free' \| 'pro' \| 'business'`, defined in `lib/billing/billing-config.ts` and mirrored in `lib/entitlements.ts` as `TierName`), `companies.ai_model_override` (nullable text), `companies.demo_estimate_quota` (nullable int) all already exist and are already selected in the current page — no migration needed. `.eq()`/`.is()`/`.not(...'is', null)` filter chaining confirmed working in Phase 93's `mainQ` builder. |
| ADMINCO-03 | The Companies list is server-side paginated (does not load every tenant row at once), with page navigation and a visible total count. | Confirmed `.select('*', { count: 'exact' })` + `.range(from, from+PAGE_SIZE-1)` is the house pattern (Phase 93, also `lib/queries/admin-whatsapp.ts`). `PAGE_SIZE = 25` locked in UI-SPEC (all other admin lists use 50 — see Common Pitfalls / State of the Art on this deviation). |
| ADMINCO-04 | The existing "Demo Accounts" grouping, `HandoffButton`, and "Configure →" per-row actions continue to work unchanged within the new paginated/filterable list. | Confirmed current `app/admin/companies/page.tsx` computes `demoCompanies` via a separate, un-paginated in-memory filter (`companies.filter(c => c.demo_estimate_quota !== null)`) sourced from ALL companies fetched unfiltered. This must become its OWN separate query (not derived from the new paginated query, which will often exclude demo rows outside the current page/filter). `HandoffButton` and `Configure →` links take only `companyId`/`companyName` as props — zero coupling to the pagination/filter mechanism, safe to reuse unchanged inside the new paginated row-map. No regression risk found in the component API surface. |
</phase_requirements>

## Standard Stack

No new libraries. This phase is 100% reuse of already-installed dependencies.

### Core (already installed, verified via existing usage)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | (existing, via `lib/supabase/service.ts`) | `.select()`/`.eq()`/`.is()`/`.not()`/`.ilike()`/`.or()`/`.range()` query building with `{count:'exact'}` | House pattern for every admin list (Phase 93 events, `lib/queries/admin-whatsapp.ts`) |
| Next.js 14 App Router | 14+ (per CLAUDE.md) | Server component reading `searchParams` as a `Promise`, `export const dynamic = 'force-dynamic'` | Already the pattern on every admin page; no alternative considered |
| shadcn/ui `Select`, `Input`, `Button`, `Card`, `Badge` | (existing, `components/ui/*`) | Filter dropdowns, search box, table chrome | Already installed and used identically in `events-controls.tsx` — UI-SPEC confirms zero new shadcn registry activity needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `lucide-react` | (existing) | `Search`, `RefreshCw`, `Building2` icons | `Building2` is new to this file (for the zero-companies `EmptyState`) — confirm it exists in the installed lucide-react version (it is a standard icon name, present in all recent lucide-react releases) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Server-side `.range()` pagination | Client-side pagination library (e.g. react-table, tanstack-table) | Rejected — locked decision (CONTEXT.md + UI-SPEC) and inconsistent with every other admin list in the codebase (`events`, `admin-whatsapp`). Would also defeat ADMINCO-03's explicit "does not load every tenant row at once" requirement. |
| `buildSearchOr()` reuse | New Companies-specific `.or()` helper | Confirmed NOT needed — `buildSearchOr` is `pipeline_attempts`-column-specific (hardcodes `error_message`/`error_code`/UUID columns). Companies search is simpler: a single `ilike('name', ...)` call, no helper file required. |

**Installation:** None required — no new packages.

**Version verification:** N/A — no new package versions to verify. Confirmed via `node --version` (v24.13.0) that the runtime matches project expectations; no library version drift relevant to this phase.

## Architecture Patterns

### Recommended Project Structure
```
app/admin/companies/
├── page.tsx                 # MODIFY: add searchParams prop, paginated query, render <CompaniesControls/>
├── companies-controls.tsx   # CREATE: 'use client', mirrors events-controls.tsx
├── handoff-button.tsx       # UNCHANGED
├── actions.ts                # UNCHANGED (setCompanyModelOverride, setDemoEstimateQuota, setByokConfig)
└── [id]/page.tsx              # OUT OF SCOPE this phase (explicitly excluded by CONTEXT.md domain boundary)
```

### Pattern 1: Server component searchParams + chainable query + count:'exact'
**What:** The page component is `async`, receives `searchParams: Promise<Record<string,string|undefined>>` (Next 14 requirement — searchParams is a Promise in async Server Components), awaits it, derives `page`/filter values, then builds a Supabase query by conditionally chaining `.eq()`/`.is()`/`.not()` calls before executing with `.range()`.
**When to use:** Every filtered/paginated admin list in this codebase (Event Log, WhatsApp admin queries).
**Example:**
```typescript
// Source: app/admin/events/page.tsx (verified in-repo, Phase 93)
export default async function EventLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requireAdmin()   // load-bearing authz — MUST run before any data read
  const svc = requireServiceClient()
  const sp = await searchParams   // Next 14: searchParams is a Promise

  const page = Math.max(1, parseInt(sp.page ?? '1', 10))
  const from = (page - 1) * PAGE_SIZE
  let mainQ: any = svc.from('pipeline_attempts').select('*', { count: 'exact' })
  if (statusFilter) mainQ = mainQ.eq('terminal_status', statusFilter)
  // ... more .eq() per active filter ...
  const { data, count } = await mainQ
    .order('last_at', { ascending: false })
    .range(from, from + PAGE_SIZE - 1)
}
```
Applied to companies, the equivalent chain is:
```typescript
// Pattern derived from above, adapted to companies columns per 150-CONTEXT.md
const from = (page - 1) * PAGE_SIZE // PAGE_SIZE = 25
let mainQ: any = svc
  .from('companies')
  .select('id, name, tier, ai_model_override, demo_estimate_quota', { count: 'exact' })

if (tierFilter) mainQ = mainQ.eq('tier', tierFilter)
if (overrideFilter === 'has')      mainQ = mainQ.not('ai_model_override', 'is', null)
if (overrideFilter === 'default')  mainQ = mainQ.is('ai_model_override', null)
if (demoFilter === 'demo')         mainQ = mainQ.not('demo_estimate_quota', 'is', null)
if (demoFilter === 'real')         mainQ = mainQ.is('demo_estimate_quota', null)

if (search) {
  if (resolvedCompanyIds) {
    mainQ = mainQ.in('id', resolvedCompanyIds)  // email path
  } else {
    mainQ = mainQ.ilike('name', `%${esc}%`)      // name path
  }
}

const { data, count } = await mainQ
  .order('name', { ascending: true })
  .range(from, from + PAGE_SIZE - 1)
```
Note: when the email search resolves to a user with company memberships, the result may be a SET of company ids (a user could theoretically belong to multiple companies via `company_members`), so `.in('id', ids)` is the correct operator — not `.eq('id', id)` like Phase 93 uses for the single `user_id` column on `pipeline_attempts`. This is a deliberate, necessary deviation from the reference pattern (Phase 93's target table has a scalar `user_id` column; Companies' target relationship is one-to-many via the join table).

### Pattern 2: Email → user → company_members resolution
**What:** When the search term contains `@`, resolve to auth user(s), then to their company id(s), then filter the main query by those ids.
**When to use:** Any admin search that needs to match on an authenticated user's email but the target table has no email column of its own (or the wrong email column).
**Example:**
```typescript
// Source: app/admin/events/page.tsx lines 46-52, adapted for company_members join
let resolvedCompanyIds: string[] | null = null
if (search.includes('@')) {
  const { data: { users } } = await svc.auth.admin.listUsers({ perPage: 1000 })
  const match = users.find((u) => u.email === search)
  if (match) {
    const { data: memberships } = await svc
      .from('company_members')
      .select('company_id')
      .eq('user_id', match.id)
    resolvedCompanyIds = (memberships ?? []).map((m) => m.company_id)
    // If resolvedCompanyIds is [] (user found but no memberships), the .in('id', [])
    // filter below must still produce zero rows, not "no filter applied" — verify
    // PostgREST .in('id', []) behavior returns empty result set (it does), OR guard
    // explicitly: if (resolvedCompanyIds.length === 0) mainQ = mainQ.eq('id', '00000000-0000-0000-0000-000000000000')
  }
}
```
**Pitfall to verify at implementation time:** confirm Supabase-js `.in('id', [])` (empty array) returns zero rows rather than being ignored/erroring. This is a known PostgREST edge case worth a Wave 0 test — Phase 93 never hits this because it does `.eq('user_id', resolvedUserId)` with a guaranteed-non-null scalar (only entering that branch when `match` is truthy), never an array that could be empty.

### Pattern 3: Client controls component pushing searchParams via router.replace
**What:** `'use client'` component reads current filter state as props (not `useSearchParams` for initial values — passed down from the server component instead, exactly as `EventsControls` does), and on change pushes a merged param set via `router.replace()`, always resetting `page`.
**When to use:** Any filter/search UI paired with a server-rendered paginated list.
**Example:**
```typescript
// Source: app/admin/events/events-controls.tsx (verified in-repo)
function pushParam(key: string, value: string) {
  const params = new URLSearchParams(sp.toString())
  if (value && value !== 'all') {
    params.set(key, value)
  } else {
    params.delete(key)
  }
  params.delete('page') // Reset to page 1 on filter change
  router.replace(`/admin/events?${params.toString()}`)
}
```
Companies variant needs the same function with `/admin/companies` and three filter keys (`tier`, `override`, `demo`) instead of Event Log's (`status`, `input_type`, `step`).

### Anti-Patterns to Avoid
- **Loading all companies then filtering/paginating in JS:** Defeats ADMINCO-03 explicitly ("does not load every tenant row at once"). The CURRENT `app/admin/companies/page.tsx` does exactly this today (`select(...).order('name')` with no range, then `companies.filter(...)` in memory) — this is precisely what the phase overhauls.
- **Deriving `demoCompanies` from the new paginated/filtered query result:** Will silently break ADMINCO-04. If the current page is filtered to tier=business and a demo company has tier=free, it won't be in the paginated result set, so an in-memory filter on that result would make demo accounts disappear from the Demo Accounts section depending on active filters — regression. Demo Accounts MUST be its own independent, always-unfiltered query.
- **Combining name-or-email into a single `.or()` string:** CONTEXT.md explicitly forbids this — the two search paths require different resolution steps (direct `ilike` vs. two-hop `auth.admin.listUsers()` → `company_members`) and cannot be expressed as one PostgREST `.or()` clause.
- **Using `companies.email` for the email search path:** That column is a business/branding contact email (see `lib/actions/settings.ts:93`, WhatsApp intent router), not the platform login email of any user. Searching it would silently return wrong/no results for "search by associated email" as the requirement intends (finding the company a given *user account* belongs to).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Pagination math (offset/limit, total pages) | Custom cursor/offset pagination utility | `.range(from, from + PAGE_SIZE - 1)` + `{count:'exact'}`, `Math.ceil(total/PAGE_SIZE)` | Already the exact, proven house pattern (3 other admin/queries use it identically) — no edge cases left to discover |
| Email-to-tenant resolution | A new lookup table / denormalized email column on `companies` | `auth.admin.listUsers()` + `company_members` join, exactly as Phase 93 | Avoids schema change; `company_members` already has an `email` column too (denormalized at membership time) as an alternative/fallback resolution path if `auth.admin.listUsers()` pagination (1000/page) becomes a concern at higher user counts — not needed at current scale but worth knowing it exists |
| URL state management for filters | Custom state management / Zustand store for filter UI | `useSearchParams` + `router.replace()` | Server-driven URL state is the codebase's established pattern for all admin list filters — keeps filters bookmarkable/shareable and avoids client/server state duplication bugs |

**Key insight:** Every piece of this phase already has a working, tested analog in the codebase. The risk is not "what's the right approach" (answered) but regression risk in the three preserved behaviors (Demo Accounts, HandoffButton, Configure) and one schema-adjacent trap (companies.email vs. company_members path for search).

## Common Pitfalls

### Pitfall 1: `companies.email` column name collision with the ADMINCO-01 "search by email" requirement
**What goes wrong:** An implementer skimming `types/database.types.ts` sees `companies.email: string | null` and writes `.ilike('email', ...)` directly on the companies table, producing a search that "works" in the sense that it returns results, but searches the wrong data (a business/branding contact field, not the account owner's login email) — silently wrong, not a crash.
**Why it happens:** The column exists and is named exactly what the requirement asks for, but its actual semantic (set via `lib/actions/settings.ts`, used in `lib/whatsapp/intent-router.ts`) is unrelated to the auth user email.
**How to avoid:** Follow the CONTEXT.md-locked resolution path — email search always goes through `auth.admin.listUsers()` → `company_members`, never a direct `ilike` on `companies.email`.
**Warning signs:** A "search by email" test passes using a company's `companies.email` value instead of a real signed-up user's auth email — this would mask the bug. Wave 0 tests should specifically seed/assert against a `company_members`-linked user email, not a `companies.email` value.

### Pitfall 2: Demo Accounts section coupling to the new paginated query
**What goes wrong:** If the "All Companies" paginated query becomes the single source of truth and the Demo Accounts section is refactored to derive from it (e.g., "reuse the fetched page" for efficiency), demo accounts outside the current filter/page silently vanish from their dedicated section.
**Why it happens:** Looks like reasonable DRY refactoring ("we already fetched companies, just filter in memory") — exactly the anti-pattern the current code has today, just moved.
**How to avoid:** Keep (or make, since ADMINCO-04 requires it survive) a fully separate, unfiltered, unpaginated query for Demo Accounts — `svc.from('companies').select(...).not('demo_estimate_quota', 'is', null)` run independently, with no `.range()`, no dependency on `page`/filter searchParams.
**Warning signs:** Demo Accounts section disappearing or shrinking when a tier/AI-override filter is applied on the main list — that's the tell that coupling happened.

### Pitfall 3: `PAGE_SIZE = 25` deviates from the codebase's otherwise-universal `PAGE_SIZE = 50`
**What goes wrong:** Not a bug, but worth flagging: every other paginated list in the codebase (`app/admin/events/page.tsx`, `app/(app)/notifications/page.tsx`, `lib/queries/admin-whatsapp.ts`) uses `PAGE_SIZE = 50`. Companies is the first to deviate to 25.
**Why it happens:** CONTEXT.md's stated rationale ("companies rows are denser/wider") is a legitimate UX judgment call, now further locked as non-discretionary in the approved UI-SPEC's pagination block.
**How to avoid:** Not an avoidance case — just confirming this is an intentional, approved deviation, not an oversight. No action needed beyond implementing exactly `PAGE_SIZE = 25` as specified.
**Warning signs:** N/A — flagging for planner awareness only, in case a future consistency pass ever asks "why is Companies different."

### Pitfall 4: Empty-array `.in('id', [])` when email resolves to a user with zero company memberships
**What goes wrong:** If `auth.admin.listUsers()` finds a matching user but that user has no `company_members` rows (e.g., an invited-but-not-yet-joined user, or a platform admin with no tenant company), `resolvedCompanyIds` becomes `[]`. Passing an empty array to `.in('id', [])` needs to reliably filter to zero rows — if the Supabase client or PostgREST ever treats an empty `.in()` array as "no filter" (some ORMs do this in older versions), the query would silently return ALL companies instead of none, which is the opposite of the intended behavior and a real correctness bug (not just a UX quirk).
**Why it happens:** Phase 93's reference pattern never exercises this branch — it uses `.eq('user_id', resolvedUserId)` guarded by `if (match)`, and `resolvedUserId` is always a truthy scalar when the branch executes. Companies' one-to-many relationship via `company_members` introduces a new possible empty-array state that has no analog in the reference implementation.
**How to avoid:** Add an explicit Wave 0 test asserting `.in('id', [])` behavior against the actual Supabase-js version in use (fastest: a static/unit test against a stub, or an integration test against a real or emulated Postgres/PostgREST). If empty-array `.in()` is confirmed safe (current PostgREST/supabase-js versions do treat it as "match nothing," per Supabase's own documented behavior), no code change needed — just confirm and move on. If NOT confirmed safe, guard explicitly with a sentinel: `if (resolvedCompanyIds.length === 0) { /* force zero results, e.g. .eq('id', '00000000-0000-0000-0000-000000000000') */ }`.
**Warning signs:** Searching an email with no company gives back the full unfiltered company list instead of "no results."

### Pitfall 5: `revalidatePath('/admin/companies')` interaction with `force-dynamic` + searchParams
**What goes wrong:** None expected, but worth confirming: existing actions (`setCompanyModelOverride`, `setDemoEstimateQuota`, `setByokConfig` in `app/admin/companies/actions.ts`) call `revalidatePath('/admin/companies')` after mutating a company. With `export const dynamic = 'force-dynamic'` (required for the new searchParams-driven page, and already present on the current page), every request is already dynamically rendered — `revalidatePath` on an already-dynamic route is a harmless no-op-ish call (it doesn't hurt, doesn't achieve anything additional, and doesn't break anything either).
**Why it happens:** N/A — this is a "confirm no regression" item, not a real risk. Included for completeness since it touches the page being overhauled.
**How to avoid:** No action needed. Verified: `force-dynamic` pages always re-fetch on navigation; `revalidatePath` calls from `actions.ts` remain harmless.
**Warning signs:** None expected — listed for planner confidence, not because a fix is needed.

## Code Examples

### Filter-select value encoding for 3-state filters (AI override, Demo/Real)
```typescript
// Pattern for tri-state Select controls (Any / Has / Doesn't-have), adapting
// events-controls.tsx's pushParam pattern. Values: '' (all/any, param omitted),
// 'has' | 'none' for override; 'demo' | 'real' for demo-vs-real.
<Select value={overrideFilter || 'all'} onValueChange={(v) => pushParam('override', v)}>
  <SelectTrigger className="h-8 text-sm w-[160px]">
    <SelectValue placeholder={t('AI override')} />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="all">{t('Any')}</SelectItem>
    <SelectItem value="has">{t('Has override')}</SelectItem>
    <SelectItem value="none">{t('Platform default')}</SelectItem>
  </SelectContent>
</Select>
```
Server-side mapping (page.tsx):
```typescript
if (overrideFilter === 'has')  mainQ = mainQ.not('ai_model_override', 'is', null)
if (overrideFilter === 'none') mainQ = mainQ.is('ai_model_override', null)
```

### Tier filter sourcing from existing constant (no duplicate list)
```typescript
// Source: lib/entitlements.ts — TierName type + tiers object keys
// (lib/billing/billing-config.ts's BillingTier is the same union, used at the
// billing layer). Either import works; TierName from entitlements.ts is the
// more UI-adjacent import already used for entitlement checks elsewhere.
import { tiers } from '@/lib/entitlements' // Object.keys(tiers) === ['free','pro','business']
```
Do not write `const TIER_OPTIONS = ['free', 'pro', 'business']` as a new literal — derive from `Object.keys(tiers)` (or import `TierName`/`BillingTier` for the type) so a future tier addition doesn't require a second edit in the admin UI.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Full unfiltered `companies` fetch + in-memory `.filter()` for demoCompanies/overrideCount | Server-side `.range()` + `{count:'exact'}` paginated query, filters pushed into `.eq()`/`.is()`/`.not()` | This phase (150) | The "All Companies" table no longer loads every tenant row; Demo Accounts section must become its own independent query to preserve current behavior |

**Deprecated/outdated:** None — the current `app/admin/companies/page.tsx` implementation is not "deprecated" in the ecosystem sense, it simply doesn't scale past one page of results, which is exactly what this phase fixes.

## Open Questions

1. **Does `auth.admin.listUsers({ perPage: 1000 })` scale as the tenant/user base grows?**
   - What we know: Phase 93 already uses this exact call with the same `perPage: 1000` cap and hasn't hit a documented issue.
   - What's unclear: At what user count this single-page fetch-and-find-in-memory approach becomes a real latency concern (Supabase Auth Admin API does not support filtering `listUsers` by exact email server-side in the GoTrue admin API as of current versions — a linear scan client-side is the existing workaround).
   - Recommendation: Out of scope to fix in this phase (mirroring the existing, accepted Phase 93 approach exactly, per CONTEXT.md's explicit instruction to reuse it verbatim). Not a blocker — flag only if a future phase revisits Event Log's search performance, since Companies would inherit the same characteristic.

2. **Should the empty-array `.in('id', [])` case be defensively guarded, or is confirming current supabase-js/PostgREST behavior sufficient?**
   - What we know: PostgREST's documented behavior for `.in()` with an empty array is to match zero rows (this is a common, well-known PostgREST semantic, not a Supabase-specific quirk).
   - What's unclear: Whether the currently-installed `@supabase/supabase-js` version could short-circuit locally and skip sending the filter (some client libraries do this optimization for empty arrays). Not independently verified against the exact installed version during this research pass.
   - Recommendation: Add a cheap unit/integration test asserting this specific case in Wave 0 (see Validation Architecture below) rather than assuming; trivial to test, meaningfully de-risks a silent "show everyone" bug.

## Environment Availability

Skipped — this phase has no new external dependencies (no new package installs, no new services, no new env vars). All required capabilities (`@supabase/supabase-js` service client, `auth.admin.listUsers()`, shadcn components) are already present and in active use elsewhere in the codebase, confirmed via direct file reads during this research pass.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (project-wide, `vitest.config.ts`) |
| Config file | `vitest.config.ts` (jsdom environment, `tests/unit/**/*.test.ts(x)`, `tests/integration/**/*.test.ts(x)`) |
| Quick run command | `npx vitest run tests/unit/admin/companies --reporter=dot` (once created) |
| Full suite command | `npm test` (= `vitest run`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ADMINCO-01 | Name search filters server-side via `ilike` | unit (static-source contract, mirroring `events-route-gate.test.ts` style) | `npx vitest run tests/unit/admin/companies-route-gate.test.ts` | ❌ Wave 0 |
| ADMINCO-01 | Email search resolves via `auth.admin.listUsers()` → `company_members`, NOT `companies.email` | unit (static-source assertion that the resolution code path exists and does not reference `.ilike('email'` on the companies table) | `npx vitest run tests/unit/admin/companies-email-search.test.ts` | ❌ Wave 0 |
| ADMINCO-02 | Tier / AI-override / Demo-vs-real filters combine with AND, each independently toggleable | unit (static-source assertion of `.eq`/`.is`/`.not` chain presence) or integration if a test DB is available | `npx vitest run tests/unit/admin/companies-filters.test.ts` | ❌ Wave 0 |
| ADMINCO-03 | `.range()` + `{count:'exact'}` present; `PAGE_SIZE = 25`; `pageUrl()` preserves all active params | unit (static-source contract, mirroring `events-route-gate.test.ts`) | `npx vitest run tests/unit/admin/companies-pagination.test.ts` | ❌ Wave 0 |
| ADMINCO-04 | `requireAdmin()` precedes `requireServiceClient()`; Demo Accounts section uses an independent query (not derived from paginated result); `HandoffButton`/Configure link still render with unchanged props | unit (static-source, index-position assertion — same style as `events-route-gate.test.ts`'s `adminIdx < svcIdx` check) | `npx vitest run tests/unit/admin/companies-route-gate.test.ts` | ❌ Wave 0 |

Given no live Supabase test database is confirmed wired into this repo's Vitest suite (the existing Phase 93/85 tests are static-source/regex contract tests against file content, not live-DB integration tests — see `tests/unit/phase85-companies-rls-or-members.test.ts` and `tests/unit/admin/events-route-gate.test.ts`), the realistic and consistent test strategy for this phase is the SAME static-source-contract style already established: assert the presence and ordering of specific code patterns (`requireAdmin()` before `requireServiceClient()`, `.range(` present, `PAGE_SIZE = 25` present, `.in('id'` present for the email-resolution branch, absence of `.ilike('email'` on the companies table). This is consistent with the codebase's actual testing maturity level for admin pages (no DB-integration harness exists per the Phase 79 note "static SQL contract test instead of live-DB integration test — no harness in repo").

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/admin/companies-*.test.ts`
- **Per wave merge:** `npm test` (full suite)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/admin/companies-route-gate.test.ts` — covers ADMINCO-04 (authz ordering) — mirror `tests/unit/admin/events-route-gate.test.ts` exactly, retargeted at `app/admin/companies/page.tsx`
- [ ] `tests/unit/admin/companies-email-search.test.ts` — covers ADMINCO-01 (email resolution path correctness — asserts `auth.admin.listUsers` + `company_members` presence, asserts NO direct `.ilike('email'` against `companies` table)
- [ ] `tests/unit/admin/companies-filters.test.ts` — covers ADMINCO-02 (tier/override/demo filter chain presence)
- [ ] `tests/unit/admin/companies-pagination.test.ts` — covers ADMINCO-03 (`.range()`, `PAGE_SIZE = 25`, `pageUrl()` param preservation)
- [ ] `tests/unit/admin/companies-controls.test.ts` — covers the new `companies-controls.tsx` client component contract (mirror `tests/unit/admin/events-controls.test.ts` — `'use client'` directive present, `router.refresh()` present for the Refresh button per UI-SPEC)
- [ ] No framework install needed — Vitest is already configured and running against this exact directory shape (`tests/unit/admin/`).

## Sources

### Primary (HIGH confidence — direct file reads, in-repo, this session)
- `C:\Users\Vanildo\Dev\xtimator\app\admin\events\page.tsx` — full reference implementation read
- `C:\Users\Vanildo\Dev\xtimator\app\admin\events\events-controls.tsx` — full reference implementation read
- `C:\Users\Vanildo\Dev\xtimator\lib\admin\events-helpers.ts` — `buildSearchOr()` read in full, confirmed table-specific and not directly reusable
- `C:\Users\Vanildo\Dev\xtimator\app\admin\companies\page.tsx` — current implementation read in full
- `C:\Users\Vanildo\Dev\xtimator\app\admin\companies\handoff-button.tsx` — read in full, confirmed prop surface (`companyId`, `companyName` only)
- `C:\Users\Vanildo\Dev\xtimator\app\admin\companies\actions.ts` — read in full, confirmed `revalidatePath` calls are harmless under `force-dynamic`
- `C:\Users\Vanildo\Dev\xtimator\lib\auth\admin-context.ts` — `requireAdmin()` implementation read
- `C:\Users\Vanildo\Dev\xtimator\lib\supabase\service.ts` — `requireServiceClient()` implementation read
- `C:\Users\Vanildo\Dev\xtimator\lib\entitlements.ts` — `TierName`, `tiers` object read (lines 1-70)
- `C:\Users\Vanildo\Dev\xtimator\lib\billing\billing-config.ts` — `BillingTier` type confirmed via grep
- `C:\Users\Vanildo\Dev\xtimator\types\database.types.ts` — `companies` and `company_members` Row types read directly (confirmed `companies.email` exists but is distinct from account-holder email; confirmed `company_members.email`, `.user_id`, `.company_id` columns)
- `C:\Users\Vanildo\Dev\xtimator\components\dashboard\empty-state.tsx` — `EmptyState` prop contract read in full
- `C:\Users\Vanildo\Dev\xtimator\vitest.config.ts` — test framework config read in full
- `C:\Users\Vanildo\Dev\xtimator\tests\unit\admin\events-route-gate.test.ts` — read in full, confirms static-source-contract testing style
- `C:\Users\Vanildo\Dev\xtimator\tests\unit\admin\events-controls.test.ts` — read in full
- `C:\Users\Vanildo\Dev\xtimator\tests\unit\phase85-companies-rls-or-members.test.ts` — read (partial), confirms no live-DB test harness exists in this repo
- `.planning/phases/150-companies-admin-screen-overhaul/150-CONTEXT.md` — locked decisions, read in full
- `.planning/phases/150-companies-admin-screen-overhaul/150-UI-SPEC.md` — approved UI contract, read in full (supersedes several CONTEXT.md discretion points with concrete resolutions)
- `.planning/REQUIREMENTS.md` — ADMINCO-01..04 + milestone locked decisions, read in full

### Secondary (MEDIUM confidence)
- None required — this phase's entire technical surface was directly verifiable in-repo; no external library/API documentation lookups were needed since all patterns are internal, already-shipped code.

### Tertiary (LOW confidence)
- PostgREST `.in()` empty-array behavior (Pitfall 4 / Open Question 2) — stated from general PostgREST/Supabase documented semantics (well-established community knowledge that `.in(col, [])` matches zero rows), but NOT independently re-verified against the exact installed `@supabase/supabase-js` version in this session. Flagged as an Open Question and a Wave 0 test item rather than asserted as fact.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies; every pattern verified by direct in-repo file reads, not training-data recall
- Architecture: HIGH — reference implementation (Phase 93) and target file (current companies page) both read in full; approved UI-SPEC further locks exact structure
- Pitfalls: HIGH for Pitfalls 1-3, 5 (all verified via direct schema/code reads); MEDIUM for Pitfall 4 (empty-array `.in()` behavior is standard PostgREST semantics but not independently version-verified this session — correctly flagged as LOW-confidence/Open Question, not asserted as fact)

**Research date:** 2026-07-05
**Valid until:** 30 days (stable internal pattern reuse, no external API/library version drift risk — the only decay vector is if `company_members` schema or `auth.admin.listUsers()` behavior changes, both unlikely on this timescale)

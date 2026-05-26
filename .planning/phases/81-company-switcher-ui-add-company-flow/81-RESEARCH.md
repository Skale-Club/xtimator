# Phase 81: Company Switcher UI + Add Company Flow — Research

**Researched:** 2026-05-25
**Domain:** Next.js App Router server actions + RLS-scoped query + dropdown UI wiring
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (SWITCH-01..SWITCH-19)

**Existing assets (Phase 71 + Phase 79):**
- SWITCH-01: `<CompanySelector>` at `components/app-shell/company-selector.tsx` has the visual shell — keep visual identity intact, only wire it up.
- SWITCH-02: Phase 79 helpers (`getActiveCompanyId`, `getActiveCompany`, `ACTIVE_COMPANY_COOKIE`, `ACTIVE_COMPANY_COOKIE_OPTIONS`) are the cookie source of truth. Do NOT redefine cookie name or options.
- SWITCH-03: `createOrUpdateCompany(input, 'add')` handles new-company atomically. Phase 81 routes to `/onboarding?mode=add`; never call `createOrUpdateCompany` directly from the switcher.

**Live company list:**
- SWITCH-04: Add `getMembershipCompanies(): Promise<{ id, name, logo_url }[]>` to `lib/queries/active-company.ts` (same file as Phase 79). JOIN `companies` with `company_members` on `user_id = auth.uid()`, ordered by `companies.created_at ASC`. Use request-scoped Supabase client (RLS scopes correctly per D-03).
- SWITCH-05: Single-company case still renders the selector with only the "+ Add new company" item.

**Switch action:**
- SWITCH-06: New file `lib/actions/active-company.ts` exporting `switchActiveCompany(companyId: string): Promise<{ ok: true } | { error: string }>`. Steps: getClaims → verify `company_members` row → set cookie via `ACTIVE_COMPANY_COOKIE_OPTIONS` → `revalidateTag('company')` → `revalidatePath('/', 'layout')` → return `{ ok: true }`.
- SWITCH-07: Selector uses `useTransition` for pending UX; spinner replaces checkmark on clicked item; trigger disabled.
- SWITCH-08: On `forbidden` error, close dropdown + `toast.error('You no longer have access to that company.')` + `router.refresh()`.
- SWITCH-09: Clicking the active company is a no-op (short-circuit on `isActive`).

**Add company flow:**
- SWITCH-10: "+ Add new company" is a `<Link href="/onboarding?mode=add" prefetch>` — NOT a server action.
- SWITCH-11: `app/onboarding/page.tsx` must read `searchParams.mode` and thread `mode: 'add'` to `createOrUpdateCompany`. **Confirmed during research that this wiring does NOT exist today** — must ship in this phase.
- SWITCH-12: Visual identity: `Building2` icon + "Add new company" label.

**Mount in sidebar:**
- SWITCH-13: Replace static block (lines ~344–392 — confirmed via Read; CONTEXT cites 350–359 but the expanded-state DropdownMenu block runs to ~392) with `<CompanySelector companies={list} activeCompanyId={active.id} />`. Layout passes both via `getMembershipCompanies()` + `getActiveCompany()`.
- SWITCH-14: Collapsed sidebar shows active company avatar as dropdown trigger only (no name, no chevron).
- SWITCH-15: Mobile (`mobile-header.tsx`) NOT modified in this phase — desktop/tablet only via `sm:flex` on trigger.

**Tests:**
- SWITCH-16: Unit tests mandatory for `getMembershipCompanies()` + `switchActiveCompany()` (3 branches: success / forbidden / unauthenticated).
- SWITCH-17: Static-contract test on CompanySelector source — must import `useTransition`, `switchActiveCompany`, and never hardcode `'active_company_id'`.
- SWITCH-18: No E2E. HUMAN-UAT covers cookie-write + revalidation composition.

**Project instructions:**
- SWITCH-19: TS strict, request-scoped supabase client, server-side cookie write, no new env vars, no new deps.

### Claude's Discretion
- Placement of `getMembershipCompanies()` inside `lib/queries/active-company.ts` (top vs bottom).
- New file `lib/actions/active-company.ts` vs co-locating in `lib/actions/company.ts` (CONTEXT recommends new file).
- Whether to break the CompanySelector prop API to `{ companies, activeCompanyId }` (recommended — zero current callers verified via grep).
- Loading skeleton shape for pending switch (inline spinner recommended).
- Whether dropdown auto-closes on success (recommended yes).

### Deferred Ideas (OUT OF SCOPE)
- Mobile company switcher in `mobile-header.tsx`.
- URL-based company scoping (`/c/{slug}/...`).
- Recent-company / keyboard shortcuts.
- Inviting other users (Admin/Member tiers — v5+).
- Cross-company analytics.
- RLS rewrite of tenant-scoped tables (separate v4.0 phase).
- Server-action sweep (separate v4.0 phase).
- Billing per-company (Phase 83).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SWITCH-01 | Keep existing CompanySelector visual identity | Verified: component at `components/app-shell/company-selector.tsx` has dropdown trigger + glass content + Check + Building2 — visual stub only, no logic |
| SWITCH-02 | Phase 79 cookie constants are source of truth | Verified: `ACTIVE_COMPANY_COOKIE = 'active_company_id'` and `ACTIVE_COMPANY_COOKIE_OPTIONS` exported from `lib/queries/active-company.ts` |
| SWITCH-03 | Add-company routes to `/onboarding?mode=add`, NOT direct action call | Verified: `createOrUpdateCompany(data, { mode: 'add' })` is the contract; signature accepts `CreateOrUpdateCompanyOptions` |
| SWITCH-04 | `getMembershipCompanies()` lives in `lib/queries/active-company.ts` | Verified: RLS policy `company_members_select` permits `user_id = auth.uid()` SELECT — request-scoped client has correct visibility |
| SWITCH-05 | Single-company case still renders selector | UX decision — Add item is only affordance |
| SWITCH-06 | `switchActiveCompany` server action with membership check + cookie + dual revalidate | `revalidatePath('/', 'layout')` is already an established pattern (`lib/actions/project.ts` uses it 7×) |
| SWITCH-07 | `useTransition` pending UX | Existing pattern in `onboarding-survey.tsx` line 37 |
| SWITCH-08 | `toast.error` from `sonner` on forbidden | Confirmed: `sonner` is the project-wide toast library (5+ existing call sites) |
| SWITCH-09 | Clicking active company = no-op | Short-circuit in onClick handler |
| SWITCH-10 | "+ Add new company" is a `<Link>` to `/onboarding?mode=add` | Routing-not-action decision |
| SWITCH-11 | `app/onboarding/page.tsx` reads `searchParams.mode` | **CRITICAL GAP CONFIRMED:** page.tsx does NOT currently read searchParams at all (verified via Read). OnboardingSurvey calls `createOrUpdateCompany({...})` with NO mode arg → defaults to `'first'`. This wiring is mandatory new work in Phase 81. |
| SWITCH-12 | Building2 icon + "Add new company" label | Stub already uses Building2 |
| SWITCH-13 | Mount in sidebar, replacing static block | Verified sidebar.tsx lines 344-392 contain the static `<DropdownMenuTrigger>` company block for the expanded state |
| SWITCH-14 | Collapsed sidebar shows avatar as trigger | Existing pattern at sidebar.tsx lines 296-343 |
| SWITCH-15 | Mobile unchanged in this phase | `mobile-header.tsx` not touched |
| SWITCH-16 | Unit tests for both functions | Vitest framework confirmed; mirrors `tests/unit/active-company-helpers.test.ts` pattern |
| SWITCH-17 | Static-contract test on CompanySelector | Mirrors Phase 79 static-contract test pattern |
| SWITCH-18 | No E2E; HUMAN-UAT covers composition | Matches Phase 79 verification pattern |
| SWITCH-19 | TS strict, no new deps | Verified — all primitives (sonner, dropdown, avatar, link) already in project |
</phase_requirements>

## Summary

Phase 81 wires up the existing Phase 71 `<CompanySelector>` visual stub to the Phase 79 multi-company plumbing. The work is mechanical: one query helper (`getMembershipCompanies`), one server action (`switchActiveCompany`), one component rewrite (`CompanySelector` with `useTransition`), one sidebar mount swap, and one onboarding-page `searchParams.mode` wiring. No new dependencies, no schema changes, no migration.

The single **critical gap** discovered during research: `app/onboarding/page.tsx` and `OnboardingSurvey` do NOT currently read `searchParams.mode` or pass `mode: 'add'` to `createOrUpdateCompany`. Phase 79 D-13 said `'add'` mode is "wired up but not yet reachable from UI" — that's still true. Phase 81 MUST close this wiring as part of SWITCH-11.

**Primary recommendation:** Plan 4 waves — (1) `getMembershipCompanies` + unit tests, (2) `switchActiveCompany` action + unit tests, (3) CompanySelector rewrite + sidebar mount + onboarding `?mode=add` wiring, (4) static-contract test + layout integration. Single phase is sufficient; no need to split.

## Project Constraints (from CLAUDE.md)

- **GSD workflow enforcement:** All edits must flow through a GSD command. This phase is being driven by `/gsd:plan-phase`.
- **Secret handling:** No secrets in any commit, including planning docs. No `.env.local` exposure. Not applicable for this phase (no secrets touched).
- **Tech stack lock:** Next.js 16 App Router, TypeScript strict, Tailwind 4, shadcn/ui (already present). No new deps.
- **RLS:** `company_members` RLS already enabled (Phase 79 migration). All new query paths must use the request-scoped client to honor RLS — never `requireServiceClient()` for the member list.
- **currentDate:** 2026-05-25 (per MEMORY.md).
- **Memory directives:** No checkpoint interruptions — auto-approve all human-verify checkpoints during phase runs; seeds and planning docs stay in English.

## Standard Stack

### Core (already in project — no install)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | 16.x (App Router) | Server actions, `cookies()`, `revalidatePath`, `revalidateTag` | Project base |
| react | 19.x | `useTransition` for pending UX | Project base |
| @supabase/ssr | (project pinned) | Request-scoped client via `lib/supabase/server.ts` | RLS-bound reads — REQUIRED for `getMembershipCompanies` |
| sonner | (project pinned) | `toast.error` for forbidden state | App-wide toast standard |
| lucide-react | (project pinned) | `Check`, `ChevronsUpDown`, `Building2`, `Loader2` icons | Project icon library |
| @radix-ui/react-dropdown-menu via `components/ui/dropdown-menu.tsx` | shadcn | Dropdown surface | Already used by stub |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `useTransition` + `router.refresh()` | SWR mutate + optimistic UI | Overkill — Phase 79 revalidate path is enough; less code, fewer client deps |
| `revalidatePath('/', 'layout')` only | `revalidateTag('company')` only | CONTEXT D-06 mandates BOTH (belt-and-suspenders); tag invalidates `loadCompanyById` cache, path invalidates layout-rendered children |
| Service-role client for membership list | RLS-bound (`createClient` from `lib/supabase/server.ts`) | RLS is already correctly scoped (D-03); service-role would bypass the security boundary unnecessarily |

**No new installations required.** Verify with `npm ls sonner lucide-react` before planning — all already at top-level deps.

## Architecture Patterns

### Recommended File Structure

```
lib/
├── queries/
│   └── active-company.ts        # ADD getMembershipCompanies() here (same file as Phase 79 helpers)
└── actions/
    └── active-company.ts        # NEW — switchActiveCompany server action

components/
└── app-shell/
    ├── company-selector.tsx     # REWRITE — break API to { companies, activeCompanyId }
    └── sidebar.tsx              # EDIT — replace static company block with <CompanySelector>

app/
├── (app)/
│   └── layout.tsx               # EDIT — add getMembershipCompanies() call into Promise.all
└── onboarding/
    └── page.tsx                 # EDIT — read searchParams.mode, pass to OnboardingSurvey
components/onboarding/
└── onboarding-survey.tsx        # EDIT — accept `mode` prop, pass to createOrUpdateCompany

tests/unit/
├── get-membership-companies.test.ts        # NEW
├── switch-active-company.test.ts           # NEW
└── company-selector-contract.test.ts       # NEW (static-contract)
```

### Pattern 1: RLS-bound query for membership list

```ts
// lib/queries/active-company.ts (append)
export async function getMembershipCompanies(): Promise<
  Array<{ id: string; name: string; logo_url: string | null }>
> {
  const claims = await getAuthClaims()
  if (!claims?.sub) return []

  const supabase = await createClient() // RLS-bound — D-03 select policy gates by auth.uid()

  // Query company_members with JOIN to companies; foreign-table ordering for ASC by created_at.
  const { data, error } = await supabase
    .from('company_members')
    .select('company_id, companies!inner(id, name, logo_url, created_at)')
    .eq('user_id', claims.sub)
    .order('created_at', { foreignTable: 'companies', ascending: true })

  if (error || !data) return []
  return data.map((row) => ({
    id: row.companies.id,
    name: row.companies.name,
    logo_url: row.companies.logo_url,
  }))
}
```

Mirrors the foreign-table ordering used in `getActiveCompanyId` (line 78). Confirmed working via Phase 79.

### Pattern 2: Server action with discriminated-union return

```ts
// lib/actions/active-company.ts (new file)
'use server'

import { cookies } from 'next/headers'
import { revalidatePath, revalidateTag } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  ACTIVE_COMPANY_COOKIE,
  ACTIVE_COMPANY_COOKIE_OPTIONS,
} from '@/lib/queries/active-company'

export async function switchActiveCompany(
  companyId: string
): Promise<{ ok: true } | { error: 'unauthenticated' | 'forbidden' }> {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null
  if (!claims?.sub) return { error: 'unauthenticated' }

  // Membership check — RLS already scopes to auth.uid(), so existence == authorized.
  const { data: membership } = await supabase
    .from('company_members')
    .select('company_id')
    .eq('user_id', claims.sub)
    .eq('company_id', companyId)
    .maybeSingle()

  if (!membership) return { error: 'forbidden' }

  const cookieStore = await cookies()
  cookieStore.set(ACTIVE_COMPANY_COOKIE, companyId, ACTIVE_COMPANY_COOKIE_OPTIONS)

  revalidateTag('company')              // Invalidates unstable_cache in loadCompanyById
  revalidatePath('/', 'layout')         // Forces layout re-render across all routes

  return { ok: true }
}
```

The `revalidatePath('/', 'layout')` pattern is established in `lib/actions/project.ts` (7 call sites). Confirmed safe.

### Pattern 3: Client component with useTransition

```tsx
// components/app-shell/company-selector.tsx (rewrite)
'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, ChevronsUpDown, Building2, Loader2 } from 'lucide-react'
import { switchActiveCompany } from '@/lib/actions/active-company'
// ... (dropdown + avatar imports unchanged)

interface CompanySelectorProps {
  companies: Array<{ id: string; name: string; logo_url: string | null }>
  activeCompanyId: string
  collapsed?: boolean
}

export function CompanySelector({ companies, activeCompanyId, collapsed }: CompanySelectorProps) {
  const [isPending, startTransition] = useTransition()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const router = useRouter()
  const active = companies.find((c) => c.id === activeCompanyId)

  function handleSwitch(id: string) {
    if (id === activeCompanyId) return // SWITCH-09 no-op
    setPendingId(id)
    startTransition(async () => {
      const result = await switchActiveCompany(id)
      if ('error' in result) {
        toast.error('You no longer have access to that company.')
        router.refresh()
      }
      setPendingId(null)
    })
  }

  // ... render: collapsed avatar-only OR expanded full row trigger
  // List companies with Check on active, Loader2 spinner on pendingId, "+ Add new company" Link below separator
}
```

### Pattern 4: searchParams in App Router page (Next.js 16)

```tsx
// app/onboarding/page.tsx (edit)
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>
}) {
  const { mode } = await searchParams
  const addMode = mode === 'add' ? 'add' : 'first'
  // ...
  return <OnboardingSurvey appName={...} logoUrl={...} mode={addMode} />
}
```

Note: **Next.js 15+ `searchParams` is async (Promise)** — must `await` before destructuring. Verify against current Next 16 docs but this matches the project's existing dynamic-route conventions.

### Anti-Patterns to Avoid

- **Calling `requireServiceClient()` for `getMembershipCompanies`** — bypasses RLS unnecessarily. The whole point of D-03 RLS is that the request-scoped client is correctly scoped already.
- **Hardcoding `'active_company_id'` cookie name in the selector or action** — Phase 79 explicitly says use `ACTIVE_COMPANY_COOKIE` constant (SWITCH-17 enforces this via static-contract test).
- **Calling `createOrUpdateCompany` directly from the dropdown** — bypasses logo upload, industry picker, validation. Route to `/onboarding?mode=add` per SWITCH-10.
- **Using only `revalidatePath` without `revalidateTag('company')`** — the layout's `unstable_cache` (`loadCompanyById`) is keyed by `activeCompanyId` AND tagged `'company'`; only the tag invalidates the cached row.
- **Adding `<CompanySelector>` to both collapsed and expanded sidebar paths as two separate trees** — instead, pass `collapsed` prop and let the component branch internally (cleaner, single mount).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Pending UX for server action | Custom loading state with useEffect | `useTransition` | React 19 idiomatic; auto-resets on completion |
| Cookie management | Custom cookie writer | `cookies().set()` + Phase 79 `ACTIVE_COMPANY_COOKIE_OPTIONS` | One source of truth (SWITCH-02) |
| Toast / error UI | Custom error banner | `toast.error()` from `sonner` | Already mounted globally |
| Layout-level cache invalidation | Manual cache key bumping | `revalidateTag('company') + revalidatePath('/', 'layout')` | Established pattern (lib/actions/project.ts) |
| Membership authorization check | Server-side allowlist | RLS-bound `company_members` SELECT | Phase 79 D-03 already enforces; existence == authorized |
| Add-company form | Inline modal in dropdown | Route to `/onboarding?mode=add` | Onboarding already owns logo upload + industry picker + validation (SWITCH-10) |

**Key insight:** Phase 79 left the entire surface unwired-but-correct. Phase 81 is glue, not new construction — anything that feels like it needs new infrastructure is a signal to double-check Phase 79 didn't already ship it.

## Runtime State Inventory

This phase does not rename or migrate any runtime state. New writes flow through existing Phase 79 cookie + table mechanisms.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — `company_members` rows already correct from Phase 79 backfill; cookie format unchanged | None |
| Live service config | None — no external service touches the company switcher | None |
| OS-registered state | None | None |
| Secrets/env vars | None — no new env vars (SWITCH-19) | None |
| Build artifacts | None — no compiled packages renamed | None |

**Nothing found in any category — verified by reading Phase 79 outputs and CONTEXT.md confirming "no new env vars / no new dependencies / no schema changes".**

## Environment Availability

This phase is purely code/config changes inside the existing Next.js + Supabase project. No new external tools, services, or runtimes required.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Vitest | Unit tests | ✓ | 4.1.4 (per package.json) | — |
| Next.js App Router runtime | Server action + layout | ✓ | 16.x | — |
| Supabase request client | `getMembershipCompanies` RLS path | ✓ | (project pinned) | — |
| sonner | Toast on forbidden | ✓ | (project pinned) | — |

**No missing dependencies.**

## Common Pitfalls

### Pitfall 1: Foreign-table ORDER BY in supabase-js

**What goes wrong:** Devs write `.order('companies.created_at', { ascending: true })` (incorrect syntax) and get a cryptic PostgREST error or silent ordering-by-PK.

**Why it happens:** supabase-js syntax for ordering by joined-table column is `order('created_at', { foreignTable: 'companies', ascending: true })` — column name first, foreign table in options.

**How to avoid:** Mirror `getActiveCompanyId` line 78 exactly — same pattern, different `ascending` direction.

**Warning signs:** Unit test for "orders by created_at ASC" fails or returns unsorted data when fed multiple memberships.

### Pitfall 2: Async searchParams in Next.js 15+

**What goes wrong:** `searchParams.mode` is `undefined` because devs treat searchParams as sync object.

**Why it happens:** Next.js 15 made `searchParams` a Promise. Project is on Next 16 — same behavior.

**How to avoid:** Type the prop as `Promise<{ mode?: string }>` and `await` it before destructuring.

**Warning signs:** TS error "Property 'mode' does not exist on type 'Promise<{ mode?: string }>'" — DO NOT silence with `as any`; await it.

### Pitfall 3: Cookie not visible until next request

**What goes wrong:** After `switchActiveCompany` returns, the very next read of `getActiveCompanyId()` in the same request might miss the new cookie (depending on context).

**Why it happens:** `cookies().set()` writes to the *outgoing* response; same-request reads see the value via Next.js's internal merging — but only inside server actions / route handlers, not inside `unstable_cache` callbacks.

**How to avoid:** The `revalidatePath('/', 'layout')` forces a fresh render, which is a fresh request from React's perspective. The cookie will be visible there. Do NOT try to read it back inside the action to "verify".

**Warning signs:** UAT shows the wrong company still active after switch — usually means `revalidatePath` wasn't called or layout's `unstable_cache` wasn't invalidated by `revalidateTag('company')`.

### Pitfall 4: CompanySelector prop API break with stale callers

**What goes wrong:** Breaking the prop API from `{ company }` to `{ companies, activeCompanyId }` errors any existing caller.

**Why it happens:** Visual stub was shipped with `{ company }` shape; CONTEXT confirms zero current callers — but humans add imports later.

**How to avoid:** Grep `<CompanySelector` and `from '@/components/app-shell/company-selector'` after the rewrite. Confirmed during research: NO production callers exist (only docs reference it). Safe to break.

### Pitfall 5: Sidebar collapsed-state covers TWO render trees

**What goes wrong:** Devs replace only the expanded-state DropdownMenu (lines 344-392) and leave the collapsed-state avatar button (lines 296-343) unchanged → switcher disappears in collapsed mode.

**Why it happens:** Sidebar has fully separate `if (collapsed)` and `else` branches for the bottom panel.

**How to avoid:** `<CompanySelector collapsed={collapsed} />` and branch internally OR mount the component in BOTH branches with appropriate `collapsed` prop. The CONTEXT recommends single mount with prop.

### Pitfall 6: `onboarding-survey.tsx` receives `mode` but doesn't thread it

**What goes wrong:** Page reads `searchParams.mode` and passes it to `OnboardingSurvey`, but the survey's `handleComplete` still calls `createOrUpdateCompany({...})` with no second arg → defaults to `'first'`.

**Why it happens:** OnboardingSurvey today (line 66) calls `createOrUpdateCompany({...state.values, logoUrl})` — no options arg.

**How to avoid:** Thread `mode` prop through OnboardingSurvey → `handleComplete` → `createOrUpdateCompany(data, { mode })`. Defaults to `'first'` if undefined.

**Warning signs:** Adding a second company silently OVERWRITES the first one (because mode=first SELECTs existing by user_id then UPDATEs).

## Code Examples

### Membership query (full)

```ts
// lib/queries/active-company.ts (append below getActiveCompany)

export async function getMembershipCompanies(): Promise<
  Array<{ id: string; name: string; logo_url: string | null }>
> {
  const claims = await getAuthClaims()
  if (!claims?.sub) return []

  const supabase = await createClient()

  const { data } = await supabase
    .from('company_members')
    .select('companies!inner(id, name, logo_url, created_at)')
    .eq('user_id', claims.sub as string)
    .order('created_at', { foreignTable: 'companies', ascending: true })

  if (!data) return []
  return data.map((row: any) => ({
    id: row.companies.id,
    name: row.companies.name,
    logo_url: row.companies.logo_url,
  }))
}
```

### Layout integration

```ts
// app/(app)/layout.tsx — add to Promise.all

const [branding, adminRow, billingRow, memberships] = await Promise.all([
  brandingPromise,
  requireServiceClient().from('platform_admins').select(...).maybeSingle(),
  requireServiceClient().from('companies').select('tier, tier_trial_ends_at').eq('id', activeCompanyId).single(),
  getMembershipCompanies(),  // NEW
])

// ...

<Sidebar
  branding={{...}}
  company={company}
  memberships={memberships}      // NEW prop
/>
```

### Sidebar prop & mount

```ts
// components/app-shell/sidebar.tsx

interface SidebarProps {
  branding: { appName: string; logoUrl: string | null }
  company: { id: string; name: string; logo_url: string | null; owner_name: string | null }
  memberships: Array<{ id: string; name: string; logo_url: string | null }>  // NEW
}

// Replace the static company block (around lines 344-392) with:
<CompanySelector
  companies={memberships}
  activeCompanyId={company.id}
  collapsed={collapsed}
/>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Static `<DropdownMenuTrigger>` showing single company name | `<CompanySelector>` driven by `getMembershipCompanies()` | Phase 81 | Multi-company users see all options; single-company users see Add path |
| `app/onboarding/page.tsx` ignores `searchParams.mode` | Reads `?mode=add`, threads through to `createOrUpdateCompany(data, { mode: 'add' })` | Phase 81 | Onboarding now supports add-company flow that Phase 79 D-13 stubbed in |
| Cache invalidation: pre-existing `revalidateTag('company')` infrastructure with no caller | Caller exists: `switchActiveCompany` calls both `revalidateTag` + `revalidatePath('/', 'layout')` | Phase 81 | Layout re-renders correctly post-switch |

**Deprecated/outdated:** None — Phase 79 left everything intentionally forward-compatible.

## Open Questions

1. **Collapsed-mode trigger styling — match existing user-menu avatar look or distinct?**
   - What we know: collapsed sidebar today renders a generic `bg-muted` initial avatar at lines 316-320 for the **user menu**. The company switcher in collapsed mode should re-use a similar avatar but reflect the active **company** (logo + initial fallback).
   - What's unclear: Visual distinction — should the company avatar be visually different from the user-menu avatar? Stacked? Same row?
   - Recommendation: Render the company avatar **above** the user-menu avatar in collapsed mode. Two distinct dropdowns, two distinct surfaces. Planner can choose; CONTEXT calls this "discretion".

2. **Pending-state UX when switching is slow (e.g., poor network)**
   - What we know: `useTransition` provides `isPending`. The clicked item gets a spinner; the trigger button could disable.
   - What's unclear: Should the dropdown close immediately on click (optimistic) and show a toast/banner on failure, or stay open with spinner until completion?
   - Recommendation: Stay open with `<Loader2 className="animate-spin">` replacing the `<Check>` on the clicked item. Close on success (router refresh handles it). Matches CONTEXT's "auto-closes after a successful switch (recommended: yes)".

3. **Should `getMembershipCompanies` be cached?**
   - What we know: Phase 79 `getActiveCompany` uses `unstable_cache` with tag `'company'`. Membership list is per-user, not per-company.
   - What's unclear: Caching the membership list could shave a DB call per layout render. Tag would be `'company-members'` or per-user.
   - Recommendation: **No caching in v1.** Membership list is small (typical 1-3 rows), per-request fetch via RLS is fast, and adding a cache adds an invalidation surface (must bust on add-company, on switch, on future revoke). Revisit if perf becomes an issue.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.4 (per `package.json`) |
| Config file | `vitest.config.ts` (project-existing) |
| Quick run command | `npx vitest run tests/unit/get-membership-companies.test.ts tests/unit/switch-active-company.test.ts tests/unit/company-selector-contract.test.ts` |
| Full suite command | `npm run test` (== `vitest run`) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SWITCH-04 | `getMembershipCompanies` filters by user_id | unit | `npx vitest run tests/unit/get-membership-companies.test.ts -t "filters by user_id"` | ❌ Wave 0 |
| SWITCH-04 | `getMembershipCompanies` orders by created_at ASC | unit | `npx vitest run tests/unit/get-membership-companies.test.ts -t "orders by created_at"` | ❌ Wave 0 |
| SWITCH-04 | `getMembershipCompanies` returns `{id,name,logo_url}` shape | unit | `npx vitest run tests/unit/get-membership-companies.test.ts -t "returns shape"` | ❌ Wave 0 |
| SWITCH-04 | Returns `[]` when unauthenticated | unit | `npx vitest run tests/unit/get-membership-companies.test.ts -t "unauthenticated"` | ❌ Wave 0 |
| SWITCH-06 | `switchActiveCompany` success → sets cookie + revalidates | unit | `npx vitest run tests/unit/switch-active-company.test.ts -t "success"` | ❌ Wave 0 |
| SWITCH-06 | `switchActiveCompany` returns `{error:'forbidden'}` on no membership | unit | `npx vitest run tests/unit/switch-active-company.test.ts -t "forbidden"` | ❌ Wave 0 |
| SWITCH-06 | `switchActiveCompany` returns `{error:'unauthenticated'}` on no session | unit | `npx vitest run tests/unit/switch-active-company.test.ts -t "unauthenticated"` | ❌ Wave 0 |
| SWITCH-17 | CompanySelector imports `useTransition`, `switchActiveCompany`; never hardcodes cookie | static-contract | `npx vitest run tests/unit/company-selector-contract.test.ts` | ❌ Wave 0 |
| SWITCH-07, SWITCH-08, SWITCH-09, SWITCH-10, SWITCH-11, SWITCH-13, SWITCH-14 | Cookie write composes with layout revalidation (end-to-end behavior); dropdown click switches; add-company routes correctly; sidebar mounts in collapsed + expanded; onboarding `?mode=add` opens onboarding in add mode | manual-only (HUMAN-UAT) | n/a — manual exercise against localhost | n/a |
| SWITCH-15 | Mobile header unchanged | static (visual inspection / no edit) | n/a — verified by NOT touching `components/app-shell/mobile-header.tsx` | n/a |

### Sampling Rate

- **Per task commit:** `npx vitest run tests/unit/get-membership-companies.test.ts tests/unit/switch-active-company.test.ts tests/unit/company-selector-contract.test.ts` (sub-1s on these isolated tests)
- **Per wave merge:** `npm run test` (full suite green)
- **Phase gate:** Full suite green before `/gsd:verify-work`; HUMAN-UAT signed off

### Wave 0 Gaps

- [ ] `tests/unit/get-membership-companies.test.ts` — covers SWITCH-04 (4 sub-tests)
- [ ] `tests/unit/switch-active-company.test.ts` — covers SWITCH-06 (3 sub-tests: success / forbidden / unauthenticated)
- [ ] `tests/unit/company-selector-contract.test.ts` — covers SWITCH-17 (static fs+regex; mirror Phase 79's contract test pattern)
- [ ] HUMAN-UAT runbook covers SWITCH-07/08/09/10/11/13/14 composition — drafted during plan, not pre-existing

No framework install required (Vitest already configured).

## Sources

### Primary (HIGH confidence)

- `lib/queries/active-company.ts` (Phase 79 output) — `ACTIVE_COMPANY_COOKIE`, `ACTIVE_COMPANY_COOKIE_OPTIONS`, foreign-table ORDER BY pattern
- `lib/actions/company.ts` — `createOrUpdateCompany` `{ mode }` parameter; service-client member insert pattern; cookie write idiom
- `supabase/migrations/20260525000001_phase79_company_members.sql` — RLS policy `company_members_select` confirms request-scoped client has correct SELECT visibility
- `types/database.types.ts` line 319 — `company_members` Row/Insert/Update shapes
- `app/(app)/layout.tsx` — current data fetching pattern (Promise.all with `requireServiceClient` for sibling reads)
- `app/onboarding/page.tsx` — current state confirms searchParams.mode is NOT yet read
- `components/onboarding/onboarding-survey.tsx` — confirms `createOrUpdateCompany` called without options arg (line 66)
- `components/app-shell/sidebar.tsx` — confirms two render paths (collapsed lines 296-343 / expanded 344-392)
- `components/app-shell/company-selector.tsx` — visual stub prop shape
- `lib/actions/project.ts` — `revalidatePath('/', 'layout')` established usage (7 call sites)
- `.planning/phases/79-multi-company-support-allow-one-user-to-own-and-switch-betwe/79-CONTEXT.md` — D-03, D-05, D-06, D-12, D-13 govern the foundation
- `.planning/phases/81-company-switcher-ui-add-company-flow/81-CONTEXT.md` — SWITCH-01..SWITCH-19
- `package.json` — Vitest 4.1.4, test scripts confirmed
- `.planning/config.json` — `nyquist_validation: true` confirms Validation Architecture section required

### Secondary (MEDIUM confidence)

- Next.js 15+ async `searchParams` behavior — project already uses this pattern in dynamic routes; reaffirm against Next 16 release notes if surprised
- `useTransition` + server action pending UX — established in `onboarding-survey.tsx` line 37

### Tertiary (LOW confidence)

- None — all critical claims verified against project files.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every library/primitive verified present in project
- Architecture: HIGH — patterns mirror Phase 79 exactly; no novel design decisions
- Pitfalls: HIGH — Pitfall 6 (onboarding mode threading) verified by reading the file
- Validation: HIGH — Vitest already configured; mocking pattern documented at `tests/unit/active-company-helpers.test.ts`

**Research date:** 2026-05-25
**Valid until:** 2026-06-25 (30 days — stable; Phase 79 foundation is shipped and unchanging)

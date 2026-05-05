---
phase: 17-navigation-performance
verified: 2026-05-05T08:50:00Z
status: human_needed
score: 4/5 must-haves verified (1 needs human perceptual measurement)
---

# Phase 17: Navigation Performance Verification Report

**Phase Goal:** Every page-to-page navigation in the authenticated app feels instant (under 200ms perceived latency). The user sees skeleton screens immediately while data loads server-side, eliminating the current ~1 second blank-screen delay between routes.

**Verified:** 2026-05-05
**Status:** human_needed — automated checks all pass; perceptual / network-timing criterion needs in-browser measurement
**Re-verification:** No — initial verification
**Milestone closure:** This is the final phase of milestone v1.3 (per ROADMAP.md). The user prompt referenced v1.2 closure, but ROADMAP clearly assigns phase 17 to v1.3 (v1.2 closed at phase 12).

---

## Goal Achievement

### Observable Truths (from ROADMAP success_criteria)

| #   | Truth                                                                                                       | Status        | Evidence                                                                                                                                                                                                                              |
| --- | ----------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Clicking any sidebar nav item shows a skeleton/loading UI within 50ms — no blank screen                     | ✓ VERIFIED    | All 7 authenticated routes have a `loading.tsx` (4 pre-existing + 3 new at projects/new, settings, settings/appearance). Next.js auto-wraps each in a Suspense boundary that streams the skeleton during navigation.                  |
| 2   | Dashboard, clients list, and project workspace stream progressively (layout + skeleton, then real data)     | ✓ VERIFIED    | `dashboard/page.tsx` wraps StatCards and ProjectList in independent `<Suspense>` boundaries. `projects/[id]/page.tsx` renders project header + Suspense-wrapped `ProjectTabs`. Clients page has a `loading.tsx` shell.                |
| 3   | Hovering a nav link prefetches the route so subsequent clicks feel instant                                  | ✓ VERIFIED    | `components/app-shell/sidebar.tsx` imports and renders `HoverPrefetchLink` for every NAV_ITEMS entry. Component toggles `prefetch={null}` on `onMouseEnter`.                                                                          |
| 4   | Company data and auth claims are not re-fetched on every page — short-lived cache                            | ✓ VERIFIED    | `lib/queries/auth.ts` exports `getAuthClaims` (React `cache()`) and `getCachedCompany` (`unstable_cache` 60s TTL, `'company'` tag). Layout + 4 pages import these. `revalidateTag('company')` wired into `updateCompanySettings`.    |
| 5   | Time-to-interactive drops from ~1s to under 300ms on a warm connection (DevTools-measurable)                 | ? UNCERTAIN   | All architectural ingredients in place (skeletons, cached helpers, Suspense streaming, hover prefetch). Actual TTI is a perceptual / network-timing metric that requires Chrome DevTools measurement in production build — see human verification. |

**Score:** 4/5 verified, 1 requires human measurement (perceptual metric, not statically verifiable)

### Required Artifacts

| Artifact                                           | Expected                                                            | Status     | Details                                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------ |
| `app/(app)/projects/new/loading.tsx`               | Skeleton shell matching wizard layout                               | ✓ VERIFIED | 17 lines, exports default `NewProjectLoading`, max-w-[700px] container + 4 skeletons |
| `app/(app)/settings/loading.tsx`                   | Skeleton shell matching settings cards                              | ✓ VERIFIED | 36 lines, exports `SettingsLoading`, 5 card skeletons + toggle rows                  |
| `app/(app)/settings/appearance/loading.tsx`        | Theme card skeleton                                                 | ✓ VERIFIED | 18 lines, exports `AppearanceLoading`, 3 theme button skeletons                      |
| `lib/queries/auth.ts`                              | `getAuthClaims` (cache), `getCachedCompany` (unstable_cache), AppCompany | ✓ VERIFIED | 36 lines, both exports present; uses service client inside unstable_cache (deviation explained in 17-02-SUMMARY) |
| `tests/unit/queries/auth.test.ts`                  | Smoke tests for both helpers                                        | ✓ VERIFIED | 3 tests pass via `npx vitest run`                                                    |
| `tests/unit/loading/loading-files.test.tsx`        | Smoke render tests for 3 new loading.tsx                            | ✓ VERIFIED | 3 tests pass                                                                         |
| `components/app-shell/hover-prefetch-link.tsx`     | Client component, hover-triggered prefetch                          | ✓ VERIFIED | 21 lines, `'use client'`, useState + onMouseEnter pattern                            |
| `components/app-shell/sidebar.tsx` (modified)      | Imports HoverPrefetchLink, replaces all NAV_ITEMS Links             | ✓ VERIFIED | Imports confirmed; NAV_ITEMS map renders `<HoverPrefetchLink>`                       |
| `app/(app)/layout.tsx` (modified)                  | Uses `getAuthClaims` + `getCachedCompany`                           | ✓ VERIFIED | Direct supabase.auth.getClaims/companies query removed; cached helpers in use       |
| `app/(app)/dashboard/page.tsx` (modified)          | Uses cached helpers + Suspense for stats / projects                  | ✓ VERIFIED | `getAuthClaims`, `getCachedCompany`, two `<Suspense>` boundaries, async sub-components |
| `app/(app)/clients/page.tsx` (modified)            | Uses cached helpers                                                  | ✓ VERIFIED | Imports `getAuthClaims`, `getCachedCompany` and uses both                            |
| `app/(app)/projects/new/page.tsx` (modified)       | Uses cached helpers + reads `company.industry`                      | ✓ VERIFIED | Imports both helpers; `INDUSTRIES.find((i) => i.id === company.industry)` works     |
| `app/(app)/settings/page.tsx` (modified)           | Uses `getAuthClaims` (keeps `getCompanySettings` for full record)   | ✓ VERIFIED | Plan-aligned: only claims call swapped, full company record still fetched for form  |
| `app/(app)/projects/[id]/page.tsx` (modified)      | Suspense around ProjectTabs after fast 404 check                    | ✓ VERIFIED | `getProjectById` awaited first, 6 promises kicked off, `<Suspense>` wraps ProjectTabs |
| `lib/actions/settings.ts` (modified)               | `revalidateTag('company')` after successful save                    | ✓ VERIFIED | Line 93: `;(revalidateTag as any)('company')` after successful Supabase update      |

### Key Link Verification

| From                                       | To                                | Via                                                | Status   | Details                                                                                                              |
| ------------------------------------------ | --------------------------------- | -------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| `app/(app)/layout.tsx`                     | `lib/queries/auth.ts`             | `import { getAuthClaims, getCachedCompany }`       | ✓ WIRED  | Both helpers awaited; result fed into Sidebar/Topbar props and onboarding redirect                                   |
| `app/(app)/dashboard/page.tsx`             | `lib/queries/auth.ts`             | Same import + use                                  | ✓ WIRED  | claims gate, company.id flows into `<DashboardStats companyId>` and `<DashboardProjects companyId>`                  |
| `app/(app)/clients/page.tsx`               | `lib/queries/auth.ts`             | Same import + use                                  | ✓ WIRED  | claims and company drive `getClients(supabase, company.id)` and prop into `<ClientList />`                           |
| `app/(app)/projects/new/page.tsx`          | `lib/queries/auth.ts`             | Same import + use                                  | ✓ WIRED  | `company.industry` resolves project types passed to `<NewProjectWizard />`                                            |
| `app/(app)/settings/page.tsx`              | `lib/queries/auth.ts`             | `getAuthClaims` import                              | ✓ WIRED  | Claims sub used to fetch full company via `getCompanySettings`; `<SettingsTabs company>` consumes the record         |
| `lib/actions/settings.ts`                  | `getCachedCompany` cache tag       | `revalidateTag('company')` after company update    | ✓ WIRED  | Line 93 fires immediately after successful update; cache hit returns refreshed data on next layout render            |
| `components/app-shell/sidebar.tsx`         | `hover-prefetch-link.tsx`          | Import + render in NAV_ITEMS map                    | ✓ WIRED  | Every NAV_ITEMS entry rendered via `<HoverPrefetchLink>` (default sidebar `<Link>` import replaced at top of file)   |
| `app/(app)/dashboard/page.tsx`             | `<Suspense>` + skeleton            | Two Suspense boundaries with explicit fallbacks    | ✓ WIRED  | Stat cards and project list each wrapped with their own skeleton fallback                                            |
| `app/(app)/projects/[id]/page.tsx`         | `<Suspense>` + ProjectWorkspaceSkeleton | One Suspense boundary after `notFound()` gate  | ✓ WIRED  | Project header rendered above Suspense; 6 promises passed into async ProjectTabs                                     |

### Data-Flow Trace (Level 4)

| Artifact                                | Data Variable          | Source                                                                | Produces Real Data | Status     |
| --------------------------------------- | ---------------------- | --------------------------------------------------------------------- | ------------------ | ---------- |
| `app/(app)/layout.tsx`                  | `claims`, `company`    | `getAuthClaims()` → Supabase JWT; `getCachedCompany()` → companies row | Yes (cached but real DB query) | ✓ FLOWING |
| `app/(app)/dashboard/page.tsx`          | `stats`, `projects`    | `getDashboardStats(supabase, companyId)` + `getProjects(...)`         | Yes (existing real queries, unchanged) | ✓ FLOWING |
| `app/(app)/projects/[id]/page.tsx`      | 6 workspace datasets   | `getProjectActivity / getProjectQuickStats / getProjectRecordings / getProjectPhotos / getCurrentEstimate / getProjectEstimates` | Yes | ✓ FLOWING |
| `components/app-shell/sidebar.tsx`      | NAV_ITEMS              | `./nav-items` static import                                           | Yes (static config — appropriate for nav) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior                                          | Command                                                                  | Result    | Status |
| ------------------------------------------------- | ------------------------------------------------------------------------ | --------- | ------ |
| Loading-skeleton smoke tests render               | `npx vitest run tests/unit/loading/`                                     | 3/3 pass  | ✓ PASS |
| Auth query smoke tests pass                       | `npx vitest run tests/unit/queries/auth.test.ts`                         | 3/3 pass  | ✓ PASS |
| TypeScript surface clean (excluding deferred blog)| `npx tsc --noEmit --skipLibCheck`                                        | Only the 2 pre-existing `blog-content.tsx` errors (tracked in deferred-items.md) | ✓ PASS |
| `revalidateTag('company')` in settings save      | grep `revalidateTag` in `lib/actions/settings.ts`                        | Line 93 confirmed inside `updateCompanySettings` | ✓ PASS |

### Requirements Coverage

No requirement IDs declared in plan frontmatter. ROADMAP.md mentions `PERF-01, PERF-02, PERF-03` for this phase, but those IDs are not present in `.planning/REQUIREMENTS.md`. Treated as "no formal requirements" per the user prompt. Phase coverage is therefore measured against the ROADMAP success criteria above.

### Anti-Patterns Found

None. Modified files contain no TODO/FIXME/placeholder markers, no empty handlers, no static-empty returns where data is expected. The `loading.tsx` files are deliberately static skeletons (correct usage of the Next.js convention, not stubs).

### Known Deferred Items

`components/blog/blog-content.tsx` has 2 pre-existing TS errors (missing `react-markdown`, `remark-gfm`). Documented in `.planning/phases/17-navigation-performance/deferred-items.md`. Out of scope for phase 17 — confined to phase 15 surfaces and unrelated to navigation performance.

### Human Verification Required

#### 1. End-to-end perceived navigation latency

**Test:**
1. `npm run build && npm start`
2. Log in as a real user, open Chrome DevTools → Network → throttle to "Fast 4G"
3. Navigate Dashboard → Clients → Projects/[id] → Settings → back to Dashboard
4. For each transition, observe: skeleton appears within ~50ms; meaningful content within ~300ms; no blank screen at any point

**Expected:**
- No blank-screen flashes between routes
- Skeleton paints almost immediately on click
- Stat cards on dashboard pop in independently of project list (visible streaming)
- Project workspace page header pops first; tabs stream in afterwards

**Why human:** Perceived latency, animation smoothness, and visual continuity are not statically measurable. Truth #5 (TTI under 300ms on warm connection) is a perceptual / DevTools-measured metric.

#### 2. Hover-prefetch network behaviour

**Test:**
1. Open Chrome DevTools → Network → filter by RSC (or `_rsc=`)
2. Hover over a sidebar nav item without clicking
3. Observe a single prefetch request fires
4. Click the same link

**Expected:**
- Hover triggers exactly one RSC prefetch request
- Subsequent click navigates without a second roundtrip (or with a cached payload)

**Why human:** Network panel observation cannot be scripted at the verification stage; needs a live browser session.

#### 3. revalidateTag end-to-end

**Test:**
1. Note the company name shown in the sidebar
2. Settings → change company name → Save
3. Navigate to Dashboard

**Expected:** Updated company name appears in the sidebar immediately (not after a 60-second wait)

**Why human:** Confirms the wired `revalidateTag('company')` actually invalidates the layout's `getCachedCompany` cache as intended; can only be observed in a real session with auth state.

### Gaps Summary

No structural gaps. All 9 must-have artifacts exist, are substantive, are wired into consumers, and produce real data. All key links verified. Test suite for the changes is green. The only outstanding item is the perceptual TTI measurement (truth #5), which is by nature a human / DevTools observation, not a static-verification concern.

Phase 17 is the final phase of milestone v1.3 (per ROADMAP.md). With automated verification fully green and only perceptual checks pending, the milestone can close once a maintainer runs the in-browser smoke described above.

---

_Verified: 2026-05-05T08:50:00Z_
_Verifier: Claude (gsd-verifier)_

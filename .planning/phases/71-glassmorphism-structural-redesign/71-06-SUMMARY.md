---
phase: 71
plan: 06
subsystem: dashboard-collections
tags: [glassmorphism, dashboard, collections, hero-zone, stat-cards, playwright-visual]
dependency_graph:
  requires:
    - "71-01 tokens (gradient-hero, gradient-brand, glass-bg-light, shadow-glow-brand)"
    - "71-02 primitive variants (Card variant=stat|glass, Button variant=primary)"
    - "71-05 app shell glass treatment (parallel — content surfaces only here)"
  provides:
    - "Dashboard hero zone with display headline + gradient-hero radial backdrop + primary CTA"
    - "4 stat cards using <Card variant=stat> + mono-font 3xl values + 3px gradient top border"
    - "Flat recent projects list (perf-gate compliant — no blur on list rows)"
    - "/clients + /projects display-scale headers + flat 40px-height list rows + primary 'New' CTA"
    - "/clients/[id] grouped info wrapped in <Card variant=glass> section cards"
    - "/projects/new wizard wrapped in <Card variant=glass max-w-2xl>"
    - "EmptyState with 48px gradient-brand circle icon + shadow-glow-brand (Pattern 6)"
    - "tests/e2e/visual/dashboard.spec.ts + collections.spec.ts (auth-fixture gated, skip-clean)"
  affects:
    - "All authenticated content surfaces visible to a paying user post-login"
    - "Downstream 71-07 (projects/[id] workspace) builds on collections list patterns"
tech_stack:
  added: []
  patterns:
    - "Hero pattern: relative isolate + absolute -z-10 gradient-hero backdrop layer (RESEARCH-confirmed recipe from 71-02 downstream notes)"
    - "Stat card: 3px gradient-brand top edge via Card variant=stat (consumes 71-02 CVA)"
    - "Flat list rows: divide-y border bg-card with hover bg-[var(--glass-bg-light)] — NO backdrop-blur (perf gate)"
    - "Display-scale headers: clamp(28px,3.5vw,40px) on collection H1s; clamp(36px,5vw,56px) on dashboard hero H1"
    - "Mono numerics: font-mono text-3xl tabular-nums on stat values per UI-SPEC typography contract"
    - "EmptyState gradient circle icon: gradient-brand bg + shadow-glow-brand on 48px rounded-full container"
key_files:
  created:
    - tests/e2e/visual/dashboard.spec.ts
    - tests/e2e/visual/collections.spec.ts
  modified:
    - app/(app)/dashboard/page.tsx
    - app/(app)/clients/page.tsx
    - app/(app)/clients/[id]/page.tsx
    - app/(app)/projects/page.tsx
    - app/(app)/projects/new/page.tsx
    - components/dashboard/stat-card.tsx
    - components/dashboard/stat-cards.tsx
    - components/dashboard/empty-state.tsx
    - components/clients/client-list.tsx
    - components/clients/client-new-project-button.tsx
decisions:
  - "Dashboard greeting derives first name from company.owner_name split — falls back to company.name when owner_name is null; copy 'Welcome back, {firstName}' is new but UI-SPEC explicitly leaves dashboard greeting to planner discretion (existing dashboard had only static 'Dashboard' title)"
  - "Recent projects section kept FLAT per UI-SPEC perf gate ('NOT glass for density') — only the hero zone backdrop + stat cards consume glass on /dashboard"
  - "/projects list row height tightened from py-4 (~56px) to h-10 (40px) for Linear-density per UI-SPEC; hover uses glass-bg-light overlay (still no blur)"
  - "/clients ClientList retains existing Table-based desktop layout (flat, dense, perf-friendly) — only the header H1 + 'Add Client' CTA promoted to display scale + primary variant; tables don't get glass treatment per perf gate"
  - "/clients/[id] wraps client-info AND projects sections in <Card variant=glass> — UI-SPEC Settings contract says 'grouped info gets glass section cards', detail page is the closest equivalent on the collections side"
  - "/projects/new wizard centered in max-w-2xl glass card per UI-SPEC pattern (form surface)"
  - "Stat values switched from text-2xl font-bold to font-mono text-3xl tabular-nums — UI-SPEC explicitly requires mono for numerics + Display 32px for stat values"
  - "EmptyState gradient circle replaces flat muted icon — applies to BOTH dashboard empty state AND projects empty state via shared component (single edit, two surfaces benefit)"
  - "Visual baselines NOT minted this plan — /dashboard, /clients, /projects all gated by auth and the authenticated-state.json fixture from 71-05 RED is a stub; specs skip cleanly with informative test.skip messages until fixture is wired (matches 71-02 + 71-05 deferral pattern)"
metrics:
  duration_seconds: 1320
  tasks_completed: 4
  files_created: 2
  files_modified: 10
  tests_added: 0
  tests_passing: 72
  completed: "2026-05-17T16:00:00Z"
---

# Phase 71 Plan 06: Dashboard + Collections Glass Redesign Summary

Restyle every authenticated content surface a logged-in user sees first — `/dashboard` hero zone with gradient-hero backdrop + 4 stat cards (3px gradient top edges, mono numerics), `/clients` + `/projects` list pages with display-scale headers + dense flat rows + primary CTAs, `/clients/[id]` grouped info in glass section cards, `/projects/new` wizard in a centered glass card — all while preserving Suspense streaming + skeletons (Phase 17) and respecting the hard perf gate (no blur on list rows).

## What Was Built

### Dashboard (`app/(app)/dashboard/page.tsx`)

Three-zone vertical layout:

1. **Hero zone** — `relative isolate` container with absolute `-z-10 gradient-hero` backdrop (radial-gradient from token). Display headline `clamp(36px, 5vw, 56px)` reading "Welcome back, {firstName}", subtitle muted, primary CTA `<Button variant="primary" size="lg">` linking to `/projects/new`. Vertical padding `clamp(48px,8vw,96px)` top, 12 bottom.
2. **4 stat cards** — section-wrapped grid `1/2/4 cols` (sm/md/lg breakpoints), each `<StatCard>` uses `<Card variant="stat">` with `min-h-[120px]`. Icons in muted, label in uppercase 12px tracking, value in `font-mono text-3xl tabular-nums`.
3. **Recent projects** — flat list (existing `<ProjectList>` rendered after H2 `Recent projects` heading). No glass on rows per perf gate.

Suspense boundaries preserved on stats + project list; skeletons updated to render `h-[120px]` placeholders that match the new stat card shape and proper grid spacing.

### Stat card primitive (`components/dashboard/stat-card.tsx`)

- Migrated from `<Card>` default + `<CardContent>` wrapping to `<Card variant="stat" className="p-6 min-h-[120px]">` (consumes 71-02 CVA).
- Icon is now 4×4 (was 5×5) sitting next to a muted 12px uppercase label.
- Value typography: `font-mono text-3xl tabular-nums leading-none` (was `text-2xl font-bold`).
- New optional `delta` prop renders `text-sm text-emerald-500` row beneath the value — not yet populated by `<StatCards>` (data layer doesn't compute deltas) but available for downstream wiring.

### Empty state (`components/dashboard/empty-state.tsx`)

- 48px gradient-brand circle replaces the flat muted icon (Pattern 6 from UI-SPEC).
- `shadow-glow-brand` accent on the circle.
- Action button now uses `variant="primary"` (was default) for both `actionHref` and `onAction` paths.
- "Clear filters" ghost button preserved.

This change cascades to every consumer: dashboard empty state, projects empty state, clients empty state, client-detail "no projects" state, and search-result empty states.

### `/clients/page.tsx` + `/components/clients/client-list.tsx`

- Page wrapper gained `px-6 py-8` outer padding (was only `space-y-6`).
- Header H1 promoted to `clamp(28px, 3.5vw, 40px)` semibold display scale (was `text-2xl font-bold`).
- "Add Client" button promoted to `<Button variant="primary">` (was default).
- Empty-state H1 also promoted to display scale for parity.
- Existing desktop table + mobile card list preserved unchanged (flat surfaces — perf gate).

### `/projects/page.tsx`

- Page-level `px-6 py-8` wrapper.
- H1 promoted to `clamp(28px, 3.5vw, 40px)` display scale.
- "New project" CTA migrated to `<Button variant="primary">`.
- List rows compacted from py-4 (~56px) to `h-10` (40px Linear density per UI-SPEC).
- Hover state migrated from `bg-accent/50` to `bg-[var(--glass-bg-light)]` glass-overlay token.
- Empty state replaced with `<EmptyState>` component (gradient circle icon + primary CTA via the new EmptyState).

### `/projects/new/page.tsx`

- Wizard wrapped in `<Card variant="glass" className="max-w-2xl mx-auto p-8">` (was bare `max-w-[700px]` div).

### `/clients/[id]/page.tsx`

- Page wrapper gained `px-6 py-8`.
- Client info card promoted from default `<Card>` to `<Card variant="glass">`.
- Client name H1 promoted to `clamp(24px, 3vw, 32px)` semibold.
- "Projects" sub-section wrapped in its own `<Card variant="glass">` with H2 `text-xl tracking-tight`.
- Inner desktop table / mobile cards inside the glass section preserved as flat surfaces.
- `<ClientNewProjectButton>` promoted to `variant="primary"`.

### Visual specs (`tests/e2e/visual/dashboard.spec.ts`, `collections.spec.ts`)

- Same pattern as `auth.spec.ts` (71-04) and the app-shell spec (71-05): viewport × lang matrix, `freezeAnimations`, `setLang` via `eb-language` cookie.
- Dashboard: 3 viewports × 2 langs (en/pt — ES skipped per parity with shell spec, see Decisions).
- Collections: 3 viewports × 2 langs × 3 paths (`/clients`, `/projects`, `/projects/new`).
- Both skip cleanly when the test session is unauthenticated (URL no longer matches the requested path → `test.skip` with informative message). Baselines mint automatically once the authenticated-state fixture is fully wired by a downstream wave.

## Verification

- `bun run test tests/unit/components/` → **72/72 passing** (3 todo; same as 71-02 baseline — no regressions)
- `bunx tsc --noEmit` filtered to plan-71-06 scope (`app/(app)/{dashboard,clients,projects}/**`, `components/{dashboard,clients/client-list,clients/client-new-project-button}.tsx`) → **zero errors**
- `grep -c 'variant="stat"' app/(app)/dashboard/page.tsx components/dashboard/stat-card.tsx` → 1 (in StatCard primitive, consumed by 4 cards via `<StatCards>` loop)
- `grep -rn 'variant="primary"' app/(app)/clients/ app/(app)/projects/ components/clients/` → 3 matches (projects/page header CTA, ClientList Add CTA, ClientNewProjectButton)
- `grep -n 'gradient-hero' app/(app)/dashboard/page.tsx` → 1 match (hero backdrop layer)
- `grep -n 'glass-bg-light' app/(app)/projects/page.tsx` → 1 match (row hover)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Critical] EmptyState gradient accent applied centrally instead of per-page**
- **Found during:** Task 3 (collections /projects empty state)
- **Issue:** Plan task 2 only mentions adding gradient accent to dashboard EmptyState, but the same `<EmptyState>` component is used across 5 surfaces (dashboard projects empty, projects list empty, projects-search empty, clients list empty, clients-search empty, client-detail no-projects). Leaving 4 of 5 surfaces with flat icons would have created visible inconsistency.
- **Fix:** Updated `components/dashboard/empty-state.tsx` once → cascades to all consumers. Promoted the action button to `variant="primary"` at the same time (UI-SPEC Pattern 6 specifies primary CTA for empty states).
- **Files modified:** `components/dashboard/empty-state.tsx`
- **Commit:** `abba753`

**2. [Rule 1 - Bug] `<header>` semantic element instead of `<div>` on collection page headers**
- **Found during:** Task 3 review
- **Issue:** Original `<div className="flex items-center justify-between">` is semantically wrong for a page title + primary action bar at the top of a route. Display-scale typography needs a corresponding `<header>` landmark for screen readers.
- **Fix:** Replaced the title-bar `<div>` with `<header>` on both `/projects/page.tsx` and `<ClientList>`.
- **Files modified:** `app/(app)/projects/page.tsx`, `components/clients/client-list.tsx`
- **Commit:** `6460f34`

## Authentication Gates

None — fully autonomous execution. The visual specs themselves report an "auth fixture not yet available" skip when the dev server doesn't have an authenticated session, but this is the same Wave-0 gap noted by 71-02 and 71-05 and is expected.

## Commits

| # | Hash      | Type | Subject |
|---|-----------|------|---------|
| 1 | `de99c77` | test | add @visual dashboard + collections specs (RED, auth-fixture gated) |
| 2 | `abba753` | feat | dashboard hero zone + stat cards (variant=stat) + gradient empty state |
| 3 | `6460f34` | feat | collections list pages + client detail glass restyle |

Task 4 had no source changes (baselines deferred until auth fixture lands — verified by examining the spec's skip path).

## Downstream Notes for 71-07..71-10

1. **Stat card pattern** is consumed via `<Card variant="stat">` + `p-6 min-h-[120px]` + value in `font-mono text-3xl tabular-nums`. Reuse this exact recipe for billing tier metrics (71-09) and any admin dashboard metrics (71-10).
2. **Hero zone pattern** = `relative isolate px-6 pt-[clamp(48px,8vw,96px)] pb-12` with sibling `<div aria-hidden className="absolute inset-0 -z-10 gradient-hero" />`. Estimate share page (71-09) and settings/billing top (71-09) should reuse exactly this; landing already has its own hero from 71-03.
3. **Flat-list-with-glass-hover** = `divide-y divide-border rounded-lg border border-border bg-card overflow-hidden` + row hover `bg-[var(--glass-bg-light)] transition-colors`. Reuse for any list >10 rows where perf matters (estimate editor rows, settings entries).
4. **Display headers on routes** = `<header>` element + `<h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-[-0.02em] leading-[1.1]">`. Settings sub-pages (71-09) and admin pages (71-10) should match this scale.
5. **EmptyState component** now ships with primary CTA + gradient circle icon — no per-consumer customization needed. Just pass `icon`, `title`, `description`, `actionLabel`, `actionHref`/`onAction`.
6. **Auth fixture is a downstream blocker** for baseline minting on /dashboard, /clients, /projects, /projects/new. The first plan that wires `tests/e2e/fixtures/authenticated-state.json` with a real session unlocks 30+ baseline snapshots across this plan + 71-05 + 71-04 onboarding.

## Known Stubs

None. All four content surfaces render real data through their existing query layer (`getDashboardStats`, `getProjects`, `getClients`, `getClientProjects`); no placeholder values, no hardcoded empty arrays, no "coming soon" text introduced.

The optional `delta` prop on `<StatCard>` is documented as a forward-compatible hook for future delta-percent computation but is not yet wired by `<StatCards>` — this is intentional API surface, not a stub. The card renders correctly with `delta` undefined.

## Self-Check: PASSED

Files verified on disk:
- `tests/e2e/visual/dashboard.spec.ts` (created, 40 lines)
- `tests/e2e/visual/collections.spec.ts` (created, 38 lines)
- `app/(app)/dashboard/page.tsx` (modified, +50/-35 lines)
- `app/(app)/clients/page.tsx` (modified)
- `app/(app)/clients/[id]/page.tsx` (modified)
- `app/(app)/projects/page.tsx` (modified, rewritten with EmptyState + 40px rows)
- `app/(app)/projects/new/page.tsx` (modified)
- `components/dashboard/stat-card.tsx` (modified)
- `components/dashboard/stat-cards.tsx` (modified)
- `components/dashboard/empty-state.tsx` (modified, gradient circle + primary CTA)
- `components/clients/client-list.tsx` (modified)
- `components/clients/client-new-project-button.tsx` (modified)

Commits verified in `git log`:
- `de99c77` — test(71-06) RED visual specs
- `abba753` — feat(71-06) dashboard restyle
- `6460f34` — feat(71-06) collections restyle

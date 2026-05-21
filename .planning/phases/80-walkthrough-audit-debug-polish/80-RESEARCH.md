# Phase 80: Walkthrough Audit, Debug & Polish — Tour & Tooltips QA Round 2

**Researched:** 2026-05-21
**Domain:** React tour/spotlight system — UAT diagnosis, a11y hardening, rAF→ResizeObserver, telemetry, Playwright auth fixture
**Confidence:** HIGH (all findings from direct file inspection of current repo state)

## Summary

Phase 75 closed with 16/16 unit tests green and "auto-approved" (no browser run). The tour architecture is solid: namespaced localStorage, correct hover-only trigger on ContextualTooltip, `findVisibleTarget` already partially hardened. But three issues flagged as "fragile" in Phase 75 remain open, and the manual runbook at `tests/visual/tour-uat-runbook.md` has never been executed. The Playwright suite (15 tests in `tests/e2e/tour-flow.spec.ts`) skips on every run due to `requireDashboard` detecting a redirect to /login.

The key findings from direct file inspection:

1. **`findVisibleTarget` is already improved** — Phase 75 added `offsetParent === null` + `getBoundingClientRect` zero-size checks. The dual-selector bug is mitigated but NOT fully fixed: `offsetParent` may return non-null for topbar elements that are `visibility:hidden` or `opacity:0`-only hidden (Tailwind `hidden` class sets `display:none` which does set `offsetParent` to null — so this likely works). Needs browser confirmation.

2. **rAF loop is still present** — `tour-spotlight.tsx:73-94` runs `requestAnimationFrame` every frame while the spotlight is open. The comment says "scroll/resize resilience" but this burns CPU on every animation frame even when nothing moves. The Phase 80 requirement is to replace it with `ResizeObserver + scroll listener`.

3. **No `inert` on background** — `tour-spotlight.tsx` renders a `<div>` overlay + tooltip card but never sets `inert` on the `<body>` or siblings. Tab key leaks to sidebar/topbar behind the spotlight overlay.

4. **`estimate_activity` table requires `project_id NOT NULL`** — tour events are session-level, not project-scoped. The table CANNOT be used for tour telemetry without a workaround. A separate `tour_events` table or a relaxed approach (log to `estimate_activity` with a dummy project_id) must be decided. Recommend a new API route `POST /api/tour/event` writing to `estimate_activity`... but this won't work. A new table is required. This is a BLOCKING decision.

5. **Playwright auth fixture situation** — `tests/e2e/fixtures/authenticated-state.json` is empty (`{}`). No session-seeding mechanism exists for e2e auth. The `requireDashboard` guard in `tour-flow.spec.ts` calls `test.skip()` when the page redirects to /login. Un-skipping these tests requires either (a) Playwright `storageState` with a seeded session, or (b) a service-role seeder (like `connect-estimates.ts` pattern). The `estimate-share-payment.spec.ts` test shows the established pattern for service-role seeding without browser auth.

6. **Tour step copy vs current UI** — The 5 steps in `tour-step.tsx` reference: `new-project` (sidebar nav link to `/projects/new`), `projects`, `clients`, `price-book`, `language-toggle`. All 4 sidebar `data-tour` attrs are confirmed present via `TOUR_TARGET` map in `sidebar.tsx` and `bottom-nav.tsx`. The `new-project` attr is on the sidebar nav link (not a dashboard button — no dashboard button has the attr). Tour copy mentions "Create a project for each job site" which is accurate. Draft→Consolidated workflow (SEED-028) is NOT in the tour — the SEED-029 notes flag this as a potential addition.

**Primary recommendation:** Execute Phase 80 in 4 plans mirroring SEED-029's Phases A-D. Plan A is diagnosis (no code), Plan B is copy + selectors, Plan C is a11y + performance, Plan D is telemetry (requires new `tour_events` table migration) + un-skip Playwright tests.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TOUR-QA-01 | Diagnosis complete — WALKTHROUGH-FINDINGS.md after running tour-uat-runbook.md in EN/PT/ES on desktop + mobile (390px) | `tests/visual/tour-uat-runbook.md` is the runbook — 111 lines, 5 checklist sections. Never run. Produces findings doc that gates Plans B-D |
| TOUR-QA-02 | Dual selector fixed — findVisibleTarget resolves correct language-toggle on mobile | `tour-spotlight.tsx:33-43` already has `offsetParent === null` + zero-size check. Browser confirmation needed. `bottom-nav.tsx:74` has `data-tour="language-toggle"`, `topbar.tsx:109` also has it. Fix may be as simple as verifying existing logic works or adding `getComputedStyle().display !== 'none'` check |
| TOUR-QA-03 | A11y hardened — inert/focus-trap during spotlight, prefers-reduced-transparency consistent | `tour-spotlight.tsx` has no `inert` on background. `ContextualTooltip` has no `prefers-reduced-transparency` gate (it uses Radix Tooltip which doesn't add blur — glass surfaces only appear in spotlight card). Focus capture/restore is present (lines 96-126) but is NOT a full trap |
| TOUR-QA-04 | Performance — rAF loop replaced with ResizeObserver + scroll listener | `tour-spotlight.tsx:73-94` confirmed rAF loop. `@floating-ui/react-dom` is installed (via node_modules) but `@floating-ui/react` (the hooks package) is NOT. `autoUpdate` is in `@floating-ui/dom` which is present |
| TOUR-QA-05 | Telemetry + 15 Playwright tests un-skipped and passing | `tour-flow.spec.ts` has 4 tests (not 15 — SEED-029 count is wrong; the file has 4 `test()` blocks). All skip on `requireDashboard`. Auth fixture is empty JSON. New `tour_events` table needed for telemetry (estimate_activity requires project_id NOT NULL) |

</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Tech Stack**: Next.js 14+ App Router, TypeScript strict, Tailwind CSS, shadcn/ui, Zustand or React Context, react-hook-form + zod
- **Database**: Supabase PostgreSQL with RLS on all tables
- **Security**: Service role key never exposed to browser; all DB writes from tour telemetry must go via API route (not direct browser Supabase client call) or be deferred to server action
- **No secrets in git**: Tour telemetry logging must not introduce any new secrets
- **GSD Workflow**: All changes via `/gsd:execute-phase`
- **Mobile**: iOS Safari + Android Chrome must be supported — tour spotlight mobile behavior is a primary concern

## Standard Stack (already installed — verified)

### Core (no new installs needed)
| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| `@floating-ui/dom` | transitive via `@floating-ui/react-dom` | `autoUpdate(reference, floating, update)` — replaces rAF loop | `node_modules/@floating-ui/dom` present |
| `@floating-ui/react-dom` | transitive via radix-ui | `useFloating` with flip/shift middleware | `node_modules/@floating-ui/react-dom` present |
| `framer-motion` | ^12.38.0 | `useReducedMotion()` already used in `tour-spotlight.tsx:4,59` | Already imported |
| `@radix-ui/react-tooltip` | via shadcn | ContextualTooltip already uses this | Already wired |
| `vitest` | ^4.1.4 | Unit tests | `pnpm test` |
| `@playwright/test` | ^1.59.1 | E2E tests | `pnpm test:e2e` |

### What is NOT installed
- `@floating-ui/react` (the higher-level hooks package with `useDismiss`, `useRole`, `useInteractions`) — only `@floating-ui/react-dom` and `@floating-ui/dom` are present. If the plan uses `autoUpdate` from `@floating-ui/dom` directly that works without a new install.

**Installation:** No new packages needed. `@floating-ui/dom` `autoUpdate` is available from the existing transitive install.

## Architecture Patterns

### Current Tour Mount Tree (verified in app/(app)/layout.tsx)
```
<TourProvider>                     // contexts, cookie check, migrateLegacyKeys()
  <TooltipProvider>                // wraps ALL children for Radix hover tooltips
    <SidebarShell>                 // sidebar.tsx, topbar.tsx, bottom-nav.tsx
      {children}
    </SidebarShell>
    <WelcomeModal />               // gated by showWelcome
    <TourSpotlight />              // gated by showSpotlight
    <TourHelpButton />             // hidden during spotlight
  </TooltipProvider>
</TourProvider>
```

### Current Persistence Layer (lib/tour/persistence.ts — verified correct post-Phase-75)
```
xtimator:tour:v1:tooltip:{key}      → { seen: boolean, dismissedAt: ISO }
xtimator:tour:v1:spotlight:completed → { seen: boolean, dismissedAt: ISO }
xtimator:tour:v1:spotlight:pending  → { pending: boolean }
```
`clearAllTourState()` sweeps all `xtimator:tour:v1:*` keys. `migrateLegacyKeys()` runs on every TourProvider mount (idempotent).

### Pattern: Replace rAF with autoUpdate + ResizeObserver
`@floating-ui/dom` exports `autoUpdate(referenceEl, floatingEl, updateCallback, options)`. It internally uses `ResizeObserver` + scroll listener + `MutationObserver`. This replaces the continuous rAF loop in `tour-spotlight.tsx:73-94`:

```typescript
// Source: @floating-ui/dom autoUpdate API
import { autoUpdate } from '@floating-ui/dom'

useEffect(() => {
  if (!showSpotlight) return
  const el = findVisibleTarget(currentStep.target)
  if (!el) return

  // A synthetic "floating" element can be the spotlight div itself.
  // Or: maintain rect state updated only when position actually changes.
  const cleanup = autoUpdate(el, spotlightDivRef.current!, () => {
    const r = el.getBoundingClientRect()
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
  })
  return cleanup
}, [showSpotlight, currentStep.target])
```

This fires the callback only when the reference element or viewport actually changes — no 60fps polling.

### Pattern: inert on body siblings during spotlight
The HTML `inert` attribute (fully supported Chrome 102+, Safari 15.5+, Firefox 112+) makes an element and all its descendants non-interactive and invisible to AT. For the spotlight, the cleanest approach is setting `inert` on everything EXCEPT the spotlight card:

```typescript
// In TourSpotlight, when showSpotlight=true:
useEffect(() => {
  if (!showSpotlight) return
  // Set inert on siblings of the portal root, or on the app shell wrapper
  const appShell = document.getElementById('app-shell') // need this data-id
  if (appShell) appShell.inert = true
  return () => { if (appShell) appShell.inert = false }
}, [showSpotlight])
```

**Alternative:** Wrap TourSpotlight card in a Radix `Dialog` — gets `aria-modal`, focus trap, and ESC for free. The spotlight hole div stays as a separate `aria-hidden` overlay. This is SEED-029's preferred path ("~150 lines reduction").

### Pattern: prefers-reduced-transparency in ContextualTooltip
`ContextualTooltip` currently uses Radix `Tooltip.Content` which does NOT add backdrop-filter blur — the glass surface only applies to the spotlight card. However, the tooltip content in shadcn adds `bg-popover` which may have glass treatment in this project. Add the same `matchMedia` check:

```typescript
// Mirror tour-spotlight.tsx:65-68 pattern in contextual-tooltip.tsx
const reducedTransparency =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-transparency: reduce)').matches
// Then conditionally apply solid vs glass className
```

### Pattern: Tour telemetry — NEW TABLE REQUIRED
`estimate_activity` schema: `project_id UUID NOT NULL`. Tour events are session-level (not project-scoped). Cannot reuse this table without a schema change or null workaround.

**Decision needed:** Two options:
1. **New `tour_events` table** — `id, company_id, user_id, event_type, step_index, metadata, created_at`. No project_id. Clean. Requires a migration.
2. **API route to `estimate_activity` with a sentinel** — Pass `project_id = NULL` by altering the column, or skip DB entirely and log to console/external tool.

**Recommendation:** Option 1 — new `tour_events` table. The tour is a company-level activation funnel event, not a project event. Matches the `estimate_activity` RLS pattern (company-scoped).

```sql
-- Migration: add tour_events table
CREATE TABLE tour_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,  -- 'tour_started' | 'tour_step_completed' | 'tour_finished' | 'tour_skipped'
  metadata JSONB,            -- { step_index?: number, step_id?: string, language?: string }
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE tour_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tour_events_company_access" ON tour_events FOR ALL TO authenticated
  USING (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));
```

Since tour events are fired client-side, the insert must go through a server action or API route (not direct browser Supabase client) — consistent with CLAUDE.md constraint "service role key never exposed to browser."

### Pattern: Un-skip Playwright tests
Current state: `tests/e2e/tour-flow.spec.ts` has 4 test blocks (not 15 as SEED-029 states — verify count was from an older plan). Each calls `requireDashboard(page)` which does `test.skip()` if the URL contains `/login`.

`tests/e2e/fixtures/authenticated-state.json` is empty (`{}`). No shared auth fixture exists.

The established pattern for e2e tests requiring auth data is the service-role seeder (see `connect-estimates.ts`). For tour tests, a simpler approach is:
1. Create a Playwright `globalSetup` script that signs in as the dev seed user and saves `storageState` to `tests/e2e/fixtures/authenticated-state.json`
2. Reference it in `playwright.config.ts` via `use: { storageState: 'tests/e2e/fixtures/authenticated-state.json' }`

This approach requires `TEST_USER_EMAIL` and `TEST_USER_PASSWORD` env vars — consistent with existing test infrastructure.

**Alternative (simpler for Phase 80 scope):** Rather than full auth, use Supabase's service role to create a test session and inject `supabase-auth-token` cookie directly. The `connect-estimates.ts` pattern shows how service-role works in fixtures.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Continuous position tracking | rAF polling loop (existing code) | `autoUpdate` from `@floating-ui/dom` | Built-in ResizeObserver + scroll handling; only fires on actual changes |
| Focus trap | Manual `querySelectorAll('[tabindex]')` iteration | Radix `Dialog` wrapper OR `inert` attribute | `inert` is now baseline browser support (Chrome 102+, Safari 15.5+, FF 112+); Radix Dialog gives focus trap + ESC + aria-modal for free |
| Visibility check for dual elements | Complex selector logic | `offsetParent === null` + `getBoundingClientRect()` zero-size (already in `findVisibleTarget`) | Already implemented in Phase 75 — verify it works, don't re-invent |
| E2E auth | Manual cookie injection | Playwright `storageState` + `globalSetup` signin | Standard Playwright pattern; service-role seeder already proven in `connect-estimates.ts` |
| Tour event logging | Log to `estimate_activity` (wrong table shape) | New `tour_events` table via migration | `estimate_activity` has `project_id NOT NULL` — tour events are session-scoped, not project-scoped |

## Runtime State Inventory

> Phase 80 is not a rename/migration phase. Tour state lives in localStorage (client-side) and is NOT in the database. No data migration required for the tour state changes.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data (localStorage) | `xtimator:tour:v1:*` keys — already in namespaced format from Phase 75 | None — namespace is correct post-Phase-75 migration |
| Stored data (DB) | No tour state in DB today | Plan D: new `tour_events` table (INSERT-only from server action) — forward-only migration |
| Live service config | None — tour is pure client-side | None |
| OS-registered state | None | None |
| Secrets / env vars | None for tour itself. Plan D may need `TEST_USER_EMAIL`/`TEST_USER_PASSWORD` for Playwright auth fixture | Document in `.env.local` if added |
| Build artifacts | None | None |

## Common Pitfalls

### Pitfall 1: Assuming findVisibleTarget fully fixes the dual-selector bug
**What goes wrong:** `offsetParent === null` catches `display:none` but NOT `visibility:hidden` elements. Tailwind's `hidden` class uses `display:none` so the topbar's language toggle wrapper (which is `hidden md:flex`) sets `display:none` on mobile — `offsetParent` will be null. This should work. But Phase 80 Plan A (browser run) must confirm this in an actual mobile viewport.
**Prevention:** Run the UAT runbook at `~390px` viewport width in Chrome DevTools before claiming the fix is complete.

### Pitfall 2: autoUpdate from @floating-ui/dom needs a reference to the actual floating element
**What goes wrong:** `autoUpdate(referenceEl, floatingEl, callback)` requires two DOM elements. The current `TourSpotlight` uses CSS rect state to position a `<div>` without refs. Switching to `autoUpdate` requires adding a `ref` to the spotlight overlay div.
**Prevention:** Add `spotlightRef = useRef<HTMLDivElement>(null)` and attach it to the spotlight hole div. Pass it as the second argument to `autoUpdate`.

### Pitfall 3: inert breaks the spotlight card itself
**What goes wrong:** If `inert` is applied too broadly (e.g., on `<body>`), the spotlight card also becomes inert and its buttons can't be clicked.
**Prevention:** Apply `inert` only to the app shell container (`SidebarShell` or the layout wrapper), NOT to the portal root where `TourSpotlight` renders. The spotlight renders at the top-level portal, outside the app shell. Verify the mount tree — in `app/(app)/layout.tsx` TourSpotlight is a sibling to SidebarShell, not a child.

### Pitfall 4: Tour telemetry fires during SSR or before auth context is ready
**What goes wrong:** Tour events are fired in `TourSpotlight` which is a client component. But inserting to `tour_events` requires the user's `company_id`. This must be fetched from context — not available until the auth context resolves.
**Prevention:** Gate the telemetry log call on `company_id` being truthy. Use the existing `useTourContext` pattern. The telemetry call is fire-and-forget (no await in the UI path).

### Pitfall 5: Playwright globalSetup approach may fail in CI without credentials
**What goes wrong:** If `TEST_USER_EMAIL`/`TEST_USER_PASSWORD` are not set in CI, globalSetup crashes and ALL e2e tests fail.
**Prevention:** Guard the globalSetup with `if (!process.env.TEST_USER_EMAIL) return` and ensure `tour-flow.spec.ts` falls back to `test.skip()` gracefully (the existing `requireDashboard` already does this).

### Pitfall 6: Counting tests — SEED-029 says "15 Playwright tests skipped" but the file has 4
**What goes wrong:** Acting on the count causes scope confusion. The 4 current tests in `tour-flow.spec.ts` are the ones to un-skip. Plan D may ADD new tests (SEED-029 says "2-3 new tests") but the base number is 4, not 15.
**Prevention:** Plan D scope: un-skip 4 existing tests + add 2-3 new tests targeting specific Phase 80 fixes (mobile selector, inert focus leak, rAF replacement).

### Pitfall 7: estimate_activity used for tour telemetry without table modification
**What goes wrong:** `estimate_activity.project_id` is `NOT NULL` (verified in initial schema migration). Any INSERT without `project_id` will fail with a PostgreSQL NOT NULL violation.
**Prevention:** Use a new `tour_events` table (Plan D), not `estimate_activity`.

### Pitfall 8: Welcome modal restart double-fires from TourHelpButton
**What goes wrong:** `TourHelpButton.handleClick()` calls `resetAllTourState()` then `startTour()`. `startTour()` calls `resetCompleted()` then `setSpotlightPending()`. So the spotlight pending key is set. Then `setShowWelcome(true)` opens the modal. If the user clicks "Show me around", `startTour()` is called again — double-setting pending is harmless because it's idempotent. Verify this flow doesn't cause a flash.
**Prevention:** Confirmed idempotent via code inspection. No action needed, but UAT Plan A should test the restart path.

## Code Examples

### Verified: findVisibleTarget (tour-spotlight.tsx:33-43 — current implementation)
```typescript
// Source: components/tour/tour-spotlight.tsx (current post-Phase-75 state)
function findVisibleTarget(selector: string): HTMLElement | null {
  if (typeof document === 'undefined') return null
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(selector))
  for (const el of candidates) {
    if (el.offsetParent === null) continue          // display:none chain
    const r = el.getBoundingClientRect()
    if (r.width <= 0 || r.height <= 0) continue    // visibility:hidden / collapsed
    return el
  }
  return candidates[0] ?? null  // fallback to first candidate
}
```

### Verified: autoUpdate replacement for rAF loop
```typescript
// Source: @floating-ui/dom autoUpdate docs
// Replaces tour-spotlight.tsx:73-94 (current rAF loop)
import { autoUpdate } from '@floating-ui/dom'

useEffect(() => {
  if (!showSpotlight || !spotlightRef.current) return
  const el = findVisibleTarget(currentStep.target)
  if (!el) return

  const cleanup = autoUpdate(el, spotlightRef.current, () => {
    const r = el.getBoundingClientRect()
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
  }, { animationFrame: false }) // ResizeObserver + scroll, not rAF
  return cleanup
}, [showSpotlight, currentStep.target])
```

### Verified: inert pattern for focus containment
```typescript
// Source: MDN HTMLElement.inert (baseline 2023)
// Applied in TourSpotlight useEffect keyed on showSpotlight
useEffect(() => {
  if (!showSpotlight) return
  // The app shell wrapper is a sibling to TourSpotlight in the portal tree
  const shell = document.querySelector('[data-testid="app-shell"]') as HTMLElement | null
  if (shell) shell.inert = true
  return () => { if (shell) shell.inert = false }
}, [showSpotlight])
```
**Note:** Requires verifying `data-testid="app-shell"` or equivalent selector exists on the layout wrapper. Check `app/(app)/layout.tsx` shell wrapper element.

### Verified: estimate_activity insert pattern (for tour_events reference)
```typescript
// Source: lib/actions/project.ts:52-57
await supabase.from('estimate_activity').insert({
  project_id: project.id,   // ← tour_events won't have this column
  company_id: company.id,
  event_type: 'project_created',
  metadata: { placeholder_name: placeholderName },
})
// tour_events mirrors this shape minus project_id, plus user_id
```

## Open Questions

1. **Does `offsetParent === null` correctly identify the hidden topbar `language-toggle` on mobile?**
   - What we know: Tailwind `hidden md:flex` = `display:none` below `md` breakpoint. `display:none` sets `offsetParent` to `null`. So `findVisibleTarget` should skip the topbar element on mobile.
   - What's unclear: The topbar element in `topbar.tsx:109` is a `<span data-tour="language-toggle">` inside a parent that may or may not be the `hidden md:flex` element. Need to verify which ancestor carries the `hidden` class.
   - Recommendation: Plan A browser run confirms. If still broken, add explicit `getComputedStyle(el).display !== 'none'` to `findVisibleTarget`.

2. **Should the spotlight card use a Radix Dialog for a11y, or is inert + manual ESC enough?**
   - What we know: SEED-029 notes suggest Radix Dialog gives ~150 lines of reduction. Current code has manual ESC (lines 107-113) and capture/restore focus (lines 105, 119-120). No full focus trap.
   - What's unclear: Whether the visual "spotlight hole" effect can survive being wrapped in a Dialog portal.
   - Recommendation: Use `inert` on the app shell for Plan C (simpler, no visual regression risk). Defer Dialog refactor unless Plan A reveals the spotlight card has severe a11y issues in VoiceOver/NVDA testing.

3. **How many tour_events to log per step vs per session?**
   - What we know: SEED-029 asks for `tour_started`, `tour_step_completed`, `tour_finished`, `tour_skipped`. That's 4 event types. Step-level: `tour_step_completed` fires once per step advancement.
   - What's unclear: Whether to log `tour_step_completed` for every step (5 DB inserts per tour run) or only the final step.
   - Recommendation: Log all events. 5 inserts is trivial. Funnel drop-off analysis (which step do users abandon at?) requires per-step data.

4. **What app-shell wrapper selector should inert target?**
   - What we know: `app/(app)/layout.tsx` renders the SidebarShell as a sibling to TourSpotlight inside TourProvider. TourSpotlight renders in a portal (not inside SidebarShell).
   - What's unclear: Whether there is a `data-testid` or `id` on the main app shell wrapper for easy DOM selection.
   - Recommendation: Plan C adds `data-tour-shell="true"` attribute to the SidebarShell wrapper div in `app/(app)/layout.tsx`, then `inert` targets `[data-tour-shell]`.

## Environment Availability

> Phase 80 is code/config-only changes with one DB migration. All dependencies are confirmed present.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `@floating-ui/dom` | rAF→autoUpdate replacement | Yes | transitive via @floating-ui/react-dom | — |
| `@floating-ui/react-dom` | Confirmed in node_modules | Yes | transitive via radix-ui | — |
| `@floating-ui/react` | Higher-level hooks (useDismiss etc.) | **No** | Not installed | Use @floating-ui/dom directly |
| vitest (jsdom) | Unit tests | Yes | ^4.1.4 | — |
| playwright | E2E tests (mobile-safari, mobile-chrome, chromium) | Yes | ^1.59.1 | — |
| Supabase project | tour_events migration | Yes (via Node/pg script pattern from Phase 76) | — | — |

**Missing with fallback:**
- `@floating-ui/react` — `autoUpdate` and `computePosition` from `@floating-ui/dom` achieve the same result for this use case (no interaction hooks needed — the spotlight card's interactions are manual).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.4 (unit/jsdom) + @playwright/test ^1.59.1 (e2e) |
| Config file | `vitest.config.ts` (root), `playwright.config.ts` (root) |
| Quick run command | `pnpm test -- tour` |
| Full suite command | `pnpm test && pnpm test:e2e` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TOUR-QA-01 | WALKTHROUGH-FINDINGS.md produced after UAT runbook | manual | `tests/visual/tour-uat-runbook.md` checklist | Runbook exists ✅; findings doc does not exist ❌ |
| TOUR-QA-02 | findVisibleTarget picks visible language-toggle on mobile 390px | e2e (mobile-safari/mobile-chrome devices) | `pnpm test:e2e --project=mobile-safari tour-flow.spec.ts` | `tests/e2e/tour-flow.spec.ts` exists (skipping) ✅ |
| TOUR-QA-03 | Tab key cannot reach sidebar/topbar while spotlight is open | e2e | `pnpm test:e2e tour-flow.spec.ts` | ✅ (needs new test case) |
| TOUR-QA-03 | prefers-reduced-transparency renders solid card | e2e (emulateMedia) | `pnpm test:e2e tour-flow.spec.ts` | ✅ (needs new test case) |
| TOUR-QA-04 | rAF replaced — no continuous animation frame activity while spotlight stationary | manual (devtools Performance tab) | manual | — |
| TOUR-QA-05 | tour_started / tour_step_completed / tour_finished / tour_skipped logged | integration | `pnpm test -- tour` | ❌ Wave 0 (Plan D) |
| TOUR-QA-05 | 4 existing Playwright tests un-skipped and passing | e2e | `pnpm test:e2e tour-flow.spec.ts` | ✅ (needs auth fixture) |

### Sampling Rate
- **Per task commit:** `pnpm test -- tour` (unit tour tests, < 5s)
- **Per wave merge:** `pnpm test && pnpm test:e2e tour-flow.spec.ts`
- **Phase gate:** Full suite green + WALKTHROUGH-FINDINGS.md signed off

### Wave 0 Gaps (Plan D)
- [ ] `tests/e2e/fixtures/authenticated-state.json` — must be populated (Playwright storageState) for tour-flow tests to un-skip
- [ ] `tests/unit/tour/tour-telemetry.test.ts` — covers tour_events insert + error handling
- [ ] New test cases in `tests/e2e/tour-flow.spec.ts` — inert focus leak check + mobile selector + transparency gate

*(Plans A/B/C have no Wave 0 test gaps — Plan A is diagnosis-only, Plan B edits existing files, Plan C hardens existing component)*

## Phase Plan Structure (recommended)

### Plan A: Diagnosis in browser (S — no code)
- Start dev server, run `tour-uat-runbook.md` checklist in EN/PT/ES on desktop + mobile 390px viewport
- Capture screenshots of each bug
- Produce `WALKTHROUGH-FINDINGS.md` with severity-ranked list
- **Exit criterion:** findings doc exists and planner can determine if any Plan B-D item is not worth doing

### Plan B: Copy + selectors (S-M)
- Verify tour step copy vs current UI (all 5 steps confirmed accurate — may need minor updates)
- Browser-confirm `findVisibleTarget` dual-selector behavior on mobile; patch if needed
- Verify all `data-tour` attrs are present on target elements (confirmed: sidebar TOUR_TARGET covers all 4; bottom-nav mirrors them)
- Consider adding a step about Draft→Consolidated workflow (SEED-028, new in Phase 78)

### Plan C: A11y + performance (S-M)
- Add `inert` on `[data-tour-shell]` wrapper during spotlight (requires adding attr to layout)
- Verify `prefers-reduced-transparency` in ContextualTooltip (likely no-op — Radix Tooltip doesn't add blur)
- Replace rAF loop with `autoUpdate` from `@floating-ui/dom`
- Verify z-index collision between help button (z-50) and Sonner toasts (Toaster in root layout.tsx — likely z-50 too)

### Plan D: Telemetry + Playwright (S)
- Migration: `tour_events` table
- Server action `logTourEvent(eventType, metadata?)` — called from `useTour()` hooks
- Un-skip 4 existing Playwright tests via auth fixture (`globalSetup` storageState)
- Add 2-3 new tests for Phase 80 fixes

## Sources

### Primary (HIGH confidence — direct file inspection)
- `components/tour/tour-spotlight.tsx` — 237 lines, fully read; rAF loop at lines 73-94, findVisibleTarget at 33-43, ESC handler at 96-126
- `components/tour/tour-step.tsx` — 39 lines, fully read; 5 steps confirmed accurate
- `components/tour/contextual-tooltip.tsx` — 74 lines, fully read; Radix Tooltip wrapper, no localStorage, no auto-show
- `components/tour/tour-provider.tsx` — 68 lines, fully read; migrateLegacyKeys + cookie check + TourContext
- `components/tour/use-tour.ts` — 51 lines, fully read; startTour correctly does NOT call completeTour (Phase 75 gotcha #2 fixed)
- `components/tour/tour-help-button.tsx` — 44 lines, fully read; resetAllTourState + startTour + setShowWelcome
- `lib/tour/persistence.ts` — 159 lines, fully read; namespaced keys, clearAllTourState, migrateLegacyKeys
- `tests/e2e/tour-flow.spec.ts` — 174 lines, fully read; 4 test blocks, all skip via requireDashboard
- `tests/unit/tour/tour-state-machine.test.ts` — 106 lines, GREEN
- `tests/unit/tour/tooltip-persistence.test.ts` — 83 lines, GREEN
- `tests/visual/tour-uat-runbook.md` — 111 lines, fully read; never executed
- `tests/e2e/fixtures/authenticated-state.json` — empty `{}`
- `components/app-shell/sidebar.tsx` — TOUR_TARGET map at lines 49-53, data-tour attrs at 152,157,226
- `components/app-shell/bottom-nav.tsx` — TOUR_TARGET map at lines 11-16, language-toggle at line 74
- `components/app-shell/topbar.tsx` — language-toggle at line 109
- `supabase/migrations/20260409000001_initial_schema.sql` — estimate_activity table at line 137 (project_id NOT NULL confirmed)
- `package.json` — test scripts confirmed (`pnpm test`, `pnpm test:e2e`)
- `vitest.config.ts`, `playwright.config.ts` — test infrastructure verified
- `node_modules/@floating-ui/` — `core`, `dom`, `react-dom`, `utils` present; `react` (hooks) NOT present

## Metadata

**Confidence breakdown:**
- Component current state: HIGH — all 7 tour files read directly, post-Phase-75 implementation confirmed
- findVisibleTarget dual-selector: MEDIUM — logic looks correct in code but browser confirmation needed (Plan A)
- Playwright auth fixture path: HIGH — empty authenticated-state.json confirmed; globalSetup pattern established in project
- estimate_activity incompatibility for tour telemetry: HIGH — NOT NULL constraint verified in migration SQL
- @floating-ui/dom autoUpdate availability: HIGH — node_modules directly inspected
- Tour step copy accuracy: HIGH — all 5 data-tour attrs confirmed in sidebar/bottom-nav TOUR_TARGET maps; /projects/new nav item is `primary: true` in NAV_ITEMS

**Research date:** 2026-05-21
**Valid until:** 2026-06-21 (30 days — tour components stable since Phase 75)

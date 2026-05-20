# Phase 75: Tour & Tooltip QA — Research

**Researched:** 2026-05-19
**Domain:** Client-side tour state machine + per-element tooltip overlay (React 18 / Next.js App Router)
**Confidence:** HIGH (all findings sourced directly from current repo files)

## Summary

The Phase 74 tour shipped with **one critical bug, one architectural bug, and a positioning system that will not survive contact with mobile / sticky topbars**. Every other complaint ("meio bugado") traces back to these.

1. **THE root-cause bug** (the LanguageToggle complaint): `ContextualTooltip` reads `localStorage.getItem(tooltipKey)` and shows itself **on mount, unconditionally**, if no "seen" flag exists. There is no "trigger" — the tooltip is born visible. The `tooltipKey`/`text`/`side` props were designed as a passive label, but the implementation treats every mount as "first contact, show it." This means **every fresh browser session on dashboard load shows the LanguageToggle tooltip floating in the topbar with no user action.** Same applies to clients, price-book, estimate-total, whatsapp tooltips on their respective pages.
2. **Positioning is hand-rolled Tailwind absolute classes** — no `@floating-ui/react`, no auto-flip, no viewport-clamping for the inline tooltip. The spotlight card uses raw `getBoundingClientRect()` math, also without flip.
3. **`@floating-ui/react-dom` and `@radix-ui/react-tooltip` are both already installed transitively** (Radix uses Floating UI internally). No new dependency needed for the fix.
4. **Zero test coverage** exists for the tour. No `tests/unit/tour/` directory exists. No tour-related e2e spec exists. Wave 0 must create scaffolding.

**Primary recommendation:** Rewrite `ContextualTooltip` to require an explicit `trigger` (hover/focus/click) using Radix's `Tooltip` primitive. Keep `localStorage` only as a "has user dismissed via X button" flag, not as a "should this be shown at all" flag. Replace spotlight bounding-box math with `@floating-ui/react-dom` `useFloating({ middleware: [flip, shift, offset] })`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Bug classes:** unprompted appearance, position regression, persistence flakiness
- **Persistence:** `localStorage` only, namespace `xtimator:tour:v1:{tooltipKey}` and `xtimator:tour:v1:spotlight:{stepId}`, schema `{ seen: boolean; dismissedAt: ISOString }`. Restart via `TourHelpButton` clears `xtimator:tour:v1:*`. No DB.
- **Positioning:** `@floating-ui/react` middleware `flip` + `shift` + `offset`. Never under sticky topbar — `flip` with `padding: { top: 64 }`.
- **Animations:** Gated by `prefers-reduced-motion`. Backdrop blur gated by `prefers-reduced-transparency`. ESC dismisses spotlight. Focus trap released on close.
- **Tests:** Unit ≥14 cases (8+ state machine, 6+ persistence). E2E `tests/e2e/tour-flow.spec.ts`.

### Claude's Discretion
- Whether to use `@floating-ui/react` directly or via shadcn/Radix `Tooltip` primitive (Radix wraps Floating UI)
- Whether to migrate persistence in-place or replace
- Exact alias map for sidebar/topbar/capture mount points

### Deferred Ideas (OUT OF SCOPE)
- Cross-device DB sync for tour state
- New tour steps for unrelated features
- Tour analytics
- Editorial rewrite of tour copy (translation OK, rewriting copy not)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TOUR-FIX-01 | Audit doc `tests/visual/tour-inventory.md` listing every mount + trigger + dismiss + side | Inventory provided below — 5 ContextualTooltip mount sites, 5 TourSpotlight steps |
| TOUR-FIX-02 | Zero unprompted popups on load/refresh/nav | Bug confirmed in `contextual-tooltip.tsx:38-44` — auto-shows on mount. Fix: require explicit trigger prop |
| TOUR-FIX-03 | Auto-flip positioning + sticky-topbar padding | `@floating-ui/react-dom` already installed; current code uses static Tailwind position classes (no flip) |
| TOUR-FIX-04 | Persistence under `xtimator:tour:v1:*`, restart clears | Current keys are flat (`tooltip_seen_*`, `tour_completed`, `tour_spotlight_pending`) — migration helper needed |
| TOUR-FIX-05 | `prefers-reduced-motion` + `prefers-reduced-transparency` + ESC + focus trap | NONE present today — spotlight transition is hardcoded `0.2s ease`, backdrop is `rgba(0,0,0,0.65)` (no blur, OK), no ESC keydown listener, no focus trap |
| TOUR-FIX-06 | 14+ unit tests | No tour tests exist — Wave 0 creates scaffolding |
| TOUR-FIX-07 | UAT in EN/PT/ES | i18n already wired via `t()` — see i18n section |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Next.js 14 App Router, TypeScript strict, Tailwind, shadcn/ui — already in use by tour components
- All client components must use `'use client'` — every tour file already has it
- No new secrets, no server-side concerns in this phase (localStorage-only)
- GSD workflow enforcement — work through `/gsd:execute-phase`

## Standard Stack (already installed)

### Core (verified in `package.json` + `node_modules`)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@floating-ui/react-dom` | (transitive via radix-ui) | Auto-flip/shift positioning | Industry standard for tooltip/popover anchoring; powers Radix Tooltip internally |
| `@radix-ui/react-tooltip` | (transitive via radix-ui ^1.4.3) | Headless tooltip primitive with built-in a11y (ARIA, focus, keyboard) | Already used by shadcn/ui throughout the codebase |
| `framer-motion` | ^12.38.0 | Animation + `useReducedMotion()` hook | Already used elsewhere in the app |
| `vitest` | ^4.1.4 | Unit testing | Project standard (`pnpm test`) |
| `@playwright/test` | ^1.59.1 | E2E | Project standard (`pnpm test:e2e`) |

### What's NOT installed (don't add — not needed)
- `react-focus-lock` — Radix `Dialog` already provides focus trap; we can reuse it for the spotlight tooltip card, or use the native `<dialog>` element, or implement manually with `inert` attribute on background
- Any new `@floating-ui/react` (the React wrapper) — `@floating-ui/react-dom` is enough for our anchored positioning; we don't need the higher-level interaction hooks because Radix `Tooltip` provides them

## Architecture Patterns

### Current Mount Tree (verified in `app/(app)/layout.tsx:61-87`)
```
<TourProvider>
  <SidebarShell>{children}</SidebarShell>   // sidebar.tsx, topbar.tsx, bottom-nav.tsx
  <WelcomeModal />                          // gated by showWelcome (cookie-triggered)
  <TourSpotlight />                         // gated by showSpotlight
  <TourHelpButton />                        // always visible unless spotlight is open
</TourProvider>
```

### Recommended pattern for the rewritten ContextualTooltip
Wrap Radix Tooltip and add a "once-per-key" dismissal flag layered on top of normal hover/focus behavior:

```tsx
'use client'
import * as Tooltip from '@radix-ui/react-tooltip'
import { useEffect, useState } from 'react'

const KEY_PREFIX = 'xtimator:tour:v1:'

export function ContextualTooltip({ tooltipKey, text, side = 'right', children }: Props) {
  const [dismissed, setDismissed] = useState(true) // start dismissed; flip after mount
  const { t } = useTranslation()

  useEffect(() => {
    const raw = localStorage.getItem(KEY_PREFIX + tooltipKey)
    setDismissed(raw ? JSON.parse(raw).seen === true : false)
  }, [tooltipKey])

  function dismiss() {
    localStorage.setItem(
      KEY_PREFIX + tooltipKey,
      JSON.stringify({ seen: true, dismissedAt: new Date().toISOString() })
    )
    setDismissed(true)
  }

  if (dismissed) return <>{children}</>  // pass-through: no tooltip wiring at all

  return (
    <Tooltip.Provider delayDuration={200}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side={side}
            sideOffset={8}
            collisionPadding={{ top: 64, bottom: 16, left: 16, right: 16 }} // dodge sticky topbar
            className="z-50 ..."
          >
            {t(text)}
            <button onClick={dismiss} aria-label={t('Dismiss tooltip')}>×</button>
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  )
}
```

Key design difference vs. today: the tooltip only ever shows on `hover` / `focus-visible` of the trigger (Radix default). The `localStorage` flag becomes "stop wiring up the tooltip altogether once user has dismissed." No more "shows itself on mount."

> **Note:** This pattern means tooltips appear when the user *hovers* the anchor. If the design intent is actually "show automatically on first ever visit, then never again," then the fix is different: render the tooltip programmatically once with `open={true}` for ~5 seconds, then never again. Planner must confirm intent with owner before choosing path. CONTEXT.md says "documented trigger" but does not define what that trigger is — flag this as an open question.

### Spotlight pattern (rewritten with Floating UI)
Replace the `getBoundingClientRect()` + `boxShadow` math with:
- A full-screen SVG mask for the spotlight hole (handles flicker better than `boxShadow: 0 0 0 9999px`)
- `useFloating({ middleware: [offset(12), flip({ padding: { top: 64 } }), shift({ padding: 16 })] })` for the card
- `useDismiss` + `useRole('dialog')` from `@floating-ui/react` for ESC + ARIA

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tooltip positioning | The current Tailwind `left-full top-1/2 ml-2` static classes | `@radix-ui/react-tooltip` with `collisionPadding` | Auto-flip on viewport edge, sticky topbar handling, RTL support, all free |
| Spotlight card positioning | `Math.max/Math.min` viewport clamping (current `tour-spotlight.tsx:92-95`) | `@floating-ui/react-dom` `flip` + `shift` middleware | Edge-cases around scroll, zoom, mobile keyboard |
| Focus trap | Manual focusable-element querying | Reuse Radix `Dialog` for the spotlight card *or* set `inert` on `<body>` siblings | a11y-tested, no edge cases |
| ESC handler | `document.addEventListener('keydown')` | Radix `Dialog`'s built-in `onEscapeKeyDown` | Avoids "ESC dismisses while a modal is also open" double-handling |
| "Once-only" semantics | Wrapping every consumer with a check | `localStorage` read in the component itself (current pattern is fine, just needs to flip the polarity) | Standard pattern |

**Key insight:** The current code reinvented Tooltip + Popover from scratch with Tailwind classes. The replacement is "use the primitive you already pay for via shadcn."

## Component Inventory

### `components/tour/contextual-tooltip.tsx` (80 lines)
- **Exports:** `TOOLTIP_KEYS` (const, 5 keys), `TooltipKey` (type), `ContextualTooltip` (component)
- **Props:** `{ tooltipKey, text, side?='right', className?, children? }`
- **State:** `useState<boolean>(false) visible`, `useState<boolean>(false) mounted`
- **Effects:** ONE useEffect — `setMounted(true)` + reads `localStorage.getItem(tooltipKey)`; if not `'seen'`, calls `setVisible(true)`. **THIS IS THE BUG.**
- **localStorage:** reads `tooltipKey` (e.g. `tooltip_seen_language_toggle`), writes `'seen'` on dismiss
- **Animation libs:** none (just Tailwind transitions on the `<button>` hover)
- **i18n:** `t(text)` and `t('Dismiss tooltip')` — wired ✅
- **Position:** static Tailwind classes per `side` prop (no flip)

### `components/tour/tour-provider.tsx` (59 lines)
- **Exports:** `TourProvider`, `useTourContext`
- **State:** `showWelcome`, `showSpotlight` (useState booleans); `isReviewModeRef` (useRef boolean)
- **Effects:** ONE useEffect on mount — reads `document.cookie` for `onboarding_complete`; if present AND tour not completed, clears cookie and opens welcome modal. Else if `tour_spotlight_pending`, opens spotlight.
- **localStorage:** indirect via `useTour()` hook (reads `tour_completed`, `tour_spotlight_pending`)
- **Gotcha:** Cookie-clear runs BEFORE `setShowWelcome(true)` — good, prevents loop. But cookie is read once on mount; in dev with React Strict Mode (mount twice), the cookie may be cleared on first mount before second mount can read it. Plan should verify this.

### `components/tour/tour-spotlight.tsx` (152 lines)
- **Exports:** `TourSpotlight`
- **State:** `stepIndex` (useState number), `rect` (useState Rect | null), `frameRef` (useRef rAF id)
- **Effects:** Continuous `requestAnimationFrame` loop tracking target element bounding rect (lines 32-53) — **runs every frame while spotlight open; should use ResizeObserver + scroll listener instead, or Floating UI's `autoUpdate`**
- **localStorage:** indirect via `useTour()` — `completeTour()`, `clearSpotlightPending()`
- **Animation:** CSS transition `top 0.2s ease, left 0.2s ease, width 0.2s ease, height 0.2s ease`. **No `prefers-reduced-motion` gate.**
- **Position:** Manual `getBoundingClientRect()` + `boxShadow: 0 0 0 9999px rgba(0,0,0,0.65)`. Tooltip card uses `Math.max(16, Math.min(rect.left, window.innerWidth - 320 - 16))` clamp. **No flip.**
- **a11y:** `role="dialog"` and `aria-label` ✅. No ESC handler ❌. No focus trap ❌. No `aria-modal` ❌.

### `components/tour/tour-step.tsx` (39 lines)
- **Exports:** `TourStep` (interface), `TOUR_STEPS` (5 steps)
- **No state, no effects, no localStorage** — pure data module
- **Steps:** new-project, projects, clients, price-book, language-toggle (selectors via `data-tour="..."`)

### `components/tour/tour-help-button.tsx` (35 lines)
- **Exports:** `TourHelpButton`
- **State:** none (reads context only)
- **Effects:** none
- **Behavior:** Hidden during spotlight (z-index avoidance). Click → sets review mode + opens welcome modal.
- **a11y:** `aria-label={t('Open app tour')}` ✅
- **Gotcha:** Hardcoded position `bottom-24 right-4 md:bottom-6 md:right-6`. On mobile, `bottom-24` is to clear `bottom-nav`. Verify it doesn't overlap toast/snackbar layers.

### `components/tour/use-tour.ts` (36 lines)
- **Exports:** `TOUR_KEYS` (const: `completed`, `spotlightPending`), `useTour` (hook)
- **No React state — pure localStorage wrapper**
- **Functions:** `isTourCompleted`, `completeTour`, `startTour` (sets pending AND calls completeTour — questionable), `isSpotlightPending`, `clearSpotlightPending`
- **Gotcha:** `startTour()` calls `completeTour()` AT THE SAME TIME as setting `spotlightPending`. This means by the time the spotlight renders, the tour is already "completed." If `TourSpotlight` reads `isTourCompleted()` it will see `true`. Today nothing checks that, but the contradictory semantics will trip up future refactors.

### `components/tour/welcome-modal.tsx` (102 lines)
- **Exports:** `WelcomeModal`
- **State:** none of its own — pure consumer of context + `useTour()` + `useTranslation()`
- **Effects:** none
- **Behavior:** Two CTAs: "Show me around" (→ startTour + open spotlight) and "Start estimating" (→ completeTour). In review mode (entered via `TourHelpButton`), X button doesn't write to localStorage.
- **a11y:** Uses shadcn `Dialog` → Radix `Dialog` → focus trap + ESC built-in ✅

## Persistence Layer

### Current keys (verified in source — flat, no namespace)
| Key | Written by | Read by | Value |
|-----|-----------|---------|-------|
| `tooltip_seen_price_book` | `ContextualTooltip.dismiss()` | `ContextualTooltip` mount effect | `'seen'` string |
| `tooltip_seen_clients` | same | same | same |
| `tooltip_seen_estimate_total` | same | same | same |
| `tooltip_seen_whatsapp` | same | same | same |
| `tooltip_seen_language_toggle` | same | same | same |
| `tour_completed` | `useTour.completeTour()`, also called from `startTour()` | `TourProvider` mount, `useTour.isTourCompleted()` | `'true'` string |
| `tour_spotlight_pending` | `useTour.startTour()` | `TourProvider` mount, `useTour.isSpotlightPending()` | `'true'` string, cleared by `clearSpotlightPending` |

### Target keys (CONTEXT.md locked)
| New key | Replaces | Schema |
|---------|----------|--------|
| `xtimator:tour:v1:tooltip:{key}` | `tooltip_seen_*` | `{"seen":true,"dismissedAt":"2026-05-19T..."}` |
| `xtimator:tour:v1:spotlight:completed` | `tour_completed` | `{"seen":true,"dismissedAt":"..."}` |
| `xtimator:tour:v1:spotlight:pending` | `tour_spotlight_pending` | `{"pending":true}` (or just presence check) |

**Migration helper required.** On first read at the new key, fall back to checking the old key, copy over, then delete the old. Otherwise existing users will see all tooltips reappear.

### Restart flow (TourHelpButton must do this; currently doesn't)
```ts
Object.keys(localStorage)
  .filter(k => k.startsWith('xtimator:tour:v1:'))
  .forEach(k => localStorage.removeItem(k))
```
Today the help button just re-opens the welcome modal in "review mode" without clearing flags.

### Race condition (the flash-of-visible-tooltip)
The `mounted` state pattern at `contextual-tooltip.tsx:34-44` is actually correct — `visible` starts `false`, the effect synchronously checks localStorage on mount, and returns `null` until `mounted && visible`. **There is no SSR flash.** The bug isn't a race — it's the design itself: the tooltip is *supposed* to show on mount according to this code.

## Trigger Conditions

### Per ContextualTooltip mount site
| File:Line | tooltipKey | text | side | Page where it triggers on load |
|-----------|-----------|------|------|--------------------------------|
| `components/app-shell/topbar.tsx:68` | `languageToggle` | "Switch languages — estimates..." | bottom | **Every authenticated page** (topbar is global) — **THIS IS THE OWNER'S REPORTED BUG** |
| `components/app-shell/sidebar.tsx:115` | `clients` | "Clients are saved automatically..." | right | Every authenticated page (sidebar global), anchored to `/clients` nav link |
| `components/app-shell/sidebar.tsx:115` | `priceBook` | "Save your most-used items..." | right | Every authenticated page, anchored to `/price-book` nav link |
| `components/workspace/estimate/estimate-totals.tsx:126` | `estimateTotal` | (not read) | (not read) | Every estimate page |
| `components/workspace/send/plain-text-card.tsx:71` | `whatsapp` | (not read) | (not read) | Every estimate "send" view |

### TourSpotlight steps (`tour-step.tsx`)
| Step ID | Target selector | Visible on |
|---------|----------------|------------|
| new-project | `[data-tour="new-project"]` | dashboard (must have button with attr) |
| projects | `[data-tour="projects"]` | sidebar (`/projects`) |
| clients | `[data-tour="clients"]` | sidebar (`/clients`) |
| price-book | `[data-tour="price-book"]` | sidebar (`/price-book`) |
| language-toggle | `[data-tour="language-toggle"]` | topbar + bottom-nav (TWO matches — `document.querySelector` returns the FIRST, which is topbar on desktop and bottom-nav on mobile depending on render order) |

**Gotcha:** The `language-toggle` data-tour attribute exists in BOTH `topbar.tsx:73` AND `bottom-nav.tsx:74`. The spotlight uses `document.querySelector(currentStep.target)` which returns the first match. On mobile (where topbar is hidden via CSS), this may still match the topbar element if it's in the DOM but display:none. Plan needs a `:not([hidden])` selector or use IntersectionObserver to pick the visible one.

### Trace of the LanguageToggle bug (line by line)
1. User loads dashboard (or any page) → `topbar.tsx` renders → `<ContextualTooltip tooltipKey="tooltip_seen_language_toggle" ...>` mounts
2. `ContextualTooltip` runs `useState(false)` → `visible=false`, `mounted=false`
3. First render: `mounted=false` → returns `<>{children}</>` (just the LanguageToggle, no tooltip)
4. `useEffect` fires after first paint → `setMounted(true)` + reads `localStorage.getItem('tooltip_seen_language_toggle')` → returns `null` (fresh browser) → `seen=false` → calls `setVisible(true)`
5. Re-render: `mounted=true && visible=true` → renders the tooltip overlay **with no user interaction whatsoever**

There is no `defaultOpen` prop, no external state, no hover handler — **the tooltip is simply born visible on every page load until dismissed.** This is the entire bug.

## Positioning Library

### Currently used
- `ContextualTooltip`: hand-rolled Tailwind static classes (`left-full top-1/2 ml-2` etc.) — **no library, no flip, no shift**
- `TourSpotlight`: hand-rolled `getBoundingClientRect()` + clamp math + `boxShadow` for the hole — **no library**

### Already installed (no new dep needed)
- `@radix-ui/react-tooltip` — full Tooltip primitive with `collisionPadding`, `side`, `align`, `sideOffset`, auto-flip via Floating UI
- `@floating-ui/react-dom` — lower-level `useFloating` hook with `flip`, `shift`, `offset`, `arrow` middleware

### Where it breaks today
- Sidebar tooltip with `side='right'`: on viewports narrower than ~1100px the sidebar collapses but the tooltip still renders to the right of the icon — drifts into the main content area
- Topbar `languageToggle` tooltip with `side='bottom'`: on narrow viewports the tooltip width (`w-52` = 208px) overflows the right edge
- Spotlight tooltip: the `Math.max(16, Math.min(...))` clamp only handles horizontal; vertical overflow at the page bottom is unhandled — card can render off-screen

## i18n Integration

- ✅ `ContextualTooltip` calls `t(text)` for the body (line 76) and `t('Dismiss tooltip')` for aria-label (line 71)
- ✅ `TourSpotlight` calls `t()` on `currentStep.title`, `currentStep.description`, `'Back'`, `'Done'`, `'Next'`, `'Skip tour'`
- ✅ `WelcomeModal` translates every visible string
- ✅ `TourHelpButton` translates aria-label
- ⚠️ **Async batch i18n behavior:** `t()` returns the source string synchronously and the cached translation on a later render (see `lib/i18n/use-translation.ts:114-118`). On first paint in PT/ES the tooltip will briefly show English text, then update. For the tooltip-on-mount bug, this means the *English* text flashes for ~50ms before the PT/ES translation arrives. Once we move to trigger-on-hover this becomes a non-issue, but UAT should verify there's no flicker.

## a11y Status

| Concern | Status | Notes |
|---------|--------|-------|
| `prefers-reduced-motion` | ❌ Not handled | Spotlight has hardcoded `0.2s ease` transition; framer-motion `useReducedMotion()` exists in deps and should be used |
| `prefers-reduced-transparency` | ⚠️ Partially OK | Spotlight backdrop is `rgba(0,0,0,0.65)` (no blur) — already compliant. But `glass-strong` class on tooltip card likely uses `backdrop-filter: blur(...)` — need to verify and gate |
| ESC key | ❌ Not handled in `TourSpotlight` | `WelcomeModal` gets it free via Radix `Dialog`. Spotlight's custom `<div>` does not. |
| Focus trap | ❌ Not in spotlight | Background sidebar/topbar links are still tab-focusable while spotlight is "modal" |
| ARIA | ⚠️ Partial | Tooltip has `role="tooltip"` ✅ but no `aria-describedby` linking it to the target. Spotlight has `role="dialog"` + `aria-label` ✅ but no `aria-modal="true"` |
| Mobile touch | ⚠️ Untested | Static-position tooltips on touch devices have no dismissal pathway except the X button (no hover-leave) |

## Test Coverage

**None.** Verified:
- No `tests/unit/tour/` directory
- `find tests -name "*tour*" -o -name "*tooltip*"` returns nothing
- No `tour-flow.spec.ts` in `tests/e2e/`

Wave 0 must create:
- `tests/unit/tour/` directory
- `tests/unit/tour/tour-state-machine.test.ts` (vitest, ≥8 cases)
- `tests/unit/tour/tooltip-persistence.test.ts` (vitest, ≥6 cases)
- `tests/e2e/tour-flow.spec.ts` (playwright)

Existing test infra is ready: `vitest run` and `playwright test` both already wired in `package.json`.

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data (localStorage) | 7 keys: 5x `tooltip_seen_*`, `tour_completed`, `tour_spotlight_pending` | Migration helper on first read at new keys (`xtimator:tour:v1:*`) — copy over then delete old; otherwise existing users see all tooltips reappear |
| Stored data (cookies) | `onboarding_complete` (set by `lib/actions/company.ts:108`, `httpOnly:false`, read by TourProvider) | No change — this is the one-shot "you just finished onboarding" signal, unrelated to v1 namespace |
| Live service config | None — no external service stores tour state | None |
| OS-registered state | None | None |
| Secrets / env vars | None | None |
| Build artifacts | None | None |

## Gotchas

1. **Two `data-tour="language-toggle"` elements in DOM simultaneously** (`topbar.tsx:73` + `bottom-nav.tsx:74`). `document.querySelector` in `tour-spotlight.tsx:38` returns the first match. On mobile, this may be the hidden-by-CSS topbar element. Fix: filter by `:not([hidden])` or visible check via `getBoundingClientRect().width > 0`.
2. **`startTour()` calls `completeTour()` immediately** (`use-tour.ts:23`). Sets `tour_completed=true` AND `tour_spotlight_pending=true` in the same breath. Semantically contradictory; any future "show only if not completed" guard will hide the spotlight that's supposed to start. Plan must clean this up.
3. **`TourProvider` cookie-read effect has `[]` dep array with eslint-disable** (line 52). Under React 18 Strict Mode in dev, this runs twice — first run clears the cookie, second run sees no cookie and skips `setShowWelcome`. In dev only, the welcome modal may fail to appear after onboarding. Production builds don't double-mount, so this is a dev-only papercut, but worth a Strict Mode test.
4. **`TourSpotlight` rAF loop runs continuously** while spotlight is open (`tour-spotlight.tsx:32-53`) — paints every frame even when nothing moves. Should use `ResizeObserver` + scroll listener, OR Floating UI's `autoUpdate(reference, floating, update)` helper.
5. **`glass-strong` Tailwind class likely uses `backdrop-filter: blur(...)`** on the tooltip cards. Under `prefers-reduced-transparency: reduce` this must fall back to solid. Need to inspect the class definition (likely in `app/globals.css` or `tailwind.config.ts`).
6. **The `text` prop is a plain English string passed at the call site**, then run through `t()` inside the tooltip. This is intentional and works with the async translation batcher. But it means **changing tooltip copy requires touching every call site**, not a central dict — fine for QA scope, just don't propose centralization.
7. **`TooltipKey` type is the VALUE of `TOOLTIP_KEYS` (the string key in localStorage), not the property name.** E.g. `tooltipKey="tooltip_seen_language_toggle"`, not `"languageToggle"`. When renaming to the new namespace, the consumer call sites do NOT need to change if you keep `TOOLTIP_KEYS` mapping the same property names to new values.
8. **`TourHelpButton` is `position: fixed bottom-24 right-4`** — overlaps any toast/snackbar that renders at the same anchor. Visual regression risk if toasts are introduced near it.
9. **`completeTour()` removes `spotlightPending`** but `clearSpotlightPending()` also exists separately. Two paths to the same state, both called from `handleClose` in `tour-spotlight.tsx:67-72` — redundant but harmless. Worth simplifying.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.4 (unit) + @playwright/test ^1.59.1 (e2e) |
| Config file | `vitest.config.ts` (assumed at root — verify in Wave 0); `playwright.config.ts` at root |
| Quick run command | `pnpm test -- tour` |
| Full suite command | `pnpm test && pnpm test:e2e` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| TOUR-FIX-02 | No tooltip visible on dashboard load (no user action) | e2e | `pnpm test:e2e tour-flow.spec.ts` | ❌ Wave 0 |
| TOUR-FIX-03 | Tooltip flips to opposite side when near viewport edge | unit (jsdom + Radix's `Tooltip.Content`) | `pnpm test tour/positioning` | ❌ Wave 0 |
| TOUR-FIX-04 | Dismissed tooltip stays dismissed across reload | unit (localStorage mock) | `pnpm test tour/tooltip-persistence` | ❌ Wave 0 |
| TOUR-FIX-04 | TourHelpButton clears all `xtimator:tour:v1:*` keys | unit | `pnpm test tour/tour-state-machine` | ❌ Wave 0 |
| TOUR-FIX-05 | ESC dismisses spotlight | e2e | `pnpm test:e2e tour-flow.spec.ts` | ❌ Wave 0 |
| TOUR-FIX-05 | `prefers-reduced-motion: reduce` skips spotlight transition | manual + e2e (Playwright `emulateMedia`) | `pnpm test:e2e tour-flow.spec.ts` | ❌ Wave 0 |
| TOUR-FIX-06 | State machine transitions (≥8 cases) | unit | `pnpm test tour/tour-state-machine` | ❌ Wave 0 |
| TOUR-FIX-07 | EN/PT/ES rendering of all tooltip surfaces | manual UAT | `.planning/known-issues.md` | manual only |

### Sampling Rate
- **Per task commit:** `pnpm test -- tour` (unit tour tests only, < 5s)
- **Per wave merge:** `pnpm test && pnpm test:e2e tour-flow.spec.ts`
- **Phase gate:** Full suite green + manual UAT signed off in EN/PT/ES

### Wave 0 Gaps
- [ ] Create `tests/unit/tour/` directory
- [ ] `tests/unit/tour/tour-state-machine.test.ts` — covers TOUR-FIX-04, TOUR-FIX-06
- [ ] `tests/unit/tour/tooltip-persistence.test.ts` — covers TOUR-FIX-04 (migration + restart flow)
- [ ] `tests/e2e/tour-flow.spec.ts` — covers TOUR-FIX-02, TOUR-FIX-05
- [ ] Shared fixture for localStorage mock if not already in `tests/unit/setup.ts`
- [ ] (Optional) Visual snapshot at `tests/e2e/visual/tour-*.spec.ts` for positioning regressions

## Open Questions

1. **What is the intended trigger for `ContextualTooltip`?**
   - What we know: CONTEXT.md says "without their documented trigger firing" but doesn't define the trigger
   - What's unclear: Is the design (a) hover/focus on the anchor (Radix Tooltip default), or (b) auto-show once on first visit, fade after N seconds, never again?
   - Recommendation: Planner must clarify with owner. Recommend option (a) — standard Tooltip semantics — because it's a11y-correct and uses the primitive. Option (b) requires a different code path (timer-based auto-dismiss + persistence).

2. **Should the `tour_completed` flag block re-running the spotlight when the user clicks "Show me around" from the help button?**
   - Today: `startTour()` always sets `spotlightPending=true` regardless of `completed`. So help button → spotlight always re-runs. This seems correct (it's a restart button) but verify intent.

3. **Mobile spotlight behavior** — the target element selector `[data-tour="language-toggle"]` exists in both topbar and bottom-nav. On mobile the topbar is hidden but the element may still be in the DOM. Verify with Playwright mobile viewport which one the spotlight highlights.

## Sources

### Primary (HIGH confidence) — direct file inspection
- `components/tour/contextual-tooltip.tsx` (80 lines, fully read)
- `components/tour/tour-provider.tsx` (59 lines, fully read)
- `components/tour/tour-spotlight.tsx` (152 lines, fully read)
- `components/tour/tour-step.tsx` (39 lines, fully read)
- `components/tour/tour-help-button.tsx` (35 lines, fully read)
- `components/tour/use-tour.ts` (36 lines, fully read)
- `components/tour/welcome-modal.tsx` (102 lines, fully read)
- `components/app-shell/sidebar.tsx`, `topbar.tsx`, `bottom-nav.tsx` (relevant sections read)
- `lib/i18n/use-translation.ts` (fully read)
- `app/(app)/layout.tsx` (mount points verified via grep)
- `package.json` (deps + scripts verified)
- `node_modules/@radix-ui/` listing (verified `react-tooltip` + `react-popper` present)
- `node_modules/@floating-ui/` listing (verified `react-dom` present)

## Metadata

**Confidence breakdown:**
- Component inventory: HIGH — full file reads
- Persistence layer: HIGH — exact keys verified in source
- Trigger condition (the bug): HIGH — root cause traced line-by-line
- Positioning library availability: HIGH — `node_modules` directly inspected
- a11y status: MEDIUM — `glass-strong` Tailwind class not inspected; reduced-transparency claim relies on grep
- Test coverage: HIGH — verified absence via `find`

**Research date:** 2026-05-19
**Valid until:** 2026-06-19 (30 days — codebase is post-Phase-74, stable)

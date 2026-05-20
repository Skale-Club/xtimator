# Phase 75 — Tour & Tooltip Inventory

**Generated:** 2026-05-20 (Phase 75 Plan 01 — Wave 0 audit)
**Authoritative source:** `.planning/phases/75-tour-and-tooltip-qa/75-RESEARCH.md`
**Status:** Pre-rewrite snapshot. All "Intended trigger" / "Dismiss rule" columns describe the LOCKED post-75-02 design — not current behavior.

This inventory is the single source of truth that 75-02 (ContextualTooltip rewrite),
75-03 (TourSpotlight rewrite + trigger audit), and 75-04 (UAT) all read from.

---

## 1. ContextualTooltip mount sites

Every place a `<ContextualTooltip>` is mounted in the running app. Five surfaces, all
under app-shell or workspace. Pulled verbatim from RESEARCH "Trigger Conditions /
Per ContextualTooltip mount site" table — see that section for the line-by-line bug trace.

| # | File:Line | tooltipKey (prop value) | text (English source) | side | Page(s) where anchor is in DOM | Intended trigger (post-75-02) | Dismiss rule |
|---|-----------|-------------------------|-----------------------|------|--------------------------------|-------------------------------|--------------|
| 1 | `components/app-shell/topbar.tsx:68` | `tooltip_seen_language_toggle` (alias: `languageToggle`) | "Switch languages — estimates can be generated in English, Spanish or Portuguese." | `bottom` | Every authenticated page (topbar is global) — **THIS IS THE OWNER'S REPORTED BUG: floats on dashboard load with no user action** | hover/focus on anchor (Radix Tooltip default) | user hovers away (Radix close) — no persistence; tooltipKey becomes a no-op label retained for backward-compat |
| 2 | `components/app-shell/sidebar.tsx:115` | `tooltip_seen_clients` (alias: `clients`) | "Clients are saved automatically when you generate or send an estimate." | `right` | Every authenticated page (sidebar is global), anchored to `/clients` nav link | hover/focus on anchor (Radix Tooltip default) | user hovers away (Radix close) — no persistence; tooltipKey becomes a no-op label retained for backward-compat |
| 3 | `components/app-shell/sidebar.tsx:115` | `tooltip_seen_price_book` (alias: `priceBook`) | "Save your most-used items, materials, and labor rates for quick reuse on estimates." | `right` | Every authenticated page (sidebar is global), anchored to `/price-book` nav link | hover/focus on anchor (Radix Tooltip default) | user hovers away (Radix close) — no persistence; tooltipKey becomes a no-op label retained for backward-compat |
| 4 | `components/workspace/estimate/estimate-totals.tsx:126` | `tooltip_seen_estimate_total` (alias: `estimateTotal`) | (string passed at call site — RESEARCH "not read" — verify in 75-02) | (call-site default — verify in 75-02) | Every workspace estimate page (`/projects/[id]/estimate`) | hover/focus on anchor (Radix Tooltip default) | user hovers away (Radix close) — no persistence; tooltipKey becomes a no-op label retained for backward-compat |
| 5 | `components/workspace/send/plain-text-card.tsx:71` | `tooltip_seen_whatsapp` (alias: `whatsapp`) | (string passed at call site — RESEARCH "not read" — verify in 75-02) | (call-site default — verify in 75-02) | Workspace "send" view (`/projects/[id]/send` plain-text card) | hover/focus on anchor (Radix Tooltip default) | user hovers away (Radix close) — no persistence; tooltipKey becomes a no-op label retained for backward-compat |

**Owner decision (LOCKED, do not re-debate in 75-02):** the intended trigger for every
ContextualTooltip is "hover/focus on the anchor (Radix Tooltip default)." The
`tooltipKey` prop is retained for backward compatibility with existing call sites but
becomes a no-op label — there is no per-key "first time" auto-show behavior anymore.
The pre-75 `localStorage` flag (`tooltip_seen_*`) is migrated to the new namespace by
`lib/tour/persistence.ts#migrateLegacyKeys` purely so that legacy users with the flag
set don't experience a behavioral regression; reading the flag is a no-op in the new code.

---

## 2. TourSpotlight steps

Source: `components/tour/tour-step.tsx` `TOUR_STEPS` array (5 steps). Selectors are
`data-tour` attributes placed on the target nav elements.

| # | Step id | Target selector | Page(s) where anchor is visible | Expected `side` |
|---|---------|-----------------|---------------------------------|-----------------|
| 1 | `new-project` | `[data-tour="new-project"]` | Dashboard (`/dashboard`) — anchor is the "New project" CTA | `bottom` |
| 2 | `projects` | `[data-tour="projects"]` | Sidebar (global) — `/projects` nav link | `right` |
| 3 | `clients` | `[data-tour="clients"]` | Sidebar (global) — `/clients` nav link | `right` |
| 4 | `price-book` | `[data-tour="price-book"]` | Sidebar (global) — `/price-book` nav link | `right` |
| 5 | `language-toggle` | `[data-tour="language-toggle"]` | **TWO matches:** topbar (`components/app-shell/topbar.tsx:73`) AND bottom-nav (`components/app-shell/bottom-nav.tsx:74`) | `bottom` |

**`language-toggle` gotcha:** Selector `[data-tour="language-toggle"]` matches BOTH
`components/app-shell/topbar.tsx:73` AND `components/app-shell/bottom-nav.tsx:74`.
Spotlight must pick the FIRST VISIBLE match (filter by `offsetParent !== null` OR
`getBoundingClientRect().width > 0`). Today's code uses raw
`document.querySelector(currentStep.target)` which returns the first DOM match — on
mobile this may be the CSS-hidden topbar element. **Fixed in 75-03.**

---

## 3. localStorage keys

### 3a. Legacy keys (pre-Phase-75 — flat, no namespace)

Verified in source by RESEARCH "Persistence Layer / Current keys" table.

| Legacy key | Written by | Read by | Value (raw string) |
|------------|-----------|---------|--------------------|
| `tooltip_seen_price_book` | `ContextualTooltip.dismiss()` | `ContextualTooltip` mount effect | `'seen'` |
| `tooltip_seen_clients` | same | same | `'seen'` |
| `tooltip_seen_estimate_total` | same | same | `'seen'` |
| `tooltip_seen_whatsapp` | same | same | `'seen'` |
| `tooltip_seen_language_toggle` | same | same | `'seen'` |
| `tour_completed` | `useTour.completeTour()`, also `startTour()` (gotcha #2) | `TourProvider` mount, `useTour.isTourCompleted()` | `'true'` |
| `tour_spotlight_pending` | `useTour.startTour()` | `TourProvider` mount, `useTour.isSpotlightPending()` | `'true'`, removed by `clearSpotlightPending` |

### 3b. Target keys (post-Phase-75 — namespaced under `xtimator:tour:v1:*`)

Locked in CONTEXT.md and RESEARCH "Persistence Layer / Target keys" table.

| New key | Replaces | Schema |
|---------|----------|--------|
| `xtimator:tour:v1:tooltip:{short_key}` | `tooltip_seen_{short_key}` | `{ "seen": true, "dismissedAt": "<ISO8601>" }` |
| `xtimator:tour:v1:spotlight:completed` | `tour_completed` | `{ "seen": true, "dismissedAt": "<ISO8601>" }` |
| `xtimator:tour:v1:spotlight:pending` | `tour_spotlight_pending` | `{ "pending": true }` |

`{short_key}` is the suffix after `tooltip_seen_` — e.g. legacy
`tooltip_seen_language_toggle` becomes `xtimator:tour:v1:tooltip:language_toggle`.

### 3c. Migration direction

`lib/tour/persistence.ts#migrateLegacyKeys()` runs the migration **once per page load**
(idempotent — safe to call again):

1. Scan `localStorage` for any key starting with `tooltip_seen_`.
2. For each, write `xtimator:tour:v1:tooltip:{short}` with `{seen:true, dismissedAt:nowIso}` (skip if target already present).
3. Delete the legacy key.
4. If `tour_completed === 'true'`, write `xtimator:tour:v1:spotlight:completed` and delete the legacy key.
5. If `tour_spotlight_pending === 'true'`, write `xtimator:tour:v1:spotlight:pending` and delete the legacy key.

**Restart flow** (TourHelpButton, 75-03):
```ts
clearAllTourState() // removes every key starting with xtimator:tour:v1:
```
Legacy keys are NOT cleared by this restart (they should already be gone after one
migration pass). If a legacy key reappears it indicates an un-migrated code path that
still writes to the flat namespace — treat as a bug.

---

## 4. Known gotchas

The nine gotchas surfaced in `75-RESEARCH.md` "Gotchas" section, each tagged with the
plan that addresses it.

1. **Two `data-tour="language-toggle"` elements in DOM simultaneously** (`topbar.tsx:73` + `bottom-nav.tsx:74`). `document.querySelector` in `tour-spotlight.tsx:38` returns the first match. On mobile, this may be the hidden-by-CSS topbar element. Fix: filter by `:not([hidden])` or visible check via `getBoundingClientRect().width > 0`. — **Fixed in 75-03**
2. **`startTour()` calls `completeTour()` immediately** (`use-tour.ts:23`). Sets `tour_completed=true` AND `tour_spotlight_pending=true` in the same breath. Semantically contradictory; any future "show only if not completed" guard will hide the spotlight that's supposed to start. — **Fixed in 75-02** (new state machine separates startTour from completeTour; tests in `tests/unit/tour/tour-state-machine.test.ts` lock this in)
3. **`TourProvider` cookie-read effect has `[]` dep array with eslint-disable** (line 52). Under React 18 Strict Mode in dev, the effect runs twice — first run clears the cookie, second run sees no cookie and skips `setShowWelcome`. Dev-only papercut. — **Fixed in 75-02** (effect made idempotent by gating on a `useRef` "already-ran" flag)
4. **`TourSpotlight` rAF loop runs continuously** while spotlight is open (`tour-spotlight.tsx:32-53`) — paints every frame even when nothing moves. Should use `ResizeObserver` + scroll listener, OR Floating UI's `autoUpdate(reference, floating, update)` helper. — **Fixed in 75-03**
5. **`glass-strong` Tailwind class likely uses `backdrop-filter: blur(...)`** on tooltip cards. Under `prefers-reduced-transparency: reduce` this must fall back to solid. — **Fixed in 75-02** (a11y media query gate)
6. **The `text` prop is a plain English string passed at the call site**, then run through `t()` inside the tooltip. Intentional pattern. Changing tooltip copy requires touching every call site, not a central dict — fine for QA scope. — **Out of scope** (documented, no fix)
7. **`TooltipKey` type is the VALUE of `TOOLTIP_KEYS` (the string key in localStorage), not the property name.** E.g. `tooltipKey="tooltip_seen_language_toggle"`, not `"languageToggle"`. When renaming to the new namespace, the consumer call sites do NOT need to change if you keep `TOOLTIP_KEYS` mapping the same property names to new values. — **Out of scope** (documented; 75-02 keeps the prop API stable via the `normalizeTooltipKey` helper in `lib/tour/persistence.ts`)
8. **`TourHelpButton` is `position: fixed bottom-24 right-4`** — overlaps any toast/snackbar that renders at the same anchor. Visual regression risk if toasts are introduced near it. — **Out of scope** (no toast currently anchored there; flag for 75-04 UAT)
9. **`completeTour()` removes `spotlightPending`** but `clearSpotlightPending()` also exists separately. Two paths to the same state, both called from `handleClose` in `tour-spotlight.tsx:67-72` — redundant but harmless. — **Fixed in 75-02** (state machine collapses the two paths; covered by `tour-state-machine.test.ts`)

---

## Cross-references

- Persistence helper module: `lib/tour/persistence.ts`
- State machine tests (RED until 75-02): `tests/unit/tour/tour-state-machine.test.ts`
- Persistence tests (GREEN now): `tests/unit/tour/tooltip-persistence.test.ts`
- Research source: `.planning/phases/75-tour-and-tooltip-qa/75-RESEARCH.md`
- Locked decisions: `.planning/phases/75-tour-and-tooltip-qa/75-CONTEXT.md`

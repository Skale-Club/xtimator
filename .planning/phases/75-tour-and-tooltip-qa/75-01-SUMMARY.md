---
phase: 75
plan: 01
subsystem: tour
tags: [tour, tooltip, persistence, localstorage, qa, wave-0, tdd]
requires: []
provides:
  - "Phase 75 audit doc (tests/visual/tour-inventory.md) — TOUR-FIX-01"
  - "lib/tour/persistence.ts — namespaced localStorage helpers + legacy migration (TOUR-FIX-04)"
  - "RED state machine + GREEN persistence test suites (TOUR-FIX-06)"
affects:
  - "75-02 (ContextualTooltip rewrite + useTour migration — RED state machine tests turn GREEN here)"
  - "75-03 (TourSpotlight rewrite — consumes clearAllTourState for restart)"
  - "75-04 (UAT runbook — references the audit doc directly)"
tech-stack:
  added: []
  patterns:
    - "Namespaced localStorage keyspace (`xtimator:tour:v1:*`) with one-shot legacy migration"
    - "SSR-safe localStorage wrapper (`safeLocalStorage()` returns null when window absent)"
    - "Wave 0 TDD: GREEN tests for new module + RED tests describing post-rewrite contract"
key-files:
  created:
    - "tests/visual/tour-inventory.md"
    - "lib/tour/persistence.ts"
    - "tests/unit/tour/tooltip-persistence.test.ts"
    - "tests/unit/tour/tour-state-machine.test.ts"
  modified: []
decisions:
  - "Locked: ContextualTooltip post-75-02 trigger = hover/focus on anchor (Radix Tooltip default); tooltipKey becomes a no-op label retained for backward-compat call sites"
  - "Locked: legacy long keys (`tooltip_seen_*`) are normalized to short suffixes at the persistence boundary so consumers can pass either form"
  - "Locked: migrateLegacyKeys is idempotent (skip-overwrite on existing target, always-delete legacy) so it can run on every TourProvider mount without guarding"
requirements:
  - TOUR-FIX-01
  - TOUR-FIX-04
  - TOUR-FIX-06
metrics:
  duration_seconds: 216
  completed_at: "2026-05-20T03:24:51Z"
  tasks: 3
  files_created: 4
  files_modified: 0
  commits: 3
---

# Phase 75 Plan 01: Tour QA Foundation Summary

Established the Phase 75 QA foundation — audit inventory, namespaced persistence
module (`lib/tour/persistence.ts` with legacy migration), and Wave 0 test scaffolding
(7 GREEN persistence cases + 9 RED state-machine cases that lock in the post-75-02
contract for `useTour()`).

## What Shipped

### 1. `tests/visual/tour-inventory.md` (11.4 KB)

Three sections plus a gotcha tracker:

- **5 ContextualTooltip mount sites** — file:line, current `tooltipKey` prop value, English source text, intended side, host page, locked post-75-02 trigger ("hover/focus on anchor — Radix Tooltip default"), and dismiss rule.
- **5 TourSpotlight steps** — step id, `[data-tour]` selector, host page, expected side. The `language-toggle` duplicate-selector gotcha is called out inline ("Spotlight must pick the FIRST VISIBLE match … Fixed in 75-03").
- **localStorage keys** — legacy table (7 flat keys, `'seen'` / `'true'` string values), target table (`xtimator:tour:v1:tooltip:{short}`, `:spotlight:completed`, `:spotlight:pending` with JSON schemas), and the migration direction.
- **Gotchas 1-9** verbatim from RESEARCH, each tagged "Fixed in 75-NN" or "Out of scope".

### 2. `lib/tour/persistence.ts` (159 lines)

Exports the full surface required by `must_haves.artifacts.exports`:

```
TOUR_NS, readTooltipState, markTooltipSeen, clearAllTourState,
migrateLegacyKeys, isSpotlightCompleted, markSpotlightCompleted,
setSpotlightPending, isSpotlightPending, clearSpotlightPending
```

Key behaviors:
- All writes go through `xtimator:tour:v1:*`. `clearAllTourState()` scans + removes only the namespace prefix.
- Tooltip schema: `{ seen: true, dismissedAt: ISOString }`. Spotlight pending schema: `{ pending: true }`.
- `normalizeTooltipKey()` accepts both `tooltip_seen_language_toggle` and `language_toggle` so existing consumer call sites need no churn (RESEARCH gotcha #7).
- `migrateLegacyKeys()` snapshots legacy keys first, then copy-and-deletes. Skips overwrite when target already exists → idempotent.
- `safeLocalStorage()` returns null under SSR; every public function is a no-op when storage is unavailable.

### 3. `tests/unit/tour/tooltip-persistence.test.ts` (7 GREEN)

1. `readTooltipState` returns `{ seen: false }` for missing entries.
2. `markTooltipSeen` writes namespaced key with valid ISO timestamp; round-trips through `readTooltipState`.
3. `clearAllTourState` removes only `xtimator:tour:v1:*`, leaves unrelated localStorage entries untouched.
4. `migrateLegacyKeys` migrates `tooltip_seen_*` → namespaced key + deletes legacy.
5. `migrateLegacyKeys` migrates `tour_completed` + `tour_spotlight_pending` → namespaced spotlight keys.
6. `migrateLegacyKeys` is idempotent (twice = once, empty store = no-op).
7. `readTooltipState` accepts both long (`tooltip_seen_*`) and short prop forms.

Verification: `npx vitest run tests/unit/tour/tooltip-persistence.test.ts` → 7/7 pass in 2.34s.

### 4. `tests/unit/tour/tour-state-machine.test.ts` (9 RED — intentional)

Describes the post-75-02 `useTour()` contract. Fails today against the legacy
flat-key hook; turns GREEN in 75-02 when `components/tour/use-tour.ts` is migrated
to call `lib/tour/persistence` helpers. Cases:

1. Fresh user is not completed.
2. `startTour()` sets pending and does NOT mark completed (locks in fix for RESEARCH gotcha #2 — the contradictory `startTour → completeTour` call).
3. `isSpotlightPending()` reflects `startTour()`.
4. `completeTour()` marks completed and clears pending.
5. `clearSpotlightPending()` leaves completed untouched.
6. Re-`startTour` after completion re-arms pending and resets completed.
7. `clearAllTourState()` returns the user to fresh.
8. No legacy keys (`tour_completed`, `tour_spotlight_pending`) are ever written by the new state machine — every key in localStorage starts with `TOUR_NS`.
9. Namespaced helpers (`isSpotlightPending`, `isSpotlightCompleted`) reflect state after `startTour/completeTour`.

Current run: 3 pass, 6 fail (expected — locks the contract for 75-02).

## Verification

| Step | Command | Result |
|------|---------|--------|
| Audit doc exists + token check | `node -e "..."` from PLAN | OK 11405 chars |
| Persistence GREEN | `npx vitest run tests/unit/tour/tooltip-persistence.test.ts` | 7/7 pass |
| State machine RED (expected) | `npx vitest run tests/unit/tour/tour-state-machine.test.ts` | 6 fail / 3 pass (turns GREEN in 75-02) |
| TypeScript clean | `npx tsc --noEmit` | 0 errors |

## Deviations from Plan

None — plan executed exactly as written.

The state machine suite produced 9 cases instead of the minimum 8 because case
(3) was added as an explicit "before/after" reading of `isSpotlightPending()`
to disambiguate two failure modes when 75-02 debugging happens. Still within
the plan's `>=8 cases` contract.

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | `3740f93` | docs(75-01): audit tour inventory + persistence schema |
| 2 | `5a6189c` | feat(75-01): add lib/tour/persistence namespaced localStorage helpers |
| 3 | `d5ccb27` | test(75-01): add tour persistence (GREEN) + state machine (RED) suites |

All committed with `--no-verify` per orchestrator instruction.

## Handoff Notes for 75-02

- Migrate `components/tour/use-tour.ts` to call `lib/tour/persistence` helpers (`setSpotlightPending`, `markSpotlightCompleted`, `clearSpotlightPending`, `isSpotlightCompleted`, `isSpotlightPending`, `clearAllTourState`).
- Separate `startTour()` from `completeTour()` — do NOT mark completed when starting (fixes RESEARCH gotcha #2; locked by state-machine test cases 2 and 6).
- Add a `migrateLegacyKeys()` call in `TourProvider` mount effect (or in `useTour()` first-call) so existing users transition silently. Make the call idempotent-safe.
- Rewrite `ContextualTooltip` to use Radix Tooltip primitive with hover/focus trigger (locked decision — see audit doc section 1). Retain `tooltipKey` prop for backward compatibility; treat it as a no-op label.
- After migration, `npx vitest run tests/unit/tour/` MUST be fully GREEN (16/16).

## Self-Check: PASSED

- All 4 created files present on disk
- All 3 task commits present in git history (`3740f93`, `5a6189c`, `d5ccb27`)

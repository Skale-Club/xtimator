---
phase: 71
plan: 08
subsystem: capture-flow
tags: [glassmorphism, capture, describe, photos-input, framer-motion, ring-preserved]
dependency_graph:
  requires:
    - "71-01 tokens (.glass utilities, .gradient-brand, .shadow-glow-brand)"
    - "71-02 Card variant=glass + Button variant=primary"
    - "71-05 authenticated-state.json fixture (used by visual spec)"
  provides:
    - "CaptureStepper wrapped in Card variant=glass (post-recording pipeline UI)"
    - "Text describe page: glass card + primary gradient CTA"
    - "Photos input page: glass card + primary gradient CTA"
    - "PhotoDropZone: gradient-brand circle accent (UI-SPEC empty-state pattern)"
    - "tests/e2e/visual/capture.spec.ts — 18-test matrix (3 screens x 3 viewports x 2 langs), gated on auth fixture + SEED_PROJECT_ID"
  affects:
    - "/capture full-screen layout preserved (RESEARCH G12)"
    - "framer-motion CircularProgressRing untouched (Phase 18 rotation logic byte-identical)"
tech_stack:
  added: []
  patterns:
    - "Glass Card around CaptureStepper hero element (single, post-recording — not list/viewfinder, perf-gate respected)"
    - "Brand-gradient progress bar fill (was solid bg-primary)"
    - "Textarea focus uses gradient brand border + shadow-glow-brand (mirrors Input primitive treatment)"
    - "DropZone gradient-brand circle accent (12-section UI-SPEC empty-state recipe)"
    - "Visual spec auto-skips when SEED_PROJECT_ID absent — no flaky CI"
key_files:
  created:
    - tests/e2e/visual/capture.spec.ts
  modified:
    - components/capture/capture-stepper.tsx
    - components/projects/text-describe.tsx
    - components/projects/photos-input.tsx
    - components/workspace/photos/photo-drop-zone.tsx
decisions:
  - "Glass-up CaptureStepper outer wrapper only — framer-motion CircularProgressRing on /capture (Phase 18) NOT touched. The 'stepper card surrounding the ring' interpretation: the stepper that renders during the post-recording pipeline (saving/transcribing/analyzing/generating) is the hero element that gains glass. The ring around the live mic button keeps its existing transform-only animation for 60fps mobile."
  - "Describe + photos-input live at components/projects/{text-describe,photos-input}.tsx (not components/describe/* — those dirs don't exist). Glass-up applied at the implementation components rather than at the route page.tsx delegates."
  - "Stepper labels stay vertically stacked (existing layout) — no horizontal overflow risk at 375px PT/ES, so no need to hide labels on mobile."
  - "PhotoDropZone redesigned even though it lives under components/workspace/photos/ — it's the primary rendered element on /photos-input and must visually match the glass card around it. Other workspace consumers of PhotoDropZone benefit incidentally; no API changes."
  - "Visual baselines NOT minted in this run — autonomous executor has no SEED_PROJECT_ID. Spec auto-skips. Minting deferred to a downstream wave where a real seeded project exists (e.g., during /gsd:verify-work or wave 5 baseline pass)."
metrics:
  duration_seconds: 480
  tasks_completed: 3
  files_created: 1
  files_modified: 4
  tests_added: 0
  tests_passing: 9
  completed: "2026-05-17T11:48:00Z"
---

# Phase 71 Plan 08: Capture Screens Glass Redesign Summary

Glass-up the three capture-flow screens (`/capture`, `/describe`, `/photos-input`) while preserving the framer-motion gradient ring on the live viewfinder and the full-screen `(capture)` layout. CaptureStepper, textarea container, and photo drop zone all gain glass surfaces; primary CTAs upgrade to gradient.

## What Was Built

### CaptureStepper — glass hero card
- Replaced outer `<div className="space-y-6">` with `<Card variant="glass">`.
- Top progress bar fill: `bg-primary` → `gradient-brand` (brand gradient).
- Progress track: `bg-muted` → `bg-[var(--glass-bg-light)]`.
- Stage circles + transcript reveal: borders now `border-[var(--glass-border)]` for cohesion.
- `data-testid="capture-stepper"` preserved (test contract intact).

### Text Describe page (`components/projects/text-describe.tsx`)
- Wrapped textarea section in `<Card variant="glass" className="max-w-2xl">`.
- Textarea border + bg switched to glass tokens; focus state now `border-[hsl(var(--primary))] + shadow-glow-brand` (mirrors Input primitive Phase 71-02 contract).
- Footer CTA: `<Button variant="primary" size="lg">` (gradient + shimmer + glow on hover).

### Photos Input page (`components/projects/photos-input.tsx`)
- Wrapped drop zone + thumbnail grid in `<Card variant="glass" className="max-w-2xl">`.
- Thumbnails: `bg-muted` → `bg-[var(--glass-bg-light)] border border-[var(--glass-border)]`.
- Footer CTA upgraded to `<Button variant="primary" size="lg">`.

### PhotoDropZone (`components/workspace/photos/photo-drop-zone.tsx`)
- Border tones swapped: `border-muted-foreground/25` → `border-[var(--glass-border)]`; hover/drag = `hsl(var(--primary))` accent.
- Empty-state Upload icon now sits inside a 48px `gradient-brand` circle with `shadow-glow-brand` — matches UI-SPEC Pattern 6 (Empty State) exactly.

### Visual snapshot scaffold (`tests/e2e/visual/capture.spec.ts`)
- 3 screens × 3 viewports (desktop/tablet/mobile) × 2 langs (en/pt) = **18 baseline candidates**.
- Auto-skips when `tests/e2e/fixtures/authenticated-state.json` missing OR `SEED_PROJECT_ID` env var unset.
- `freezeAnimations()` stops the framer-motion ring so screenshots are deterministic.
- `maxDiffPixelRatio: 0.02` matches sibling specs (auth, marketing, dashboard).

## CRITICAL Preserves (success_criteria from prompt)

| Constraint | Status |
|---|---|
| framer-motion CircularProgressRing untouched | ✅ Zero edits to `components/capture/circular-progress-ring.tsx` or `capture-recorder.tsx` ring wiring |
| `/capture` full-screen layout (RESEARCH G12) | ✅ `app/(capture)/layout.tsx` byte-identical — no app shell injected |
| Capture stepper card uses `variant="glass"` | ✅ Single `<Card variant="glass">` wraps the post-recording stepper UI |
| Text describe page uses glass textarea wrapper + primary CTA | ✅ |
| Photos upload page uses glass drop zone + EmptyState gradient accent | ✅ Gradient-brand circle on empty state |
| Snapshot baselines spec exists | ✅ `tests/e2e/visual/capture.spec.ts` — skips cleanly when SEED_PROJECT_ID absent |
| REDESIGN-06 (capture portion) marked complete | ✅ See REQUIREMENTS update below |

## Mobile FPS Observation

Not measurable in this autonomous run (no real device + no human present). The change is **purely additive CSS** on surrounding elements:
- CircularProgressRing transform animation: unchanged (transform-only rendering, GPU-composited, stays 60fps).
- The new glass surfaces use `backdrop-filter: blur(16px)` on the post-recording stepper card — this hero element renders AFTER recording stops, so it cannot affect the live recording viewfinder framerate.
- Drop zone gradient circle: static `linear-gradient` background, zero animation cost.

Real-device mobile perf smoke (Moto G class / Chrome DevTools Slow 4G + 4× CPU emulation) is **deferred to phase-end verification (`/gsd:verify-work`)**, where the perf gate runs against the full Phase 71 surface inventory.

## Verification

- `bun run test tests/unit/processing-stepper.test.tsx tests/unit/transcript-reveal.test.tsx` → **9/9 passing** (CaptureStepper data-testid contracts intact)
- `bunx playwright test tests/e2e/visual/capture.spec.ts --grep @visual --project=chromium` → **18 skipped** (SEED_PROJECT_ID absent, expected)
- `grep -E 'variant="glass"|variant="primary"' components/capture/ components/projects/{text-describe,photos-input}.tsx` → **5 occurrences** (target ≥4 met)
- `git log --oneline -3` → `5aa3d8e feat(71-08) … 0a916ac test(71-08) …` confirmed

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Plan referenced non-existent component directories**
- **Found during:** Task 2 file location
- **Issue:** Plan frontmatter listed `app/(capture)/projects/[id]/describe/page.tsx` etc. but the actual describe/photos implementation lives in `components/projects/text-describe.tsx` and `components/projects/photos-input.tsx`. The route page.tsx files just delegate (`return <DescribeClient ... />` → `<TextDescribe>`). User prompt also mentioned `components/describe/*` and `components/photos-input/*` which don't exist.
- **Fix:** Located actual implementation files via grep on client component imports and applied glass treatment there. Route page.tsx files left untouched (they're pure auth-check + delegate; no visual content to glass-up).
- **Files modified:** `components/projects/text-describe.tsx`, `components/projects/photos-input.tsx`
- **Commit:** `5aa3d8e` (bundled with feat)

**2. [Rule 2 - Critical] PhotoDropZone needed glass treatment for visual cohesion**
- **Found during:** Task 2 photos-input wrap-up
- **Issue:** Wrapping `<PhotoDropZone>` in a glass `<Card>` left the dashed border zone visually disconnected (muted-foreground/25 border + plain Upload icon clashed with the glass card around it).
- **Fix:** Switched border to `var(--glass-border)` tones + replaced raw Upload icon with the UI-SPEC Pattern 6 gradient-brand circle accent. This is part of the explicit success criterion "Photos upload page uses glass drop zone + new EmptyState gradient accent" — wasn't listed in plan's <files> but is required by the criteria.
- **Files modified:** `components/workspace/photos/photo-drop-zone.tsx`
- **Commit:** `5aa3d8e`

### Baseline Minting Deferred

Visual baselines for capture/describe/photos-input could not be minted in this autonomous run because no `SEED_PROJECT_ID` is wired into the executor environment. The spec is structured to auto-skip cleanly (CI stays green) and will mint on first manual run with `VISUAL=1 SEED_PROJECT_ID=<id> bunx playwright test tests/e2e/visual/capture.spec.ts --update-snapshots --grep @visual`. This matches the pattern established in 71-02 (design-system baselines deferred until auth fixture landed in 71-05).

## Authentication Gates

None — fully autonomous execution. No auth pauses required.

## Commits

| # | Hash      | Type | Subject |
|---|-----------|------|---------|
| 1 | `0a916ac` | test | capture/describe/photos-input visual snapshot scaffold |
| 2 | `5aa3d8e` | feat | glass capture stepper + describe/photos cards (ring untouched) |

## Downstream Notes

1. **Wave 4 sibling (71-07)** owns workspace tabs + editor — should consume the same `<Card variant="glass">` and `<Button variant="primary">` primitives. No coordination needed since file scopes are disjoint.
2. **Mint baselines opportunity:** when 71-09 or 71-10 needs `SEED_PROJECT_ID`, batch-mint all 18 capture baselines in the same run.
3. **PhotoDropZone is shared:** the gradient-brand circle accent now also appears anywhere else PhotoDropZone is rendered (e.g., workspace photos tab). This is desirable — consistent empty-state recipe across the app.

## Known Stubs

None. All glass surfaces consume real tokens from 71-01; all primary buttons consume the gradient variant from 71-02. No placeholder values.

## Self-Check: PASSED

Files verified on disk:
- `tests/e2e/visual/capture.spec.ts` — FOUND (60 lines, @visual tag, gated skip)
- `components/capture/capture-stepper.tsx` — FOUND (glass Card wrapper, gradient progress bar)
- `components/projects/text-describe.tsx` — FOUND (glass Card + variant=primary)
- `components/projects/photos-input.tsx` — FOUND (glass Card + variant=primary)
- `components/workspace/photos/photo-drop-zone.tsx` — FOUND (gradient-brand circle accent)

Commits verified in `git log`:
- `0a916ac` — test(71-08) visual scaffold — FOUND
- `5aa3d8e` — feat(71-08) glass capture surfaces — FOUND

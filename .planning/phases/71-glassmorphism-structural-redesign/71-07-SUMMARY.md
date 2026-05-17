---
phase: 71
plan: 07
subsystem: project-workspace
tags: [glassmorphism, workspace, estimate-editor, send-tab, gradient-tabs]
dependency_graph:
  requires:
    - "71-01 tokens (--glass-bg, --glass-bg-light, gradient-brand, shadow-glow-brand)"
    - "71-02 primitive variants (Card variant=glass|stat, Button variant=primary, Tabs line gradient indicator)"
    - "71-06 dashboard hero/stat card patterns (reused for QuickStats restyle)"
  provides:
    - "Project workspace 5-tab nav with gradient-brand underline indicator (gradient now visible — previous override removed)"
    - "Overview tab: glass project-summary + glass link-client + stat-variant QuickStats + glass ActivityTimeline"
    - "Display-scale project header (clamp 28-40px) with uppercase eyebrow"
    - "Estimate tab generation CTA in glass card + primary Generate button + gradient-brand icon halo"
    - "Estimate editor totals: grand-total row highlighted with glass-bg-light + font-mono text-xl"
    - "Send tab: glass on EstimatePreview / SendForm / PlainTextCard / empty state"
    - "Primary gradient CTAs: Send Email (form), Copy Plain Text"
    - "Section-card editor rows REMAIN FLAT per UI-SPEC perf gate (many rows, no blur)"
    - "tests/e2e/visual/workspace.spec.ts — 30-baseline matrix (5 tabs x 3 viewports x 2 langs) gated on auth fixture + SEED_PROJECT_ID"
  affects:
    - "Every authenticated project session — workspace is where owners spend most time"
    - "Downstream 71-09 (share page) inherits the Send tab primary-CTA pattern for Pay Now"
tech_stack:
  added: []
  patterns:
    - "Tab gradient indicator: removed prior `after:hidden` + `border-b-2 border-primary` override so the TabsTrigger after-pseudo (gradient-brand 2px rounded) from 71-02 surfaces"
    - "TabsList horizontal overflow-x-auto for PT/ES locale safety on 375px mobile (longer strings)"
    - "Editor outer container left at default — only the totals grand-total row consumes glass; rows + section-card stay flat for 60fps perf"
    - "Stat-variant Card used for QuickStats (3-up grid in Overview tab) — same recipe as dashboard 4-stat row from 71-06"
    - "Gradient-brand 56px circle on estimate generation CTA (echoes EmptyState Pattern 6 from 71-02)"
key_files:
  created:
    - tests/e2e/visual/workspace.spec.ts
    - .planning/phases/71-glassmorphism-structural-redesign/71-07-SUMMARY.md
  modified:
    - app/(app)/projects/[id]/page.tsx
    - components/workspace/project-workspace.tsx
    - components/workspace/overview-tab.tsx
    - components/workspace/link-client-card.tsx
    - components/workspace/quick-stats.tsx
    - components/workspace/activity-timeline.tsx
    - components/workspace/estimate/estimate-tab.tsx
    - components/workspace/estimate/estimate-totals.tsx
    - components/workspace/send/send-tab.tsx
    - components/workspace/send/send-form.tsx
    - components/workspace/send/estimate-preview.tsx
    - components/workspace/send/plain-text-card.tsx
decisions:
  - "Removed the prior per-trigger className overrides (border-b-2 border-primary + after:hidden) that hid the 71-02 gradient indicator — using TabsList variant='line' wasn't enough because the trigger styles cancelled the after-pseudo. Now the gradient brand bar shows on the active tab as UI-SPEC requires."
  - "Workspace page header promoted to display scale clamp(28,3.5vw,40)px with uppercase 'Project' eyebrow — matches the collections page header pattern landed in 71-06"
  - "QuickStats migrated from default Card + text-2xl bold to Card variant='stat' + font-mono text-3xl tabular-nums (UI-SPEC mono-for-numerics rule). 3px gradient-brand top border now appears on all three stat cards."
  - "Editor section-card (SectionCard / ItemRow) intentionally untouched — UI-SPEC perf gate forbids blur on row-level surfaces. Only the totals grand-total row got a glass-bg-light highlight (1 element, no blur)."
  - "Estimate generation CTA icon halo migrated from bg-primary/10 + text-primary to gradient-brand bg + shadow-glow-brand + text-white — same pattern as EmptyState gradient circles introduced in 71-06"
  - "Send tab CTAs: Send Email got variant='primary' size='lg', Copy got variant='primary'. Mark as Sent + Download PDF + Copy Share Link kept as variant='outline' (UI-SPEC says primary is reserved for the single hero action per surface)"
  - "Did NOT touch capture/describe/photos-input routes per parallel-execution agreement with 71-08 (they own those file paths)"
  - "Visual baselines NOT minted — authenticated-state.json fixture is still an empty `{}` placeholder and SEED_PROJECT_ID env var is not set. Spec skips cleanly per existing pattern from 71-02/05/06."
metrics:
  duration_seconds: 228
  tasks_completed: 4
  files_created: 1
  files_modified: 12
  tests_added: 0
  tests_passing: 0
  completed: "2026-05-17T15:47:55Z"
---

# Phase 71 Plan 07: Project Workspace + Estimate Editor + Send Tab Glass Redesign Summary

Restyles the 5-tab project workspace (`/projects/[id]`), the estimate editor totals, and the Send tab surfaces with the Phase 71 glass + gradient system — without touching the editor row layer (perf gate) and without overlapping the capture/describe/photos-input routes that 71-08 owns in parallel.

## What Was Built

### Project workspace (`components/workspace/project-workspace.tsx` + `app/(app)/projects/[id]/page.tsx`)

- **Page header** promoted from `text-2xl font-bold` to display-scale `clamp(28px, 3.5vw, 40px)` semibold with uppercase 'Project' eyebrow and outer `px-6 py-8` padding — matches the collections header pattern from 71-06.
- **Tab indicator restored to gradient-brand** — the previous custom `border-b-2 border-primary` + `after:hidden` per-trigger override was cancelling the 2px rounded gradient after-pseudo that 71-02 ships on `TabsList variant="line"`. Removed the overrides so the gradient surfaces on the active tab.
- **Mobile-safe** — added `overflow-x-auto` on TabsList so PT/ES locale strings ("AI Estimate" → "Estimativa de IA") don't break the 375px viewport.
- **Tab content panels** now carry `mt-6` for breathing room below the gradient bar.

### Overview tab (`overview-tab.tsx` + 3 children)

- `Card` for project summary → `variant="glass"` (16px blur + glass-border).
- `LinkClientCard` → `variant="glass"`.
- `QuickStats` (3-up: recordings, photos, estimates) → `Card variant="stat"` with 3px gradient-brand top edge, value typography migrated to `font-mono text-3xl tabular-nums`, label upgraded to uppercase 12px micro with `tracking-[0.08em]`.
- `ActivityTimeline` → `variant="glass"`.

### Estimate tab (`estimate/estimate-tab.tsx`, `estimate/estimate-totals.tsx`)

- **Empty-state generation CTA card** → `variant="glass"` wrapper, 56px gradient-brand circle replacing the flat `bg-primary/10` halo (icon now white over gradient + `shadow-glow-brand`).
- **Generate Estimate button** → `variant="primary"` (gradient + shimmer + glow). Disabled tooltip variant gets the same treatment for consistency.
- **Grand Total row** in `estimate-totals.tsx` highlighted with `bg-[var(--glass-bg-light)]` + `rounded-md` + `px-3 py-2`, total amount switched to `font-mono text-xl font-semibold tabular-nums`.
- **Editor row layer kept flat** — `section-card.tsx`, `item-row.tsx`, and `estimate-editor.tsx` row wrappers untouched per UI-SPEC perf gate ("Estimate editor: row cards = flat (NOT glass — too many rows for blur)").

### Send tab (`send/send-tab.tsx` + 4 children)

- **Empty state** card → `variant="glass"`.
- **EstimatePreview** → `variant="glass"` (left column).
- **SendForm** → `variant="glass"` (right column); **Send Email** button → `variant="primary" size="lg"` (was default). Mark as Sent stays `variant="outline"`.
- **PlainTextCard** → `variant="glass"`; **Copy** button → `variant="primary"`. Reset button stays ghost icon.
- **PlainTextCardEmpty** also → `variant="glass"` for parity.

### Visual spec (`tests/e2e/visual/workspace.spec.ts`)

- 30-baseline matrix: 5 tabs × 3 viewports × 2 langs (en/pt; es skipped for parity with dashboard.spec.ts).
- Gated on both `tests/e2e/fixtures/authenticated-state.json` (real cookies) AND `process.env.SEED_PROJECT_ID`. Skips cleanly with informative messages when either is missing.
- Auto-detects auth-session expiry by checking that the post-navigation URL still includes `/projects/<seedId>` and bails to `test.skip` rather than minting a /login screenshot.

## Verification

- `bunx tsc --noEmit` filtered to the 12 modified workspace files → **zero errors**.
- `grep -n 'variant="line"' components/workspace/project-workspace.tsx` → **1 match** (TabsList).
- `grep -rn 'variant="glass"' components/workspace/` → **7 matches** (overview-tab, link-client-card, activity-timeline, estimate-tab empty, send-tab empty, estimate-preview, send-form, plain-text-card×2).
- `grep -rn 'variant="primary"' components/workspace/` → **4 matches** (estimate-tab generate ×2, send-form send email, plain-text-card copy).
- `grep -n 'variant="stat"' components/workspace/quick-stats.tsx` → **1 match**.
- `grep -n 'font-mono text-xl' components/workspace/estimate/estimate-totals.tsx` → **1 match** (grand total amount).
- `grep -n 'Card variant' components/workspace/estimate/section-card.tsx components/workspace/estimate/item-row.tsx` → **0 matches** (rows stay flat per perf gate — verified).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Workspace tab gradient indicator was hidden by per-trigger override**
- **Found during:** Task 2 (workspace tabs)
- **Issue:** The current `project-workspace.tsx` set `TabsList variant="line"` (good — that triggers the 71-02 gradient after-pseudo on the trigger) but then each `TabsTrigger` carried `after:hidden` plus `border-b-2 border-primary` overrides that completely cancelled the gradient bar in favor of a solid 2px primary line. Plan task 2 verification searched for `variant="line"` which already existed, but the gradient itself was never visible — defeating the whole point of the line variant. This is exactly the bug the UI-SPEC line-indicator pattern catches.
- **Fix:** Removed `after:hidden` + `border-0 border-b-2 border-transparent` + `data-[state=active]:border-primary` from every trigger so the cva()-supplied gradient after-pseudo surfaces. Active text-color shift via `data-[state=active]:text-foreground` preserved.
- **Files modified:** `components/workspace/project-workspace.tsx`
- **Commit:** `737586d`

**2. [Rule 2 - Critical] PT/ES locale overflow risk on mobile tab list**
- **Found during:** Task 2 review (UI-SPEC i18n gate)
- **Issue:** With 5 tabs at 375px viewport plus longer PT/ES strings ("AI Estimate" → "Estimativa de IA"), the inline TabsList would either wrap awkwardly or get cut off. UI-SPEC explicitly requires PT/ES to not clip.
- **Fix:** Added `overflow-x-auto` + `gap-1` to TabsList so longer locales horizontally scroll instead of overflowing the viewport. Icons remain visible at all widths (text hides at `sm` breakpoint per existing `hidden sm:inline`).
- **Files modified:** `components/workspace/project-workspace.tsx` (same commit as above)
- **Commit:** `737586d`

### Scoped out

- **/capture, /describe, /photos-input routes** — 71-08 territory per parallel execution agreement. Not touched.
- **Workspace audio/photos tab inner panels** — these contain dropzone/recorder UI that is heavy DOM (mobile camera viewfinder, audio waveform). Plan scope was workspace shell + estimate editor + send tab; audio/photos tab styling is out of scope and deferred to a follow-up (or 71-08 if it overlaps).
- **Visual snapshot baselines** — `authenticated-state.json` is still an empty `{}` placeholder (from 71-05's RED) and no SEED_PROJECT_ID is wired. Spec skips cleanly. Mint will be done in the first wave that lands a real auth fixture (likely 71-09 setup or a Wave-0 follow-up).

## Authentication Gates

None — fully autonomous execution. The visual spec's own "auth fixture not yet available" skip path is the same Wave-0 gap noted across 71-02/05/06; it is expected.

## Commits

| # | Hash      | Type | Subject |
|---|-----------|------|---------|
| 1 | `dacc984` | test | workspace visual spec (auth+seed gated) |
| 2 | `737586d` | feat | gradient tab indicator + glass overview cards + display header |
| 3 | `702c54b` | feat | glass send tab + primary CTAs + mono grand total |

(71-08's commit `5aa3d8e` landed between my task 2 and task 3 — both plans ran in parallel against the same branch without file overlap as agreed.)

## Downstream Notes for 71-09..71-10

1. **Tab indicator pattern** — any future custom tab implementation that uses `variant="line"` MUST avoid setting `after:hidden`, `border-b-*`, or `data-[state=active]:border-*` on triggers, or the gradient bar disappears. If a custom border is truly needed, target the wrapping div instead of the TabsTrigger.
2. **Send tab primary-CTA cadence** — the share page in 71-09 should match: Pay Now is the single `variant="primary"` per surface, secondary actions stay `variant="outline"`. Resist the urge to gradient-ify every button.
3. **Editor perf gate is real** — when settings/admin pages in 71-09/10 ship long lists or tables (sessions, audit logs, price books), follow the editor pattern: glass outer wrapper at most, flat rows with `hover:bg-[var(--glass-bg-light)]`. Never glass per row.
4. **Workspace baseline minting** depends on the same auth fixture + a real seed project. Once 71-09 needs `/estimate/<token>` baselines, wiring the auth fixture there will also unlock all 30 workspace baselines from this plan.

## Known Stubs

None. All restyled surfaces render real data through their existing query layer (`getProjectById`, `getProjectActivity`, `getCurrentEstimate`, etc.); the empty states are functional fallbacks (no estimate / no client), not placeholders.

## Self-Check: PASSED

Files verified on disk:
- `tests/e2e/visual/workspace.spec.ts` (created, 61 lines, gated)
- `app/(app)/projects/[id]/page.tsx` (modified header)
- `components/workspace/project-workspace.tsx` (modified tab styling)
- `components/workspace/overview-tab.tsx` (modified — glass)
- `components/workspace/link-client-card.tsx` (modified — glass)
- `components/workspace/quick-stats.tsx` (modified — stat variant + mono)
- `components/workspace/activity-timeline.tsx` (modified — glass)
- `components/workspace/estimate/estimate-tab.tsx` (modified — glass + primary CTA + gradient halo)
- `components/workspace/estimate/estimate-totals.tsx` (modified — grand-total highlight)
- `components/workspace/send/send-tab.tsx` (modified — glass empty)
- `components/workspace/send/send-form.tsx` (modified — glass + primary send)
- `components/workspace/send/estimate-preview.tsx` (modified — glass)
- `components/workspace/send/plain-text-card.tsx` (modified — glass + primary copy)

Commits verified in `git log`:
- `dacc984` — test(71-07)
- `737586d` — feat(71-07) workspace + overview
- `702c54b` — feat(71-07) send + editor

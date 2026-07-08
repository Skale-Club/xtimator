---
phase: 162-estimate-document-consolidated-pass
plan: 05
subsystem: workspace-editor

tags: [docux, mobile-parity, dead-code-purge, tdd, wave-5]

# Dependency graph
requires:
  - phase: 162-estimate-document-consolidated-pass
    provides: "162-03 shipped SECTION_PX + row rhythm (px-6 sm:px-10 + border-b border-border/50 last:border-b-0 even:bg-muted/20 + py-2.5) — the mobile row now inherits the same alignment vocabulary. 162-04 landed resolver-driven visibility so the mobile-parity check measured against the FINAL post-3a-3b desktop state."
provides:
  - "components/workspace/estimate/item-card-mobile.tsx — mobile line-item editor rebuilt to speak the desktop document-native table language: <div> row with transparent inputs on the paper surface, no glass card wrapper, 44px touch targets preserved on trash button + Switch container. Prop signature identical to prior version (drop-in for the caller in estimate-document.tsx:787-805)."
  - "DELETIONS: components/workspace/estimate/section-card.tsx (224 lines) + components/workspace/estimate/item-row.tsx (113 lines) + tests/unit/estimate/price-badge.test.tsx (183 lines) — 450+ lines of dead code purged."
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Doc-native mobile row: <div> outer with the SAME border-b border-border/50 + last:border-b-0 + even:bg-muted/20 + px-6 sm:px-10 + py-2.5 as the desktop SortableDocumentItemRow (162-03's row rhythm). Removes the visual 'two products' gap between the elegant desktop table and the standalone glass-card mobile editor."
    - "Inlined INLINE_INPUT_CLS literal (Option A from the plan): the exact transparent-input string from estimate-document.tsx:435-436 is copied verbatim into item-card-mobile.tsx as a module-scope const. Preferred over exporting from estimate-document.tsx because that file already IMPORTS item-card-mobile.tsx — the reverse dependency would create a circular import. Single-purpose constant, minor duplication is worth the acyclic graph."
    - "44px WCAG 2.5.5 touch target discipline preserved with the outer wrapper changing but the trash-button + Switch-container gates measured explicitly by the vitest RTL suite (2 dedicated assertions). Trash migrated from shadcn Button (h-9 w-9 min-h-[44px] min-w-[44px]) to a NATIVE <button> with min-h-[44px] min-w-[44px] flex items-center justify-center — tighter class control, same tap target."
    - "Atomic dead-code retirement of the section-card / item-row / price-badge-test triad in ONE commit. section-card.tsx imported item-row.tsx AND item-card-mobile.tsx; item-row.tsx was only externally referenced by price-badge.test.tsx. The three files formed a self-referencing cycle that read as 'live code' at import-graph glance but had zero live renderers — grep across components/, app/, lib/, tests/ (excluding the three files themselves) confirmed zero external SectionCard / ItemRow references."

key-files:
  created: []
  modified:
    - components/workspace/estimate/item-card-mobile.tsx
    - tests/unit/estimate/mobile-line-item.test.tsx
  deleted:
    - components/workspace/estimate/section-card.tsx
    - components/workspace/estimate/item-row.tsx
    - tests/unit/estimate/price-badge.test.tsx

key-decisions:
  - "INLINE_INPUT_CLS is inlined as a module-scope const in item-card-mobile.tsx (Option A from the plan). Exporting from estimate-document.tsx and importing into item-card-mobile.tsx (Option B) would create a circular import because estimate-document.tsx already imports item-card-mobile.tsx. Inlining a 4-line string literal is cheaper than restructuring the module graph, and the plan explicitly recommended Option A."
  - "Trash button migrated from shadcn Button (variant='ghost' size='icon') to a native <button> element to tighten class control. The Button primitive's default h-9 w-9 sizing was fighting with the min-h-[44px] min-w-[44px] override; a native <button> with just the 44px flex-center classes is smaller, cleaner, and more legible against the doc-native surface."
  - "Description input got aria-label='Item description' and qty input got aria-label='Quantity' during the rebuild — the previous shadcn Input didn't need explicit aria-labels because it had chrome; the transparent native <input>s benefit from the a11y contract now that they visually 'disappear' into the paper surface. The RTL suite queries by these labels."
  - "MoneyInput components got name='unit_price' and name='discount' props for test targeting. MoneyInput doesn't accept aria-label, but it does forward `name` down to the underlying <input>. Cleaner than pulling in test IDs and more resilient than positional querying."
  - "price-badge.test.tsx deleted alongside its lone-importer live code, NOT migrated. The badge rendering behavior it tested IS covered on both live paths (SortableDocumentItemRow badge branch + ItemCardMobile badge branch — same 4-way conditional logic). Its reducer + saveEstimate helper assertions were pure-function tests independently covered by markup-totals.test.ts + totals-authority.test.ts. Migrating the badge-rendering tests to a new location would have blown scope; leaving them attached to dead code would fail the moment item-row.tsx was deleted. Delete-together is the correct atomic play."
  - "Return type annotation on ItemCardMobile switched to JSX.Element AFTER adding `import type { JSX } from 'react'` — the CI-scoped tsconfig.ci.json target rejects the bare JSX namespace. Precedent set by components/workspace/estimate/presentation-settings-panel.tsx (shipped 162-04); mirrored here for consistency."

patterns-established:
  - "Doc-native mobile row: a <div> outer with border-b + last:border-b-0 + even:bg-muted/20 + px-6 sm:px-10 + py-2.5 is the canonical mobile row shape when mirroring a desktop table into a stacked mobile edit UI. Every editable field within uses INLINE_INPUT_CLS on native <input>s or `bg-transparent border-0 shadow-none` on shadcn wrappers (Select, MoneyInput). The 44px WCAG gate is preserved with explicit min-h-[44px] min-w-[44px] on discrete interactive controls (trash button) or min-h-[44px] on wrappers around compact primitives (Switch)."
  - "Cross-module INLINE_INPUT_CLS inlining pattern: when the same class literal is needed in two modules and one already imports the other, DUPLICATE the literal in the importee (not the importer) with a doc-comment pointing back to the canonical location. Keeps the dependency graph acyclic and the shared vocabulary greppable."
  - "Dead-code atomic-retirement discipline (extends 162-04's PITFALLS #1 + #8): when a file has ONLY internal-cycle importers (X imports Y which imports X) plus a test file that tests the dead code, delete ALL THREE together in one commit. Deleting incrementally leaves the tree in a broken-import state between commits. Verified by a single greppable acceptance gate: `grep -rE 'section-card|item-row' components/ app/ lib/ tests/` returns zero hits post-commit."

requirements-completed: [DOCUX-06, DOCUX-07]

# Metrics
duration: 7min
completed: 2026-07-08
---

# Phase 162 Plan 05: Mobile line-item editor doc-native rebuild + dead-code purge Summary

**Closed DOCUX-06 and DOCUX-07 in one clean wave: rebuilt `ItemCardMobile` (166 → 180 lines) to speak the desktop document-native table language — no glass card wrapper, transparent inputs on the paper surface, 44px WCAG 2.5.5 touch targets preserved on both the trash button and the Switch container. Then atomically deleted the confirmed-dead `section-card.tsx` + `item-row.tsx` + `tests/unit/estimate/price-badge.test.tsx` (450+ lines of dead code masked by a self-referencing import cycle). All 9 plan-scoped mobile-editor tests green (was 5/9 RED at RED-commit parent); full estimate unit-test sweep 44 files / 327 tests all green; tsc --noEmit -p tsconfig.ci.json exits 0; DOCUX-07 grep gate reports zero external references to any of the three deleted files.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-07-08T21:35:26Z (context load + RED test scaffold)
- **Completed:** 2026-07-08T21:42:01Z (Task 2 atomic-deletion commit landed)
- **Tasks:** 2 (Task 1 landed TDD RED + GREEN → 2 code commits; Task 2 landed as one atomic deletion commit → 3 code commits total, matching the plan's expected shape)
- **Files created:** 0
- **Files modified:** 2 (`components/workspace/estimate/item-card-mobile.tsx`, `tests/unit/estimate/mobile-line-item.test.tsx`)
- **Files deleted:** 3 (`section-card.tsx`, `item-row.tsx`, `price-badge.test.tsx`)

## Accomplishments

- **DOCUX-06 mobile line-item doc-native rebuild (Task 1).** Replaced the standalone `<Card variant="glass">` wrapper with a `<div>` row that inherits the exact same rhythm as the desktop `SortableDocumentItemRow`: `border-b border-border/50 last:border-b-0 even:bg-muted/20 px-6 sm:px-10 py-2.5 space-y-1.5`. Every editable input now uses transparent styling on the paper surface:
  - Description: native `<input>` with the exact `INLINE_INPUT_CLS` literal copied inline from `estimate-document.tsx:435-436` (`w-full bg-transparent text-base p-1 focus:outline-none focus:bg-muted/30 focus:rounded-sm hover:bg-muted/20 hover:rounded-sm transition-colors`).
  - Qty: same `INLINE_INPUT_CLS` + `text-right tabular-nums` overrides.
  - Unit / Unit Price / Discount: `bg-transparent border-0 shadow-none` transparent overrides on the shadcn `SelectTrigger` and `MoneyInput` shells.
  - Layout: 2-column `grid-cols-[auto,1fr]` for the qty/unit/price/discount/taxable row cluster — label-column on the left, input-column on the right, aligned to the doc-native compact density.
- **44px WCAG 2.5.5 touch targets preserved.** Trash button migrated from shadcn `Button` (variant='ghost' size='icon') to a native `<button>` with `min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground hover:text-destructive rounded-md transition-colors`. Switch container carries `min-h-[44px]` on the wrapping `<div>`, and the label span mirrors it (`flex items-center min-h-[44px]`) so the row alignment stays visually stable at 360px viewport width.
- **9 RTL tests replaced 9 `it.todo` placeholders.** RED phase committed at `ea89499c` with 5/9 failing (as designed — the failing 4 tests exercised the outer-div classes / aria-labels / name props that only landed in GREEN). GREEN commit `03244b46` flipped all 9 green. Assertions cover: (a) no glass class + no Card rounded-lg wrapper, (b) description / qty / unit-price transparent-input classes, (c) trash + Switch 44px touch targets, (d) outer row `border-b border-border/50 last:border-b-0 even:bg-muted/20` structure, (e) prop-signature contract preservation.
- **DOCUX-07 dead-code purge (Task 2).** Three files deleted atomically in commit `ed726f30`:
  - `components/workspace/estimate/section-card.tsx` (224 lines) — self-imported from `item-row.tsx`; never rendered anywhere (grep across components/, app/, lib/, tests/ returned zero external `SectionCard` importers).
  - `components/workspace/estimate/item-row.tsx` (113 lines) — the only in-directory importer was `section-card.tsx` (deleted in the same commit); the only external reference was `price-badge.test.tsx`.
  - `tests/unit/estimate/price-badge.test.tsx` (183 lines) — the sole importer of the deleted `item-row.tsx`; tested dead-code badge rendering that has live equivalents in `SortableDocumentItemRow` + the rebuilt `ItemCardMobile`.
- **DOCUX-07 grep gate reports zero external references.** After the deletion commit: `grep -rE 'section-card|item-row' components/ app/ lib/ tests/` returns 0 hits (excluding `.deleted` / `.bak` patterns). `grep -rE 'SectionCard|ItemRow' tests/` returns 0 hits.
- **Zero test regressions from the deletion.** Full `tests/unit/estimate` suite: 44 files / 327 tests all green post-deletion. The `price-badge.test.tsx` file's 8 tests (6 badge-rendering + 1 reducer + 1 save-behavior) all had live-code equivalents:
  - Badge rendering: covered on both live paths — `SortableDocumentItemRow` badge branch in `estimate-document.tsx:598-625` AND the rebuilt `ItemCardMobile` badge branch (both share the identical 4-way conditional logic).
  - Reducer `UPDATE_ITEM` unit_price → isManuallyEdited: covered by `markup-totals.test.ts` and the state-shape assertions in `document-totals-view.test.tsx`.
  - `saveEstimate` price_source resolution: covered by `advanced-pricing-migration.test.ts` and `channel-adapter.test.ts`.
- **tsc CI-scoped typecheck clean.** `npx tsc --noEmit -p tsconfig.ci.json` exits 0 with zero errors post-commit.

## Task Commits

1. **Task 1 RED — failing tests for ItemCardMobile doc-native rebuild** — `ea89499c` (test)
2. **Task 1 GREEN — rebuild ItemCardMobile with transparent inputs (DOCUX-06)** — `03244b46` (feat)
3. **Task 2 ATOMIC — delete section-card + item-row + price-badge test (DOCUX-07)** — `ed726f30` (chore)

_(Final metadata commit will follow this SUMMARY.md write via the state-update sequence.)_

## Files Created/Modified

- `components/workspace/estimate/item-card-mobile.tsx` (modified) — rebuilt from `<Card variant="glass">` shell to a doc-native `<div>` row. Added `import type { JSX } from 'react'` for the return-type annotation. Removed `Card`, `Input`, `Button` imports (no longer used). New `INLINE_INPUT_CLS` const inlined from `estimate-document.tsx:435-436`. Trash button rewritten as a native `<button>` with 44px targets. Prop signature preserved verbatim.
- `tests/unit/estimate/mobile-line-item.test.tsx` (modified) — 9 real RTL assertions replacing 9 `it.todo` Wave 0 placeholders. Local `makeItem()` builder that mirrors the retired `price-badge.test.tsx` fixture shape, extended with `taxable / tax_category / discount / cost / markup_pct` for v4.11 compliance.
- `components/workspace/estimate/section-card.tsx` (DELETED, 224 lines).
- `components/workspace/estimate/item-row.tsx` (DELETED, 113 lines).
- `tests/unit/estimate/price-badge.test.tsx` (DELETED, 183 lines).

## Decisions Made

- **Inlined `INLINE_INPUT_CLS` (Option A from the plan) instead of exporting it from `estimate-document.tsx`.** The plan flagged the risk explicitly: `estimate-document.tsx` already imports `item-card-mobile.tsx`, so a reverse import would create a cycle. Duplicating the 2-line literal is cheaper than restructuring the module graph, and the string is single-purpose. A doc-comment above the const points back to the canonical location.
- **Trash button migrated from shadcn `Button` to a native `<button>`.** The `Button` primitive's default `h-9 w-9` sizing was fighting with the `min-h-[44px] min-w-[44px]` override — the Button variant chrome (variant='ghost', size='icon') brought along default padding + border classes that clashed with the doc-native transparent language. A native `<button>` with just `min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground hover:text-destructive rounded-md transition-colors` is smaller, cleaner, and more legible on the paper surface.
- **`MoneyInput` targeting via `name` prop, not aria-label or test IDs.** `MoneyInput` doesn't accept `aria-label` (it wraps the underlying `<input>` in a `<div>` for the currency-symbol overlay), but it does forward `name` down to the input element. Passing `name="unit_price"` + `name="discount"` gives the test suite a precise, semantic query hook without introducing test-only prop pollution.
- **Return-type annotation switched to `JSX.Element` AFTER `import type { JSX } from 'react'`.** Discovered during Task 1 GREEN typecheck: the CI-scoped `tsconfig.ci.json` rejects the bare `JSX` namespace. `presentation-settings-panel.tsx` (162-04) already established the fix pattern — mirrored here for consistency.
- **`price-badge.test.tsx` deleted alongside the dead code, not migrated to a new location.** Its 8 assertions had live-code equivalents already covered elsewhere (badge rendering on `SortableDocumentItemRow` + rebuilt `ItemCardMobile`; reducer + saveEstimate on `markup-totals.test.ts` + `advanced-pricing-migration.test.ts` + `channel-adapter.test.ts`). Migration would have expanded scope; delete-together keeps the atomic-retirement discipline the plan called for.
- **Description + qty inputs got explicit aria-labels during the rebuild.** The shadcn `Input` primitives previously used had border + shadow chrome that visually signalled "editable input" — the aria-label was implicit. The new transparent native `<input>`s visually 'disappear' into the paper surface, so `aria-label="Item description"` + `aria-label="Quantity"` restore the a11y contract for screen readers.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] `it.todo` string in comment tripped the grep-count gate.**

- **Found during:** Task 1 GREEN acceptance-criteria grep sweep.
- **Issue:** The plan's acceptance gate `grep -c "it.todo" tests/unit/estimate/mobile-line-item.test.tsx` returns 0. My initial test-file comment referenced "the Wave 0 placeholder `it.todo` scaffolds" — the literal `it.todo` substring in the comment tripped the gate (returned 1 instead of 0).
- **Fix:** Rephrased the comment to describe the replacement without naming the pattern literally ("replace the Wave 0 (162-01) placeholder pending-test scaffolds").
- **Files modified:** tests/unit/estimate/mobile-line-item.test.tsx
- **Committed in:** 03244b46 (Task 1 GREEN)

**2. [Rule 3 — Blocking] Bare `JSX.Element` return type annotation rejected by tsconfig.ci.json.**

- **Found during:** Task 1 GREEN post-rebuild typecheck sweep.
- **Issue:** `components/workspace/estimate/item-card-mobile.tsx(68,26): error TS2503: Cannot find namespace 'JSX'`. The CI-scoped tsconfig (used by the plan's `npx tsc --noEmit -p tsconfig.ci.json` acceptance gate) doesn't resolve the bare `JSX` namespace under `moduleResolution: bundler` + React 18+ types.
- **Fix:** Added `import type { JSX } from 'react'` (precedent set by `presentation-settings-panel.tsx` in 162-04).
- **Files modified:** components/workspace/estimate/item-card-mobile.tsx
- **Committed in:** 03244b46 (Task 1 GREEN)

---

**Total deviations:** 2 auto-fixed (2 × Rule 3 blocking grep-gate / typecheck plumbing fixes).

**Impact on plan:** Both were plumbing fixes needed to land the plan's declared behavior against its own acceptance gates. Zero behavioral deviations. Zero scope creep. Both were caught by the exact acceptance-criteria grep + typecheck gates the plan defined, which is the point of those gates.

## Issues Encountered

**None that impacted the plan.**

The full estimate unit-test sweep (`npx vitest run tests/unit/estimate`) was green (44 files / 327 tests). The broader Windows parallel-import flakes documented in 162-02 SUMMARY (`cleanup-route-auth.test.ts`, `ai/empty-output-guards.test.ts`, `ai/transcribe-fallback.test.ts`, `company-action.test.ts`) were not exercised by this plan and remain pre-existing deferred items.

Gitleaks pre-commit clean on all 3 code commits.

## Deferred Issues

**None new.** The pre-existing deferred items from 162-04 SUMMARY (Playwright `share.spec.ts` baselines, warning-regressions on `project-workspace.tsx`, `estimates-public-token-rls` integration test needing live Supabase, Windows parallel-import flakes in unrelated test files) remain in the same state — none touched by this plan.

## User Setup Required

**None** — no new external services, no new env vars, no schema migrations, no additional dependencies.

## Next Phase Readiness

- **Phase 162 CLOSED.** DOCUX-01 landed in 162-04; DOCUX-02 + DOCUX-03 landed in 162-02; DOCUX-04 + DOCUX-05 landed in 162-03; DOCUX-06 + DOCUX-07 land here. All 7 phase-scoped requirements are checked off. The consolidated document-editor + share-page rendering path now speaks ONE visual language across mobile + desktop, and the dead-code cycle that was masking the parity gap is purged.
- **Phase 163 (Send Hub) unblocked.** The classic-renderer share path already respects `presentation_settings` (via 162-04's `estimate-view.tsx` threading). The mobile branch is now visually consistent, so Phase 163's Send Hub UI can focus on channel-formatter work without needing a mobile visual audit.
- **Phase 164+ future mobile work.** The doc-native mobile row pattern established here is a reusable vocabulary. Any future mobile-first component that mirrors a desktop table can lift the same `<div>` outer + `INLINE_INPUT_CLS` + `grid-cols-[auto,1fr]` shape.

## Self-Check: PASSED

Verified after writing this SUMMARY:

- `components/workspace/estimate/item-card-mobile.tsx` exists on disk (rebuilt).
- `tests/unit/estimate/mobile-line-item.test.tsx` exists on disk (real assertions).
- `components/workspace/estimate/section-card.tsx` DELETED — `test ! -f` returns 0.
- `components/workspace/estimate/item-row.tsx` DELETED — `test ! -f` returns 0.
- `tests/unit/estimate/price-badge.test.tsx` DELETED — `test ! -f` returns 0.
- Commits verified in `git log --oneline --all`: `ea89499c` (test 1 RED), `03244b46` (feat 1 GREEN), `ed726f30` (chore 2 atomic deletion).
- DOCUX-06 acceptance grep counts (all landed):
  - `it.todo` in mobile test file = 0
  - `variant="glass"` in item-card-mobile.tsx = 0
  - `Card` import from `@/components/ui/card` = 0
  - `border-b border-border/50` in item-card-mobile.tsx = 1
  - `min-h-[44px] min-w-[44px]` in item-card-mobile.tsx = 1 (trash)
  - `min-h-[44px]` in item-card-mobile.tsx = 3 (trash + Switch label span + Switch wrapper)
  - `bg-transparent` in item-card-mobile.tsx = 4 (description INLINE_INPUT_CLS + qty + unit-price + discount)
  - `const INLINE_INPUT_CLS` in item-card-mobile.tsx = 1
  - `export function ItemCardMobile` in item-card-mobile.tsx = 1
- DOCUX-07 grep gate: `grep -rE 'section-card|item-row' components/ app/ lib/ tests/ | grep -v '\.deleted\|\.bak'` returns 0 hits.
- Plan-scoped vitest: 9/9 GREEN.
- Full estimate unit-suite sweep: 44 files / 327 tests all green.
- CI-scoped `npx tsc --noEmit -p tsconfig.ci.json`: 0 errors.

---
*Phase: 162-estimate-document-consolidated-pass*
*Completed: 2026-07-08*

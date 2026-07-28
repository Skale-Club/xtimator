---
phase: 185
slug: paginated-editable-editor-mode
status: partial
created: 2026-07-28
updated: 2026-07-28
---

# Phase 185 — Human UAT Checklist

Durable UAT checklist for the phase's Manual-Only Verifications (per
`185-VALIDATION.md`'s "Manual-Only Verifications" table) so this evidence
survives even if the checkpoint gets auto-approved. This file records what a
human should verify — it does NOT assert that a human has verified it. Every
checklist item below starts unchecked.

All three items below are things jsdom structurally cannot prove (real
layout/timing/visual judgment) — every OTHER claim in the phase (sheet
count/chrome/fail-soft, pure-function page-offset arithmetic, reducer
structural-epoch classification, debounce timing, focus/dnd-kit stability,
share-webview import boundary, engine-vs-rendered-view parity) is already
covered by the automated suite (`npx vitest run tests/unit tests/eval`,
4891 tests green as of this plan) plus the standalone
`scripts/pagination-binding-check.ts` Playwright script (already run against
real Chromium during 185-03's execution — PASSED).

## Checklist (Manual-Only Verification, per 185-VALIDATION.md)

- [ ] **Real-browser paginated editing feel** (PGMODE-02/03) — Open a large,
      multi-page estimate in the workspace editor, toggle to paginated mode,
      type into a long description field, and confirm: no reflow
      thrash/flicker while typing (repagination should visibly wait ~400ms
      after you stop typing, not fire per keystroke); drag-reorder an item
      and a section (page membership should never visually "fight" the
      drag); pinch/zoom or resize the window and confirm the paginated
      canvas scales smoothly; the decorative page sheets visually track the
      real content underneath as you scroll.
- [ ] **Real positional binding at scale** (PGMODE-02) — Open a REAL
      estimate with enough content to span 3+ pages (not the Playwright
      script's synthetic fixture), toggle paginated mode, and visually
      confirm every item/section/totals/terms/signature/photo block sits
      fully inside its own decorative sheet, with no block visually
      straddling a page boundary.
- [ ] **Visual match to the pending owner reference image** (PGMODE-02) —
      The owner has not yet supplied the paginated-mode UI reference image
      (per `.planning/REQUIREMENTS.md`'s locked decisions). Standard
      PDF-preview conventions (centered letter pages on a neutral canvas,
      page gaps, shadows, page numbers) were applied in the meantime. Once
      the reference image arrives: compare against it and adjust any
      `[ADJUSTABLE]` tokens noted in `185-UI-SPEC.md`.

## How To Verify

1. Confirm `npx vitest run tests/unit tests/eval` and
   `npx tsc -p tsconfig.ci.json --noEmit` are clean (both confirmed clean at
   the end of 185-04's execution).
2. Open the workspace editor for a real, multi-page estimate (or seed one)
   and walk through each checklist item above.
3. Check off each box against what you see.
4. If everything checks out, update this file's frontmatter
   `status: partial` → `status: verified` (or note any issues found
   instead). The third item can only move to `verified` once the owner's
   reference image has actually arrived and been compared against.

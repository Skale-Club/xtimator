---
phase: quick-260526-jo4
plan: 01
subsystem: workspace-estimate-rendering
tags: [bug-fix, layout, prop-chain, pdf, estimate, logo, regression]
requires:
  - DocumentCompany interface in components/workspace/estimate/estimate-document.tsx
  - companies table columns (logo_url, phone, email, website, address, city, state, zip)
provides:
  - Company header (logo + name + contact + address) rendered in workspace editor
  - Logo positioned RIGHT in workspace editor + share view + PDF header (desktop)
  - Language badge stacked above logo in PDF headerRight column
affects:
  - app/(app)/projects/[id]/page.tsx
  - components/workspace/project-workspace.tsx
  - components/workspace/overview-tab.tsx
  - components/workspace/estimate/estimate-tab.tsx
  - components/workspace/estimate/estimate-editor.tsx
  - components/workspace/estimate/estimate-document.tsx
  - components/pdf/estimate-pdf.tsx
tech-stack:
  added: []
  patterns:
    - "Server-page → ProjectWorkspace → OverviewTab → EstimateTab → EstimateEditor → EstimateDocument prop chain (mirrors share-view assembly pattern)"
    - "Two-column header in EstimateDocument: info LEFT (min-w-0), logo RIGHT (flex-shrink-0), parent sm:justify-between"
    - "@react-pdf/renderer two-column header: headerLeft column + headerRight column (flex-end alignment, gap 6) stacking langBadge above logo"
key-files:
  created: []
  modified:
    - app/(app)/projects/[id]/page.tsx
    - components/workspace/project-workspace.tsx
    - components/workspace/overview-tab.tsx
    - components/workspace/estimate/estimate-tab.tsx
    - components/workspace/estimate/estimate-editor.tsx
    - components/workspace/estimate/estimate-document.tsx
    - components/pdf/estimate-pdf.tsx
decisions:
  - "Mirrored share-view's DocumentCompany assembly verbatim in page.tsx (same shape, same null-fallback pattern) — no new abstraction"
  - "Used DocumentCompany type import (not redefined) — single source of truth in estimate-document.tsx"
  - "min-w-0 on info column allows long text to wrap without pushing logo off-screen"
  - "PDF headerLeft flexDirection changed column->row -> column (single child now); kept for clarity, gap 4 (vestigial)"
  - "PDF langBadge moved INTO headerRight rather than removed — preserves visible language indicator while honoring layout intent"
metrics:
  duration: "~11 minutes"
  completed: "2026-05-26"
  tasks: 3
  files: 7
requirements: [QUICK-JO4-01, QUICK-JO4-02, QUICK-JO4-03]
---

# Quick 260526-jo4: Company Logo in Editor + Move to Right Summary

Restored the missing company header block in the workspace estimate editor and repositioned the logo to the RIGHT side of all three render surfaces (workspace editor, share view, PDF).

## What Was Built

Two distinct bugs fixed in one focused plan:

**1. Editor regression (Task 1)** — `EstimateEditor` was rendering `<EstimateDocument>` without a `company` prop, causing the conditional `{company && (...)}` header to be skipped. Plumbed a `DocumentCompany`-shaped object from the server page down through 5 components:

```
app/(app)/projects/[id]/page.tsx          (extended SELECT; assemble documentCompany)
└─ ProjectWorkspace                       (accept company, forward to OverviewTab)
   └─ OverviewTab                         (accept company, forward to EstimateTab)
      └─ EstimateTab                      (accept company, forward to EstimateEditor)
         └─ EstimateEditor                (accept company, pass to <EstimateDocument company={...}>)
            └─ EstimateDocument           (already accepts optional company; now receives it in edit mode)
```

The `companies` SELECT in `page.tsx` was extended from 8 columns to 16 to include the 8 fields the `DocumentCompany` interface requires (`logo_url`, `phone`, `email`, `website`, `address`, `city`, `state`, `zip`).

**2. Layout reorder (Tasks 2 + 3)** — Logo moves from LEFT (inside info group) to RIGHT (separate flex child) across all three surfaces:

- `estimate-document.tsx` — Two flex children of the existing `sm:justify-between` parent: info `<div className="min-w-0">` LEFT, logo `<div className="flex-shrink-0">` RIGHT. Workspace editor + share view both benefit from a single component change.
- `estimate-pdf.tsx` — Restructured into `headerLeft` (info column) + `headerRight` (langBadge stacked above logo, `alignItems: 'flex-end'`). The `fixed` prop on the outer header is retained so the header still repeats on every PDF page.

## Commits

| Task | Hash      | Message                                                                              |
| ---- | --------- | ------------------------------------------------------------------------------------ |
| 1    | `baf83a2` | feat(quick-260526-jo4): plumb DocumentCompany prop chain to EstimateDocument in editor |
| 2    | `bc97dc3` | feat(quick-260526-jo4): move logo to right side in EstimateDocument header           |
| 3    | `485fee4` | feat(quick-260526-jo4): move logo to right in PDF header, stack langBadge above it   |

## Decisions Made

- **Mirrored share-view's `DocumentCompany` assembly verbatim in `page.tsx`** — same shape, same null-fallback pattern (`?? null`) — no new abstraction or helper introduced. Keeps the assembly co-located with the SELECT it depends on.
- **Used `DocumentCompany` type import** (not redefined) in the 5 chain files — single source of truth remains `components/workspace/estimate/estimate-document.tsx`.
- **`min-w-0` on the info column** allows long company names / contact strings to wrap cleanly within the flex container instead of pushing the logo off-screen on narrow desktop widths.
- **PDF `langBadge` moved INTO `headerRight` rather than removed** — the language indicator stays visible, satisfying the plan's must-have truth ("language indicator badge remains visible in the PDF header"). Stacked above the logo with `gap: 6` on the column.
- **PDF `headerLeft` `flexDirection` changed `row` → `column`** — the Image moved out, so the row arrangement (logo beside info) is no longer required. Column is semantically correct for the single remaining `<View>` child.

## Verification Results

- `npx tsc --noEmit` after each task — clean (exit 0)
- Visual checks deferred to user (per plan's done criteria): workspace editor + share view + PDF should now show logo on RIGHT with info on LEFT (desktop), mobile gracefully stacks info-first / logo-below

## Deviations from Plan

None — plan executed exactly as written across all three tasks.

## Deferred Issues

Three pre-existing lint findings in modified files (NOT introduced by this plan, present on `main` at base commit `fd42fb0`):

1. `components/workspace/project-workspace.tsx:66` — `react-hooks/set-state-in-effect` error (`setActiveTab` synchronous in `useEffect`)
2. `components/workspace/project-workspace.tsx:43` — unused `stats` prop
3. `components/workspace/estimate/estimate-editor.tsx:136` — unused `photos` prop

See `deferred-items.md` in this plan directory.

## Self-Check: PASSED

- `app/(app)/projects/[id]/page.tsx` — FOUND, includes `documentCompany` (verified)
- `components/workspace/project-workspace.tsx` — FOUND, accepts `company: DocumentCompany` (verified)
- `components/workspace/overview-tab.tsx` — FOUND, forwards `company` (verified)
- `components/workspace/estimate/estimate-tab.tsx` — FOUND, forwards `company` (verified)
- `components/workspace/estimate/estimate-editor.tsx` — FOUND, passes `company={company}` to `<EstimateDocument>` (verified)
- `components/workspace/estimate/estimate-document.tsx` — FOUND, info LEFT + logo RIGHT structure (verified)
- `components/pdf/estimate-pdf.tsx` — FOUND, `headerRight` style + langBadge stacked above logo (verified)
- Commit `baf83a2` — FOUND
- Commit `bc97dc3` — FOUND
- Commit `485fee4` — FOUND

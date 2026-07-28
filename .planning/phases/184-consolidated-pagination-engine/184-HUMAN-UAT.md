---
phase: 184
slug: consolidated-pagination-engine
plan: 05
status: partial
created: 2026-07-28
---

# Phase 184 Plan 05 — Human UAT Checklist

Durable UAT checklist + artifact paths (Plan 184-05, Task 4) so manual-verification
evidence survives even if the checkpoint gets auto-approved. This file records
what a human should verify — it does NOT assert that a human has verified it.
Every checklist item below starts unchecked.

## Artifacts

All 4 PDFs are real, unmocked `renderToBuffer()` output — generated via the
same `blocksFromModel()` + `computePageBreaks()` + template-dispatcher
pipeline `lib/pdf/render-estimate-pdf.ts` runs in production:

- `.planning/phases/184-consolidated-pagination-engine/uat/classic-1page.pdf` — Classic template, small single-section/single-item fixture (1 real page)
- `.planning/phases/184-consolidated-pagination-engine/uat/classic-multipage.pdf` — Classic template, 4-section/40-item fixture (6 real pages)
- `.planning/phases/184-consolidated-pagination-engine/uat/modern-1page.pdf` — Modern template, small single-section/single-item fixture (1 real page)
- `.planning/phases/184-consolidated-pagination-engine/uat/modern-multipage.pdf` — Modern template, 4-section/40-item fixture (7 real pages)

Page counts above are confirmed via the real `/Type /Page` PDF-byte count
matching `computePageBreaks()`'s own computed page count exactly (see
`tests/unit/pdf/estimate-pdf-pagination.test.tsx`) — this checklist is for
the VISUAL/qualitative check automated tests can't perform.

## Checklist (Manual-Only Verification, per 184-VALIDATION.md)

Open all 4 PDFs above and confirm:

- [ ] No line-item row is ever split across a page break (a row's text/cells always stay together on one page)
- [ ] Every section header stays on the same page as its first item row
- [ ] Every section's subtotal stays on the same page as that section's last item row
- [ ] The totals block never splits across a page boundary
- [ ] The signature block never splits across a page boundary (N/A for these 4 fixtures — none carry a signature; confirmed structurally elsewhere in `tests/unit/pdf/estimate-pdf-signature.test.tsx` / `estimate-pdf-modern-signature.test.tsx`)
- [ ] Every terms card never splits across a page boundary (N/A for these 4 fixtures — none carry terms text; confirmed structurally in `tests/unit/pdf/estimate-pdf-terms-atomicity.test.tsx`)
- [ ] Every PDF page after page 1 in `classic-multipage.pdf` / `modern-multipage.pdf` repeats the items-table column header (Description / Qty / Unit / Unit Price / Total) at the correct position
- [ ] Every page in all 4 PDFs shows "Page N of M" in the footer, with correct, sequential N and a correct total M
- [ ] `classic-1page.pdf` and `modern-1page.pdf` look visually unchanged from the pre-184 single-page rendering (header, title banner, info grid, section, totals — no layout regressions)
- [ ] `classic-multipage.pdf` and `modern-multipage.pdf` show no orphan/widow visual oddities (e.g. a page ending immediately after a section header with no rows, or starting with a lone orphaned row) — Note: all 5 terms-card titles/text (Estimate/Payment/Timeline/Warranty/Notes) are validated structurally in `estimate-pdf-terms-atomicity.test.tsx`, not visually in these 2 fixtures (neither carries terms text) — a manual spot-check with a terms-bearing estimate is recommended before shipping if that surface hasn't been visually reviewed elsewhere in Phase 183/184

## How To Verify

1. Confirm `npx vitest run tests/unit tests/eval` and `npx tsc -p tsconfig.ci.json --noEmit` are clean (done automatically by Plan 184-05 Task 4 before these artifacts were generated).
2. Open each of the 4 PDFs listed above in a PDF viewer.
3. Check off each box above against what you see.
4. If everything checks out, update this file's frontmatter `status: partial` → `status: verified` (or note any issues found instead).

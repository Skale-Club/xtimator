---
phase: 184
slug: consolidated-pagination-engine
plan: 05
status: partial
created: 2026-07-28
updated: 2026-07-28
---

# Phase 184 Plan 05 — Human UAT Checklist

Durable UAT checklist + artifact paths (Plan 184-05, Task 4) so manual-verification
evidence survives even if the checkpoint gets auto-approved. This file records
what a human should verify — it does NOT assert that a human has verified it.
Every checklist item below starts unchecked.

**Regenerated 2026-07-28** after the Phase 185 pre-flight verification pass found
and fixed 2 real gaps (GAP 1 + GAP 1b — see `184-05-SUMMARY.md`'s Deviations
section for the full write-up):
- GAP 1: `measureHeaderHeightPt` charged a company's full US street +
  city/state/zip address as ONE line; `formatAddress()` actually joins them
  with `\n` and both render in ONE `<Text>` — a real 2-line block. Fixed to
  derive the line count from the actual formatted string.
- GAP 1b: 2 more real formula bugs found and fixed in `blocks-from-model.ts`
  (`totalsRowHeightPt`/`grandTotalHeightPt` missing border/margin terms;
  Modern's first-deposit-row `marginTop: 16` was uncharged). The additional
  `PDF_RENDER_SAFETY_MARGIN_PT` safety reserve was then RE-calibrated via the
  now-committed `scripts/pagination-render-calibration.ts` (measured minimum
  zero-mismatch: 78pt; set to 90pt with a 12pt buffer — down from the
  previous, over-reserved 100pt).

The 4 PDFs below are REGENERATED with the corrected budget. The multipage
fixtures were ALSO extended (UAT-generation-script-only, not the shared unit
test fixture) to carry a signature, all 5 terms cards, prepared-by, and
photos — so every atomic-block rule (totals/signature/terms-card/photo-row)
is actually visible in a real render, not just structurally tested.

## Artifacts

All 4 PDFs are real, unmocked `renderToBuffer()` output — generated via the
same `blocksFromModel()` + `computePageBreaks()` + template-dispatcher
pipeline `lib/pdf/render-estimate-pdf.ts` runs in production. Each PDF's real
`/Type /Page` byte count was asserted equal to the engine's own computed
page count at generation time (not just "renderToBuffer didn't throw"):

- `.planning/phases/184-consolidated-pagination-engine/uat/classic-1page.pdf` — Classic template, small single-section/single-item fixture (1 real page)
- `.planning/phases/184-consolidated-pagination-engine/uat/classic-multipage.pdf` — Classic template, 4-section/40-item fixture + signature + all 5 terms cards + photos + prepared-by (7 real pages)
- `.planning/phases/184-consolidated-pagination-engine/uat/modern-1page.pdf` — Modern template, small single-section/single-item fixture (1 real page)
- `.planning/phases/184-consolidated-pagination-engine/uat/modern-multipage.pdf` — Modern template, 4-section/40-item fixture + signature + all 5 terms cards + photos + prepared-by (9 real pages)

## Checklist (Manual-Only Verification, per 184-VALIDATION.md)

Open all 4 PDFs above and confirm:

- [ ] No line-item row is ever split across a page break (a row's text/cells always stay together on one page)
- [ ] Every section header stays on the same page as its first item row
- [ ] Every section's subtotal stays on the same page as that section's last item row
- [ ] The totals block never splits across a page boundary
- [ ] The signature block (visible in `classic-multipage.pdf` / `modern-multipage.pdf`) never splits across a page boundary
- [ ] Every terms card (all 5 — Estimate/Payment/Timeline/Warranty/Notes, visible in `classic-multipage.pdf` / `modern-multipage.pdf`) never splits across a page boundary, and each shows the CORRECT title/text for its key (not a generic or mismatched label)
- [ ] The photo grid (visible in `classic-multipage.pdf` / `modern-multipage.pdf`) breaks only between rows, never mid-photo, and the captioned photo shows its caption
- [ ] The "Prepared by" block (visible in `classic-multipage.pdf` / `modern-multipage.pdf`) renders correctly and doesn't split across a page boundary
- [ ] Every PDF page after page 1 in `classic-multipage.pdf` / `modern-multipage.pdf` repeats the items-table column header (Description / Qty / Unit / Unit Price / Total) at the correct position
- [ ] Every page in all 4 PDFs shows "Page N of M" in the footer, with correct, sequential N and a correct total M
- [ ] `classic-1page.pdf` and `modern-1page.pdf` look visually unchanged from the pre-184 single-page rendering (header, title banner, info grid, section, totals — no layout regressions)
- [ ] `classic-multipage.pdf` and `modern-multipage.pdf` show no orphan/widow visual oddities (e.g. a page ending immediately after a section header with no rows, or starting with a lone orphaned row)
- [ ] The company header (name/contact/full street address) renders correctly and doesn't visually overlap the language badge/logo area on any page — this is the surface GAP 1's formula fix targeted

## How To Verify

1. Confirm `npx vitest run tests/unit tests/eval` and `npx tsc -p tsconfig.ci.json --noEmit` are clean (done automatically before these artifacts were (re)generated).
2. Open each of the 4 PDFs listed above in a PDF viewer.
3. Check off each box above against what you see.
4. If everything checks out, update this file's frontmatter `status: partial` → `status: verified` (or note any issues found instead).

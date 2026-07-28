# Phase 186 — Validation Map

**Requirement:** POLISH-01 (only open requirement, final phase of milestone v4.23)
**Mode:** standard (research skipped) — conservative refinement pass, webview-only + one geometry-safe PDF token propagation.
**Revised** after plan-checker (Opus) pass: 6 blockers + 5 warnings + 2 info items addressed — see each plan's frontmatter/interfaces for the corrected citations (real PDF call sites, mobile "cards win, zebra drops" decision, cardTintFill guard, honest REQUIREMENTS.md rationale).

## Test infrastructure used

| Suite | Command | Why |
|-------|---------|-----|
| Estimate unit tests | `npx vitest run tests/unit/estimate` | Behavior + DOM-snapshot regression net for every webview className/style change in both plans |
| PDF unit tests | `npx vitest run tests/unit/pdf` | Defensive rerun after Plan 02 Task 1's one PDF StyleSheet touch (cardFill prop at the 2 real call sites) |
| Pagination unit tests | `npx vitest run tests/unit/pagination` | Proves `blocks-from-model.ts`'s height formulas stay untouched/unbroken — the phase's core lockstep guard |
| Playwright list (no run) | `npx playwright test tests/e2e/visual/share.spec.ts --list` | Proves the stale-test deletion (Plan 02 Task 3) parses cleanly, WITHOUT relying on `tsc` — bare `tsc` carries 11 pre-existing unrelated errors and the CI-scoped `tsconfig.ci.json` excludes `tests/` entirely, so neither is a meaningful signal for this specific edit |
| `git diff --stat` | shell | Confirms file-touch scope matches each plan's `files_modified` exactly — zero incidental PDF/pagination-formula drift beyond the precisely-scoped `estimate-pdf.tsx` exception (2 call-site lines + 1 import) |

Two new test files are touched (not created from scratch, both extend existing suites): `tests/unit/estimate/mobile-line-item.test.tsx` (Plan 01 — one test's title/assertion updated to assert zebra absence, per the "mobile drops zebra" decision) and `tests/unit/estimate/pagination-tokens.test.ts` (Plan 02 — a new `describe('cardTintFill', ...)` block, including the malformed-brand-color fallback case per Warning 7). `tests/unit/estimate/__snapshots__/document-alignment.test.tsx.snap` is regenerated across both plans via reviewed `-u` runs — never a silent snapshot update.

## Per-task verification map

| Plan | Task | Automated verification | Manual visual check (recommended, non-blocking) |
|------|------|------------------------|--------------------------------------------------|
| 186-01 | Task 1 — Zebra: desktop bump, mobile-EDIT-list removal | `mobile-line-item.test.tsx` + `document-alignment.test.tsx -u` (reviewed) + `tests/unit/estimate` + precisely-scoped greps (`even:bg-muted/40`, `even:bg-muted/20`, `hover:bg-muted/20` counts — never a bare `bg-muted/20` substring match) | Load a multi-item estimate in the workspace editor (full-width) and on `/estimate/{token}`; confirm desktop alternating rows are clearly distinguishable; confirm the mobile-EDIT item list no longer stripes |
| 186-01 | Task 2 — Grand-total emphasis | `document-totals-view.test.tsx` + `document-alignment.test.tsx -u` + grep on `text-3xl font-extrabold` | Confirm the grand total reads as the most prominent number on the page, brand-colored top rule renders correctly against the tenant's brand color |
| 186-01 | Task 3 — Title/section-header tracking (both variants) | `document-alignment.test.tsx -u` + `tests/unit/estimate` + grep confirming BOTH the editable-input (~521) and read-only-span (~524) section-header lines picked up `tracking-wide` | Compare Classic vs Modern title bands and section headers side-by-side, in BOTH edit and view mode; confirm consistent letter-spacing feel |
| 186-02 | Task 1 — Terms/signature tint + Classic PDF propagation (real call sites) | `pagination-tokens.test.ts` (incl. malformed-color case) + `document-prepared-by-terms`/`document-signature-view`/`document-alignment` (`-u`, reviewed) + `tests/unit/pdf` + `tests/unit/pagination` (must be unmodified) | Download a Classic PDF and a Modern PDF for a signed, terms-filled estimate; confirm Classic's terms/signature show a subtle brand tint, Modern's stay hairline-only; compare against the webview for the same estimate; confirm a tenant with a malformed brand color still renders a plain (untinted) document with no crash |
| 186-02 | Task 2 — Photo grid + mobile card list (cards win, zebra dropped) | `document-alignment.test.tsx -u` (mobile-row assertion at lines 139-147 still passes) + `document-photo-captions-view.test.tsx` + `tests/unit/estimate` + grep confirming `even:bg-muted` count is 1 (desktop only) in estimate-document.tsx | On a real mobile viewport (or devtools emulation), confirm the customer-facing item list reads as separated cards with no zebra; confirm the workspace editor's mobile EDIT list is visually unchanged from Plan 186-01; confirm photo tiles show a frame |
| 186-02 | Task 3 — Milestone close-out | grep on `stripe=success\|stripe=canceled` (expect 0) + `playwright --list` + grep on `POLISH-01`/docblock baseline count in REQUIREMENTS.md/share.spec.ts | Run the Playwright visual suite once seed data is available (`SEED_ESTIMATE_TOKEN` set) to regenerate the 9-baseline matrix + brand-override smoke test (10 total); the 2 removed stale tests should simply be gone, no new failures |

## Non-goals / explicitly deferred verification

- Full Playwright `@visual share` baseline regeneration is NOT run as part of automated task verification (requires `SEED_ESTIMATE_TOKEN`, a live seeded estimate, and is environment-dependent) — flagged here as a recommended manual/CI follow-up once this phase merges, not a blocking gate.
- No new DISCOVERY.md / RESEARCH.md — Level 0 discovery (this phase's changes are pure styling refinements over already-established, already-tested patterns; the one new mechanism, `cardTintFill()`, is a plain guarded function following `tokens.ts`'s own existing "plain values only" convention, not a new pattern).
- PDF font-size/box-model propagation to match the webview's grand-total emphasis and terms-card padding is explicitly DEFERRED, not attempted — it would require lockstep `blocks-from-model.ts` formula updates (grandTotalHeightPt has no font-size term, termsCardBaseHeightPt has no padding term), which is out of scope for a "conservative refinement" phase. This is recorded honestly in REQUIREMENTS.md's traceability row and the 186-02 SUMMARY, not silently left as an apparent oversight.

## Quality gate self-check

- [x] Polish targets concrete and cited (file:line of what's being refined and why) — see each plan's `<interfaces>` block; PDF call sites corrected to the REAL, live lines (estimate-pdf.tsx ~578/~591 — `PdfTermsSection` confirmed dead code, not wired).
- [x] Zero PDF-geometry drift without lockstep formula updates — Plan 186-01 touches zero PDF files; Plan 186-02's one PDF touch (`cardFill`, background-color-only, via the shared `cardTintFill()` guard) is verified against blocks-from-model.ts's actual formula terms and re-proven via an unmodified `blocks-from-model.test.ts` rerun. `estimate-pdf.tsx`'s touch is precisely scoped to 2 call-site lines + 1 import line — stated explicitly as the sole exception to the "zero files under components/pdf/" guard.
- [x] Stale visual-baseline handling explicit — Plan 186-02 Task 3 removes the two dead `?stripe=success/canceled` tests with a documented reason, not silently, and corrects the file's own docblock baseline count (12 → 10).
- [x] Every task has read_first citations, grep-verifiable criteria (precisely scoped — never a bare substring match that also catches unrelated `hover:` states), and concrete actions.
- [x] Mobile "cards win, zebra drops" decision applied consistently across all 3 mobile surfaces (Classic edit, Classic view, Modern view) and recorded in both plans' SUMMARYs.
- [x] Existing locked test contracts (Phase 162-05/DOCUX-06 "no Card wrapper, no rounded-lg" on item-card-mobile.tsx) verified NOT broken by the zebra-removal change.

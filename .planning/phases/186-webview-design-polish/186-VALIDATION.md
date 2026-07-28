# Phase 186 — Validation Map

**Requirement:** POLISH-01 (only open requirement, final phase of milestone v4.23)
**Mode:** standard (research skipped) — conservative refinement pass, webview-only + one geometry-safe PDF token propagation.

## Test infrastructure used

| Suite | Command | Why |
|-------|---------|-----|
| Estimate unit tests | `npx vitest run tests/unit/estimate` | Behavior + DOM-snapshot regression net for every webview className/style change in both plans |
| PDF unit tests | `npx vitest run tests/unit/pdf` | Defensive rerun after Plan 02 Task 1's one PDF StyleSheet touch (cardFill prop) |
| Pagination unit tests | `npx vitest run tests/unit/pagination` | Proves `blocks-from-model.ts`'s height formulas stay untouched/unbroken — the phase's core lockstep guard |
| Type check | `npx tsc -p tsconfig.ci.json --noEmit` | CI-scoped compile check (app/lib/components/hooks + tests included) |
| `git diff --stat` | shell | Confirms file-touch scope matches each plan's `files_modified` exactly — zero incidental PDF/pagination-formula drift |

No new automated test files are created this phase (pure styling/refinement work over already-tested surfaces) — verification instead grounds in re-running and reviewing existing snapshot/behavior suites, per the Nyquist rule's `MISSING` fallback not being applicable here (tests already exist for every touched surface).

## Per-task verification map

| Plan | Task | Automated verification | Manual visual check (recommended, non-blocking) |
|------|------|------------------------|--------------------------------------------------|
| 186-01 | Task 1 — Classic zebra contrast | `document-alignment.test.tsx -u` (reviewed diff) + `tests/unit/estimate` + grep on `bg-muted/40`/`bg-muted/20` counts | Load a multi-item estimate in the workspace editor (full-width) and on `/estimate/{token}`; confirm alternating rows are now clearly distinguishable at both viewport sizes |
| 186-01 | Task 2 — Grand-total emphasis | `document-totals-view.test.tsx` + `document-alignment.test.tsx -u` + grep on `text-3xl font-extrabold` | Confirm the grand total reads as the most prominent number on the page, brand-colored top rule renders correctly against the tenant's brand color |
| 186-01 | Task 3 — Title/section-header tracking | `document-alignment.test.tsx -u` + `tests/unit/estimate` | Compare Classic vs Modern title bands and section headers side-by-side; confirm consistent letter-spacing feel, no accidental line-wrap at narrow widths |
| 186-02 | Task 1 — Terms/signature cards + Classic PDF propagation | `document-prepared-by-terms`/`document-signature-view`/`document-alignment` (`-u`, reviewed) + `tests/unit/pdf` + `tests/unit/pagination` (must be unmodified) | Download a Classic PDF and a Modern PDF for a signed, terms-filled estimate; confirm Classic's terms/signature show a subtle brand tint, Modern's stay hairline-only; compare against the webview for the same estimate |
| 186-02 | Task 2 — Photo grid + mobile list | `document-alignment.test.tsx -u` (review mobile-row assertion still passes) + `document-photo-captions-view.test.tsx` + `tests/unit/estimate` | On a real mobile viewport (or devtools emulation), confirm the customer-facing item list reads as separated cards; confirm the workspace editor's mobile EDIT list is visually unchanged; confirm photo tiles show a frame |
| 186-02 | Task 3 — Milestone close-out | grep on `stripe=success\|stripe=canceled` (expect 0) + grep on `POLISH-01` in REQUIREMENTS.md + `tsc --noEmit` | Run the Playwright visual suite once seed data is available (`SEED_ESTIMATE_TOKEN` set) to regenerate the 9-baseline matrix + brand-override smoke test; the 2 removed stale tests should simply be gone, no new failures |

## Non-goals / explicitly deferred verification

- Full Playwright `@visual share` baseline regeneration is NOT run as part of automated task verification (requires `SEED_ESTIMATE_TOKEN`, a live seeded estimate, and is environment-dependent) — flagged here as a recommended manual/CI follow-up once this phase merges, not a blocking gate.
- No new DISCOVERY.md / RESEARCH.md — Level 0 discovery (this phase's changes are pure styling refinements over already-established, already-tested patterns; the one new mechanism, `CARD_TINT_ALPHA_HEX`, is a plain string constant following `tokens.ts`'s own existing "plain values only" convention, not a new pattern).

## Quality gate self-check

- [x] Polish targets concrete and cited (file:line of what's being refined and why) — see each plan's `<interfaces>` block.
- [x] Zero PDF-geometry drift without lockstep formula updates — Plan 186-01 touches zero PDF files; Plan 186-02's one PDF touch (`cardFill`, background-color-only) is verified against blocks-from-model.ts's actual formula terms (neither `termsCardBaseHeightPt` nor `signatureBaseHeightPt` references color) and re-proven via an unmodified `blocks-from-model.test.ts` rerun.
- [x] Stale visual-baseline handling explicit — Plan 186-02 Task 3 removes the two dead `?stripe=success/canceled` tests with a documented reason, not silently.
- [x] Every task has read_first citations, grep-verifiable criteria, and concrete actions.

---
phase: 186-webview-design-polish
verified: 2026-07-28T18:20:40Z
status: passed
score: 13/13 must-haves verified
re_verification: false
gates:
  typecheck: "npx tsc -p tsconfig.ci.json --noEmit — 0 errors"
  unit_eval: "npx vitest run tests/unit tests/eval — 595 passed | 1 skipped (596 files); 4893 passed | 21 todo (4914 tests); 186.51s"
  pagination_binding: "npx tsx scripts/pagination-binding-check.ts — PASSED (4/4 page anchors bind, 16/16 blocks non-straddling)"
  playwright_parse: "npx playwright test --list tests/e2e/visual/share.spec.ts — 30 tests in 1 file (10 baselines x 3 projects), parses clean"
  geometry_diff: "git diff 4a3041a5..HEAD -- lib/estimate/pagination/ — EMPTY"
human_verification:
  - test: "Open a Classic estimate with terms + signature, download the PDF, compare the terms/signature tint against the webview"
    expected: "A subtle brand tint is perceptible behind the PDF terms cards and signature block"
    why_human: "CARD_TINT_ALPHA_HEX is '0D' (~5% opacity) and the PDF receives ONLY backgroundColor (no border/padding, by geometry-safety design), so unlike the webview — which also gains rounded-lg + border + p-4 — the PDF tint has no supporting boundary. Whether 5% reads as 'a matching tint' vs 'invisible' on paper is a visual judgment"
  - test: "Load a multi-item estimate in the workspace editor at desktop width, in both edit and view mode"
    expected: "Alternating table rows are clearly distinguishable at bg-muted/40; the grand total reads as the most prominent number; the brand-colored top rule is visible"
    why_human: "Contrast perception and 'most emphasized' are visual judgments; also, a very light tenant brand color could wash out the new borderTopColor rule (previously a guaranteed-visible border-foreground black rule)"
  - test: "Load /estimate/{token} on a real mobile viewport for both Classic and Modern templates"
    expected: "The item list reads as separated cards with no zebra; photo tiles show a frame; card insets (mx-4 Classic / mx-6 Modern) look intentional against the section padding"
    why_human: "Mobile card-vs-inset spacing is a visual composition judgment no DOM assertion captures"
---

# Phase 186: Webview Design Polish Verification Report

**Phase Goal:** Conservative design refinement of the benchmark webview (both templates, mobile) with geometry-safe PDF propagation; POLISH-01 closes; milestone requirement set complete.
**Verified:** 2026-07-28T18:20:40Z
**Status:** passed
**Re-verification:** No — initial verification
**Baseline for diffs:** `4a3041a5` (pre-phase) → `HEAD` (`978d29b2`)

## Goal Achievement

### Observable Truths

Must-haves taken from both PLAN frontmatters (5 from 186-01, 8 from 186-02).

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Desktop zebra distinguishable; zebra is desktop-table-only, mobile-EDIT drops it | ✓ VERIFIED | `even:bg-muted/40`=1, `bg-muted/40`=2 (line 293 pseudo-class + line 641 ternary), `even:bg-muted`=1 total (desktop only), `hover:bg-muted/20`=5 untouched in estimate-document.tsx; `even:bg-muted`=0 and `hover:bg-muted/20`=2 in item-card-mobile.tsx |
| 2 | Grand total is the single most emphasized number on Classic | ✓ VERIFIED | estimate-document.tsx:914-915 `text-3xl font-extrabold`; every other number/name is `text-2xl font-bold` (1230, 1237, 1526, 1589). Only larger text is the ESTIMATE title band (a word, not a number) |
| 3 | Classic title band + BOTH section-header variants + Modern section header share one letter-spacing scale | ✓ VERIFIED | Title band 1509 `tracking-widest`; editable input 521 and read-only span 524 both `tracking-wide`; modern 248 `tracking-wide`. All 4 sites present in diff and in the refreshed snapshot |
| 4 | item-card-mobile's "no Card wrapper / no rounded-lg / no glass" contract (Phase 162-05/DOCUX-06) provably unbroken | ✓ VERIFIED | mobile-line-item.test.tsx diff touches ONLY lines 121-134; the locked assertions at 39-63 are byte-unchanged and green in the full run |
| 5 | Plan 01 touched zero files under components/pdf/ or lib/estimate/pagination/ | ✓ VERIFIED | `git show --stat` for 684f4cd7 / 9f4a5c25 / 5fad931b: only estimate-document.tsx, item-card-mobile.tsx, estimate-document-modern.tsx, and 2 test files |
| 6 | Terms entries render with a matching subtle tint/accent in both webview templates | ✓ VERIFIED | Classic: 5 terms wrappers + signature inner div all gain `rounded-lg border border-border/50 p-4` + `backgroundColor: cardTintFill(brandColor)` (6 call sites). Modern: 4 terms divs + signature inner div gain `border-l-2 pl-4` + `borderLeftColor: brandColor` |
| 7 | Classic PDF terms/signature carry a matching tint from ONE shared tokens.ts helper, never two hand-typed literals | ✓ VERIFIED | `cardTintFill` + `CARD_TINT_ALPHA_HEX` + `HEX_COLOR_RE` exist exactly once (lib/estimate/document/tokens.ts:124-138); consumed by estimate-pdf.tsx:32/583/596 and estimate-document.tsx:56 + 6 style sites. Zero duplicated hex-alpha literal or duplicated regex anywhere |
| 8 | cardTintFill degrades safely — malformed brandColor → undefined → today's plain output | ✓ VERIFIED | Guard `if (typeof brandColor !== 'string' \|\| !HEX_COLOR_RE.test(brandColor)) return undefined`; dedicated unit case `cardTintFill('not-a-color')` → `toBeUndefined()` (pagination-tokens.test.ts:119-121), green |
| 9 | Modern's PDF and webview terms/signature stay fill-free | ✓ VERIFIED | `git diff -- components/pdf/estimate-pdf-modern.tsx` EMPTY; ad-hoc tree probe: 0 nodes with the tint color in the rendered Modern PDF tree vs ≥1 in Classic; Modern webview uses border-l accent only, `even:bg-muted`=0 |
| 10 | Customer-facing photo grid + mobile list read as cards; item-card-mobile untouched by Plan 02 | ✓ VERIFIED | estimate-document.tsx:565 → `${SECTION_PX} py-2.5 mx-4 my-1.5 rounded-lg border border-border/40`; modern:255 → `px-8 py-3 mx-6 my-1.5 rounded-lg border border-[#e4e4e7]`; photo tiles gain `ring-1 ring-border/50` / `border border-[#e4e4e7]`; item-card-mobile.tsx absent from Plan 02 commits |
| 11 | blocks-from-model.ts provably untouched despite PDF StyleSheet edits | ✓ VERIFIED | `git diff 4a3041a5..HEAD -- lib/estimate/pagination/` is EMPTY (whole dir, not just the one file); `pagination-binding-check.ts` PASSED; tests/unit/pagination green unmodified |
| 12 | Two stale ?stripe= visual baselines removed with a documented reason; docblock count corrected | ✓ VERIFIED | `grep -c "stripe=success\|stripe=canceled"`=0; `"12 baselines total"`=0; `"10 baselines total"`=1; a 10-line intentional-removal rationale comment replaces the tests; playwright `--list` → 30 tests (10 × 3 projects), down from 36 |
| 13 | POLISH-01 marked complete with the honest rationale in the traceability row | ✓ VERIFIED | REQUIREMENTS.md:53 `- [x] **POLISH-01**`; :94 `Complete (Phase 186) — webview-only polish + one geometry-safe PDF token; PDF font/box propagation deferred — requires lockstep blocks-from-model formula updates.` — verbatim as planned |

**Score:** 13/13 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/estimate/document/tokens.ts` | CARD_TINT_ALPHA_HEX + guarded cardTintFill | ✓ VERIFIED | +22 lines, documented as the single source; exported, imported by 2 consumers, unit-tested |
| `components/workspace/estimate/estimate-document.tsx` | Zebra/total/tracking + terms/signature/photo/mobile cards | ✓ VERIFIED | +86/-… across both plans; every edit matches the plans' cited line targets |
| `components/workspace/estimate/item-card-mobile.tsx` | Zebra removed, no replacement decoration | ✓ VERIFIED | 1-line diff removing `even:bg-muted/20`; no rounded/shadow/glass added |
| `components/share/estimate-document-modern.tsx` | Tracking + left-accent terms/signature + photo/mobile cards | ✓ VERIFIED | 5 accent sites, tracking-wide header, tile border, mobile card row |
| `components/pdf/shared/pdf-terms-section.tsx` | Optional cardFill, background-color-only | ✓ VERIFIED | `cardFill?: string`; merged-object style sets ONLY backgroundColor alongside existing marginTop |
| `components/pdf/shared/pdf-signature-block.tsx` | Optional cardFill, background-color-only | ✓ VERIFIED | Same pattern; `marginTop: 16` preserved |
| `components/pdf/estimate-pdf.tsx` | Classic-only wiring at 2 real call sites | ✓ VERIFIED | Exactly 1 import line + 2 call-site lines (583, 596); PdfTermsSection (dead code) untouched |
| `tests/unit/estimate/pagination-tokens.test.ts` | cardTintFill coverage incl. malformed case | ✓ VERIFIED | New describe block, 2 cases, both green |
| `tests/unit/estimate/mobile-line-item.test.tsx` | Zebra-absence assertion; locked tests unmodified | ✓ VERIFIED | Only the title + 1 assertion changed |
| `tests/e2e/visual/share.spec.ts` | Stale tests gone, docblock says 10 | ✓ VERIFIED | Parses; 30 enumerated tests |
| `.planning/REQUIREMENTS.md` | POLISH-01 closed with honest rationale | ✓ VERIFIED | Checkbox + traceability + `Complete: 18/18 ✓` footer |
| `.planning/ROADMAP.md` | Phase 186 complete, 5/5 phases | ✓ VERIFIED | Phase line `[x]`, both plans `[x]`, progress table `186. Webview Design Polish \| 2/2 \| Complete \| 2026-07-28` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| tokens.ts `cardTintFill` | estimate-pdf.tsx 583/596 | shared import | ✓ WIRED | Import at line 32; both call sites pass `cardFill: cardTintFill(brandColor)` |
| tokens.ts `cardTintFill` | estimate-document.tsx | shared import | ✓ WIRED | Import at line 56; 6 inline-style consumers |
| `cardFill` prop | blocks-from-model.ts height formulas | verified NO reference required | ✓ WIRED (as designed) | `grep cardFill lib/` → zero hits; pagination diff empty; binding check PASS |
| Classic PDF `cardFill` | rendered react-pdf tree | View style merge | ✓ WIRED | Tree probe found ≥1 node with `backgroundColor === cardTintFill(brand)`; Modern tree found 0 |
| Classic webview brandColor | rendered DOM | inline style | ✓ WIRED | Snapshot renders `style="background-color: rgba(64, 110, 241, 0.05);"` on the terms card |

### Data-Flow Trace (Level 4)

| Artifact | Data variable | Source | Produces real data | Status |
|----------|---------------|--------|--------------------|--------|
| Classic webview terms/signature | `brandColor` | estimate-document.tsx:1352 `brandColorProp ?? company?.brand_primary_color ?? SYSTEM_COLORS.primary` | Yes — fallback `#406EF1` is a valid 6-digit hex, so the tint survives the no-brand-color path instead of silently degrading to undefined | ✓ FLOWING |
| Classic PDF terms/signature | `brandColor` | estimate-pdf.tsx:414 `company.brand_primary_color ?? SYSTEM_COLORS.primary` | Yes — same valid fallback | ✓ FLOWING |
| Modern webview terms/signature | `brandColor` | estimate-document-modern.tsx:80 | Yes (borderLeftColor, no fill by design) | ✓ FLOWING |
| Share webview (Classic) | whole document | estimate-view.tsx:48-54 dynamically imports the SAME `EstimateDocument` | Yes — share and editor render one component, so no share/editor drift is structurally possible (ROADMAP success criterion 3) | ✓ FLOWING |

**Color-format compatibility check (would have made the PDF tint hollow):** `@react-pdf/stylesheet`'s `transformColor('#2563eb0D')` returns `'#2563eb0D'` unchanged, and `transformColor('rgba(37,99,235,0.05)')` normalizes to `'#2563EB0D'` — 8-digit hex-alpha is react-pdf's own canonical alpha representation, so the tint is not silently dropped by the renderer.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Pagination geometry still binds after the PDF touch | `npx tsx scripts/pagination-binding-check.ts` | PASSED — 4/4 anchors within their own sheet, 16/16 blocks non-straddling | ✓ PASS |
| CI-scoped typecheck | `npx tsc -p tsconfig.ci.json --noEmit` | 0 errors | ✓ PASS |
| Full CI test gate | `npx vitest run tests/unit tests/eval` | 595 passed / 1 skipped (596 files); 4893 passed / 21 todo (4914 tests) | ✓ PASS |
| share.spec.ts parses after deletion | `npx playwright test --list tests/e2e/visual/share.spec.ts` | 30 tests in 1 file | ✓ PASS |
| Classic PDF tree actually carries the tint | ad-hoc react-pdf tree walk (temp probe, removed) | ≥1 node with `backgroundColor === '#2563eb0D'` | ✓ PASS |
| Modern PDF tree carries no tint | same probe | 0 tinted nodes | ✓ PASS |

### Requirements Coverage

| Requirement | Source plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| POLISH-01 | 186-01, 186-02 | Benchmark webview receives a design refinement pass (both templates, mobile included) and the refinements propagate to the PDF through the shared engine | ✓ SATISFIED (scoped, documented) | Both templates refined on desktop + mobile; one cross-surface value (brand tint) routed through tokens.ts and propagated to the Classic PDF; remaining refinements are webview-only with the deferral stated verbatim in the traceability row, the 186-02 SUMMARY, and 186-VALIDATION.md |

**Orphaned requirements:** none — REQUIREMENTS.md maps only POLISH-01 to Phase 186, and both plans claim it.
**Milestone coverage:** all 18 v1 IDs (ENGINE-01/02/03, PDFPAR-01..04, PGBRK-01..05, PGMODE-01..05, POLISH-01) are `[x]` with 0 unchecked and every traceability row reading Complete; ROADMAP v4.23 progress table shows 5/5 phases Complete.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | No TODO/FIXME/XXX/HACK/PLACEHOLDER/"not yet implemented" in any of the 6 changed source files | — | None |
| `app/globals.css`, `.planning/config.json` | — | Uncommitted working-tree changes | ℹ️ Info | Unrelated to Phase 186 (marketing `.hero-image` sizing + a trailing-newline fix); predates this verification, not phase drift |

### Honest-Closure Assessment (POLISH-01)

The closure is honest, but readers should understand its exact shape:

- Of this phase's refinements, **one** (`cardTintFill`) is token-sourced and reaches the PDF. The rest — `bg-muted/40`, `text-3xl font-extrabold`, `tracking-wide`/`tracking-widest`, `rounded-lg border p-4`, `mx-4 my-1.5`, `ring-1` — are per-surface Tailwind literals with no PDF counterpart. ROADMAP success criterion 2 ("refined values are read from tokens.ts … so the same refinement appears in the PDF output for both templates") is therefore met for the tint and explicitly deferred for everything else.
- That deferral is stated in three places (REQUIREMENTS.md traceability row, 186-02-SUMMARY.md, 186-VALIDATION.md "Non-goals") and is consistent with the milestone's own locked decision at ROADMAP:3012 — *"Pixel-perfect DOM↔PDF parity is explicitly rejected — the bar is 'same page-break decisions, same content per page,' verified structurally."*
- Net effect worth naming: Classic's webview grand total is now visually heavier than Classic's PDF grand total, and the webview's terms cards have padding the PDF cards don't. This is a deliberate, documented trade for zero geometry drift — not an undisclosed gap.

### Test-Coverage Observations (non-blocking, for future phases)

1. **No permanent regression guard for "Modern PDF never receives cardFill."** Phase 183's `estimate-pdf-banner-fill.test.tsx` asserts no Modern node has `backgroundColor === '#2563eb'` — the raw brand color. The tint is `'#2563eb0D'`, a different string, so that test would **not** catch an accidental tint leak into Modern. I closed the hole with a throwaway tree probe (0 tinted nodes) and removed it; a permanent assertion would be cheap insurance.
2. **The desktop read-only zebra bump (line 641) has no test coverage.** `document-alignment.test.tsx`'s fixture renders one item at idx 0, so the `idx % 2 === 1` branch never fires — correctly documented as a known limitation in 186-01-SUMMARY rather than hidden, but it means only grep, not a test, protects that site.
3. **No unit assertion that the Classic PDF terms/signature carry the tint.** The wiring is currently protected by code review only; the probe I ran confirms it today.

### Human Verification Recommended (non-blocking)

The phase's own VALIDATION.md classifies visual checks as recommended, not gating. Highest-value first:

1. **PDF tint perceptibility** — download a Classic PDF for a terms-filled, signed estimate. At `0D` (~5% alpha) with no border or padding on the PDF side, confirm the tint is actually visible rather than effectively absent.
2. **Grand-total rule against light brand colors** — the divider changed from a guaranteed-visible `border-foreground` black rule to `borderTopColor: brandText`. Check a tenant with a pale brand color.
3. **Mobile card insets** — `mx-4` (Classic) / `mx-6` (Modern) nested inside existing section padding; confirm the composition reads as intended on a real device.

### Gaps Summary

None. All 13 must-have truths verified against the codebase, all 12 artifacts exist and are wired with real data flowing, all 5 key links connected, and every gate the phase claimed was re-run independently and reproduced: geometry diff empty, binding check PASSED, typecheck 0 errors, 4893 unit/eval tests passing, Playwright parsing at 30 tests. The two SUMMARY claims most worth distrusting — "blocks-from-model.ts provably untouched" and "Modern stays fill-free" — were both confirmed by independent means (whole-directory diff plus the binding script; and a rendered-tree walk rather than the file diff alone). POLISH-01's completion is scoped rather than total, and the scope is disclosed accurately everywhere it is claimed.

---

_Verified: 2026-07-28T18:20:40Z_
_Verifier: Claude (gsd-verifier)_

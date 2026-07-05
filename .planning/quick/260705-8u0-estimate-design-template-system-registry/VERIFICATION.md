---
phase: 260705-8u0-estimate-design-template-system-registry
verified: 2026-07-05T07:05:00Z
status: passed
score: 13/13 must-haves verified
---

# Estimate Design Template System (Registry + PDF + Share + Settings) Verification Report

**Phase Goal:** Businesses can pick between two visual designs ("classic" = today's default, "modern" = new editorial style) for their estimate PDF and public share page, selectable via a Settings picker, with ZERO functional/data difference between templates and ZERO impact on the in-app workspace editor or onboarding.

**Verified:** 2026-07-05T07:05:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Plan | Truth | Status | Evidence |
|---|------|-------|--------|----------|
| 1 | 01 | A single source of truth lists the available estimate design templates (classic, modern) with id/label/description | ✓ VERIFIED | `lib/estimate/templates/registry.ts` exports `ESTIMATE_TEMPLATES` with exactly 2 entries, exact labels/descriptions per plan |
| 2 | 01 | Consumers can validate an unknown/legacy string safely falls back to 'classic' | ✓ VERIFIED | `isEstimateTemplateId()` type guard (`.includes()` check, never throws) + `DEFAULT_ESTIMATE_TEMPLATE_ID = 'classic'`; used defensively in route.ts, estimate-view.tsx, settings.ts, company-info-form.tsx |
| 3 | 02 | Modern PDF has editorial serif styling (Times-Roman/Times-Bold), thin rule dividers, hero grand-total — not Classic's boxed-table letterhead | ✓ VERIFIED | `estimate-pdf-modern.tsx` styles: `fontFamily: 'Times-Roman'/'Times-Bold'`, `borderBottomWidth: 0.75` hairlines, `grandTotalValue: {fontSize: 30}` standalone hero block, no `backgroundColor` fills anywhere |
| 4 | 02 | Classic PDF is byte-identical to before (totals, labels, order) | ✓ VERIFIED | `estimate-pdf.tsx` unmodified (git log shows no changes this phase); `tests/unit/pdf/estimate-pdf-totals.test.tsx` still passes |
| 5 | 02 | PDF route selects template component via registry-keyed map, not if/else | ✓ VERIFIED | `app/api/estimates/[id]/pdf/route.ts:20-23` — `PDF_TEMPLATE_COMPONENTS: Record<EstimateTemplateId, typeof EstimatePDF>` literal map, resolved via `PDF_TEMPLATE_COMPONENTS[templateId]` |
| 6 | 03 | Modern share page shows editorial serif styling for the document, not Classic's boxed-table look | ✓ VERIFIED | `estimate-document-modern.tsx` uses `font-serif` root class, hairline `border-t`/`border-b` rules, `text-4xl sm:text-5xl` hero total block, no brand-color `backgroundColor` fills |
| 7 | 03 | Classic share page is byte-identical to before | ✓ VERIFIED | `estimate-view.tsx`'s Classic branch (`<EstimateDocument mode="view" .../>`) is verbatim unchanged from prior hardcoded render; `estimate-document.tsx` itself untouched |
| 8 | 03 | SignaturePad / Accept-Decline / Invoices / footer render unchanged regardless of template | ✓ VERIFIED | These blocks in `estimate-view.tsx` sit outside the `templateId === 'modern' ? ... : ...` ternary, structurally identical to pre-phase code |
| 9 | 03 | Share page selects document component via registry-resolved templateId (guarded), not raw string comparison | ✓ VERIFIED | `estimate-view.tsx:167-171` — `isEstimateTemplateId(estimate.company.estimate_template_style) ? ... : DEFAULT_ESTIMATE_TEMPLATE_ID`, then ternary render |
| 10 | 04 | Settings > Company tab shows a 2-option radio-card picker (Classic/Modern), styled like ThemeToggleRadioGroup | ✓ VERIFIED | `company-info-form.tsx:472-504` — `RadioGroup`/`RadioGroupItem` mapped over `ESTIMATE_TEMPLATES`, label+description rendered per option |
| 11 | 04 | Selecting a template and saving persists estimate_template_style to the company row | ✓ VERIFIED | Form `onSubmit` sets `fd.set('estimateTemplateStyle', ...)` → `lib/actions/settings.ts` reads it, validates via `isEstimateTemplateId`, writes `estimate_template_style: estimateTemplateStyle` in the `.update()` call |
| 12 | 04 | No onboarding flow, banner, tour step, or badge references this feature anywhere | ✓ VERIFIED | `lib/actions/company.ts`'s `row` object has no `estimate_template_style` field; grep across `components/` finds it referenced only in `estimate-view.tsx` and `company-info-form.tsx`; no matches in `components/onboarding` or `components/tour` |
| 13 | (all) | Workspace editor (edit-mode) is completely unaffected | ✓ VERIFIED | `components/workspace/estimate/estimate-document.tsx` has zero references to `estimate_template_style`/`EstimateTemplateId`/template registry; not modified by any commit in this phase's git log |

**Score:** 13/13 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/estimate/templates/registry.ts` | ESTIMATE_TEMPLATES, EstimateTemplateId, isEstimateTemplateId, DEFAULT_ESTIMATE_TEMPLATE_ID | ✓ VERIFIED | All 4 exports present, exact shape matches plan 01's interface contract |
| `components/pdf/estimate-pdf-modern.tsx` | EstimatePDFModern consuming EstimatePDFProps unchanged | ✓ VERIFIED | Default export `EstimatePDFModern`, imports `EstimatePDFProps`-shaped params identical to `estimate-pdf.tsx`, same helpers (`deriveDepositDisplay`, `ensureReadableOnWhite`, `readableTextColor`, `formatMoney`, `formatPhoneForDisplay`) |
| `app/api/estimates/[id]/pdf/route.ts` | Record<EstimateTemplateId, Component> lookup | ✓ VERIFIED | `PDF_TEMPLATE_COMPONENTS` map, defensive `isEstimateTemplateId` guard before lookup |
| `tests/unit/pdf/estimate-pdf-modern-totals.test.tsx` | Structural totals-order test | ✓ VERIFIED | 3 test cases mirror Classic's locked order (Subtotal→Total→Deposit→Balance Due); all 3 pass |
| `components/share/estimate-document-modern.tsx` | View-only Modern document, same props as EstimateDocument view-mode | ✓ VERIFIED | Type-imports `EstimateDocumentData`/`DocumentCompany`/`DocumentClient` from `estimate-document.tsx`; no dispatch, no dnd-kit, no edit affordances |
| `components/share/estimate-view.tsx` | templateId-conditional render swapping only the document sub-tree | ✓ VERIFIED | Ternary at line 234, all other blocks (SignaturePad/CTA/Invoices/footer) untouched |
| `lib/queries/estimate.ts` | getEstimateWithContext selects estimate_template_style | ✓ VERIFIED | Line 141 — column appended to companies select string |
| `lib/queries/share.ts` | getEstimateByShareToken selects + types estimate_template_style | ✓ VERIFIED | Line 173 select string + line 46 `ShareEstimateData` type field |
| `lib/queries/company.ts` | CompanySettings.estimate_template_style: string | ✓ VERIFIED | Line 43 |
| `lib/actions/settings.ts` | updateCompanySettings persists validated value | ✓ VERIFIED | Lines 66-69 (validation), line 115 (persistence) |
| `components/settings/company-info-form.tsx` | Radio-card picker wired into form/schema/submit | ✓ VERIFIED | Schema (line 50), defaultValues (line 117), onSubmit FormData (line 157), JSX (lines 472-504) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `app/api/estimates/[id]/pdf/route.ts` | `components/pdf/estimate-pdf-modern.tsx` | `PDF_TEMPLATE_COMPONENTS[templateId]` | ✓ WIRED | Confirmed at route.ts:95 |
| `lib/queries/estimate.ts` | `app/api/estimates/[id]/pdf/route.ts` | `estimate_template_style` in company select | ✓ WIRED | Route destructures `company` then reads `company.estimate_template_style` (route.ts:91) |
| `components/share/estimate-view.tsx` | `components/share/estimate-document-modern.tsx` | `templateId === 'modern'` ternary | ✓ WIRED | Confirmed at estimate-view.tsx:234 |
| `lib/queries/share.ts` | `components/share/estimate-view.tsx` | `estimate_template_style` in company select | ✓ WIRED | share.ts:173 select + estimate-view.tsx:168 reads `estimate.company.estimate_template_style` |
| `components/settings/company-info-form.tsx` | `lib/actions/settings.ts` | FormData field `estimateTemplateStyle` | ✓ WIRED | form.tsx:157 sets it, settings.ts:66 reads `formData.get('estimateTemplateStyle')` |
| `lib/actions/settings.ts` | `companies` table | `.update({ estimate_template_style: ... })` | ✓ WIRED | settings.ts:115 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| PDF route template selection | `company.estimate_template_style` | `getEstimateWithContext` → live Supabase select | Yes (once migration applied) / defensively defaults to 'classic' pre-migration via `isEstimateTemplateId` guard against `undefined` | ✓ FLOWING (guarded) |
| Share page template selection | `estimate.company.estimate_template_style` | `getEstimateByShareToken` → live Supabase select | Same as above | ✓ FLOWING (guarded) |
| Settings picker default value | `company.estimate_template_style` | `getCompanySettings` (`select('*')`) | Same as above | ✓ FLOWING (guarded) |
| Modern PDF/share totals | `estimate.total`/`subtotal`/`deposit_*` etc. | Same `EstimateWithSections`/`EstimateDocumentData` objects Classic consumes — no separate/recomputed data path | Yes — proven by identical totals test | ✓ FLOWING |

Note: the live Supabase migration (`20260705000001_estimate_design_template.sql`) had not yet been applied to the database at the time of this phase's execution (explicitly scoped out, pending user's morning authorization). All 3 read sites use `isEstimateTemplateId()` defensively, so a runtime-absent column degrades gracefully to `'classic'` — zero risk of a crash or an unintended silent "modern" activation. This is architecturally correct and matches the plan's explicit scope note.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Modern PDF totals match Classic's locked order/values | `npx vitest run tests/unit/pdf/estimate-pdf-modern-totals.test.tsx tests/unit/pdf/estimate-pdf-totals.test.tsx` | 2 files, 6 tests passed | ✓ PASS |
| Full project type-check | `npx tsc --noEmit -p tsconfig.ci.json` | No output (clean) | ✓ PASS |
| Full unit/eval suite (per user's independent run) | `npx vitest run tests/unit tests/eval` | 2819 passed, 1 pre-existing parallel-only flake (confirmed green in isolation) | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|--------------|------------|--------------|--------|----------|
| TEMPLATE-REGISTRY | 01 | Shared template id registry | ✓ SATISFIED | `lib/estimate/templates/registry.ts` |
| TEMPLATE-PDF | 02 | Modern PDF template + registry-keyed route selection | ✓ SATISFIED | `estimate-pdf-modern.tsx`, route.ts wiring |
| TEMPLATE-SHARE | 03 | Modern share-page document + registry-keyed selection | ✓ SATISFIED | `estimate-document-modern.tsx`, estimate-view.tsx wiring |
| TEMPLATE-SETTINGS | 04 | Settings picker + persistence | ✓ SATISFIED | company-info-form.tsx + settings.ts |

No orphaned requirements found — all 4 plans' declared requirement IDs match their SUMMARY/PLAN frontmatter and REQUIREMENTS.md is not separately cross-checked here since this is a `.planning/quick/` task (no formal REQUIREMENTS.md entry expected for quick tasks).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `app/api/estimates/[id]/pdf/route.ts` | 109 | `renderToBuffer(element as any)` | ℹ️ Info | Pre-existing before this phase (confirmed via git diff by the executing agent, logged in `deferred-items.md`); not introduced by this phase, not a functional risk |

No TODO/FIXME/placeholder comments, no empty stub implementations, no hardcoded-empty data flowing to render, no disconnected props found in any of the 11 artifacts reviewed.

### Human Verification Required

The following are visual/UX judgments that cannot be fully verified by static code analysis — recommended manual spot-check before shipping, though code-level evidence strongly supports correct behavior:

### 1. Visual quality of the Modern PDF

**Test:** Generate a PDF for a company with `estimate_template_style = 'modern'` (after the migration is applied) and open it.
**Expected:** Serif typography renders correctly, hairline rules are visible but subtle, the hero total is prominent and readable, brand color appears only as accent (never as a fill).
**Why human:** Static analysis confirms the StyleSheet properties are set correctly, but actual PDF rendering (font substitution, whitespace balance, page-break behavior with long content) can only be confirmed by opening a rendered PDF.

### 2. Visual quality of the Modern share page

**Test:** Open a share link for an estimate whose company has `estimate_template_style = 'modern'` on both desktop and mobile viewport widths.
**Expected:** The document renders with serif font, thin rule dividers, hero total, and the mobile stacked-card / desktop table breakpoint behaves like Classic's.
**Why human:** Tailwind class correctness (`sm:hidden`/`hidden sm:block`, `font-serif` fallback stack rendering) is best confirmed visually in a browser.

### 3. Settings picker end-to-end persistence

**Test:** In Settings > Company tab, select "Modern," save, reload the page, and confirm the radio-card still shows "Modern" selected. Then generate a PDF/share link and confirm it uses the Modern template.
**Expected:** Selection persists across reload; PDF/share immediately reflect the new choice.
**Why human:** Requires the Supabase migration to be live (explicitly deferred to "tomorrow morning" per the plan's scope notes) — cannot be exercised end-to-end until then. Code-level wiring is fully verified and correct; this is purely an environment/deployment-sequencing gate, not a code gap.

### Gaps Summary

No gaps found. All 13 observable truths across the 4 plans are verified against the actual code (not just SUMMARY claims). Key findings:

- The registry (`lib/estimate/templates/registry.ts`) is a clean, side-effect-free single source of truth, exactly matching the plan 01 interface contract.
- Modern PDF (`estimate-pdf-modern.tsx`) and Modern share document (`estimate-document-modern.tsx`) both reuse the exact same prop types, pure helpers, and data-derivation logic as their Classic counterparts — confirmed by direct diff comparison against `estimate-pdf.tsx` and by the passing structural totals tests. Only StyleSheet/JSX/Tailwind styling differs.
- Both consumer sites (PDF route, share view) resolve the template id defensively via `isEstimateTemplateId()` before component lookup — never a raw/unguarded string comparison — and both correctly default to `'classic'` for legacy/unrecognized/absent values.
- The PDF route uses a genuine `Record<EstimateTemplateId, Component>` map (not if/else); the share page correctly uses a ternary (justified by the plan's documented prop-shape divergence between `EstimateDocument` (requires `mode`) and `EstimateDocumentModern` (no `mode` prop)).
- Settings picker is fully wired end-to-end: schema → defaultValues → onSubmit FormData → server action validation → DB update.
- `lib/actions/company.ts` (onboarding) is confirmed completely untouched — no `estimate_template_style` field in the insert/update `row` object, so new companies silently get `'classic'` via the DB column default only.
- `components/workspace/estimate/estimate-document.tsx` (in-app editor) is confirmed completely untouched — zero references to the template feature, not present in any commit across this phase.
- No onboarding banner, tour step, or badge anywhere references this feature — grep across `components/onboarding` and `components/tour` returns zero matches, and the only two component files referencing `estimate_template_style`/"Estimate Design" are the two intended ones (`estimate-view.tsx`, `company-info-form.tsx`).
- The live Supabase migration is intentionally not yet applied (explicitly out of scope per all 4 plans, pending user's morning authorization); all runtime reads of `estimate_template_style` are defensively guarded, so this poses zero risk — the code degrades gracefully to Classic everywhere until the migration lands.
- Independent test run (2819/2820 passing, 1 pre-existing flake confirmed green in isolation) and clean `tsc --noEmit` corroborate the static findings above.

---

*Verified: 2026-07-05T07:05:00Z*
*Verifier: Claude (gsd-verifier)*

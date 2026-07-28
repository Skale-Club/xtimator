---
phase: 182-shared-document-engine-send-path-fix
verified: 2026-07-28T05:11:37Z
status: human_needed
score: 5/5 success criteria verified
verified_at_commit: b41c4aff
requirements:
  ENGINE-01: satisfied
  ENGINE-02: satisfied
  ENGINE-03: partial_marked_complete
  PDFPAR-04: satisfied
human_verification:
  - test: "Send a test estimate by email and by WhatsApp in staging for a company whose estimate_template_style = 'modern'; compare both received PDFs against the same estimate's Download PDF output."
    expected: "All three PDFs are the Modern template and are visually identical (header, fonts, sections, totals, preparedBy, photos)."
    why_human: "Requires live Resend + Twilio/Meta providers and real rendered-PDF inspection. Pre-declared manual-only in 182-VALIDATION.md:69."
  - test: "Sign an estimate, then edit it after signing, then send it by email and WhatsApp."
    expected: "Both delivered PDFs show the FROZEN signed content, not the post-sign edit — matching Download PDF."
    why_human: "End-to-end signature + live send flow; the code path is unit-proven but the production wiring cannot be confirmed from source."
  - test: "Open the workspace editor in page mode and the public share webview for the same estimate side by side, before/after this phase."
    expected: "Rendered output identical, EXCEPT dates on the share webview / both PDFs which may now shift by one day west of UTC — the intended local-midnight fix, not a regression."
    why_human: "Visual comparison; the date-fix propagation is an intentional CONTEXT.md-locked exception to 'zero visible change'."
  - test: "Decide whether REQUIREMENTS.md's ENGINE-03 marking should be downgraded from 'Complete' to 'Partial (token layer; structural de-dup in Phase 183/PDFPAR-01)'."
    expected: "A human confirms the intended bookkeeping. See 'Traceability Honesty Assessment' below — the phase's own plans/summaries/validation all say PARTIAL, but REQUIREMENTS.md records it unqualified as Complete."
    why_human: "Requires a scope/bookkeeping judgment call, not a code check. No code change is implied either way."
---

# Phase 182: Shared Document Engine + Send-Path Fix — Verification Report

**Phase Goal:** All four document renderers (workspace editor, share webview, classic PDF, modern PDF) read from one shared document model/labels/tokens/formatters source, and every PDF send path (download, email, WhatsApp) renders the tenant's actual chosen template with the signed snapshot honored.

**Verified:** 2026-07-28T05:11:37Z at commit `b41c4aff`
**Status:** human_needed — all automated checks pass; 4 items need a human
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Identical labels/addresses/dates across all four surfaces from ONE shared module (no diverged copies) | ✓ VERIFIED | `lib/estimate/document/labels.ts:11-56` declares `DocumentLabels` (45 keys) and `LABELS` (en/pt/es) at `:57`; `format.ts:11-45` declares `DATE_LOCALE`/`formatAddress`/`formatDate`. All four renderers import them: `estimate-document.tsx:53-54`, `estimate-document-modern.tsx:40-41`, `estimate-pdf.tsx:30-31`, `estimate-pdf-modern.tsx:33-34`. Live grep for any remaining local `const DOC_LABELS\|PDF_LABELS\|DATE_LOCALE\|function formatAddress\|function formatDate` across all 5 files returns **zero matches**. |
| 2 | Page geometry + pt↔px conversion read from one shared module — no hand-copied literal elsewhere | ✓ VERIFIED | `lib/estimate/document/tokens.ts:11-16` (`PT_PER_PX`, `PX_PER_PT`, `LETTER_WIDTH_PT=612`, `LETTER_HEIGHT_PT=792`, `LETTER_WIDTH_PX`, `LETTER_HEIGHT_PX` — the px values are *derived*, not re-typed). Consumers: `estimate-document.tsx:55` + `:1410` (`minHeight: ${LETTER_HEIGHT_PX}px`), `estimate-editor.tsx:34` + `:181` (`LETTER_PAGE_HEIGHT = LETTER_HEIGHT_PX`) + `:717` (`maxWidth: ${LETTER_WIDTH_PX}px`). Live digit-boundary grep for bare `612\|792\|816\|1056` across all 5 renderer/editor files returns **zero matches** (including comments). |
| 3 | Email + WhatsApp PDFs render the tenant's configured template, matching the Download route | ✓ VERIFIED | Registry-keyed lookup `render-estimate-pdf.ts:43-46` + `:164`; template resolution `:95-98`. All three call sites consume it: `app/api/estimates/[id]/pdf/route.ts:3,23,36`; `app/api/estimates/[id]/send/route.ts:5,183`; `lib/whatsapp/pdf-delivery.ts:14,39`. **Structural proof:** a repo-wide grep for `renderToBuffer` or `from '@/components/pdf/estimate-pdf'` across `app/ lib/ components/` returns hits ONLY inside `lib/pdf/render-estimate-pdf.ts` — no fourth call site can drift. Test `tests/unit/pdf/render-estimate-pdf-resolver.test.ts:75-91` asserts Modern-vs-Classic selection on the actual component identity. |
| 4 | Email/WhatsApp PDFs honor the signed snapshot (TRUST-01) | ✓ VERIFIED | `render-estimate-pdf.ts:90-93` — `requireServiceClient()` → `loadLatestSignedSnapshot()` → `applySignedSnapshot(liveEstimate, signedContent)`, inside `resolveEstimatePdfContext`, which is on the shared path for all three call sites (`renderEstimatePdf:128` falls through to it when no context is injected — which is exactly how send/route.ts:183 and pdf-delivery.ts:39 call it). Test `:94-112` asserts `passedProps.estimate.summary === 'FROZEN summary'` against a differing live row. |
| 5 | Zero visible change — rendered output unchanged (regression-proof) | ✓ VERIFIED (automated) | Full CI gate re-run live during this verification: `npx vitest run tests/unit tests/eval` → **562 files passed / 1 skipped, 4672 tests passed / 21 todo**; `npx tsc -p tsconfig.ci.json --noEmit` → **exit 0**. Matches the claimed state at `b41c4aff`. One *intended* exception is documented and CONTEXT-locked: the local-midnight `formatDate` fix now propagates to the 3 surfaces that previously called `new Date(dateStr)` directly. Real-world visual confirmation is a human item (below). |

**Score: 5/5 success criteria verified.**

---

### Required Artifacts

| Artifact | Expected | Exists | Substantive | Wired | Status |
|----------|----------|--------|-------------|-------|--------|
| `lib/estimate/document/model.ts` | 7 document-model types | ✓ 106 L | ✓ | ✓ imported at `estimate-document.tsx:56-64`, re-exported to 13 downstream sites | ✓ VERIFIED |
| `lib/estimate/document/labels.ts` | `LABELS` + `LANG_INDICATOR` + `DocumentLabels` | ✓ 113 L | ✓ 45 keys × 3 langs | ✓ all 4 renderers | ✓ VERIFIED |
| `lib/estimate/document/format.ts` | `formatDate` (local-midnight), `formatAddress`, `DATE_LOCALE` | ✓ 45 L | ✓ `:38` normalizes `YYYY-MM-DD` → `${dateStr}T00:00:00` | ✓ all 4 renderers | ✓ VERIFIED |
| `lib/estimate/document/tokens.ts` | LETTER geometry + `ESTIMATE_DESIGN_TOKENS` | ✓ 32 L | ✓ px derived from pt | ✓ editor + document + both PDFs | ✓ VERIFIED |
| `lib/pdf/render-estimate-pdf.ts` | `resolveEstimatePdfContext` + `renderEstimatePdf` | ✓ 178 L | ✓ registry + TRUST-01 + preparedBy + photo pre-resolution | ✓ all 3 call sites | ✓ VERIFIED |
| `tests/.../document-label-parity.test.ts.snap` | Permanent value lock | ✓ 147 L | ✓ real en/pt/es values committed | ✓ asserted at test `:121-123` | ✓ VERIFIED |
| `components/workspace/send/send-hub-dialog.tsx` | `attachPdf: opts.format === 'pdf'` | ✓ `:226` | ✓ | ✓ `:425` Email button passes `format: 'pdf'` | ✓ VERIFIED |

---

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `estimate-document.tsx` | `document/labels.ts` | `import { LABELS as DOC_LABELS }` `:53` | ✓ WIRED |
| `estimate-editor.tsx` | `document/tokens.ts` | `LETTER_HEIGHT_PX, LETTER_WIDTH_PX` `:34` → used `:181`, `:311`, `:717` | ✓ WIRED |
| `estimate-document-modern.tsx` | `document/labels.ts` + `format.ts` | `:40-41` → `L = DOC_LABELS[lang]` `:77` | ✓ WIRED |
| `estimate-pdf.tsx` | `document/tokens.ts` | `ESTIMATE_DESIGN_TOKENS.classic` — 13 StyleSheet sites (`:76…:441`) | ✓ WIRED |
| `estimate-pdf-modern.tsx` | `document/tokens.ts` | `ESTIMATE_DESIGN_TOKENS.modern` — 15 sites (`:79…:452`) | ✓ WIRED |
| `pdf/route.ts` | `render-estimate-pdf.ts` | `resolveEstimatePdfContext` `:23` (ETag) → `renderEstimatePdf(…{context})` `:36` | ✓ WIRED |
| `send/route.ts` | `render-estimate-pdf.ts` | `renderEstimatePdf(id, supabase)` `:183` → `rendered.buffer` `:190` | ✓ WIRED |
| `pdf-delivery.ts` | `render-estimate-pdf.ts` | `renderEstimatePdf(estimateId, supabase)` `:39` → `rendered.buffer` `:50` | ✓ WIRED |
| `send-hub-dialog.tsx` | `send/route.ts` | POST `attachPdf: opts.format === 'pdf'` `:226` | ✓ WIRED |

---

### Data-Flow Trace (Level 4)

| Artifact | Data variable | Source | Real data? | Status |
|----------|---------------|--------|-----------|--------|
| `send/route.ts` `pdfAttachments` | `rendered.buffer` | `renderEstimatePdf` → `renderToBuffer(element)` `:175` | ✓ real PDF bytes, guarded by `if (rendered)` | ✓ FLOWING |
| `pdf-delivery.ts` upload payload | `rendered.buffer` | same resolver; throws on null `:41` | ✓ | ✓ FLOWING |
| `pdf/route.ts` response body | `rendered.buffer` | resolver on ETag miss | ✓ 304 short-circuit preserved `:29-33` | ✓ FLOWING |
| Resolver `estimate` | `applySignedSnapshot(liveEstimate, signedContent)` `:93` | `loadLatestSignedSnapshot` (service client) | ✓ frozen content overrides live | ✓ FLOWING |
| Resolver `attachedPhotos` | `storage.getSignedUrl('photos', …)` `:159` | pre-resolved before `createElement` `:165` | ✓ never raw `storage_path` | ✓ FLOWING |
| Resolver `preparedBy` | `company_members.display_name` `:142-147` | falls back to `company.owner_name` `:138` | ✓ | ✓ FLOWING |

No hollow props, no static/empty returns, no hardcoded `[]`/`{}` feeding a render.

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full CI test gate green | `npx vitest run tests/unit tests/eval` | 562 files passed / 1 skipped; 4672 passed / 21 todo | ✓ PASS |
| CI typecheck clean | `npx tsc -p tsconfig.ci.json --noEmit` | exit 0 | ✓ PASS |
| Phase-specific suites | `npx vitest run tests/unit/pdf tests/unit/estimate/document-{format,label-parity,engine-boundary}.test.ts tests/unit/estimate/pt-px-conversion-source.test.ts tests/unit/whatsapp/pdf-delivery.test.ts` | 8 files / 53 tests passed | ✓ PASS |
| No `it.fails` placeholders survive | `grep -rn "it\.fails" tests/unit/estimate tests/unit/pdf` | no matches — both Wave-0 known-red geometry checks are now real `it()` | ✓ PASS |
| Only one PDF render path exists | `grep -rn "renderToBuffer\|from '@/components/pdf/estimate-pdf" app lib components` | hits only in `lib/pdf/render-estimate-pdf.ts` | ✓ PASS |
| Email/WhatsApp PDF visually matches Download | — | needs live providers | ? SKIP → human |

---

### Guard-Test Quality Audit

The phase leaned on two clever "state-tolerant" tests. Both were audited for degeneration into vacuous checks:

- **`document-label-parity.test.ts`** — now that all 4 renderers have adopted, all 12 per-renderer branches take the post-adoption path (`:62`), which asserts only *that the import exists* — value-blind, as the plan openly stated. The actual value guard is the committed snapshot at `:121-123` + the 147-line `.snap`, which locks every en/pt/es string permanently. **This is honest and adequate** — the design was pre-declared in 182-VALIDATION.md:77 (NEW-2). The `LANG_INDICATOR` branch `:101-107` additionally asserts `not.toMatch(/const LANG_INDICATOR/)`, correctly preventing a silent leftover duplicate.
- **`pt-px-conversion-source.test.ts`** — did NOT degenerate. It is a real static grep with a digit-boundary regex (`(?<!\d)N(?!\d)`, correctly catching `1056px`) over all 5 renderer/editor files, plus a positive assertion that `tokens.ts` declares the canonical constants. `DIRTY_SOURCES` and its loop are fully removed; zero `it.fails` remain.
- **`document-engine-boundary.test.ts`** — real: asserts the 4 shared-module files import no `@react-pdf/renderer`, no `react`, no `@/components/*`.

---

### Requirements Coverage

| Requirement | Source Plan(s) | Status | Evidence |
|-------------|----------------|--------|----------|
| **ENGINE-01** | 182-01, 182-02 | ✓ SATISFIED | One shared model/labels/format source consumed by all 4 renderers; zero per-surface duplicate declarations remain (live grep). |
| **ENGINE-02** | 182-01, 182-02 | ✓ SATISFIED | LETTER geometry + pt↔px defined once in `tokens.ts:11-16`; zero bare literals anywhere else; enforced by static-grep test. |
| **ENGINE-03** | 182-01, 182-02 | ⚠️ **PARTIAL — recorded as Complete** | Delivered: per-template font tokens (`tokens.ts:29-32`) wired into 28 StyleSheet sites across both PDFs; zero bare `'Helvetica'`/`'Times-Roman'` literals remain. **NOT delivered:** the requirement's own text — *"replacing the current byte-duplicated ~860-line PDF template pair"*. The pair is still 707 / 708 lines with 44 StyleSheet blocks each; only `fontFamily` values are shared. See assessment below. |
| **PDFPAR-04** | 182-03, 182-04 | ✓ SATISFIED | All 3 paths resolve through `lib/pdf/render-estimate-pdf.ts`, honoring template, TRUST-01, preparedBy, and photos; 7-case acceptance test; structurally unforkable (single `renderToBuffer` in the repo). |

**Orphan check:** ROADMAP Phase 182 declares exactly `ENGINE-01, ENGINE-02, ENGINE-03, PDFPAR-04`; the union of all 4 plans' `requirements:` frontmatter is the same set. **Zero orphaned requirements.**

---

### Traceability Honesty Assessment (ENGINE-03)

Requested explicitly as part of this verification.

**Is the partial-delivery language present in the summaries? YES — consistently and prominently.**

| Location | Language |
|----------|----------|
| `182-02-PLAN.md` must_haves truth #6 | "ENGINE-03 is PARTIALLY delivered by this plan… the full structural de-duplication… is NOT this phase's job — it completes in Phase 183 (PDFPAR-01)." |
| `182-02-SUMMARY.md:132` (provides) | "ENGINE-03 per-template token layer established (full StyleSheet de-duplication deferred to Phase 183 / PDFPAR-01)" |
| `182-02-SUMMARY.md:155` (key-decisions) | "ENGINE-03 partially delivered…" |
| `182-02-SUMMARY.md:205, :240` | Repeats the partial scope in prose |
| `182-01-SUMMARY.md:40, :92` | Documents the parallel `CompanyInfo`/`ClientInfo` model deferral |
| `182-VALIDATION.md:45` | Task 182-02-T2 requirement column literally reads "ENGINE-03 (partial)" |

**Is the traceability marking honest? NO — it overstates.**

- `.planning/REQUIREMENTS.md:26` marks ENGINE-03 `- [x]` with no qualifier.
- `.planning/REQUIREMENTS.md:79` traceability table: `| ENGINE-03 | Phase 182 | Complete |`.
- Neither carries the partial note that appears in six other places.

**Root cause (mechanical, not deceptive):** both plans' SUMMARY frontmatter emits an unqualified `requirements-completed: [ENGINE-01, ENGINE-02, ENGINE-03]` (`182-01-SUMMARY.md:46`, `182-02-SUMMARY.md:157`). That machine-readable field is what propagates to REQUIREMENTS.md, and it has no "partial" expressiveness — so the nuance carried faithfully in every prose field was silently dropped at the one place an auditor would look. The executors did not hide anything; the schema lost it.

**Practical risk: LOW.** The outstanding structural work is already owned by Phase 183 / PDFPAR-01, which is `[ ]` Pending and explicitly scoped to the same two files — no work is lost. The exposure is purely that "is ENGINE-03 done?" currently answers "yes" when the correct answer is "token layer yes, structural de-dup no."

**Recommended correction (documentation only, no code):** amend REQUIREMENTS.md:79 to `| ENGINE-03 | Phase 182 (partial) → Phase 183 | Token layer complete; structural de-dup pending |` and add the same qualifier to the `:26` checkbox. Flagged as a human decision rather than a code gap — see `human_verification` item 4.

---

### Executor Race Incidents — Commit Audit

Both self-corrected incidents were independently re-checked against git; **both summaries describe them accurately.**

| Claim | Verification | Verdict |
|-------|-------------|---------|
| `370cdcfc` "adopt shared document engine in webview renderers + editor" contains only 182-02's 5 files | `git show --stat 370cdcfc` → `estimate-document-modern.tsx`, `estimate-document.tsx`, `estimate-editor.tsx`, `document-page-view.test.tsx`, `pt-px-conversion-source.test.ts` (5 files, +47/−453). **No `send-hub-dialog.tsx`.** | ✓ Headline matches content |
| The scooping commit `0f59a439` was abandoned, not duplicated | `git show --stat 0f59a439` → same 5 files **plus** `send-hub-dialog.tsx` (6 files). `git merge-base --is-ancestor 0f59a439 HEAD` → **not an ancestor**; it is orphaned and excluded from main's history. | ✓ Correctly discarded — no double-commit of the same change |
| `618c860d` "flip Email PDF attachPdf hardcode + drop dead deliveryLog param" carries exactly that | `git show 618c860d` → 1 file, +2/−5: `attachPdf: false` → `attachPdf: opts.format === 'pdf'`, and `?deliveryLog=true` removed from the `window.open` URL. | ✓ Headline matches content exactly |
| No code lost in the race | Current working tree at `b41c4aff` has both changes live (`send-hub-dialog.tsx:226`, `:167-170`); tsc + full suite green. | ✓ No loss, no duplication |

Phase commit sequence on `main` is coherent and complete: `baf0fdb0 → 8a6d685d → 766b548a` (182-01), `bb30daa3 → e8a4eef3` (182-03), `53cea2f6 → b1b7f0fa` (182-04 T1/T2), `370cdcfc → 74c2f29c` (182-02), `618c860d → 255845cd` (182-04 T3 + fix), plus doc commits and `b41c4aff`.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `.planning/REQUIREMENTS.md` | 26, 79 | ENGINE-03 recorded `Complete` while six other artifacts say `partial` | ⚠️ Warning | Bookkeeping-only; the residual work is already owned by Phase 183/PDFPAR-01. See assessment above. |
| `components/workspace/estimate/estimate-document.tsx` | 71-114 | Local `interface DocLabels` (42 keys) parallels the shared 45-key `DocumentLabels` | ℹ️ Info | **Intentional and planned** — `182-02-PLAN.md:168-172` explicitly instructs "KEEP the local `interface DocLabels` UNCHANGED — used as a narrower prop-type contract by 6 sub-components". Values are single-sourced; only the structural prop type is local, and a renamed/removed shared key still fails at the assignment site. Not a gap. |
| `components/pdf/estimate-pdf*.tsx` | 34/50, 37/53 | Local `CompanyInfo`/`ClientInfo` interfaces not folded into `model.ts` | ℹ️ Info | **Documented deferral** — `182-01-PLAN.md` scope note: PDF-only optional fields + the call sites' `client` lacking `id`. Deferred to Phase 183. Not a gap. |
| `tests/integration/missing-key-ux.test.ts` | — | Fails on a `next/cache` `unstable_cache` mock gap | ℹ️ Info | **Pre-existing and independently confirmed:** `lib/demo/guard.ts` last touched 2026-07-26 (Phase 180) and `unstable_cache` in `lib/queries/auth.ts` dates to 2026-05-03 — both predate Phase 182. `.github/workflows/test.yml:71,75` gates on `tests/unit tests/eval` only, so it does not block deploys. Logged honestly in `deferred-items.md`. |

**Zero TODO/FIXME/XXX/HACK/PLACEHOLDER markers** across all phase-created and phase-modified source files.

---

### Human Verification Required

#### 1. Cross-channel template parity (PDFPAR-04)
**Test:** For a company with `estimate_template_style = 'modern'`, send a test estimate by email and by WhatsApp in staging; compare both received PDFs against the same estimate's "Download PDF".
**Expected:** All three are the Modern template and visually identical (header/branding, serif fonts, sections, totals, preparedBy, photos).
**Why human:** Requires live Resend + Twilio/Meta providers and real rendered-PDF inspection. Pre-declared manual-only in `182-VALIDATION.md:69`.

#### 2. Signed-snapshot freeze on the send path (TRUST-01)
**Test:** Sign an estimate, edit it after signing, then send by email and WhatsApp.
**Expected:** Both delivered PDFs show the frozen signed content — matching Download PDF, never the post-sign edit.
**Why human:** End-to-end signature + live delivery flow; unit-proven at `render-estimate-pdf-resolver.test.ts:94-112` but production wiring can't be confirmed from source.

#### 3. Zero-visible-change confirmation
**Test:** Compare the workspace editor page mode and public share webview before/after this phase for the same estimate.
**Expected:** Identical, **except** dates on the share webview and both PDFs, which may shift by one day for viewers west of UTC — the intended local-midnight fix, not a regression.
**Why human:** Visual comparison; the date-fix propagation is a deliberate CONTEXT.md-locked exception to "zero visible change."

#### 4. ENGINE-03 traceability decision
**Test:** Decide whether to downgrade `REQUIREMENTS.md:26` / `:79` from `Complete` to `Partial (token layer; structural de-dup in Phase 183 / PDFPAR-01)`.
**Expected:** A deliberate call on the bookkeeping. No code change either way.
**Why human:** Scope judgment, not a verifiable code property.

---

### Gaps Summary

**No code gaps.** Every observable truth in the phase goal holds against the actual source, not just the SUMMARYs:

- The shared engine exists, is substantive, is imported by all four renderers plus the editor, and the duplicates it replaced are provably gone (live greps return zero, not "the summary says so").
- The PDF resolver is not merely present but *structurally exclusive* — a repo-wide grep confirms `renderToBuffer` and the PDF component imports appear in exactly one file, which is the strongest available proof that email and WhatsApp cannot silently diverge from Download again.
- Both executor race incidents were re-derived from git independently and match their write-ups exactly, including the abandoned `0f59a439` correctly being excluded from history.
- Guard tests were audited for vacuity; the value-blind post-adoption branch is real but is backed by a committed 147-line snapshot, exactly as pre-declared.

**One documentation defect:** ENGINE-03 is recorded as `Complete` in REQUIREMENTS.md while every other phase artifact — plan must_haves, both summaries, and the validation contract — correctly calls it partial. The cause is the `requirements-completed:` frontmatter schema having no way to express "partial." The residual work is already owned by Phase 183 / PDFPAR-01, so nothing is lost operationally; the fix is a two-line documentation correction, surfaced as human item 4 rather than as a phase gap.

**Status is `human_needed`, not `passed`,** because the send-path behavior that this phase exists to fix — email and WhatsApp delivering the right template with the right frozen content — is unit-proven but has never been observed against live providers. That is the one claim code inspection cannot close.

---

_Verified: 2026-07-28T05:11:37Z at commit b41c4aff_
_Verifier: Claude (gsd-verifier)_

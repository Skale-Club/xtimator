---
phase: 182-shared-document-engine-send-path-fix
plan: 04
subsystem: pdf
tags: [react-pdf, supabase, typescript, pdf-generation, send-path, whatsapp, email]

# Dependency graph
requires:
  - phase: 182-03
    provides: lib/pdf/render-estimate-pdf.ts (resolveEstimatePdfContext + renderEstimatePdf)
provides:
  - "All 3 PDF call sites (download route, email send route, WhatsApp document delivery) now render through the ONE shared in-process resolver — zero direct EstimatePDF/renderToBuffer usage remains outside lib/pdf/render-estimate-pdf.ts"
  - "TRUST-01 closed on the send path: a signed estimate's emailed/WhatsApp-delivered PDF now reflects the frozen signed content, matching the download route"
  - "'Email PDF' in the send hub actually attaches a PDF (attachPdf: false hardcode flipped to attachPdf: opts.format === 'pdf')"
affects: [182-shared-document-engine-send-path-fix]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Route handlers as thin wrappers around a shared resolver, keeping cache/short-circuit logic (ETag/304) route-owned while the expensive render lives in one shared module"

key-files:
  created: []
  modified:
    - "app/api/estimates/[id]/pdf/route.ts"
    - "app/api/estimates/[id]/send/route.ts"
    - "lib/whatsapp/pdf-delivery.ts"
    - "tests/unit/whatsapp/pdf-delivery.test.ts"
    - "components/workspace/send/send-hub-dialog.tsx"
    - "tests/integration/missing-key-ux.test.ts"

key-decisions:
  - "Kept the download route's ETag/304 short-circuit route-owned (calls resolveEstimatePdfContext first, computes ETag, only calls the expensive renderEstimatePdf on a cache miss), per 182-RESEARCH.md's Open Question #2 resolution"
  - "send/route.ts and pdf-delivery.ts call renderEstimatePdf with no pre-resolved context (no caching need at those call sites)"
  - "Logged the pre-existing, unrelated tests/integration/missing-key-ux.test.ts unstable_cache mock failure to deferred-items.md rather than fixing it — confirmed via source inspection that demoGuardResponse (unchanged by this plan, called unconditionally before any PDF code path) already transitively imports unstable_cache from next/cache, and that tests/integration/ is not part of the CI gate (.github/workflows/test.yml runs only tests/unit and tests/eval)"

requirements-completed: [PDFPAR-04]

# Metrics
duration: 13min
completed: 2026-07-28
---

# Phase 182 Plan 04: Send-Path PDF Resolver Wiring Summary

**All 3 PDF call sites (download, email, WhatsApp) now render through the shared `lib/pdf/render-estimate-pdf.ts` resolver, closing the TRUST-01 signed-content bug and the hardcoded-Classic-template defect on the email and WhatsApp paths, plus flipping the "Email PDF" `attachPdf: false` hardcode in the send hub.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-07-28T04:33:57Z
- **Completed:** 2026-07-28T04:46:51Z
- **Tasks:** 3 completed
- **Files modified:** 6 (5 planned + 1 deviation fix)

## Accomplishments
- `app/api/estimates/[id]/pdf/route.ts` is now a thin wrapper: `resolveEstimatePdfContext` for the cheap ETag phase, `renderEstimatePdf(id, supabase, {context})` on a cache miss — ETag/304 behavior unchanged, ~135 lines of inline render logic deleted.
- `app/api/estimates/[id]/send/route.ts`'s `attachPdf` branch now calls `renderEstimatePdf` instead of hardcoding `EstimatePDF` (Classic) against live rows — the emailed PDF now reflects the tenant's chosen template AND the TRUST-01 signed snapshot. Dead `projectName`/`projectType`/`clientRaw`/`client` locals and the unused `project` destructure removed; `projectId` untouched, still drives its 4 existing use sites (lines 96/119/243/245/253).
- `lib/whatsapp/pdf-delivery.ts`'s `generateAndUploadEstimatePDF` now calls `renderEstimatePdf` instead of hardcoding `EstimatePDF` + skipping the signed snapshot — WhatsApp document delivery now honors template + TRUST-01 + preparedBy + photos. Storage upload/signed-URL/filename behavior (WAPDF-02/04) unchanged.
- `components/workspace/send/send-hub-dialog.tsx`'s "Email PDF" button now sends `attachPdf: opts.format === 'pdf'` instead of a hardcoded `false` — this was safe to flip only because Task 2 made the resolver-backed render correct. Also removed the dead `?deliveryLog=true` query param from the Download PDF `window.open` call.
- `tests/unit/whatsapp/pdf-delivery.test.ts` updated with mocks for the resolver's transitive imports (`lib/queries/share`, `lib/supabase/service`, `estimate-pdf-modern`) and a new test proving the resolver's template-selection path is exercised end-to-end (PDFPAR-04) — all 15 tests in the file (8 original + 1 new via `describe('generateAndUploadEstimatePDF')`, plus `buildPdfFilename` cases) pass.

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire the download route to the resolver** - `53cea2f6` (feat)
2. **Task 2: Wire send/route.ts and pdf-delivery.ts to the resolver** - `b1b7f0fa` (feat)
3. **Task 3: Flip the send-hub-dialog attachPdf hardcode + drop dead deliveryLog param** - `618c860d` (fix)
4. **Deviation fix: mock estimate-pdf-modern in missing-key-ux integration test** - `255845cd` (fix)

**Plan metadata:** (this commit)

_Note: Task 3's commit was re-done after a race with the concurrent 182-02 executor — see Deviations below._

## Files Created/Modified
- `app/api/estimates/[id]/pdf/route.ts` - Thin wrapper around `resolveEstimatePdfContext`/`renderEstimatePdf`; ETag/304 stays route-owned
- `app/api/estimates/[id]/send/route.ts` - `attachPdf` branch renders via the shared resolver; dead locals removed
- `lib/whatsapp/pdf-delivery.ts` - `generateAndUploadEstimatePDF` renders via the shared resolver
- `tests/unit/whatsapp/pdf-delivery.test.ts` - Mocks updated for the resolver's transitive imports; new PDFPAR-04 template-selection test added
- `components/workspace/send/send-hub-dialog.tsx` - `attachPdf: opts.format === 'pdf'`; dead `deliveryLog=true` param removed
- `tests/integration/missing-key-ux.test.ts` - Added `estimate-pdf-modern` mock (deviation fix, see below)

## Decisions Made
- Preserved the download route's cheap/expensive resolver split exactly as specified in the plan — `resolveEstimatePdfContext` first for the ETag, `renderEstimatePdf(id, supabase, {context})` only on a cache miss, avoiding a second DB fetch.
- Did not attempt to fix the pre-existing `unstable_cache`/`next/cache` mock gap in `tests/integration/missing-key-ux.test.ts` — verified it predates this plan (caused by `demoGuardResponse`, unconditional and unchanged by this plan's diff) and is not part of the CI gate (`tests/unit` + `tests/eval` only). Logged to `deferred-items.md` per the Scope Boundary rule instead of expanding this plan's blast radius.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Mocked `@/components/pdf/estimate-pdf-modern` in `tests/integration/missing-key-ux.test.ts`**
- **Found during:** Task 2 verification (running the plan's full verification command, which includes this integration test)
- **Issue:** `send/route.ts` now imports `renderEstimatePdf` from the shared resolver, which imports BOTH template components (`EstimatePDF` and `EstimatePDFModern`) at module scope. This test only mocked `@/components/pdf/estimate-pdf`, so the real `estimate-pdf-modern.tsx` loaded and crashed on `StyleSheet.create` against the test's minimal `@react-pdf/renderer` mock (`{ renderToBuffer: vi.fn() }`, no `StyleSheet`) — even though the test's `attachPdf: false` request never reaches the actual render call, module-level imports still execute.
- **Fix:** Added `vi.mock('@/components/pdf/estimate-pdf-modern', () => ({ default: () => null }))`, mirroring the existing `estimate-pdf` mock in the same file.
- **Files modified:** `tests/integration/missing-key-ux.test.ts`
- **Verification:** Re-ran the test; the `StyleSheet` crash is gone (a separate, pre-existing, unrelated failure remains — see Issues Encountered).
- **Committed in:** `255845cd`

---

**Total deviations:** 1 auto-fixed (1 blocking). **Impact on plan:** Necessary to prevent the plan's own transitive import change from silently breaking test collection for an existing integration test; no scope creep beyond the one missing mock line.

## Issues Encountered

- **`tests/integration/missing-key-ux.test.ts` still fails after the above fix**, on an unrelated, pre-existing issue: `Error: No "unstable_cache" export is defined on the "next/cache" mock`, thrown from `lib/queries/auth.ts:23` (`getCachedCompany = unstable_cache(...)`), reached via `lib/queries/active-company.ts` ← `lib/demo/guard.ts` ← `demoGuardResponse()`, which `send/route.ts` calls unconditionally as its very first piece of route logic — before body parsing, before the Resend-key check, and well before the `attachPdf`/resolver branch this plan touches. Verified via `git log` that `lib/demo/guard.ts` (demo Phase 2 read-only enforcement) and the `unstable_cache` call in `lib/queries/auth.ts` both predate Phase 182 by many commits, and via `.github/workflows/test.yml` that `tests/integration/` is not part of the CI-gating test run (only `tests/unit` and `tests/eval` are). Logged to `.planning/phases/182-shared-document-engine-send-path-fix/deferred-items.md` per the executor's Scope Boundary rule rather than fixed here.
- **Task 3's commit was captured by a race with the concurrent 182-02 executor**: after staging `components/workspace/send/send-hub-dialog.tsx` for this plan's Task 3, the concurrent (file-disjoint, per plan design) 182-02 executor committed its own changes (`0f59a439`) in the shared working tree before my `git commit` ran — that commit accidentally scooped up my staged `send-hub-dialog.tsx` change. The 182-02 executor subsequently corrected this by re-committing its own work without `send-hub-dialog.tsx` (visible as the rewritten `370cdcfc`/`74c2f29c` commits), which left my working-tree edits intact but no longer part of any commit. I detected this via `git status`/`git diff` showing the file as modified again against the corrected HEAD, confirmed the working-tree content still matched Task 3's intended change exactly, and re-committed it cleanly as `618c860d`. No code was lost or duplicated; only the commit's position in history shifted.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 4 `must_haves.truths` from this plan's frontmatter are satisfied: email/WhatsApp PDFs now render the company's configured template and honor TRUST-01; "Email PDF" attaches a real PDF; the download route's ETag/304 short-circuit is unchanged.
- `grep -rn "EstimatePDF\b" app lib --include=*.ts --include=*.tsx | grep -v "generateAndUploadEstimatePDF\|renderEstimatePdf\|estimate-pdf"` confirms no remaining direct component imports outside `lib/pdf/render-estimate-pdf.ts` and the component files themselves.
- Manual-only verification (per 182-VALIDATION.md, cannot be automated in this environment): send a test estimate by email and WhatsApp in staging, compare the resulting PDF against "Download PDF" for the same estimate — template, signature block presence (if signed), preparedBy, and photos should all match.
- Wave-boundary full-suite gate (`npx tsc -p tsconfig.ci.json --noEmit` + `pnpm vitest run tests/unit tests/eval`) still needs to run after both Wave-2 plans (182-02 and this one) fully land — not run here per this plan's parallel-wave note, since 182-02 was still committing changes to `components/workspace/estimate/*` in the shared working tree at completion time.
- `.planning/phases/182-shared-document-engine-send-path-fix/deferred-items.md` created with one logged pre-existing, unrelated, non-CI-gated test failure for a future plan to pick up if desired.

---
*Phase: 182-shared-document-engine-send-path-fix*
*Completed: 2026-07-28*

## Self-Check: PASSED

- FOUND: app/api/estimates/[id]/pdf/route.ts
- FOUND: app/api/estimates/[id]/send/route.ts
- FOUND: lib/whatsapp/pdf-delivery.ts
- FOUND: .planning/phases/182-shared-document-engine-send-path-fix/deferred-items.md
- FOUND: 53cea2f6 (Task 1 commit)
- FOUND: b1b7f0fa (Task 2 commit)
- FOUND: 618c860d (Task 3 commit)
- FOUND: 255845cd (deviation fix commit)

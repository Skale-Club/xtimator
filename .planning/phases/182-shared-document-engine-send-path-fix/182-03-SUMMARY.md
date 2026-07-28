---
phase: 182-shared-document-engine-send-path-fix
plan: 03
subsystem: pdf
tags: [react-pdf, supabase, typescript, pdf-generation, send-path]

# Dependency graph
requires:
  - phase: 164
    provides: applySignedSnapshot (TRUST-01 overlay) and loadLatestSignedSnapshot (lib/queries/share.ts)
  - phase: 160
    provides: estimate_template_style column + lib/estimate/templates/registry.ts
provides:
  - "lib/pdf/render-estimate-pdf.ts — the ONE shared in-process PDF resolver (resolveEstimatePdfContext + renderEstimatePdf) all 3 PDF call sites will consume"
  - "PDFPAR-04 acceptance test proving template selection, TRUST-01 overlay, photo pre-resolution, and the cheap/expensive context split"
affects: [182-04, pdf-download-route, estimate-send-route, whatsapp-pdf-delivery]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Resolver split into cheap (resolveEstimatePdfContext) vs expensive (renderEstimatePdf) phases so callers with an ETag-style cache check can skip the costly preparedBy/photo/render work"
    - "Plain function + injected SupabaseClient (never an internal HTTP fetch) for code that must run in both auth-cookie (route) and service-role (webhook/Inngest) contexts"

key-files:
  created:
    - lib/pdf/render-estimate-pdf.ts
    - tests/unit/pdf/render-estimate-pdf-resolver.test.ts
  modified: []

key-decisions:
  - "Extracted the PDF resolver verbatim from app/api/estimates/[id]/pdf/route.ts's already-correct pattern rather than writing new logic, to guarantee behavioral parity with the one proven call site"
  - "EstimatePdfContext.company is typed NonNullable<EstimateContextResult['company']> — required because TS strict mode doesn't propagate the runtime null-guard narrowing through a separately declared interface field derived via indexed access"

patterns-established:
  - "Registry-keyed PDF_TEMPLATE_COMPONENTS[templateId] lookup (never if/else) kept local to the resolver module so it has zero dependency on the route file"

requirements-completed: [PDFPAR-04]

# Metrics
duration: 5min
completed: 2026-07-28
---

# Phase 182 Plan 03: Shared PDF Resolver Summary

**One shared in-process PDF resolver (`lib/pdf/render-estimate-pdf.ts`) extracted verbatim from the proven download-route pattern, exporting a cheap `resolveEstimatePdfContext` (template + TRUST-01 snapshot + cache key) and a full `renderEstimatePdf` (+preparedBy +photo signed-URLs +renderToBuffer), proven by 7 passing acceptance tests.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-07-28T04:19:00Z
- **Completed:** 2026-07-28T04:22:14Z
- **Tasks:** 2 completed
- **Files modified:** 2 (both created)

## Accomplishments
- Extracted `app/api/estimates/[id]/pdf/route.ts`'s proven pattern (registry-keyed template lookup + `loadLatestSignedSnapshot`/`applySignedSnapshot` TRUST-01 overlay + preparedBy `company_members` lookup + pre-resolved photo signed URLs) into a standalone, dependency-injected module with zero coupling to Next.js route internals.
- Split the resolver into a cheap `resolveEstimatePdfContext` (DB reads + cache-key computation only) and an expensive `renderEstimatePdf` (full render, optionally reusing a pre-resolved context) so the download route's future ETag 304 short-circuit (Plan 182-04) can skip the costly work on a cache hit.
- Proved the 4 PDFPAR-04 behaviors — template selection, TRUST-01 frozen-content overlay, photo pre-resolution, and the cheap/expensive split — with a fully mocked acceptance test (no real Supabase/network calls), mirroring `tests/unit/whatsapp/pdf-delivery.test.ts`'s existing mocking convention.
- Satisfied the load-bearing "never internal HTTP fetch" constraint (`lib/whatsapp/pdf-delivery.ts:5-8`) by construction — the resolver is a plain async function taking an injected `SupabaseClient`, safe to call from both route handlers (auth-cookie client) and Inngest/webhook contexts (service-role client).

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement lib/pdf/render-estimate-pdf.ts** - `bb30daa3` (feat)
2. **Task 2: Write the PDFPAR-04 resolver acceptance test** - `e8a4eef3` (test)

**Plan metadata:** (this commit)

## Files Created/Modified
- `lib/pdf/render-estimate-pdf.ts` - Exports `resolveEstimatePdfContext` and `renderEstimatePdf`; the shared PDF-rendering resolver all 3 send-path call sites will consume in Plan 182-04
- `tests/unit/pdf/render-estimate-pdf-resolver.test.ts` - 7-case acceptance test proving template selection, TRUST-01 overlay, photo pre-resolution, and the cheap/expensive context split

## Decisions Made
- Wrapped `EstimatePdfContext.company` in `NonNullable<...>` per the plan's load-bearing type-safety note — without it, strict-mode `tsc` fails on `company.owner_name` access in `renderEstimatePdf` because the runtime null-guard in `resolveEstimatePdfContext` doesn't structurally propagate into the separately declared interface field.
- Kept `PDF_TEMPLATE_COMPONENTS` as a local const in the resolver module (duplicated from the route file) rather than importing it, per the plan's explicit design goal of zero dependency on `app/api/estimates/[id]/pdf/route.ts`.

## Deviations from Plan

None - plan executed exactly as written. The plan's action block provided complete, verbatim code for both the implementation and the test file; both were created as specified and verified without modification.

## Issues Encountered

None. `npx tsc -p tsconfig.ci.json --noEmit` exited 0 with zero "possibly null" errors on `company.owner_name`, and all 7 vitest cases in `tests/unit/pdf/render-estimate-pdf-resolver.test.ts` passed on the first run.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `lib/pdf/render-estimate-pdf.ts` is ready for Plan 182-04 to wire into all 3 call sites: `app/api/estimates/[id]/pdf/route.ts` (replacing its inline logic with `resolveEstimatePdfContext`/`renderEstimatePdf`, keeping its ETag 304 short-circuit route-owned), `app/api/estimates/[id]/send/route.ts` (currently hardcodes Classic and skips the signed snapshot — defect this resolver fixes), and `lib/whatsapp/pdf-delivery.ts` (currently hardcodes Classic and skips the signed snapshot — same defect).
- This plan's files (`lib/pdf/render-estimate-pdf.ts`, `tests/unit/pdf/render-estimate-pdf-resolver.test.ts`) are new and file-disjoint from Plan 182-01's `lib/estimate/document/*` work — confirmed via `git status`/`git log`, zero existing route/component files touched by this plan.
- The wave-boundary full-suite gate (`npx tsc -p tsconfig.ci.json --noEmit` + `pnpm vitest run tests/unit tests/eval`) still needs to run after both Wave-1 plans (182-01 and this one) land, per the plan's parallel-wave note — not run here since 182-01 was still in progress in the shared working tree.

---
*Phase: 182-shared-document-engine-send-path-fix*
*Completed: 2026-07-28*

## Self-Check: PASSED

- FOUND: lib/pdf/render-estimate-pdf.ts
- FOUND: tests/unit/pdf/render-estimate-pdf-resolver.test.ts
- FOUND: bb30daa3 (Task 1 commit)
- FOUND: e8a4eef3 (Task 2 commit)

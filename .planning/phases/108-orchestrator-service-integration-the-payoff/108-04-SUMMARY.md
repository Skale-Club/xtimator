---
phase: 108-orchestrator-service-integration-the-payoff
plan: 04
subsystem: generation-core / price-research integration
tags: [price-research, integration, the-payoff, never-$0, awaiting-details, channel-neutral, warning-1]
requires:
  - lib/estimate/price-research/orchestrator.ts (researchUnmatchedPrices + ResearchContext + ResearchOutcome — Plan 108-03)
  - lib/ai/price-anchoring.ts (anchorAndClampSections — the candidate-set boundary it researches)
  - lib/estimate/quality/vagueness.ts (the 108-02 gate that permits a total>0 partially-priced estimate)
  - lib/entitlements.ts (maxPriceResearchPerMonth — 108-01 interface widening)
provides:
  - "generate-estimate.ts calls researchUnmatchedPrices between anchoring and the server totals — researched prices flow into the authoritative totals + persistence (THE PAYOFF: the $0→vague fix lands at runtime for all 3 channels)"
  - "flaggedUnpriced>0 AND total>0 → projects.status='awaiting_details' (existing recourse; partial estimate surfaced, not blocked)"
  - "projectId threaded into ResearchContext as the best-available per-generation metering seed (Warning #1)"
  - "5 stale Entitlements test mocks repaired (no NEW tsc errors from this milestone)"
affects:
  - "Plan 108-05 (regression fixture) — the wire is now live; the 'Couch cleaning 8seats' full-graph case can assert non-zero/non-vague end-to-end"
tech-stack:
  added: []
  patterns:
    - "Non-fatal enrichment between anchoring and totals (try/catch in addition to the never-throws orchestrator contract — research failure degrades to anchored sections)"
    - "Single computed status local (projectStatus) preserves the existing one-shot projects.update call shape"
    - "vi.hoisted for mock vars referenced inside a hoisted vi.mock factory"
key-files:
  created:
    - tests/unit/services/generate-estimate-research.test.ts
  modified:
    - lib/services/generate-estimate.ts
    - tests/unit/whatsapp/handler.test.ts
    - tests/unit/whatsapp/handler-intent-routing.test.ts
    - tests/unit/whatsapp/handler-inngest-dispatch.test.ts
decisions:
  - "Research runs AFTER anchorAndClampSections and BEFORE the calculatedSections/subtotal block — the only point where items are tagged price_book vs ai_estimate and still before persistence/assess, which is exactly why it fixes the $0→vague bug (assess reads the PERSISTED estimate)."
  - "projectId is the metering seed (no real attemptId is reachable at this call site nor on GenerateEstimateOptions; threading a new correlation token across the graph just for this was out of scope per Warning #1). The orchestrator builds ${attemptId ?? projectId ?? companyId}:... so projectId is retry-stable and finer than company-scoped."
  - "Defensive try/catch wraps the call EVEN THOUGH the orchestrator never-throws — belt-and-suspenders so a future orchestrator change can never break generation; degrades to the anchored sections + flaggedUnpriced=0."
  - "Status routing uses a single computed local (flaggedUnpriced>0 && safeGrandTotal>0 ? 'awaiting_details' : 'estimate_ready') so the existing projects.update({status,total}) shape is byte-identical when nothing is flagged."
metrics:
  duration_minutes: 6
  completed: 2026-06-24
  tasks: 1
  files: 5
  commits: 2
---

# Phase 108 Plan 04: Wire researchUnmatchedPrices into generateEstimateForProject Summary

THE PAYOFF lands at runtime. `generateEstimateForProject` now calls the Plan-108-03
orchestrator `researchUnmatchedPrices` IMMEDIATELY after `anchorAndClampSections` and
BEFORE the server totals recalculation + persistence, so researched regional prices
flow into the authoritative `estimates.subtotal/total` and the persisted estimate the
vagueness gate (`assess`) reads carries real numbers — the originating
"Couch cleaning 8seats → $0 → blocked as vague" bug is fixed for ALL three channels
(web/WhatsApp/MCP) because the service is the shared core. The `flaggedUnpriced` signal
routes a partially-priced estimate (total>0) to the EXISTING `awaiting_details` recourse
without blocking it.

## What Shipped

**Task 1 — the wire + integration tests** (commit `4f4108a`)
- `lib/services/generate-estimate.ts`:
  - New import `researchUnmatchedPrices` from `@/lib/estimate/price-research/orchestrator`.
  - Inserted the research call AFTER the `anchorAndClampSections` block and BEFORE
    `const calculatedSections = ...`. `region = { city: client?.city ?? null, state:
    client?.state ?? null }`, `currency = currencyCode`, `companyId` from the param,
    `projectId` as the metering seed. Wrapped in `try/catch` → `researchedSections`
    falls back to `guardedSections` (and `flaggedUnpriced` to 0) on any error.
  - Totals now read `researchedSections.map(...)` (was `guardedSections`). Everything
    downstream (subtotal/taxAmount/grandTotal/persist) is unchanged — it operates on
    the researched tree.
  - Project-status update computes a single `projectStatus` local:
    `flaggedUnpriced > 0 && safeGrandTotal > 0 ? 'awaiting_details' : 'estimate_ready'`,
    `total: safeGrandTotal` either way.
- `tests/unit/services/generate-estimate-research.test.ts` (6 tests, mocked
  orchestrator/provider/service-client/price-book/next-cache, capture-based chainable
  service mock):
  - Test 1 (insertion order): orchestrator re-tags the $0 ai_estimate item to
    researched $180 → persisted `subtotal`/`total` = 180 (research ran BEFORE totals).
  - Test 2 (non-fatal): a rejecting orchestrator → generation still completes, persists
    the anchored ($0) sections, no throw bubbles out.
  - Test 3 (region/currency/companyId/projectId): asserts the exact ctx args.
  - Test 4a/4b/4c: flagged+total>0 → `awaiting_details`; no-flag → `estimate_ready`;
    flagged but total===0 → `estimate_ready` (the vagueness gate owns empty/all-$0).

**Extra Task 2 — repair the 5 stale Entitlements mocks** (commit `9cd0196`)
- 108-01 widened `Entitlements` with `maxPriceResearchPerMonth`; 5 mock literals across
  `tests/unit/whatsapp/handler.test.ts` (×2), `handler-intent-routing.test.ts` (×1),
  `handler-inngest-dispatch.test.ts` (×2) predated it and broke `tsc --noEmit`. Added
  the field to each (unlimited/Business tiers `null`, free-tier `50`). Runtime behavior
  unchanged (those suites already passed at runtime); this clears the milestone's NEW
  tsc errors.

## Warning #1 (idempotency-key token)

No real `attemptId`/`correlationId` is reachable at this call site or on
`GenerateEstimateOptions`, and threading a new per-generation token across the estimate
graph purely for the metering key was explicitly out of scope. `projectId` is passed as
`ResearchContext.projectId` — the orchestrator builds
`${attemptId ?? projectId ?? companyId}:research:...`, so the project-scoped seed is
retry-stable (same project = same key on an Inngest retry) and finer than the
company-scoped fallback. The cache-overlap is benign (a same-service+region repeat
within the 30-day TTL is a cache HIT → no allowance regardless of seed).

## Verification

- `npx vitest run tests/unit/services/generate-estimate-research.test.ts` → 1 file / 6 passed.
- Regression: `npx vitest run tests/unit/services tests/eval tests/unit/whatsapp/handler*.test.ts` → 8 files / 66 passed (existing generate-estimate route test + eval harness + the 3 repaired handler suites all green).
- FULL `npx vitest run` → **274 files passed | 3 skipped, 1921 passed | 2 skipped | 33 todo** (was 273/1915 at the 108-03 baseline; +1 file / +6 assertions — no regressions).
- `npx tsc --noEmit` → clean on `lib/services/generate-estimate.ts`, the new test, and all 3 repaired handler files. The 5 Entitlements errors are GONE; the remaining repo-wide tsc errors are the 7 long-standing pre-Phase-108 tsconfig/strictness mismatches (e.g. `generate-estimate-job.test.ts` Mock-callable) logged to `deferred-items.md` — NONE from this milestone.
- Channel-neutral: the new import is from `lib/estimate/*`; no `lib/whatsapp` import added to generate-estimate.ts beyond the pre-existing `getWhatsAppSystemPrompt` platform-config import.
- Acceptance greps: `grep -c "researchUnmatchedPrices" lib/services/generate-estimate.ts` = 2 (import + call); `grep -c "researchedSections" lib/services/generate-estimate.ts` = 3 (destructure-fallback + assignment + totals input). ORDER verified by reading the file: the call sits between `anchorAndClampSections` and `calculatedSections`.
- gitleaks ran on both commits (normal hooked commits, NO `--no-verify`) — no leaks found. Test URLs/keys are placeholders only.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] vi.hoisted for the mocked orchestrator/provider vars**
- **Found during:** Task 1 (first test run)
- **Issue:** the hoisted `vi.mock('@/lib/estimate/price-research/orchestrator')` factory referenced top-level `researchMock`, which is a TDZ ReferenceError under vitest hoisting.
- **Fix:** moved `generateEstimateMock`/`researchMock` into a `vi.hoisted(() => ...)` block (the established project pattern — see Plan 107-02's deviation log).
- **Files modified:** tests/unit/services/generate-estimate-research.test.ts
- **Commit:** 4f4108a

**2. [Rule 1 - Bug] EstimateOutput.suggested_project_name must be a string**
- **Found during:** Task 1 (tsc)
- **Issue:** the test fixture set `suggested_project_name: null`, but the GUARD-01 zod schema types it `z.string()`.
- **Fix:** set it to a real string (`'Smith Couch Cleaning'`).
- **Files modified:** tests/unit/services/generate-estimate-research.test.ts
- **Commit:** 4f4108a

The 5-Entitlements-mock repair was a pre-declared extra task (documented above), not an
unplanned deviation.

## Deferred Issues (out of scope — NOT caused by this plan)

The repo-wide `npx tsc --noEmit` still reports the 7 long-standing pre-Phase-108
tsconfig/strictness errors (es2018 regex `s` flag, StepRunner mock shape, DocumentSection
assignment, `generate-estimate-job.test.ts` Mock-callable). These are runtime-green
(vitest passes) and CI uses a scoped `tsconfig.ci.json`. Already logged to
`deferred-items.md` by prior plans; not touched here (different subsystems, scope
boundary). The 5 Entitlements errors that WERE in scope are now fixed.

## Known Stubs

None. The wire is fully live: `researchUnmatchedPrices` is invoked in the production
generation path, the researched sections feed the authoritative totals + persistence,
and `flaggedUnpriced` routes to the existing `awaiting_details` recourse. The actual
research SOURCE (OpenRouter-web / Anthropic-web adapters) is configured via
`platform_integrations` and returns all-misses when unconfigured (safe no-op), which is
the intended dormant-until-configured behavior, not a stub in this plan's code.

## Self-Check: PASSED
- FOUND: lib/services/generate-estimate.ts
- FOUND: tests/unit/services/generate-estimate-research.test.ts
- FOUND commit: 4f4108a
- FOUND commit: 9cd0196

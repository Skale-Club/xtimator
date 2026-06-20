---
phase: 96-intelligence-parity-auto-refine-needs-details-surfacing
verified: 2026-06-20T15:30:00Z
status: passed
score: 6/6 must-haves verified
re_verification: false
---

# Phase 96: Intelligence Parity — Auto-Refine + Needs-Details Surfacing Verification Report

**Phase Goal:** Add cap=1 auto-refine loop to the shared estimate graph and surface needs_details per channel
**Verified:** 2026-06-20T15:30:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (from 96-02-PLAN must_haves)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | When a vague estimate is generated, the engine automatically runs one self-refine attempt before involving any human | VERIFIED | `checkVagueAfterAssessEdge` routes to `autoRefine` when `isVague=true && refineAttempts < 1`; loop back-edge `autoRefine → generate` wired in `index.ts` |
| 2 | After one failed auto-refine, web/MCP surfaces needs_details=true in the graph return value and writes projects.status='awaiting_details' | VERIFIED | `makeDefaultAdapter.finalize` conditional on `isVague && refineAttempts >= 1` writes `awaiting_details` and returns `{ needsDetails: true }` |
| 3 | WhatsApp finalize behavior is preserved unchanged — ask-details message fires after one auto-refine attempt | VERIFIED | `lib/estimate/adapters/whatsapp.ts` is UNCHANGED; imports `revertVagueEstimate` from `@/lib/whatsapp/ask-details` (backward-compat re-export still live); never-reply-regression test: 3/3 GREEN |
| 4 | autoRefineNode reads companyId from state.companyId (closure-trusted input) — not an LLM-overrideable parameter | VERIFIED | `auto-refine.ts` contains `state.companyId` in docblock (QA-02 source anchor); no `function(...companyId)` pattern; Test C GREEN. Behavioral isolation confirmed: adapter captures `companyId` in closure; `auto-refine.ts` does not accept companyId as a parameter |
| 5 | lib/estimate/graph/nodes/auto-refine.ts contains zero lib/whatsapp/* imports (ENGINE-01) | VERIFIED | grep of forbidden tokens returns 0 matches; graph-neutrality.test.ts 2/2 GREEN |
| 6 | quota recordUsage fires once after the entire graph completes — no charge per internal attempt (SMART-02) | VERIFIED | `generate-estimate.ts` Step 1 = `orchestrate-estimate` (full graph); Step 2 = `record-usage` (one call, after graph returns); file is UNCHANGED from Phase 95 |

**Score:** 6/6 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/estimate/quality/revert.ts` | Shared `revertVagueEstimate` function | VERIFIED | 33 lines; exports `revertVagueEstimate`; imports only `SupabaseClient`; no WhatsApp tokens |
| `lib/estimate/graph/nodes/auto-refine.ts` | Shared auto-refine core node | VERIFIED | 49 lines; exports `autoRefineNode`; contains `state.companyId` (docblock); zero `lib/whatsapp/*` imports |
| `lib/estimate/graph/nodes/decide.ts` | `checkVagueAfterAssessEdge` exported | VERIFIED | Exports `checkGeneratedEdge`, `checkVagueEdge`, `checkVagueAfterAssessEdge`; cap=1 logic present |
| `lib/estimate/graph/state.ts` | `needsDetails` field present | VERIFIED | Line 42: `needsDetails: Annotation<boolean \| undefined>()` |
| `lib/estimate/graph/index.ts` | Conditional loop topology, no direct assess→finalize | VERIFIED | `addConditionalEdges('assess', checkVagueAfterAssessEdge, ['finalize', 'autoRefine'])` + `addEdge('autoRefine', 'generate')`; no `addEdge('assess', 'finalize')` line |
| `lib/estimate/adapters/default.ts` | `awaiting_details` written, `needsDetails` returned | VERIFIED | Finalize method has real body; writes `status: 'awaiting_details'`; returns `{ needsDetails: true }` on vague-after-refine path |
| `lib/whatsapp/ask-details.ts` | Re-exports `revertVagueEstimate` for backward compat | VERIFIED | Line 53: `export { revertVagueEstimate } from '@/lib/estimate/quality/revert'` — function body removed, re-export only |
| `lib/inngest/functions/generate-estimate.ts` | UNCHANGED (SMART-02) | VERIFIED | Commits confirm no changes since Phase 95; `record-usage` step fires as Step 2 after the graph step |
| `lib/mcp/tools/write.ts` | UNCHANGED (SMART-04) | VERIFIED | File exists; dispatches `EVENT_ESTIMATE_GENERATE`; inherits `needsDetails` via Inngest job output with zero code changes |
| `lib/estimate/adapters/whatsapp.ts` | UNCHANGED (SMART-05) | VERIFIED | Imports `revertVagueEstimate` from `@/lib/whatsapp/ask-details` (backward-compat path); file unchanged from Phase 94 |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `lib/estimate/graph/index.ts` | `lib/estimate/graph/nodes/auto-refine.ts` | `addNode('autoRefine', autoRefineNode)` | WIRED | Import on line 29; `addNode` on line 54; conditional edge on line 63 |
| `lib/estimate/graph/nodes/auto-refine.ts` | `lib/estimate/quality/revert.ts` | `import { revertVagueEstimate }` | WIRED | Line 24: `import { revertVagueEstimate } from '@/lib/estimate/quality/revert'`; called on line 38 |
| `lib/estimate/adapters/default.ts` | `lib/estimate/quality/revert.ts` | `import { revertVagueEstimate }` for finalize body | WIRED | Line 23: `import { revertVagueEstimate } from '@/lib/estimate/quality/revert'`; called on line 49 |
| `lib/whatsapp/ask-details.ts` | `lib/estimate/quality/revert.ts` | re-export for backward compat | WIRED | Line 53: `export { revertVagueEstimate } from '@/lib/estimate/quality/revert'` |
| `lib/estimate/graph/index.ts` | `lib/estimate/graph/nodes/decide.ts` | `checkVagueAfterAssessEdge` | WIRED | Line 30 import; used in `addConditionalEdges` on line 63 |
| `autoRefine` back-edge | `generate` node | `.addEdge('autoRefine', 'generate')` | WIRED | Line 64 of `index.ts`; closes the cap=1 loop |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `lib/estimate/adapters/default.ts` finalize | `state.isVague`, `state.refineAttempts` | Graph state populated by `assessNode` | Yes — real assessment output | FLOWING |
| `lib/estimate/adapters/default.ts` finalize | `companyId` for DB filter | Closure captured from `makeDefaultAdapter({ companyId })` (server-side Inngest event payload) | Yes — event payload, not LLM-derived | FLOWING |
| `lib/estimate/graph/nodes/auto-refine.ts` | `state.refineAttempts`, `state.estimateId`, `state.prompts` | Graph state from previous nodes | Yes — real state | FLOWING |
| `lib/estimate/graph/index.ts` | `checkVagueAfterAssessEdge` routing | `state.isVague` + `state.refineAttempts` | Yes — assess node output | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| auto-refine isolation: 4 tests (SMART-01/03/04, QA-02) | `npx vitest run tests/unit/estimate/auto-refine-isolation.test.ts` | 4/4 passed | PASS |
| ENGINE-01 neutrality: core files exist + no WhatsApp tokens | `npx vitest run tests/unit/estimate/graph-neutrality.test.ts` | 2/2 passed | PASS |
| QA-01 regression: WhatsApp never-throw/always-reply preserved | `npx vitest run tests/unit/whatsapp/never-reply-regression.test.ts` | 3/3 passed | PASS |
| Full estimate test suite | `npx vitest run tests/unit/estimate/` | 30/30 passed (8 files) | PASS |
| Full unit suite (regression check) | `npx vitest run tests/unit/` | 1514 passed; 10 failed in 3 files — all pre-existing (landing-actions, onboarding-survey, theme-toggle) | PASS (no Phase 96 regressions) |
| TypeScript Phase 96 files | `npx tsc --noEmit` filtered to phase files | 0 errors in auto-refine.ts, revert.ts, decide.ts, state.ts, index.ts, default.ts | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SMART-01 | 96-01, 96-02 | Engine makes exactly ONE auto self-refine attempt (cap=1) | SATISFIED | `checkVagueAfterAssessEdge` returns `autoRefine` only when `refineAttempts < 1`; Test A GREEN |
| SMART-02 | 96-02 | Quota charged only once after graph completes (not per attempt) | SATISFIED | `generate-estimate.ts` UNCHANGED; `record-usage` is Step 2 after the whole graph step |
| SMART-03 | 96-02 | Web surfaces `needs_details` as `awaiting_details` project status | SATISFIED | `default.ts` finalize writes `{ status: 'awaiting_details' }` + `eq('company_id', companyId)`; Test B GREEN |
| SMART-04 | 96-02 | MCP surfaces `needs_details` as structured job result status | SATISFIED | `default.ts` returns `{ needsDetails: true }`; `mcp/tools/write.ts` UNCHANGED (inherits via Inngest job output) |
| SMART-05 | 96-02 | WhatsApp inline ask-details behavior preserved | SATISFIED | `whatsapp.ts` adapter UNCHANGED; backward-compat re-export live in `ask-details.ts`; never-reply-regression GREEN |
| QA-02 | 96-01, 96-02 | Multi-tenant isolation: companyId stays closure/param, never LLM-suppliable | SATISFIED | `auto-refine.ts` has no `companyId` parameter; `default.ts` uses closure companyId in DB filter; Test C + Test D GREEN |

**All 6 Phase 96 requirements SATISFIED.**

Orphaned requirements check: REQUIREMENTS.md traceability table lists SMART-01..05 and QA-02 mapped to Phase 96 — exact match with both plan files. No orphaned requirements.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | — | — | — | — |

No stubs, no hardcoded empty returns on hot paths, no TODOs blocking functionality. The `revert.ts` early-return on null `estimateId` is intentional and documented.

---

### Human Verification Required

None. All behavioral contracts are verified programmatically via the test suite.

---

### Gaps Summary

No gaps. All must-haves verified at all four levels (exists, substantive, wired, data-flowing). The 10 test failures in the full unit suite are in `landing-actions.test.ts`, `onboarding-survey.test.tsx`, and `theme-toggle.test.tsx` — all three files predate Phase 96 (oldest commit `9b3f688b`) and are unrelated to the estimate graph.

---

_Verified: 2026-06-20T15:30:00Z_
_Verifier: Claude (gsd-verifier)_

---
phase: 108-orchestrator-service-integration-the-payoff
verified: 2026-06-24T06:45:00Z
status: passed
score: 7/7 must-haves verified
human_verification:
  - test: "End-to-end live estimate: record an 8-seat couch cleaning walkthrough for a client in a real US city/state with a configured price-research provider, generate, and confirm the persisted estimate has a non-zero total, is not blocked as vague, and the researched line shows a regional price."
    expected: "Estimate persists with grandTotal>0, not vague; a flagged unpriced line (if any) routes to the awaiting_details/needs-details banner without blocking the priced lines."
    why_human: "Requires a live provider key + real client address + browser UI; the automated regression proves it deterministically with a fixture provider but cannot exercise the real OpenRouter/Anthropic web-research path or the UI banner."
---

# Phase 108: Orchestrator Service Integration — The Payoff — Verification Report

**Phase Goal:** Wire price research into generateEstimateForProject immediately after anchorAndClampSections (before totals/persist) so the persisted estimate carries real regional numbers before the vagueness gate; precedence price_book > researched > ai_estimate; evidence-gated tagging; never-$0 fallback ladder; meter via existing quota; vagueness gate distinguishes empty (block) from partially-priced-with-flagged-line (allow); "Couch cleaning 8seats" non-zero/non-vague regression.
**Verified:** 2026-06-24T06:45:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | generate-estimate.ts CALLS researchUnmatchedPrices AFTER anchorAndClampSections and BEFORE subtotal/total recalc + persist; region = client city+state; non-fatal try/catch over a never-throws orchestrator | ✓ VERIFIED | `generate-estimate.ts`: anchoring at L277-281; `researchUnmatchedPrices` call at L300-308 with `region: { city: client?.city, state: client?.state }`, `companyId` (param, not LLM), `supabase` reused, `projectId` seed; wrapped in try/catch (L299-312); `calculatedSections`/subtotal block reads `researchedSections` at L314-332 (AFTER). |
| 2 | Orchestrator: never-throws, channel-neutral; candidates = post-anchor 'ai_estimate' only; cache HIT → no provider/no allowance; miss+quota → batched lookup → cache.put; evidence-gated re-tag; over-allowance skips provider; idempotent recordUsage per-attempt/project key; returns flaggedUnpriced | ✓ VERIFIED | `orchestrator.ts`: top-level try/catch returns input on error (L123-232); zero `lib/whatsapp` imports (grep=0); candidate filter `price_source === 'ai_estimate'` (L129); cache HIT re-tag with no provider/recordUsage (L152-153); single batched `provider.lookup` (L168); `checkQuota` gate skips provider on over-allowance (L163-164); evidence gate `isUsableCandidate` (L192); `recordUsage` keyed by `buildIdemKey` = `${attemptId ?? projectId ?? companyId}:research:${normName}:${region}` (L109-112, L185); returns `flaggedUnpriced` (L224). |
| 3 | Never-$0: a $0 outcome is a flagged-unpriced line routed to existing awaiting_details (projects.status), not silently $0, not blocking a partially-priced estimate | ✓ VERIFIED | Orchestrator counts unit_price<=0 items into `flaggedUnpriced` without mutating/dropping (L84-98, L220-224). `generate-estimate.ts` L479-480: `projectStatus = flaggedUnpriced > 0 && safeGrandTotal > 0 ? 'awaiting_details' : 'estimate_ready'` → existing path, only when total>0. |
| 4 | quota.ts price_researched EventType + price_research QuotaType + checkQuota gating before non-estimate early-return; entitlements maxPriceResearchPerMonth on all tiers; idempotent migration widening usage_events CHECK | ✓ VERIFIED | `quota.ts`: `EventType` incl `'price_researched'` (L17), `QuotaType` incl `'price_research'` (L12), `QUOTA_TO_EVENT` map (L24), `price_research` branch BEFORE `quotaType !== 'estimate'` early-return (L50-79). `entitlements.ts`: `maxPriceResearchPerMonth` on type + all 4 tiers (free 50/trial 200/pro 1000/business null, L20/33/43/55/66). Migration `20260624000002_...sql`: idempotent DROP IF EXISTS + ADD CONSTRAINT listing all 4 values. |
| 5 | vagueness.ts distinguishes empty/all-$0 (vague) from total>0-with-flagged-line (not vague); WhatsApp/needs-details not regressed | ✓ VERIFIED | `vagueness.ts` L41-46: `isVagueEstimate` returns `!hasTotal || !hasItems` keyed on aggregate `total` — total>0 with items → not vague; total 0/no items → vague. WhatsApp + estimate suites: 374 passed, 0 failed. |
| 6 | Eval regression "Couch cleaning 8 seats" {Austin,TX}: evidenced → grandTotal>0 & isVague=false; empty-research → non-zero/non-vague; all-empty → isVague=true; deterministic fixture provider, no live network | ✓ VERIFIED | `tests/eval/price-research-regression.test.ts`: 3/3 pass. Test 1 evidenced → grandTotal=180, isVague=false. Test 2 empty-research+context → grandTotal=90, isVague=false. Test 3 all-empty → grandTotal=0, isVague=true. Drives REAL graph via `buildEstimateGraph` (generate node → generateEstimateForProject), fixture provider under FIXTURE_FIXED_NOW, live-network tripwire `fetch` throws. |
| 7 | Channel-neutral; graph topology (assess/decide edges) unchanged; full suite green | ✓ VERIFIED | Orchestrator + vagueness import nothing channel-specific (grep `lib/whatsapp`=0). No phase-108 commits/changes to `lib/estimate/graph/` (git log + status clean). Phase-108 suites 48/48 + eval 3/3 + estimate/whatsapp regression 374 passed. |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `lib/services/generate-estimate.ts` | researchUnmatchedPrices wired between anchoring and totals; flaggedUnpriced→awaiting_details | ✓ VERIFIED | Call placed L300, fed into totals L314, status routing L479-480. |
| `lib/estimate/price-research/orchestrator.ts` | channel-neutral, never-throws, precedence + evidence-gate + never-$0 + metering | ✓ VERIFIED | 233 lines; exports `researchUnmatchedPrices`; imports cache/provider/quota/normalize; tsc-clean. |
| `lib/quota.ts` | price_researched EventType + price_research QuotaType + checkQuota gating | ✓ VERIFIED | All three present; gating branch before non-estimate early-return. |
| `lib/entitlements.ts` | maxPriceResearchPerMonth on every tier | ✓ VERIFIED | Type field + 4 tiers documented. |
| `lib/estimate/quality/vagueness.ts` | empty vs flagged-unpriced distinction; total>0 never blocked | ✓ VERIFIED | Aggregate-total gate; no per-item $0 branch. |
| `supabase/migrations/20260624000002_phase108_usage_event_price_researched.sql` | idempotent CHECK widening incl price_researched | ✓ VERIFIED | DROP IF EXISTS + ADD CONSTRAINT, 4 values, no secrets. NOT applied to remote (deploy pipeline owns it — documented). |
| `tests/eval/price-research-regression.test.ts` | full-graph regression (evidenced/empty/all-empty) | ✓ VERIFIED | 3 variants, fixture provider, zero network, 3/3 pass. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| generate-estimate.ts | orchestrator.ts | `researchUnmatchedPrices(guardedSections, {...})` | ✓ WIRED | L9 import, L300 call; researchedSections feeds calculatedSections (L314). |
| orchestrator.ts | cache.ts | `import { get, put }` | ✓ WIRED | L44 `get as cacheGet, put as cachePut`; used L148, L195. |
| orchestrator.ts | provider.ts | `getPriceResearchProvider, isUsableCandidate` | ✓ WIRED | L43; used L165 (lookup), L192 (evidence gate). |
| orchestrator.ts | quota.ts | `checkQuota, recordUsage` | ✓ WIRED | L45; used L163, L185. |
| quota.ts checkQuota | entitlements maxPriceResearchPerMonth | `getEntitlements(tier).maxPriceResearchPerMonth` | ✓ WIRED | L58. |
| eval test | provider.getPriceResearchProvider | `vi.mock returning makeFixtureProvider` | ✓ WIRED | L84-90, L398-400. |
| eval test | fixtures/price-research.ts | `PRICE_RESEARCH_FIXTURES` | ✓ WIRED | L50, L185-186. |
| graph generate node | generateEstimateForProject | StepRunner invocation | ✓ WIRED | `nodes/generate.ts` L15/L34 — eval drives the real integration. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| generate-estimate.ts | `researchedSections` | `researchUnmatchedPrices(...).sections` → feeds `calculatedSections`/subtotal/persist | Yes — researched prices flow into authoritative server totals (L307→L314→L327→L408/414) | ✓ FLOWING |
| orchestrator.ts | re-tagged items | cache.get / provider.lookup (evidence-gated) | Yes — eval proves $0→$180 researched flow end-to-end | ✓ FLOWING |
| generate-estimate.ts | `flaggedUnpriced` | orchestrator count → `projectStatus` | Yes — drives awaiting_details only when total>0 | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Phase-108 unit suites | `vitest run quota-price-research + entitlements + orchestrator + vagueness-flagged-unpriced + generate-estimate-research` | 5 files, 48 tests passed | ✓ PASS |
| Eval regression (3 variants) | `vitest run tests/eval/price-research-regression.test.ts` | 3/3 passed (grandTotal 180/90/0; isVague false/false/true) | ✓ PASS |
| WhatsApp/needs-details + estimate regression | `vitest run tests/unit/estimate tests/unit/whatsapp` | 374 passed, 0 failed (3 skipped, 28 todo) | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| RPRICE-01 | 108-03/04 | Research no-match line items via client city+state | ✓ SATISFIED | Truth 1, 2; orchestrator candidate set + region wiring |
| RPRICE-03 | 108-03/04 | Precedence price_book > researched > ai_estimate | ✓ SATISFIED | Truth 2; only ai_estimate items are candidates (L129) |
| RPRICE-04 | 108-03 | researched tag only with real evidence; else non-zero ai_estimate | ✓ SATISFIED | Truth 2; `isUsableCandidate` gate (L192) |
| RFALL-01 | 108-03/04 | No fallback rung ever $0 | ✓ SATISFIED | Truth 3; flaggedUnpriced ladder, never silently $0 |
| RFALL-02 | 108-02 | Vagueness gate distinguishes empty vs flagged-unpriced | ✓ SATISFIED | Truth 5; vagueness.ts aggregate-total gate |
| RFALL-03 | 108-05 | "Couch cleaning 8seats" regression non-zero/non-vague | ✓ SATISFIED | Truth 6; eval 3/3 |
| RMETER-01 | 108-01/03 | Each search metered via usage_events/recordUsage, idempotent | ✓ SATISFIED | Truth 2, 4; recordUsage idempotency key |
| RMETER-02 | 108-01 | Per-tier monthly allowance in entitlements | ✓ SATISFIED | Truth 4; maxPriceResearchPerMonth on 4 tiers |
| RMETER-03 | 108-01/03 | checkQuota gates research; over-allowance skips, never hard-fails | ✓ SATISFIED | Truth 2, 4; over-allowance skip (L163-164) |

No orphaned requirements — all 9 declared IDs map to plans and to REQUIREMENTS.md (all marked Complete / Phase 108).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (orchestrator/service/quota/vagueness) | — | `=[]`/`return null` initial-state matches | ℹ️ Info | All are legitimate accumulators (candidates/misses arrays) or never-throws fallbacks overwritten by real data; NOT stubs. Verified data-fetch paths populate them. |
| `components/workspace/estimate/estimate-editor.tsx` | 51 | `tsc` TS2322: `price_source "researched"` not assignable to `DocumentItem` union | ⚠️ Warning | PRE-EXISTING (present at commit 4dc07861 before any 108 code; `researched` entered the union in Phase 105). Type-level only — `DocumentItem.price_source` is declared but not read at render time, so no runtime impact. `next build` type-checks (no `ignoreBuildErrors`), so this should be closed by a follow-up widening `DocumentItem.price_source` to include `'researched'`. Documented in deferred-items.md. |
| `tests/unit/whatsapp/handler*.test.ts` | various | Stale Entitlements mocks missing maxPriceResearchPerMonth | ℹ️ Info | Runtime-green (mocked getEntitlements never asked for the field on WhatsApp paths); 9cd0196e already patched the blocking ones. Remaining are deferred and documented. |

### Human Verification Required

1. **Live end-to-end couch-cleaning estimate** — Record/describe an 8-seat couch cleaning for a real US-city client with a configured price-research provider, generate, and confirm: persisted total>0, not blocked as vague, researched line carries a regional price, and any flagged unpriced line surfaces the needs-details/awaiting_details banner without blocking the priced lines.
   - Expected: grandTotal>0, isVague=false, partial estimate proceeds with the banner.
   - Why human: needs a live provider key, real address, and the browser UI — the automated regression proves the logic deterministically with a fixture provider but cannot exercise the real web-research path or render the banner.

### Gaps Summary

No goal-blocking gaps. All 7 observable truths, all 7 artifacts (exists/substantive/wired/data-flowing), all 8 key links, and all 9 requirements are verified. 48 phase-unit tests + 3 eval regressions + 374 estimate/whatsapp regression tests are green. The integration call is correctly placed (post-anchor, pre-totals), the orchestrator is channel-neutral and never-throws, the never-$0 ladder routes to the existing awaiting_details path only when total>0, and the originating "Couch cleaning 8 seats" $0/vague bug is locked as a green full-graph regression across all three variants.

One pre-existing (not phase-108-caused) type-level warning is logged for follow-up: `estimate-editor.tsx`'s `DocumentItem.price_source` union does not yet include `'researched'`. It is documented in deferred-items.md, has no runtime impact (the field is not read at render), but `next build` does type-check — a one-line union widening should be scheduled so the UI build stays green now that `researched` items actually occur.

---

_Verified: 2026-06-24T06:45:00Z_
_Verifier: Claude (gsd-verifier)_

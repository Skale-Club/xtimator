---
phase: 105-price-source-researched-threading
verified: 2026-06-23T23:19:00Z
status: passed
score: 9/9 must-haves verified
---

# Phase 105: `price_source: 'researched'` Threading Verification Report

**Phase Goal:** The estimate stack understands a third price provenance — `researched` — end to end (output schema, types, DB CHECK constraint, persistence, editor badge), shipped with ZERO runtime behavior change because nothing tags an item `researched` yet. Dormant foundation that unblocks Phase 108.
**Verified:** 2026-06-23T23:19:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | An `estimate_items` row can be persisted with `price_source = 'researched'`; CHECK accepts exactly `price_book \| ai_estimate \| researched` and still rejects anything else (NULL valid). | ✓ VERIFIED | Migration L13: `CHECK (price_source IS NULL OR price_source IN ('price_book', 'ai_estimate', 'researched'))` |
| 2 | `estimateOutputSchema` preserves `'researched'`; genuine garbage still coerces to `'ai_estimate'`. | ✓ VERIFIED | schema.ts L22-25 preprocess `(v === 'price_book' \|\| v === 'researched' ? v : 'ai_estimate')` + enum widened; test L115-121 asserts `.toBe('researched')`; garbage/missing regression cases pass |
| 3 | `LineItemOutput.price_source` type accepts `'researched'`. | ✓ VERIFIED | types.ts L17 union `'price_book' \| 'ai_estimate' \| 'researched'` |
| 4 | `anchorAndClampSections` still tags a price-book match `'price_book'` — behavior byte-unchanged; only the type widened. | ✓ VERIFIED | price-anchoring.ts L93 `price_source: 'price_book' as const`; `git diff` of file vs prior commit is empty (type widens transitively via `LineItemOutput`) |
| 5 | Editor renders a distinct "Researched" badge (third variant) on desktop ItemRow + mobile ItemCardMobile when `price_source === 'researched'`. | ✓ VERIFIED | item-row.tsx L90-94 + item-card-mobile.tsx L59-63 each add a `Search`-icon `Researched` badge after the `ai_estimate` branch |
| 6 | `EditorItem.price_source` and the editor-save union accept `'researched'`. | ✓ VERIFIED | use-estimate-reducer.ts L19 (`\| null`) + L94 (loaded shape); estimate.ts L51 (`\| null`) |
| 7 | The Edited rule is intact (edit clears `price_source` to null, null path beats any badge) and NOT re-implemented. | ✓ VERIFIED | `isManuallyEdited` is the FIRST ternary branch in both components; save rule `isManuallyEdited ? null : (item.price_source ?? null)` unchanged at estimate.ts L186/225/243; test L78-89 asserts Edited beats researched |
| 8 | DORMANT invariant: nothing in production code WRITES/assigns `price_source = 'researched'`. | ✓ VERIFIED | Repo-wide grep finds only type unions, `=== 'researched'` badge comparisons, and the schema preprocess that PRESERVES (passes through) the value — zero assignments |
| 9 | The unit/eval suite stays green; no regression. | ✓ VERIFIED | `vitest run tests/unit/ai` = 64/64 pass; `price-badge.test.tsx` + 3 targeted AI suites = 32/32 pass |

**Score:** 9/9 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `supabase/migrations/20260623000001_estimate_items_price_source_researched.sql` | Idempotent CHECK widening incl. `researched` | ✓ VERIFIED | Drops Phase-19 autonamed CHECK + named one idempotently; re-adds 3-value CHECK; NULL preserved; comment updated; no secrets |
| `lib/ai/schema.ts` | Relaxed D-15 preprocess preserving `researched` | ✓ VERIFIED | L22-25 preserves `researched`, garbage→`ai_estimate` |
| `lib/ai/types.ts` | `LineItemOutput.price_source` union widened | ✓ VERIFIED | L17 includes `'researched'` |
| `lib/ai/price-anchoring.ts` | Type-only widening, logic unchanged | ✓ VERIFIED | No diff; `'price_book' as const` intact |
| `components/workspace/estimate/item-row.tsx` | Desktop Researched badge (3rd variant) | ✓ VERIFIED | L90-94; `Search` imported L3 |
| `components/workspace/estimate/item-card-mobile.tsx` | Mobile Researched badge (3rd variant) | ✓ VERIFIED | L59-63; `Search` imported L3 |
| `components/workspace/estimate/use-estimate-reducer.ts` | EditorItem + loaded-shape unions widened | ✓ VERIFIED | L19 + L94 |
| `lib/actions/estimate.ts` | Editor-save union widened | ✓ VERIFIED | L51 |
| `tests/unit/ai/schema.test.ts` | `researched` preservation case | ✓ VERIFIED | L115-121 |
| `tests/unit/estimate/price-badge.test.tsx` | Researched render + Edited-precedence cases | ✓ VERIFIED | L66-89; makeItem param widened L10 |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| schema.ts | types.ts | `EstimateOutput = z.infer<...>` re-export | ✓ WIRED | enum `['price_book','ai_estimate','researched']` flows to `EstimateOutput`; types.ts re-exports it |
| `estimate_items.price_source` CHECK | persistence | `IN ('price_book','ai_estimate','researched')` | ✓ WIRED | Migration L13 |
| item-row.tsx | `EditorItem.price_source === 'researched'` | badge branch after ai_estimate | ✓ WIRED | L90 branch present, after ai_estimate, before `: null` |
| estimate.ts | `estimate_items.price_source` | `isManuallyEdited ? null : (item.price_source ?? null)` | ✓ WIRED | L186/225/243 unchanged; nulls edited items, passes `researched` through for non-edited |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| item-row / item-card-mobile badge | `item.price_source` | EditorItem loaded from DB (use-estimate-reducer L399) | N/A — DORMANT BY DESIGN | ⚠️ HOLLOW-INTENTIONAL — no production path emits `'researched'` until Phase 108; this is the explicit phase contract, not a defect |

The "Researched" badge is intentionally dormant: it renders only when an item carries `price_source === 'researched'`, and no production code produces that value in this phase. This matches the goal ("ZERO runtime behavior change ... nothing tags an item researched yet"). Not a gap.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Schema preserves `researched`, garbage coerces | `vitest run tests/unit/ai/schema.test.ts` | pass | ✓ PASS |
| Anchoring + tagging behavior unchanged | `vitest run tests/unit/ai/price-anchoring.test.ts price-source-tagging.test.ts` | pass | ✓ PASS |
| Researched badge renders + Edited precedence | `vitest run tests/unit/estimate/price-badge.test.tsx` | pass | ✓ PASS |
| Full AI suite regression | `vitest run tests/unit/ai` | 64/64 pass | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| RPRICE-02 | 105-01, 105-02 | Researched price tagged `price_source: 'researched'` threaded through output schema, persistence (CHECK), and editor badge | ✓ SATISFIED | schema/types/migration/badge all thread the value; REQUIREMENTS.md maps RPRICE-02 → Phase 105 (Complete) |
| RPRICE-03 | 105-01, 105-02 | Price precedence `price_book > researched > ai_estimate` enforced (type/schema-layer parts here) | ✓ SATISFIED (scoped) | Type/schema layer threaded; anchoring (price-book wins) unchanged; full runtime precedence enforcement is owned by Phase 108 per scope. REQUIREMENTS.md maps RPRICE-03 → Phase 108 (Complete) |

Note: REQUIREMENTS.md coverage table assigns RPRICE-03 primary ownership to Phase 108 (where full runtime precedence enforcement lands). Phase 105 delivers only the type/schema-layer parts of RPRICE-03, consistent with the phase scope statement. No orphaned requirements for this phase.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| (none) | — | — | — | No blocker/warning anti-patterns. The dormant badge branch is an intentional, documented, type-safe variant — not a stub. No TODO/FIXME/placeholder in modified files. No production assignment of `'researched'`. |

### Human Verification Required

None required. The phase ships dormant by design — there is no new user-visible runtime behavior to exercise until Phase 108 begins writing `'researched'`. All claims are verifiable programmatically (schema, types, migration text, badge branches, test suite).

### Gaps Summary

No gaps. All 9 observable truths verified, all 10 artifacts pass existence + substantive + wiring checks, all 4 key links wired, the DORMANT invariant holds (no production code assigns `price_source = 'researched'`; only type unions, read-only `=== 'researched'` badge comparisons, and a value-preserving schema preprocess exist), the Edited rule is intact and not re-implemented, price-anchoring behavior is byte-unchanged, and the unit suite is green (64/64 AI, 32/32 targeted). RPRICE-02 fully satisfied in this phase; RPRICE-03's type/schema-layer slice satisfied with full runtime enforcement correctly deferred to Phase 108.

---

_Verified: 2026-06-23T23:19:00Z_
_Verifier: Claude (gsd-verifier)_

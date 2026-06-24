---
phase: 108-orchestrator-service-integration-the-payoff
plan: 02
subsystem: estimate-quality
tags: [vagueness, RFALL-02, gate, contract-lock]
requires:
  - "lib/estimate/quality/vagueness.ts isVagueEstimate (Phase 94 extraction)"
provides:
  - "isVagueEstimate intent documented: empty/all-$0 → vague; partially-priced (total>0) with a flagged unpriced line → not vague"
  - "RFALL-02 contract locked by tests/unit/estimate/vagueness-flagged-unpriced.test.ts"
affects:
  - "lib/estimate/graph/nodes/assess.ts (consumer — verdict unchanged)"
  - "tests/eval/metrics.ts scorePersistedEstimate (consumer — verdict unchanged)"
  - "lib/whatsapp/ask-details.ts re-export (needs-details path — verdict unchanged)"
tech-stack:
  added: []
  patterns:
    - "Behavior-preserving contract lock: document intent + add tests, no functional body change"
key-files:
  created:
    - "tests/unit/estimate/vagueness-flagged-unpriced.test.ts"
  modified:
    - "lib/estimate/quality/vagueness.ts"
decisions:
  - "No spurious per-item $0 branch added: the gate keys on the AGGREGATE total. The current `!hasTotal || !hasItems` already yields all six required verdicts (empty/all-$0 vague; total>0 with a flagged unpriced line not vague). Adding a per-item block would re-block partially-priced estimates (the never-$0 fallback ladder)."
metrics:
  duration: ~3 min
  completed: 2026-06-24
  tasks: 1
  files: 2
  commits: 1
---

# Phase 108 Plan 02: Vagueness-Gate Refinement Summary

RFALL-02 — refined the Ellen rule so a partially-priced estimate is never blocked just because one line is a flagged unpriced item, while a genuinely valueless (empty / all-$0) estimate still asks for details. The refinement is a documentation + contract-lock change: `isVagueEstimate` already produced all six required verdicts because it keys on the aggregate `total`, so the function body stays functionally identical; the doc comment now makes the empty-vs-flagged distinction explicit and six tests lock it.

## What Was Built

- **`lib/estimate/quality/vagueness.ts`** — Expanded the `isVagueEstimate` doc comment to state the two distinguished cases (empty/all-$0 → vague; partially-priced with a flagged unpriced line → not vague), and to warn future readers NOT to add a per-item $0 branch (which would re-block partially-priced estimates). Function body unchanged: `!hasTotal || !hasItems`, keyed on the aggregate total.
- **`tests/unit/estimate/vagueness-flagged-unpriced.test.ts`** — Six-case contract lock:
  - Test 1: `{ total: 0, sections: [] }` → true (vague)
  - Test 2: `{ total: null, sections: [{ items: [] }] }` → true (vague)
  - Test 3: `{ total: 0, sections: [{ items: [{},{}] }] }` → true (items but all-$0 → vague)
  - Test 4: `{ total: 250, sections: [{ items: [{},{},{}] }] }` → false (the new case — priced, flagged line allowed)
  - Test 5: `isVagueEstimate(null)` → true
  - Test 6: `{ total: 1000, sections: [{ items: [{}] }] }` → false (happy path)

## Why It Works (the key insight, load-bearing)

The context line "total > 0 already passes today; the refinement ensures a partially-priced estimate is never blocked just because one line is flagged" is satisfied by the existing logic because the gate evaluates the AGGREGATE `total`, not per-item prices. A flagged unpriced line is just another item (possibly unit_price 0); once total > 0, it flips neither `hasTotal` nor `hasItems`. So the correct refinement is to LOCK and DOCUMENT this contract rather than add a branch that could regress it.

## Verification

- `npx vitest run tests/unit/estimate/vagueness-flagged-unpriced.test.ts` → 1 file / 6 passed.
- `grep -ci "flagged\|partially" lib/estimate/quality/vagueness.ts` → 7 (intent documented).
- Regression: `npx vitest run tests/unit/estimate tests/eval tests/unit/whatsapp` → 55 files passed | 3 skipped, 389 passed | 28 todo, 0 failures. The `vague-do-some-work` eval case (total 0 / sections []) stays `isVague: true`; the WhatsApp ask-details / needs-details path is unchanged.
- `npx tsc --noEmit` clean on `vagueness.ts` + the new test.

## Deviations from Plan

None — plan executed exactly as written. The plan explicitly anticipated that the body would stay functionally identical and that the change is a documentation + contract-lock; that is what landed.

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: lib/estimate/quality/vagueness.ts
- FOUND: tests/unit/estimate/vagueness-flagged-unpriced.test.ts
- FOUND commit: 13cad33

---
phase: quick-260707-mv1
plan: 01
subsystem: ai-estimate-pipeline
tags: [ai, prompt, schema, vagueness, side-effects]
requires:
  - lib/ai/prompt-builder.ts (HARD-02/UNIFY-02 shared builder)
  - lib/estimate/quality/vagueness.ts (isVagueEstimate — the assess gate)
provides:
  - Soft-prior industry phrasing + detected_trade instruction (generate mode)
  - detected_trade through zod + all 5 provider schema sites
  - Side-effect-free discard semantics (rename/project_type/mismatch gated on vagueness)
  - estimate_activity 'trade_mismatch_detected' rows for future auto-suggestion UX
affects:
  - lib/ai/prompt-builder.ts
  - lib/ai/schema.ts
  - lib/ai/providers/openrouter.ts
  - lib/ai/providers/gemini.ts
  - lib/ai/providers/anthropic.ts
  - lib/services/generate-estimate.ts
  - lib/estimate/graph/nodes/auto-refine.ts
tech-stack:
  added: []
  patterns:
    - "Gate post-persist side effects on the SAME deterministic verdict the assess node re-derives (skip, don't undo)"
key-files:
  created:
    - tests/unit/ai/prompt-soft-prior.test.ts
  modified:
    - lib/ai/prompt-builder.ts
    - lib/ai/schema.ts
    - lib/ai/providers/openrouter.ts
    - lib/ai/providers/gemini.ts
    - lib/ai/providers/anthropic.ts
    - lib/services/generate-estimate.ts
    - lib/estimate/graph/nodes/auto-refine.ts
    - tests/unit/services/generate-estimate.test.ts
decisions:
  - "Task 2 mechanism: gate rename/project_type/mismatch writes on isVagueEstimate() computed from the exact persisted values (safeGrandTotal + calculatedSections) instead of restore-on-revert — a reverted pass never wrote anything, so revert.ts stays untouched"
  - "detected_trade added to `required` in every provider schema site where suggested_project_name is required (all 5), zod keeps it optional so legacy/cached outputs still parse"
metrics:
  duration: "~65 min (one stream-watchdog resume mid-Task 2)"
  completed: 2026-07-07
  tasks: 3
  files: 9
---

# Quick 260707-mv1: Adaptive Trade Inference + Zero Side Effects on Discard Summary

Industry is now a soft prior ("primarily works in X, but ALWAYS estimate the requested work") with AI-returned detected_trade persisted to projects.project_type on kept generations only — discarded (vague-reverted) passes leave zero side effects because the rename/type/mismatch writes are gated on the same vagueness verdict the assess node re-derives.

## Commits

| Task | Commit | Message |
| ---- | ------ | ------- |
| 1 | 5fcf7ce5 | feat(ai): industry as soft prior + detected_trade in schema — config can no longer force a wrong-trade estimate |
| 2 | 3dcc15b7 | fix(estimate): zero side effects on discarded generations — rename/project_type only on kept estimates |
| 3 | 6923f50f | test(ai): soft-prior prompt + detected_trade schema coverage |

## Task 1 — Soft prior + detected_trade plumbing

- `buildSystemPrompt` generate-mode opening replaced: "You are a professional estimator. The company primarily works in ${industry ?? 'general services'}, but ALWAYS estimate the work that is actually requested — if the request belongs to a different trade, price it faithfully for that trade at realistic US market rates." (also fixes the "a electrical" grammar bug). Every other sentence of the paragraph is unchanged; the refine-mode paragraph is untouched (HARD-02/UNIFY-02 caveat honored — asserted by test).
- detected_trade instruction appended next to the suggested_project_name instruction in the same paragraph.
- `lib/ai/schema.ts`: `detected_trade: z.string().optional()` — optional so legacy/cached outputs parse.
- Provider JSON schemas (openrouter 1 site, gemini 2 sites, anthropic 2 sites): `detected_trade` property with description, added to `required` mirroring suggested_project_name exactly (it is required in all 5 sites, including both refine schemas, which were trivially symmetric).

## Task 2 — Mechanism chosen and WHY (flow trace)

**Flow trace (the acceptance criteria drove the mechanism, per the plan's instruction):**

1. Graph topology (`lib/estimate/graph/index.ts`): `START → ingest → generate → assess → (vague? autoRefine → generate … : finalize)`. Web/MCP final-vague terminal is the default adapter's `finalize` (`awaiting_details` + revert).
2. `generateEstimateForProject` persists the estimate row (`total = safeGrandTotal`), then sections/items (`calculatedSections`), then updates `projects.status/total`.
3. `assessNode` re-reads **exactly those persisted values** from DB (`estimates.total` + nested `estimate_items` ids) and runs `isVagueEstimate` — a pure function of `{ total, sections[].items[] }`.
4. The OLD rename ran at line ~269, BEFORE persistence and therefore before assess could ever run — a pass later judged vague had already renamed the placeholder; `revertVagueEstimate` deleted the estimate and reset status/total but left the garbage name, and the PLACEHOLDER_PREFIX guard then permanently blocked a correct rename (the production double-damage).

**Mechanism:** instead of "move rename to end-of-success + restore name in the discard path" (the plan's recommended starting point), the rename + project_type write + mismatch activity moved to AFTER the projects status/total update AND are gated on `isVagueEstimate({ total: safeGrandTotal, sections: calculatedSections })` — the byte-identical inputs assessNode re-reads from DB, so the two verdicts can never disagree.

**Why this beats restore-on-revert:**
- A pass that assess will mark vague (and autoRefine/finalize will revert) **never wrote** projects.name/project_type — there is nothing to restore, so `revert.ts` and `auto-refine.ts` need no restore logic (a documenting comment was added to auto-refine.ts making the dependency explicit).
- The plan's explicit trace question — "can the final vague terminal (default adapter awaiting_details path) follow a pass that renamed?" — answers NO under this gate: if a pass renamed, it was non-vague by this verdict ⇒ assess computes `isVague=false` ⇒ neither autoRefine nor the finalize `state.isVague && refineAttempts >= 1` branch runs. Choice: **skip, not restore** — zero side effects, not undone side effects (no window where a concurrent reader sees a garbage name).
- Restore-on-revert would require carrying the pre-attempt name through graph state (or a pre-generate DB read) — more moving parts and replay hazards under Inngest retries.

**Kept-generation additions (acceptance B):**
- PLACEHOLDER_PREFIX rename guard preserved verbatim (renames exactly once; user-set names untouched).
- `projects.project_type = detected_trade` (lowercased, trimmed) when present.
- `estimate_activity` row `trade_mismatch_detected` with `metadata { detected, configured }` when detected_trade and company.industry both exist and differ case-insensitively. No UI in this task.
- The client-link block (~230-267) stayed where it was, per plan.

**Edge note:** `awaiting_details` from `flaggedUnpriced > 0 && total > 0` (RFALL-01 partial-price path) is a KEPT estimate (non-vague, total > 0) — it renames/persists type, which is correct: that estimate survives and is shown to the user.

## Task 3 — Tests

- `tests/unit/ai/prompt-soft-prior.test.ts` (new): (1) "primarily works in electrical" + faithful-to-request instruction; (2) "general services" fallback on null industry; (3) detected_trade instruction present; (4) refine-mode opening carries no soft-prior/detected_trade leak; (5) schema parses WITH detected_trade (value preserved) and WITHOUT it (legacy-safe).
- `tests/unit/services/generate-estimate.test.ts` (updated): existing rename tests passed unmodified against the moved anchor (the mock's `updateSpy` + `select('name')` path is position-independent). Added 4 tests via a hoisted `activityInsertSpy`: vague (total 0) pass performs NO rename / NO project_type / NO mismatch row; kept pass persists `project_type: 'cleaning'` from `'  Cleaning '`; mismatch row logged with `{ detected: 'cleaning', configured: 'construction' }`; NO mismatch row when trades match case-insensitively.
- Targeted suites: 128 tests / 20 files green (`tests/unit/ai/` + service test).

## Verification

- `npx tsc --noEmit`: 41 errors before AND after (pre-existing test-infra errors, unrelated files — git-stash baseline comparison). Zero new problems.
- `npx eslint` on all 9 touched files: clean.
- `npx vitest run tests/unit/ai/ tests/unit/services/generate-estimate.test.ts`: 128 passed.
- Post-deploy manual check (from plan, still pending user): sofa-cleaning request on the electrical-profile company should yield a cleaning-trade estimate with a coherent name and a `trade_mismatch_detected` activity row.

## Deviations from Plan

### Auto-fixed / adapted

**1. [Task 2 mechanism] Vagueness-gate instead of end-of-success position alone**
- **Found during:** Task 2 flow trace
- **Issue:** Merely moving the rename after the status update does not by itself guarantee a discarded pass never renamed — the service has no awareness of the assess verdict unless it derives it.
- **Fix:** Derive the identical verdict inline (`isVagueEstimate` over the persisted values) and gate all three side effects on it. The plan explicitly authorized this ("adapt if the flow disagrees"; "restore or skip — document the choice").
- **Files modified:** lib/services/generate-estimate.ts, lib/estimate/graph/nodes/auto-refine.ts (comment)
- **Commit:** 3dcc15b7

Otherwise executed as written.

## Known Stubs

None. The `trade_mismatch_detected` activity rows are intentionally write-only for now (raw material for a future industry auto-suggestion UX — explicitly out of scope per the plan: "No new UI in this task").

## Self-Check: PASSED

- All 3 task commits exist on dev: 5fcf7ce5, 3dcc15b7, 6923f50f
- Created files exist: tests/unit/ai/prompt-soft-prior.test.ts, this SUMMARY
- tsc error count 41 = baseline 41 (zero new); eslint clean on all touched files; 128 targeted tests green

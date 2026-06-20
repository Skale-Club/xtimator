---
phase: 94-extract-canonical-graph-behind-whatsapp-behavior-preserving-steprunner-seam
verified: 2026-06-20T13:36:00Z
status: passed
score: 8/8 must-haves verified
re_verification: null
gaps: []
human_verification: []
---

# Phase 94: Extract Canonical Graph Behind WhatsApp (behavior-preserving) + StepRunner Seam — Verification Report

**Phase Goal:** Lift the WhatsApp-only StateGraph into a shared, channel-neutral `lib/estimate/graph/` core (`ingest → generate → assess → refine/ask → finalize`) driven by a `ChannelAdapter`, with the deterministic `isVagueEstimate` gate extracted, the never-throw/failure-as-state invariant preserved, the `StepRunner` contract injected, and the checkpoint-granularity decision captured — WhatsApp behavior unchanged, its tests stay green.
**Verified:** 2026-06-20T13:36:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (mapped to the 8 requirement IDs)

| #   | Requirement | Truth                                                                                                     | Status     | Evidence                                                                                                                                                                                                                  |
| --- | ----------- | ------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | ENGINE-01   | Shared core exists and imports NOTHING from WhatsApp; state carries no channel-specific fields           | ✓ VERIFIED | `grep -rE "@/lib/whatsapp\|sendWhatsAppMessage\|ownerPhone\|WhatsAppMessage" lib/estimate/graph` → EMPTY. TS-only grep on `graph`+`quality` → EMPTY (only `.md` doc reference in CHECKPOINTING.md). `state.ts` Annotation.Root has no ownerPhone/WhatsAppMessage/whatsapp_ |
| 2   | ENGINE-02   | ChannelAdapter closure-factory exists; buildEstimateGraph accepts an adapter; companyId is a closure param | ✓ VERIFIED | `makeWhatsAppAdapter({companyId,supabase,ownerPhone,messages})` returns `ChannelAdapter`; companyId/ownerPhone captured in closure, NOT edge-fn input. `buildEstimateGraph(adapter, {runner})` in `index.ts`               |
| 3   | ENGINE-03   | isVagueEstimate lives in `lib/estimate/quality/vagueness.ts` AND re-exported from `lib/whatsapp/ask-details.ts` | ✓ VERIFIED | `vagueness.ts` exports `isVagueEstimate`+`VagueCheckEstimate` (verbatim truth table: total<=0 OR no items); `ask-details.ts` re-exports both from `@/lib/estimate/quality/vagueness`                                       |
| 4   | ENGINE-04   | Core nodes never throw; `failure?: { reason }` channel exists; 3 readers consistent                       | ✓ VERIFIED | `generate.ts` try/catch → `return { failure: { reason: 'generation_failed' } }`; `state.ts` has `failure: Annotation<{reason:string}\|undefined>`; `decide.ts` reads `state.failure`; adapter `onError` branches on `state.failure?.reason === 'generation_failed'` |
| 5   | CHAN-01     | WhatsApp runs on the shared graph; whatsapp-process.ts calls buildEstimateGraph via orchestrate-estimate; contract stable | ✓ VERIFIED | `estimate-graph.ts` zero-arg `buildEstimateGraph()` composes `buildSharedEstimateGraph(makeWhatsAppAdapter(...))`; `whatsapp-process.ts` → `step.run('orchestrate-estimate', ...)` → `buildEstimateGraph()` → `graph.invoke` |
| 6   | DURABLE-01  | StepRunner contract + passthroughRunner default exist; injected into factory; used in generate node      | ✓ VERIFIED | `types.ts` `interface StepRunner { run<T> }` + `passthroughRunner`; `index.ts` `{ runner = passthroughRunner }` → `makeGenerateNode(runner)`; `generate.ts` `runner.run('ai-generate', () => generateEstimateForProject(...))` |
| 7   | DURABLE-02  | CHECKPOINTING.md decision artifact exists (Inngest sole durability, no LangGraph checkpointer); .compile() has no saver | ✓ VERIFIED | `CHECKPOINTING.md` states "Inngest is the sole durability layer" + "No LangGraph checkpointer" + "no saver / checkpointer argument"; `index.ts` plain `graph.compile()` (no `checkpointer`/`Saver` token)                  |
| 8   | QA-01       | never-reply-regression.test.ts exists and is GREEN (3 failure paths → exactly one reply; invoke never rejects) | ✓ VERIFIED | `tests/unit/whatsapp/never-reply-regression.test.ts` (210 lines, 3 tests Path A/B/C) all PASS; asserts `sendWhatsAppMessage` called exactly once per path + `invoke` resolves                                                |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact                                          | Expected                                                       | Status     | Details                                                            |
| ------------------------------------------------- | ------------------------------------------------------------- | ---------- | ----------------------------------------------------------------- |
| `lib/estimate/graph/state.ts`                     | Channel-neutral EstimateState Annotation.Root                 | ✓ VERIFIED | 40 lines; Annotation.Root; failure channel; no WhatsApp fields    |
| `lib/estimate/graph/types.ts`                     | ChannelAdapter + StepRunner + passthroughRunner               | ✓ VERIFIED | 64 lines; all three present                                       |
| `lib/estimate/graph/index.ts`                     | buildEstimateGraph(adapter, {runner}) factory, no checkpointer | ✓ VERIFIED | 63 lines; `.compile()` no saver                                   |
| `lib/estimate/graph/nodes/generate.ts`            | Core generate node (runner-wrapped, never-throw → failure)    | ✓ VERIFIED | 38 lines; try/catch → failure                                     |
| `lib/estimate/graph/nodes/assess.ts`              | Core assess node (isVagueEstimate → isVague)                  | ✓ VERIFIED | 28 lines; calls isVagueEstimate                                   |
| `lib/estimate/graph/nodes/decide.ts`              | Core conditional-edge fns                                     | ✓ VERIFIED | 26 lines; checkGeneratedEdge reads failure                       |
| `lib/estimate/quality/vagueness.ts`               | Channel-neutral isVagueEstimate (moved verbatim)             | ✓ VERIFIED | 30 lines; export function isVagueEstimate                         |
| `lib/estimate/adapters/whatsapp.ts`               | WhatsApp ChannelAdapter closure-factory ingest/finalize/onError | ✓ VERIFIED | 445 lines; makeWhatsAppAdapter; Send fan-out; two-copy onError   |
| `lib/estimate/adapters/default.ts`                | web/MCP adapter stub (passthrough)                            | ✓ VERIFIED | 51 lines; intentional Phase-95 stub, documented no-op contract    |
| `lib/whatsapp/estimate-graph.ts`                  | Thin wiring; preserves buildEstimateGraph() export            | ✓ VERIFIED | 86 lines; composes shared graph + adapter                        |
| `lib/whatsapp/ask-details.ts`                     | Re-export of isVagueEstimate (old import still works)         | ✓ VERIFIED | 70 lines; re-exports from vagueness.ts                            |
| `lib/inngest/functions/whatsapp-process.ts`       | Inngest job invoking shared graph via orchestrate-estimate     | ✓ VERIFIED | 141 lines; step.run('orchestrate-estimate') + onFailure fallback |
| `lib/estimate/graph/CHECKPOINTING.md`             | DURABLE-02 decision artifact                                  | ✓ VERIFIED | 44 lines; Inngest-sole / no-checkpointer rationale               |
| `tests/unit/whatsapp/never-reply-regression.test.ts` | QA-01 frozen behavioral regression                        | ✓ VERIFIED | 210 lines; 3 paths GREEN                                          |
| `tests/unit/inngest/whatsapp-process-job.test.ts` | Anchor source-text test repointed to new homes               | ✓ VERIFIED | 120 lines; readFileSync PATHS repointed; GREEN                    |
| 6 × `tests/unit/estimate/*.test.ts`               | Wave-0 stubs now GREEN                                        | ✓ VERIFIED | graph-neutrality/channel-adapter/vagueness/never-throw/step-runner/no-checkpointer all PASS |

### Key Link Verification

| From                              | To                                       | Via                                      | Status  | Details                                                          |
| --------------------------------- | ---------------------------------------- | ---------------------------------------- | ------- | --------------------------------------------------------------- |
| `lib/whatsapp/ask-details.ts`     | `lib/estimate/quality/vagueness.ts`      | re-export                                | ✓ WIRED | `export { isVagueEstimate, type VagueCheckEstimate } from '@/lib/estimate/quality/vagueness'` |
| `lib/estimate/graph/nodes/generate.ts` | `lib/services/generate-estimate.ts` | runner.run('ai-generate', generateEstimateForProject) | ✓ WIRED | line 27-29                                                      |
| `lib/estimate/graph/index.ts`     | `lib/estimate/graph/types.ts`            | passthroughRunner injection              | ✓ WIRED | `{ runner = passthroughRunner }` → `makeGenerateNode(runner)`   |
| `lib/estimate/adapters/whatsapp.ts` | `lib/whatsapp/client.ts`               | sendWhatsAppMessage / downloadWhatsAppMedia | ✓ WIRED | imports + used in adapter only                                  |
| `lib/whatsapp/estimate-graph.ts`  | `lib/estimate/graph`                     | buildEstimateGraph(makeWhatsAppAdapter(...)) | ✓ WIRED | line 37-72                                                      |
| `lib/inngest/functions/whatsapp-process.ts` | `buildEstimateGraph`           | step.run('orchestrate-estimate') → graph.invoke | ✓ WIRED | line 80-95                                                      |
| `tests/unit/estimate/no-checkpointer.test.ts` | `lib/estimate/graph/CHECKPOINTING.md` | readFileSync + grep 'no LangGraph checkpointer' | ✓ WIRED | GREEN                                                           |
| `tests/unit/inngest/whatsapp-process-job.test.ts` | moved module homes               | readFileSync repointed paths             | ✓ WIRED | reads generate/assess/decide/index/adapter at new homes        |

### Data-Flow Trace (Level 4)

Not applicable in the UI-render sense — phase 94 is a backend/library extraction (no dynamic-data-rendering components). Data flow was instead verified behaviorally via QA-01 (real estimate-row mock drives the vague/confirm branch) and the full scope suite.

### Behavioral Spot-Checks

| Behavior                                                            | Command                                                                                          | Result                              | Status  |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------- | ------- |
| Full phase-94 scope suite is green (behavior-preserving gate)       | `npx vitest run tests/unit/estimate tests/unit/whatsapp tests/unit/inngest/whatsapp-process-job.test.ts` | 33 passed / 3 skipped; 237 passed / 28 todo; 0 fail | ✓ PASS  |
| QA-01 + 6 core estimate tests green                                 | `npx vitest run never-reply-regression + never-throw + no-checkpointer + graph-neutrality + channel-adapter + step-runner + vagueness` | 7 files / 23 tests passed           | ✓ PASS  |
| ENGINE-01 static neutrality grep is empty                           | `grep -rE "@/lib/whatsapp\|sendWhatsAppMessage\|ownerPhone\|WhatsAppMessage" lib/estimate/graph` | EMPTY                               | ✓ PASS  |

### Requirements Coverage

| Requirement | Source Plan(s) | Description                                                                 | Status      | Evidence                                          |
| ----------- | -------------- | -------------------------------------------------------------------------- | ----------- | ------------------------------------------------- |
| ENGINE-01   | 94-02          | Shared channel-neutral graph; no channel-specific state fields             | ✓ SATISFIED | Truth 1 — neutrality grep empty                   |
| ENGINE-02   | 94-03          | ChannelAdapter closure-factory; core graph untouched                      | ✓ SATISFIED | Truth 2 — makeWhatsAppAdapter + buildEstimateGraph(adapter) |
| ENGINE-03   | 94-02          | isVagueEstimate extracted + reused verbatim, no LLM                       | ✓ SATISFIED | Truth 3 — vagueness.ts + re-export                 |
| ENGINE-04   | 94-02          | Never-throw / failure-as-state invariant                                  | ✓ SATISFIED | Truth 4 — failure channel + 3 consistent readers   |
| CHAN-01     | 94-03, 94-04   | WhatsApp consumes shared graph; behavior preserved                        | ✓ SATISFIED | Truth 5 + anchor test repoint + full suite green   |
| DURABLE-01  | 94-02          | StepRunner abstraction defined + injected (contract/scaffold)             | ✓ SATISFIED | Truth 6 — passthroughRunner + runner.run          |
| DURABLE-02  | 94-01          | Checkpoint-granularity decision artifact captured                         | ✓ SATISFIED | Truth 7 — CHECKPOINTING.md + no-saver compile      |
| QA-01       | 94-01, 94-03   | Frozen never-throw / always-reply regression test                        | ✓ SATISFIED | Truth 8 — never-reply-regression.test.ts GREEN     |

**All 8 declared requirement IDs accounted for. No ORPHANED requirements** — REQUIREMENTS.md line 125 maps exactly ENGINE-01..04, CHAN-01, DURABLE-01, DURABLE-02, QA-01 to Phase 94, and every one appears in a plan's `requirements:` frontmatter (P01: DURABLE-02/QA-01; P02: ENGINE-01/03/04, DURABLE-01; P03: ENGINE-02, CHAN-01, QA-01; P04: CHAN-01). All marked Complete in REQUIREMENTS.md.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (none in phase-94 source) | — | TODO/FIXME/PLACEHOLDER scan returned zero hits | — | — |

`lib/estimate/adapters/default.ts` returns `{}` from ingest/finalize/onError — this is NOT a stub anti-pattern: it is the deliberately-documented Phase-95 passthrough/no-op web-MCP contract (Phase 94 ships only the seam; Phase 95 wires the real web/MCP behavior). Out of scope for phase 94 truths.

### Human Verification Required

None. This is a behavior-preserving backend extraction fully covered by the frozen QA-01 regression and the phase-94 scope suite (all green). No visual/real-time/external-service behavior introduced.

### Gaps Summary

No gaps. All 8 must-haves verified at all applicable levels (exists, substantive, wired, behavior). The shared `lib/estimate/graph/` core is channel-neutral (zero WhatsApp imports in TS), driven by a `ChannelAdapter` closure-factory; `isVagueEstimate` is extracted and back-compat re-exported; the never-throw/failure-as-state invariant is intact with three consistent readers; WhatsApp runs entirely on the shared graph via the stable zero-arg `buildEstimateGraph()` called inside the `orchestrate-estimate` Inngest step; the StepRunner seam is defined, defaulted to `passthroughRunner`, and used in the generate node; the DURABLE-02 decision artifact is present and enforced by a static no-saver test; and the QA-01 frozen regression is green.

**Out-of-scope note (confirmed):** The working tree contains ~60 uncommitted skeleton-redesign files unrelated to phase 94. The ~10 full-suite failures (onboarding-survey, landing-actions, theme-toggle) originate from that uncommitted skeleton work, NOT phase 94. The phase-94 scope (`tests/unit/estimate` + `tests/unit/whatsapp` + `tests/unit/inngest/whatsapp-process-job.test.ts`) is 100% green. Phase-94 source files are already committed (not present in `git status`), confirming the boundary.

---

_Verified: 2026-06-20T13:36:00Z_
_Verifier: Claude (gsd-verifier)_

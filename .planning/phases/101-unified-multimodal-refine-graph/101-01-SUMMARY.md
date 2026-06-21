---
phase: 101-unified-multimodal-refine-graph
plan: 01
subsystem: api
tags: [multimodal, ingestion, whatsapp, transcription, vision, openrouter, langgraph, refactor]

# Dependency graph
requires:
  - phase: 99
    provides: "transcribeAudioOR / analyzePhotoOR fallback-wrapped (OpenRouter->Gemini) primitives via callWithFallback"
  - phase: 101-00
    provides: "Wave-0 RED scaffold tests/unit/estimate/multimodal-ingest.test.ts (UNIFY-01 contract)"
provides:
  - "lib/estimate/ingest/multimodal.ts — single channel-neutral raw-media -> text ingestion (ingestMultimodal)"
  - "WhatsApp processMessage transcription/vision now routed through the shared ingestion primitive"
affects: [101-02, 101-03, refine-route, refine-node, prompt-builder]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared channel-neutral ingestion module over fallback-wrapped primitives (one place owns raw-media -> text)"
    - "Per-item skip-not-throw aggregation (single failed media item caught + skipped, aggregate still resolves)"

key-files:
  created:
    - lib/estimate/ingest/multimodal.ts
  modified:
    - lib/estimate/adapters/whatsapp.ts

key-decisions:
  - "Kept the WhatsApp empty-transcript guard (transcripts[0] ?? '') so a single ingestMultimodal skip preserves today's ok:false / empty_transcript mediaResults outcome"
  - "Removed transcribeAudioOR/analyzePhotoOR from whatsapp.ts imports (only referenced at the two swapped call sites) to keep tsc/lint clean"

patterns-established:
  - "ingestMultimodal({ audio, photos, texts }) -> { transcripts, photoDescriptions, texts }: the UNIFY-01 single ingestion seam reused by WhatsApp now, refine in 101-03"
  - "Mechanical call-site swap that preserves batch atomicity (Send[]/mediaResults reducer untouched — Phase 102 boundary)"

requirements-completed: [UNIFY-01]

# Metrics
duration: 7min
completed: 2026-06-21
---

# Phase 101 Plan 01: Shared Multimodal Ingestion + WhatsApp Routing (UNIFY-01) Summary

**One channel-neutral `ingestMultimodal` turns audio Blobs + base64 photos + text into `{ transcripts, photoDescriptions, texts }` over the Phase-99 fallback-wrapped primitives, with single-item skip-not-throw; WhatsApp `processMessage` now flows transcription/vision through it with byte-stable batch behavior.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-06-21T18:28:33Z
- **Completed:** 2026-06-21T18:35:14Z
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments
- Created `lib/estimate/ingest/multimodal.ts` — the UNIFY-01 single implementation of "raw media -> text" over `transcribeAudioOR` / `analyzePhotoOR` (no second fallback layer, no `lib/whatsapp/*` import). `tests/unit/estimate/multimodal-ingest.test.ts` GREEN (4/4): aggregation, texts trimmed/filtered, single transcription failure skipped, single vision failure skipped, empty `{}` -> empty arrays.
- Routed the WhatsApp adapter `processMessageNode` audio + photo branches through `ingestMultimodal` — a mechanical 2-call-site swap. The Send[] fan-out, `mediaResults` reducer, storage uploads, `recordings`/`photos` inserts, and every `ok:false` return are unchanged (batch atomicity preserved — Phase 102 boundary).
- Invariant suites stay GREEN (in isolation): `never-reply-regression` (QA-01), `channel-adapter` (ENGINE-02), `graph-neutrality` (ENGINE-01). Both modified files are `tsc --noEmit` clean.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create lib/estimate/ingest/multimodal.ts (UNIFY-01)** - `c0017de` (feat) — TDD GREEN against the 101-00 RED scaffold
2. **Task 2: Route WhatsApp processMessage through ingestMultimodal** - `b2eb35b` (refactor)

**Plan metadata:** (this docs commit)

## Files Created/Modified
- `lib/estimate/ingest/multimodal.ts` (created) - `ingestMultimodal(input)` + `MultimodalRawInput` / `MultimodalIngestResult` types; channel-neutral, never-throw-per-item ingestion over the fallback-wrapped primitives.
- `lib/estimate/adapters/whatsapp.ts` (modified) - import swap (`transcribeAudioOR`/`analyzePhotoOR` -> `ingestMultimodal`) + the two AI-primitive call sites in `processMessageNode` (audio ~line 196, photo ~line 243). Diff = 21 insertions / 9 deletions, only the import + two call sites.

## Decisions Made
- Preserved the WhatsApp `if (!transcript)` empty-transcript guard by mapping `transcripts[0] ?? ''`: `ingestMultimodal` swallows a single failed item and returns `transcripts: []`, so the existing `empty_transcript` `ok:false` outcome is unchanged.
- Dropped `transcribeAudioOR`/`analyzePhotoOR` from the whatsapp.ts import (they were referenced only at the two swapped call sites) to keep the file tsc/lint clean.

## Deviations from Plan

None - plan executed exactly as written. The two tasks, signatures, and call-site swaps match the plan + RESEARCH Pattern 2 verbatim.

## Issues Encountered

**Pre-existing full-sweep test-isolation leakage (NOT caused by this plan; logged to `deferred-items.md`).**
When `tests/unit/estimate` + `tests/unit/whatsapp` run together, four suites that PASS in isolation fail (`channel-adapter`, `step-runner`, `confirm`, `never-reply-regression`). Stashing this plan's `whatsapp.ts` edit and re-running the same sweep reproduces the SAME failures on the clean baseline (14 failures), proving it is pre-existing. Root cause: the 101-00 Wave-0 RED scaffolds (`refine-node.test.ts`, `generate-refine-equivalence.test.ts`) `vi.mock`/spy shared modules and leak mock state across files in the worker. The four suspect suites pass 18/18 when run together in isolation, before and after this plan. Owned by 101-02 / 101-03 (which implement those RED contracts and can add `vi.resetModules()` isolation if leakage persists).

## Remaining RED (expected — owned by later waves)
- `tests/unit/estimate/refine-node.test.ts` (UNIFY-03 makeRefineNode) — 101-02.
- `tests/unit/estimate/generate-refine-equivalence.test.ts` (criterion 5 + bespoke-prompt deletion) — 101-02.
- `tests/unit/estimate/no-checkpointer.test.ts` `buildRefineGraph` cases — 101-02/101-03.
- `tests/unit/ai/refine-shared-prompt.test.ts`, extended `prompt-builder.test.ts` (HARD-02/UNIFY-02) — 101-02.
- `tests/unit/api/refine-route-contract.test.ts` (HARD-01) — 101-03.

## Pre-existing unrelated failures (out of scope)
- `tsc --noEmit` errors in `observability.test.ts`, `generate-estimate-job.test.ts`, `account-emails.test.ts`, and `xphere-client.test.ts` predate this plan and touch neither modified file. **xphere files untouched** per execution constraints.

## User Setup Required
None - no external service configuration required (pure TypeScript source edits, no new deps).

## Next Phase Readiness
- UNIFY-01 ingestion seam is live and GREEN — 101-03's refine route can consume `ingestMultimodal` for its audio/photo/text assembly instead of the inline `transcribeRefineAudio` + per-photo loop.
- WhatsApp transcription/vision now share the one implementation; batch atomicity untouched, leaving HARD-05 (Phase 102) clean.

## Self-Check: PASSED
- FOUND: lib/estimate/ingest/multimodal.ts
- FOUND: lib/estimate/adapters/whatsapp.ts
- FOUND: .planning/phases/101-unified-multimodal-refine-graph/101-01-SUMMARY.md
- FOUND: commit c0017de (Task 1)
- FOUND: commit b2eb35b (Task 2)

---
*Phase: 101-unified-multimodal-refine-graph*
*Completed: 2026-06-21*

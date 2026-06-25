---
phase: 122-channel-neutral-domain-extraction
plan: 02
subsystem: agent-tools
tags: [channel-neutral, agent-tools, langchain, multimodal, multi-tenant, neutrality-gate]

# Dependency graph
requires:
  - phase: 122-channel-neutral-domain-extraction
    provides: "122-01 RED scaffolds (query-company-data + normalize-input + neutrality gate) this plan turns GREEN"
  - phase: 99-pipeline-hardening
    provides: "lib/estimate/ingest/multimodal ingestMultimodal — the neutral primitive normalizeInput wraps"
provides:
  - "lib/agent-tools/query-company-data.ts — 6 channel-neutral company data-read functions (companyId positional, T-lrf-01 tenant isolation, parity output strings)"
  - "lib/agent-tools/normalize-input.ts — channel-neutral normalizeInput wrapping ingestMultimodal (audio/photo/text, never throws)"
  - "lib/agent-tools/index.ts — barrel for the neutral capability functions"
  - "WhatsApp makeQueryTools + normalizeMessage re-pointed as thin channel adapters over the neutral home"
affects: [122-03, 124-chat-backend, agent-tools, mcp-parity]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Data-read extraction at the plain-function layer (not the LangChain tool object) so a second channel can bind the SAME reads without importing LangChain"
    - "Thin channel adapter: WhatsApp keeps download + mime/ext derivation + message type-switch, delegates the transcribe/analyze to the neutral primitive"
    - "Neutrality gate is grep-literal — even header-comment strings like 'lib/whatsapp' / 'tool(' trip it; comments must paraphrase forbidden tokens"

key-files:
  created:
    - lib/agent-tools/query-company-data.ts
    - lib/agent-tools/normalize-input.ts
    - lib/agent-tools/index.ts
  modified:
    - lib/whatsapp/query-tools.ts
    - lib/whatsapp/normalize.ts

key-decisions:
  - "Move + re-point (NOT a re-export shim): tool bodies lifted verbatim into neutral plain functions; the LangChain tool() wrapper + zod schemas stay in the WhatsApp adapter."
  - "normalize.ts re-exports NormalizeKind/NormalizeResult from the neutral module so intent-router's type imports need zero churn (Task 3 = pure parity gate, no edit)."
  - "Photo description coerced `photoDescriptions[0] ?? ''` to keep byte-parity with the old analyzePhotoOR-returns-string path (empty-analysis branch behaves identically)."

requirements-completed: [NEUT-02, NEUT-03, NEUT-05]

# Metrics
duration: 6min
completed: 2026-06-25
---

# Phase 122 Plan 02: Channel-Neutral Extraction — QUERY data-reads + NORMALIZE Summary

**Extracted the QUERY data-read layer (6 company reads) and the NORMALIZE core (audio/photo/text → text) into the channel-neutral `lib/agent-tools/` home, then re-pointed the WhatsApp `makeQueryTools` and `normalizeMessage` to bind/delegate to them — non-destructively, with the entire existing WhatsApp parity suite staying GREEN and assertions UNCHANGED.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-06-25T01:40:44Z
- **Completed:** 2026-06-25T01:47:00Z
- **Tasks:** 3
- **Files modified:** 3 created, 2 modified

## Accomplishments
- **NEUT-02:** `lib/agent-tools/query-company-data.ts` ships 6 plain `(companyId, supabase, [name]) => Promise<string>` reads (findClientByName / getLatestEstimateForClient / getProjectStatus / listRecentEstimates / listServices / findServiceByName) with bodies lifted verbatim from the tool callbacks. `companyId` is the FIRST positional param (T-lrf-01: never an LLM field); every tenant-table query still chains `.eq('company_id', companyId)`. The neutral module imports ZERO of `@langchain` / `lib/whatsapp` / `WhatsAppMessage` / zod.
- **WhatsApp makeQueryTools re-pointed:** still returns the SAME 6 LangChain `tool()` objects (identical names/descriptions/zod schemas, no `company_id` schema field), each callback now delegating to the neutral read. The LangChain binding stays in the channel.
- **NEUT-03:** `lib/agent-tools/normalize-input.ts` wraps `ingestMultimodal` for audio (→ transcript), photo (→ analysis + optional caption), and text (passthrough), returning the same `{ text, kind, ok, reason? }` shape and NEVER throwing. WhatsApp `normalizeMessage` is now a thin adapter doing only the download + the `mp4 → m4a` remap + `split(';')` codec strip + message type-switch, delegating transcribe/analyze to `normalizeInput`.
- **NEUT-05 parity proven (for QUERY + NORMALIZE):** the full WhatsApp suite is green with every `expect(...)` unchanged (the m4a remap, codec strip, caption inclusion, and both ok:false-no-throw cases all still hold). intent-router needed ZERO edits — its `normalizeMessage` / `makeQueryTools` imports resolve and the ReAct prompt / `createReactAgent` / `splitReply` / `sendOwnerReplyChunks` stayed in the channel.
- **Neutrality gate GREEN:** `lib/agent-tools/` now has source files and the static source-grep gate passes (zero forbidden channel tokens).

## Task Commits

Each task committed atomically (normal hooked, IN-PLACE, no `--no-verify`; gitleaks ran clean each time):

1. **Task 1: NEUT-02 extract query-company-data + re-point makeQueryTools** — `8bdbef6` (feat)
2. **Task 2: NEUT-03 extract normalizeInput + thin normalizeMessage adapter** — `c110d5b` (feat)
3. **Task 3: intent-router parity gate** — NO COMMIT (no source change required; intent-router compiles and resolves unchanged — Task 3 is the parity gate, which passed). Recorded here per the plan's note.

## Files Created/Modified
- `lib/agent-tools/query-company-data.ts` (created) — 6 neutral company data-reads; T-lrf-01 header; imports `formatMoney` from `@/lib/money/currency` + `SupabaseClient`; no LangChain/zod/channel imports.
- `lib/agent-tools/normalize-input.ts` (created) — neutral `normalizeInput` wrapping `ingestMultimodal`; exports `NormalizeKind`/`NormalizeResult`/`NormalizeInput`; never throws.
- `lib/agent-tools/index.ts` (created) — barrel re-exporting both neutral modules.
- `lib/whatsapp/query-tools.ts` (modified) — `makeQueryTools` now binds the neutral reads as LangChain tools; same names/descriptions/schemas; no `company_id` schema field.
- `lib/whatsapp/normalize.ts` (modified) — thin adapter: download + mime/ext derivation + type-switch, delegates to `normalizeInput`; re-exports the normalize types.

## Decisions Made
- Move + re-point (not a re-export shim) so Phase 124's AI-SDK chat can bind the SAME data-reads without LangChain — the highest-leverage call in the phase (Research Pitfall 4).
- Re-exported `NormalizeKind`/`NormalizeResult` from `normalize.ts` to keep intent-router's type imports stable, making Task 3 a zero-edit parity gate (Task 3 owns intent-router this wave — confirmed no change needed).
- Coerced `photoDescriptions[0] ?? ''` in the photo branch to keep byte-parity with the old `analyzePhotoOR` string return (caption-only / empty-analysis behavior identical).

## Deviations from Plan

None — plan executed exactly as written.

Two minor in-task corrections (not deviations, both required to keep the neutrality gate green and were anticipated by the plan's grep-based acceptance criteria):
- **[Rule 3 - Blocking]** The neutrality gate is a literal source-grep, so my header comments containing the strings `lib/whatsapp` and `tool(` tripped it. Reworded the comments to paraphrase those tokens (no behavior change). Verified gate green.

## Issues Encountered
None functional. Git emitted the expected LF→CRLF warnings on Windows (cosmetic). The two `tests/unit/agent-tools/` failures (`create-estimate`, `ask-knowledge`) are the documented RED-by-missing-module scaffolds owned by Plan 122-03 — out of scope for this plan and expected to be red until then.

## Known Stubs
None. All extracted functions are fully wired (real data-reads + real ingest primitive); no placeholder/empty-return paths introduced.

## User Setup Required
None — no migration, no new dependency, no secret, no external configuration.

## Verification Results
- `npx vitest run tests/unit/whatsapp tests/unit/agent-tools` — WhatsApp suite fully GREEN with assertions unchanged; agent-tools query + normalize + neutrality GREEN. (Only create-estimate + ask-knowledge RED-by-missing-module — owned by 122-03.)
- `npx vitest run` (full suite) — 317 files passed / 3 skipped; only the 2 expected 122-03-owned RED scaffolds fail. 2229 tests passed.
- Neutrality grep: `query-company-data.ts` and `normalize-input.ts` contain none of `lib/whatsapp` / `WhatsAppMessage` / `downloadWhatsAppMedia` / `@langchain` / `tool(` / `z.object` (verified → 0 each).
- `npx tsc --noEmit` clean on all touched/created files.

## Next Phase Readiness
- 122-03 implements the remaining neutral modules (`create-estimate`, `ask-knowledge`) against the 122-01 RED contracts and re-points the WhatsApp create/knowledge dispatch; the neutrality gate and the WhatsApp parity suite remain the regression guards.
- The neutral data-reads + `normalizeInput` are now ready for Phase 124's AI-SDK chat to bind without importing LangChain.

## Self-Check: PASSED

- `lib/agent-tools/query-company-data.ts`, `lib/agent-tools/normalize-input.ts`, `lib/agent-tools/index.ts` exist (verified).
- `lib/whatsapp/query-tools.ts` + `lib/whatsapp/normalize.ts` re-pointed (verified via grep: neutral imports present).
- Both task commits exist in git history: `8bdbef6`, `c110d5b` (verified below).

---
*Phase: 122-channel-neutral-domain-extraction*
*Completed: 2026-06-25*

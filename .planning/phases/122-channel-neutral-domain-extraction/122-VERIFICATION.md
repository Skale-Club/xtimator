---
phase: 122-channel-neutral-domain-extraction
verified: 2026-06-24T22:05:00Z
status: passed
score: 5/5 must-haves verified
---

# Phase 122: Channel-Neutral Domain Extraction Verification Report

**Phase Goal:** Extract the capabilities inside `lib/whatsapp/` into channel-NEUTRAL domain tools (createEstimate, queryCompanyData, normalizeInput, askKnowledge) in `lib/agent-tools/` that BOTH WhatsApp AND the future web chat call; the extraction is NON-DESTRUCTIVE — WhatsApp behaves identically (parity), no regression.
**Verified:** 2026-06-24T22:05:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 (NEUT-01) | Neutral `createEstimate` dispatches EVENT_ESTIMATE_GENERATE; companyId a trusted param; WhatsApp media-ingest CREATE path NOT routed through it | ✓ VERIFIED | `lib/agent-tools/create-estimate.ts:29-53` — `inngest.send({ name: EVENT_ESTIMATE_GENERATE, ... data.companyId: args.companyId })`, returns `{ jobId: ids[0] }`, throws on empty ids. WhatsApp CREATE still uses `processInboundMessages` + `generateEstimateForProject` (intent-router.ts:413, confirm-actions.ts:339) — zero `createEstimate` import/reference in `lib/whatsapp/`. |
| 2 (NEUT-02) | Neutral data-reads (companyId, supabase) with ZERO @langchain; makeQueryTools binds them | ✓ VERIFIED | `lib/agent-tools/query-company-data.ts` — 6 plain `(companyId, supabase, [name])` reads, every tenant query `.eq('company_id', companyId)`. No `@langchain`/`zod`/`tool(` import. `lib/whatsapp/query-tools.ts:29-36` imports the 6 neutral reads, wraps each in `tool()` keeping LangChain in the channel. |
| 3 (NEUT-03) | Neutral `normalizeInput` wraps ingestMultimodal; `normalize.ts` a thin adapter | ✓ VERIFIED | `lib/agent-tools/normalize-input.ts:17,42,58` wraps `ingestMultimodal`, never throws. `lib/whatsapp/normalize.ts:27` imports `normalizeInput`; keeps download + `mp4→m4a` remap + `split(';')` codec strip + WhatsAppMessage type-switch. |
| 4 (NEUT-04) | Neutral `askKnowledge` wraps `lib/knowledge/answer` (never-throws); dispatchKnowledge re-pointed | ✓ VERIFIED | `lib/agent-tools/ask-knowledge.ts:18,22-32` delegates to `answer()` with own try/catch FALLBACK. `lib/whatsapp/intent-router.ts:44` imports `askKnowledge`; `dispatchKnowledge` (line 320) calls it. |
| 5 (NEUT-05) | `lib/agent-tools/` imports NO channel; neutrality test exists; WhatsApp parity suite green with behavioral assertions UNCHANGED | ✓ VERIFIED | Grep over `lib/agent-tools/` for all 6 forbidden tokens + `@langchain` + `@/lib/mcp` → 0 matches. `tests/unit/agent-tools/neutrality.test.ts` is a real recursive source-grep gate (6 FORBIDDEN tokens, 2 assertions). Behavioral parity tests A-D in `intent-router-knowledge.test.ts` byte-unchanged; only Test E's static import-path grep re-pointed. Full suite green. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `lib/agent-tools/create-estimate.ts` | NEUT-01 neutral dispatch | ✓ VERIFIED | 53 lines, real inngest.send dispatch, no channel/MCP/LangChain imports |
| `lib/agent-tools/ask-knowledge.ts` | NEUT-04 wrapper over answer | ✓ VERIFIED | Delegates to `answer()`, own never-throw guard |
| `lib/agent-tools/normalize-input.ts` | NEUT-03 wraps ingestMultimodal | ✓ VERIFIED | 70 lines, text/audio/photo branches, never throws |
| `lib/agent-tools/query-company-data.ts` | NEUT-02 6 data-reads | ✓ VERIFIED | 227 lines, 6 exported reads, tenant `.eq('company_id', companyId)` on every query |
| `lib/agent-tools/index.ts` | Barrel, all 4 capabilities | ✓ VERIFIED | Re-exports query reads, normalizeInput, createEstimate, askKnowledge |
| `lib/whatsapp/query-tools.ts` | Re-pointed LangChain binding | ✓ VERIFIED | Imports neutral reads; 6 `tool()` objects; no `company_id` schema field |
| `lib/whatsapp/normalize.ts` | Thin adapter | ✓ VERIFIED | Imports normalizeInput; keeps WhatsApp-specific download + mime/ext derivation |
| `lib/whatsapp/intent-router.ts` | dispatchKnowledge re-pointed | ✓ VERIFIED | Imports + calls askKnowledge; reply-splitting stays in channel |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| create-estimate.ts | inngest events | `inngest.send` EVENT_ESTIMATE_GENERATE | ✓ WIRED | EVENT_ESTIMATE_GENERATE + EstimateGeneratePayload exist in `lib/inngest/events.ts:10,28` |
| ask-knowledge.ts | knowledge/answer | `from '@/lib/knowledge/answer'` | ✓ WIRED | `answer()` exists `lib/knowledge/answer.ts:25` |
| query-tools.ts | query-company-data | imports 6 reads, wraps in tool() | ✓ WIRED | Import present query-tools.ts:29-36, all 6 bound |
| normalize.ts | normalize-input | adapter calls normalizeInput | ✓ WIRED | Import present normalize.ts:27 |
| normalize-input.ts | ingest/multimodal | wraps ingestMultimodal | ✓ WIRED | Import + 2 call sites |
| intent-router.ts | ask-knowledge | dispatchKnowledge calls askKnowledge | ✓ WIRED | intent-router.ts:44,320 |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Neutral home imports no channel token | grep 6 forbidden + @langchain + @/lib/mcp over lib/agent-tools/ | 0 matches | ✓ PASS |
| agent-tools + whatsapp + knowledge suites green | `npx vitest run tests/unit/agent-tools tests/unit/whatsapp tests/unit/knowledge` | 42 files passed / 3 skipped, 279 passed / 28 todo, 0 fail | ✓ PASS |
| WhatsApp CREATE not routed through neutral createEstimate | grep `createEstimate` in lib/whatsapp/intent-router.ts | 0 matches | ✓ PASS |
| Behavioral parity tests A-D unchanged | read intent-router-knowledge.test.ts | Tests A-D intact; only Test E static grep re-pointed | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| NEUT-01 | 122-01, 122-03 | channel-neutral createEstimate both channels call, no duplicated generation logic | ✓ SATISFIED | create-estimate.ts dispatches shared EVENT_ESTIMATE_GENERATE; every channel ends at generateEstimateForProject |
| NEUT-02 | 122-01, 122-02 | company-data query as neutral tool both channels call | ✓ SATISFIED | query-company-data.ts (6 neutral reads) bound by WhatsApp makeQueryTools |
| NEUT-03 | 122-01, 122-02 | multimodal ingestion extracted to neutral module | ✓ SATISFIED | normalize-input.ts wraps ingestMultimodal; WhatsApp normalize.ts a thin adapter |
| NEUT-04 | 122-01, 122-03 | neutral askKnowledge wraps lib/knowledge/answer | ✓ SATISFIED | ask-knowledge.ts delegates to answer; dispatchKnowledge re-pointed |
| NEUT-05 | 122-01, 122-02, 122-03 | extraction NON-DESTRUCTIVE, WhatsApp identical, behavioral-parity tests, no regression | ✓ SATISFIED | Neutrality gate green; full WhatsApp parity suite green with behavioral assertions A-D unchanged |

No orphaned requirements — REQUIREMENTS.md maps exactly NEUT-01..05 to Phase 122, all claimed in plan frontmatter.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (none) | - | - | - | No blocker/warning anti-patterns. `return { text: '', ... ok: false }` paths in normalize-input.ts are the documented never-throw failure contract, not stubs (each follows a real ingestMultimodal call). No TODO/FIXME/placeholder. No migration. No secrets (gitleaks clean per summaries; no secret-pattern literals introduced). |

### Human Verification Required

None. All must-haves are programmatically verifiable (static imports, signatures, dispatch payloads, tenant filters) and confirmed by the green parity + neutrality test suites.

### Gaps Summary

No gaps. Phase 122 achieved its goal:

- All four neutral capabilities exist in `lib/agent-tools/`, are substantive (real dispatch / real reads / real ingest wrap / real answer delegation), wired (imported and used by the WhatsApp adapters), and data-flowing (bound to real Inngest events, Supabase tenant-scoped queries, the ingestMultimodal primitive, and the RAG answer composer).
- The neutral home imports zero channel tokens — the load-bearing NEUT-05 gate (`tests/unit/agent-tools/neutrality.test.ts`) is a real recursive source-grep with all 6 forbidden tokens and is green.
- The extraction is non-destructive: the 4 behavioral WhatsApp KNOWLEDGE parity tests (A-D) are byte-unchanged; only one static import-path grep (Test E) was correctly re-pointed for the NEUT-04 import move. The full `tests/unit/agent-tools tests/unit/whatsapp tests/unit/knowledge` run is green (42 files, 279 tests, 0 failures).
- WhatsApp's media-ingest CREATE path (`processInboundMessages`) was correctly left WhatsApp-specific and NOT forced through the neutral createEstimate — matching the NEUT-01 design intent.
- No migration, no new dependency, no secret.

---

_Verified: 2026-06-24T22:05:00Z_
_Verifier: Claude (gsd-verifier)_

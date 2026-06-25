---
phase: 122-channel-neutral-domain-extraction
plan: 01
subsystem: testing
tags: [tdd, vitest, channel-neutral, agent-tools, neutrality-gate, multi-tenant]

# Dependency graph
requires:
  - phase: 121-whatsapp-knowledge-intent
    provides: lib/knowledge/answer (the answer() askKnowledge wraps)
  - phase: 95-migrate-web-mcp-shared-graph
    provides: EVENT_ESTIMATE_GENERATE dispatch contract (write.ts createEstimate mirror)
  - phase: 99-pipeline-hardening
    provides: lib/estimate/ingest/multimodal ingestMultimodal (normalizeInput wraps)
provides:
  - "Wave-0 RED test scaffolds locking the contract for the 4 neutral capability functions (createEstimate, queryCompanyData, normalizeInput, askKnowledge)"
  - "Permanent ENGINE-01/NEUT-05 neutrality gate over lib/agent-tools/ (RED-by-missing-dir, flips GREEN when 122-02/03 add the first source file)"
  - "T-lrf-01 tenant-isolation contract restated for plain (non-LangChain) functions: companyId is a positional param, never an LLM field"
affects: [122-02, 122-03, agent-tools, chat-backend, mcp-parity]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TDD RED-by-missing-module: import the not-yet-existent neutral module so the failure is Cannot-find-module, not a syntax/assertion error"
    - "Static source-grep neutrality gate ported per-module (collectTsFiles + FORBIDDEN tokens) — RED-by-missing-dir until first source file ships"

key-files:
  created:
    - tests/unit/agent-tools/neutrality.test.ts
    - tests/unit/agent-tools/create-estimate.test.ts
    - tests/unit/agent-tools/query-company-data.test.ts
    - tests/unit/agent-tools/normalize-input.test.ts
    - tests/unit/agent-tools/ask-knowledge.test.ts
  modified: []

key-decisions:
  - "Neutrality gate copied VERBATIM from knowledge-neutrality.test.ts, changing only the scanned dir constant (lib/knowledge -> lib/agent-tools) and the describe label — same 6 forbidden tokens, same collectTsFiles walker, same two it() cases."
  - "normalize-input mocks @/lib/ai/openrouter-client (not @/lib/estimate/ingest/multimodal) so the REAL ingestMultimodal wiring is exercised; the codec/ext derivation moved to the WhatsApp adapter (122-02), so the neutral test passes ext already-derived and asserts the wrap, not the derivation."
  - "T-lrf-01 reframed for plain functions: the WhatsApp 'no zod company_id field' assertion becomes 'companyId is the FIRST positional param' + every tenant query still records .eq('company_id','company-SECRET')."

patterns-established:
  - "Per-module neutrality gate: each neutral lib home gets its own collectTsFiles source-grep test that is RED-by-missing-dir until its first source file exists."
  - "Nyquist RED-first: each neutral capability has a failing automated test authored before any implementation, encoding the exact contract (signatures, payload shape, tenant isolation, never-throws)."

requirements-completed: [NEUT-01, NEUT-02, NEUT-03, NEUT-04, NEUT-05]

# Metrics
duration: 4min
completed: 2026-06-25
---

# Phase 122 Plan 01: Channel-Neutral Extraction — Wave-0 RED Scaffolds + Neutrality Gate Summary

**Five RED vitest files in `tests/unit/agent-tools/` that lock the contract for the channel-neutral extraction before any implementation exists: a static `lib/agent-tools/` neutrality gate (NEUT-05 forward guard) plus four capability-function RED tests (createEstimate, queryCompanyData, normalizeInput, askKnowledge), each failing for the RIGHT reason (missing dir / missing module).**

## Performance

- **Duration:** 4 min
- **Started:** 2026-06-25T01:33:23Z
- **Completed:** 2026-06-25T01:37:04Z
- **Tasks:** 3
- **Files modified:** 5 created

## Accomplishments
- Neutrality gate `tests/unit/agent-tools/neutrality.test.ts` is live — a verbatim port of `knowledge-neutrality.test.ts` repointed to `lib/agent-tools/`, retaining all 6 forbidden channel tokens. RED-by-missing-dir now; flips GREEN automatically when 122-02/03 add the first neutral source file.
- Four capability RED tests encode the EXACT downstream contract: NEUT-01 `createEstimate` (EVENT_ESTIMATE_GENERATE dispatch payload + trusted-companyId isolation + no-id guard), NEUT-02 `queryCompanyData` (T-lrf-01 tenant isolation via positional companyId + parity output strings), NEUT-03 `normalizeInput` (wraps ingestMultimodal: text/audio/photo/failure-no-throw), NEUT-04 `askKnowledge` (forwards question+ctx to answer() verbatim, never throws).
- Verified the regression guard: the existing WhatsApp parity suite is byte-for-byte unchanged (28 files passed / 3 skipped / 213 tests), confirming this plan ADDED only test files.

## Task Commits

Each task was committed atomically (normal hooked, IN-PLACE, no `--no-verify`; gitleaks ran clean each time):

1. **Task 1: Neutrality gate for lib/agent-tools/** - `32e19420` (test)
2. **Task 2: RED tests for NEUT-02 query-company-data + NEUT-03 normalize-input** - `154faa0a` (test)
3. **Task 3: RED tests for NEUT-01 create-estimate + NEUT-04 ask-knowledge** - `cbd07df9` (test)

## Files Created/Modified
- `tests/unit/agent-tools/neutrality.test.ts` - ENGINE-01/NEUT-05 static source-grep gate over `lib/agent-tools/` (6 forbidden tokens; RED on "has at least one source file to scan" until first source file ships).
- `tests/unit/agent-tools/create-estimate.test.ts` - NEUT-01 RED: `createEstimate` dispatches EVENT_ESTIMATE_GENERATE once with `{ companyId, projectId, requestId, prompts?, language? }`, returns `{ jobId }`, rejects on empty `ids`, asserts `data.companyId` is the trusted passed value (no `company_id` key).
- `tests/unit/agent-tools/query-company-data.test.ts` - NEUT-02 RED: ported chainable supabase mock; T-lrf-01 isolation (companyId positional, every tenant query `.eq('company_id','company-SECRET')`) + parity outputs (not-found strings, 1,234 + 2026-06-01 total/date, Drywall price formatting).
- `tests/unit/agent-tools/normalize-input.test.ts` - NEUT-03 RED: mocks `@/lib/ai/openrouter-client`; text passthrough (transcribe not called), audio→transcribe with supplied ext, photo→analyze + caption, empty-primitive→ok:false-no-throw.
- `tests/unit/agent-tools/ask-knowledge.test.ts` - NEUT-04 RED: mocks `@/lib/knowledge/answer`; forwards question + `{industries,companyId,language}` verbatim, rejecting answer does not propagate (resolves to string), scope never derived from question text.

## Decisions Made
- Neutrality gate copied verbatim from `knowledge-neutrality.test.ts`; only the scanned dir constant + describe label changed (per plan Task 1 instruction). Same 6 forbidden tokens, same `collectTsFiles` walker, same two `it()` cases.
- `normalize-input` mocks the OpenRouter primitives (not `ingestMultimodal`) so the real ingest wiring is exercised; ext passed already-derived (derivation lives in the WhatsApp adapter per 122-02).
- T-lrf-01 reframed for plain functions: "no zod company_id field" → "companyId is the FIRST positional param" + the `.eq('company_id', ...)` capture assertion retained.

## Deviations from Plan

None - plan executed exactly as written. The 5 RED files are RED for the precise reasons the plan specifies (neutrality gate: missing dir on "has at least one source file"; the four capability tests: `Failed to resolve import "@/lib/agent-tools/*"` — missing module, not syntax/assertion).

## Issues Encountered
None. Git emitted the expected LF→CRLF warning on Windows (cosmetic, no impact).

## Known Stubs
None. These are intentional RED test scaffolds — `lib/agent-tools/` source files are deliberately NOT created in this plan (the contract is RED-by-missing until 122-02/122-03 implement). This is the documented Wave-0 state, not an unintended stub.

## User Setup Required
None - no external service configuration required. No migration, no new dependency, no secret.

## Next Phase Readiness
- Nyquist satisfied: NEUT-01..04 each now have a failing automated test ready to flip GREEN in 122-02/122-03; NEUT-05's forward guard is in place and the existing WhatsApp parity suite is the regression guard.
- 122-02 / 122-03 implement the neutral `lib/agent-tools/*.ts` modules against these exact contracts; the neutrality gate flips GREEN automatically on the first source file.

## Self-Check: PASSED

- All 5 test files exist under `tests/unit/agent-tools/` (verified).
- SUMMARY.md exists (verified).
- All 3 task commits exist in git history: `32e19420`, `154faa0a`, `cbd07df9` (verified).

---
*Phase: 122-channel-neutral-domain-extraction*
*Completed: 2026-06-25*

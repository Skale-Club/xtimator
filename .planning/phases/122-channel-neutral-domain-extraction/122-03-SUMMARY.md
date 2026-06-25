---
phase: 122-channel-neutral-domain-extraction
plan: 03
subsystem: agent-tools
tags: [channel-neutral, agent-tools, inngest, knowledge, neutrality-gate, whatsapp-parity]

# Dependency graph
requires:
  - phase: 122-channel-neutral-domain-extraction
    provides: "122-01 RED scaffolds (create-estimate + ask-knowledge) this plan turns GREEN; 122-02 query-company-data + normalize-input + the neutrality gate + the agent-tools barrel"
  - phase: 89-mcp-write-tools
    provides: "lib/mcp/tools/write.ts handleCreateEstimate — the EVENT_ESTIMATE_GENERATE dispatch precedent createEstimate mirrors"
  - phase: 118-knowledge-module
    provides: "lib/knowledge/answer — the already-neutral never-throws RAG composer askKnowledge wraps"
provides:
  - "lib/agent-tools/create-estimate.ts — neutral createEstimate({companyId,projectId,prompts?,language?,channel?}) dispatching EVENT_ESTIMATE_GENERATE once, returning { jobId }; companyId is a trusted param (T-lrf-01)"
  - "lib/agent-tools/ask-knowledge.ts — neutral askKnowledge wrapper over lib/knowledge/answer; never-throws (own FALLBACK guard)"
  - "lib/agent-tools/index.ts — the single neutral capability barrel now exposing all FOUR capabilities (createEstimate, queryCompanyData reads, normalizeInput, askKnowledge)"
  - "WhatsApp dispatchKnowledge re-pointed to the neutral askKnowledge — behavior identical, neutral binding"
affects: [124-chat-backend, agent-tools, mcp-parity, whatsapp-knowledge]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Neutral generation dispatch is the PURE inngest.send — each channel keeps its own pre-flight (MCP does the auth+project-ownership lookup; WhatsApp its media-ingest path); the neutral fn is the shared tail web + MCP + chat all reach"
    - "A neutral capability wrapper adds its OWN never-throw guard (not just inheriting the inner fn's) so a binding channel can never crash on it even if the inner contract changes"
    - "Re-point = swap the import + the call site only; the channel's reply-splitting (splitReply + sendOwnerReplyChunks) and the trusted company-read stay in the channel"

key-files:
  created:
    - lib/agent-tools/create-estimate.ts
    - lib/agent-tools/ask-knowledge.ts
  modified:
    - lib/agent-tools/index.ts
    - lib/whatsapp/intent-router.ts
    - tests/unit/whatsapp/intent-router-knowledge.test.ts

key-decisions:
  - "createEstimate is the prompt/already-ingested EVENT_ESTIMATE_GENERATE path ONLY — WhatsApp's heavier media-ingest CREATE (processInboundMessages) stays WhatsApp-specific by design (Research Pitfall 3); NEUT-01 'no duplicated generation logic' already holds because every channel ends at generateEstimateForProject."
  - "askKnowledge carries its OWN try/catch FALLBACK (not merely the pass-through the plan sketched): the 122-01 RED test mocks answer() to REJECT and asserts askKnowledge still resolves to a string — the neutral capability must guarantee never-throw at its own boundary."
  - "Updated the ONE stale static-source assertion in intent-router-knowledge.test.ts (the import-path grep) to the neutral path — the 4 behavioral parity tests (A-D, the load-bearing NEUT-05 proof) stayed byte-unchanged and green."

requirements-completed: [NEUT-01, NEUT-04, NEUT-05]

# Metrics
duration: 5min
completed: 2026-06-25
---

# Phase 122 Plan 03: Channel-Neutral Extraction — CREATE dispatch + KNOWLEDGE Summary

**Added the two remaining neutral capabilities — `createEstimate` (the EVENT_ESTIMATE_GENERATE dispatch mirroring the MCP create_estimate precedent) and `askKnowledge` (a never-throwing wrapper over the already-neutral `lib/knowledge/answer`) — then re-pointed WhatsApp's `dispatchKnowledge` to the neutral wrapper, completing the four-capability neutral barrel Phase 124's chat will bind, with the full WhatsApp parity suite green and behavioral assertions unchanged.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-06-25T01:51:00Z
- **Completed:** 2026-06-25T01:56:49Z
- **Tasks:** 3 (2 with commits; Task 3 = zero-source parity gate)
- **Files:** 2 created, 3 modified

## Accomplishments
- **NEUT-01 createEstimate (Task 1, GREEN):** `lib/agent-tools/create-estimate.ts` dispatches `EVENT_ESTIMATE_GENERATE` exactly once with `{ companyId, projectId, requestId: randomUUID(), prompts?, language?, channel? }` and returns `{ jobId: ids[0] }` (throws `'createEstimate: inngest.send returned no event id'` on empty `ids` — same guard as write.ts). Dispatch body lifted from `handleCreateEstimate` but STRIPPED of the MCP auth/scope/project-ownership wrapper — it is the pure dispatch so each channel does its own pre-flight. `companyId` is a trusted closure param (T-lrf-01): `data.companyId === args.companyId`, no `company_id` key, no tenant from input text. Imports ZERO of `lib/whatsapp` / `@/lib/mcp` / `@langchain` (grep → 0). WhatsApp's media-ingest CREATE path left untouched.
- **NEUT-04 askKnowledge + re-point (Task 2, GREEN):** `lib/agent-tools/ask-knowledge.ts` forwards `(question, { industries, companyId, language })` to `answer()` verbatim and NEVER throws — it adds its OWN `try/catch` FALLBACK (the 122-01 RED test mocks `answer` to reject and asserts a string still resolves). `intent-router.ts` `dispatchKnowledge` now imports + calls `askKnowledge` instead of `answer` directly; the trusted company-read (`companies.industries, default_estimate_language`), `splitReply`, the fallback string, and `sendOwnerReplyChunks` are byte-unchanged (Research Pitfall 5 — only the capability call moved to neutral).
- **NEUT-05 full parity + neutrality gate (Task 3):** the `lib/agent-tools/` barrel now re-exports all FOUR neutral capabilities — `create-estimate`, `query-company-data` (6 reads), `normalize-input`, `ask-knowledge` — the single import surface Phase 124's chat binds. The full WhatsApp suite is green with the behavioral KNOWLEDGE assertions unchanged across all four capabilities (CREATE dispatch / QUERY / NORMALIZE / KNOWLEDGE). The neutrality gate confirms the now-4-source-file `lib/agent-tools/` imports none of the 6 forbidden channel tokens.

## Task Commits

Each task committed atomically (normal hooked, IN-PLACE, no `--no-verify`; gitleaks ran clean — placeholder ids only):

1. **Task 1: NEUT-01 neutral createEstimate** — `956a1c5` (feat)
2. **Task 2: NEUT-04 neutral askKnowledge + re-point dispatchKnowledge** — `12f833f3` (feat)
3. **Task 3: full parity + neutrality gate** — NO COMMIT (barrel was already complete after Tasks 1+2; Task 3 is the phase gate, which passed). Recorded here per the plan's note.

## Files Created/Modified
- `lib/agent-tools/create-estimate.ts` (created) — neutral `createEstimate`; T-lrf-01 header; imports `randomUUID` + `inngest` + `EVENT_ESTIMATE_GENERATE`/`EstimateGeneratePayload`; no channel/MCP/LangChain imports.
- `lib/agent-tools/ask-knowledge.ts` (created) — neutral `askKnowledge` over `@/lib/knowledge/answer`; own never-throw FALLBACK guard.
- `lib/agent-tools/index.ts` (modified) — barrel now re-exports `createEstimate` + `askKnowledge` (all four capabilities exposed).
- `lib/whatsapp/intent-router.ts` (modified) — `dispatchKnowledge` re-pointed: import + call swapped to `askKnowledge`; reply-splitting + company-read unchanged.
- `tests/unit/whatsapp/intent-router-knowledge.test.ts` (modified) — one stale static-source assertion (import-path grep) updated to the neutral path; behavioral tests A-D unchanged.

## Decisions Made
- **createEstimate is the prompt/already-ingested path only.** WhatsApp's media-ingest CREATE (`processInboundMessages`) stays WhatsApp-specific (Research Pitfall 3 / Open Question 1) — NEUT-01's "no duplicated generation logic" already holds because every channel converges on `generateEstimateForProject`. Did NOT route the media-ingest path through the neutral createEstimate.
- **askKnowledge owns its never-throw.** The RED contract mocks `answer` to reject; a bare pass-through would propagate. Added a try/catch FALLBACK so the neutral capability is crash-proof at its own boundary regardless of the inner fn.
- **The neutral dispatch carries no project-ownership lookup.** That belongs to each channel's pre-flight wrapper (MCP does it with its auth context). Keeping createEstimate the pure dispatch lets the chat call it after resolving its own project.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] askKnowledge needed its own never-throw guard to pass the RED contract**
- **Found during:** Task 2
- **Issue:** The plan sketched askKnowledge as a bare `return answer(question, ctx)` pass-through "inheriting answer's never-throw". But `tests/unit/agent-tools/ask-knowledge.test.ts` Test 2 MOCKS `answer` to reject and asserts askKnowledge still resolves to a string — a bare pass-through propagates the rejection (test failed `promise rejected "model outage" instead of resolving`).
- **Fix:** Wrapped the `answer()` call in a `try/catch` returning a FALLBACK string (mirrors answer's own internal guard). The neutral capability now guarantees never-throw at its OWN boundary.
- **Files modified:** lib/agent-tools/ask-knowledge.ts
- **Commit:** 12f833f3

**2. [Rule 1 - Bug] One stale static-source assertion in the WhatsApp knowledge parity test**
- **Found during:** Task 2
- **Issue:** `intent-router-knowledge.test.ts` Test E (a `readFileSync` source-grep) asserted intent-router imports `from '@/lib/knowledge/answer'`. The plan's own Task 2 action mandates re-pointing that import to `@/lib/agent-tools/ask-knowledge`, so this static assertion went stale and red — a direct conflict between the plan's ACTION (re-point) and the same plan's "assertions unchanged" acceptance, resolvable only on this one line.
- **Fix:** Updated ONLY that line's regex to the neutral import path (with a comment explaining the NEUT-04 re-point). The FOUR behavioral parity tests (A-D — the load-bearing NEUT-05 proof: routing, both CREATE-default regressions, and the trusted-scope check) stayed byte-unchanged and green. No behavioral assertion was touched.
- **Files modified:** tests/unit/whatsapp/intent-router-knowledge.test.ts
- **Commit:** 12f833f3

## Issues Encountered
None functional. Git emitted the expected LF→CRLF warnings on Windows (cosmetic). The known parallel-only `mcp-route-contract.test.ts` flake did NOT surface in the full run this time.

## Known Stubs
None. Both neutral functions are fully wired — `createEstimate` dispatches the real Inngest event; `askKnowledge` delegates to the real RAG composer. No placeholder/empty-return paths.

## User Setup Required
None — no migration, no new dependency, no secret, no external configuration.

## Verification Results
- `npx vitest run tests/unit/agent-tools/create-estimate.test.ts tests/unit/agent-tools/neutrality.test.ts` → 5/5 green (Task 1).
- `npx vitest run tests/unit/agent-tools/ask-knowledge.test.ts tests/unit/whatsapp/intent-router-knowledge.test.ts tests/unit/agent-tools/neutrality.test.ts` → 10/10 green (Task 2).
- **Phase gate** `npx vitest run tests/unit/whatsapp tests/unit/agent-tools tests/unit/knowledge` → **42 files passed | 3 skipped, 279 passed | 28 todo** — WhatsApp behavioral assertions unchanged; all 5 agent-tools files green.
- **Full suite** `npx vitest run` → **319 files passed | 3 skipped, 2235 passed | 2 skipped | 33 todo** (baseline 122-02 was 317 passed / 2229; +2 files / +6, the two formerly-RED scaffolds now green) — no cross-module regression; the known `mcp-route-contract.test.ts` flake did not surface.
- Neutrality grep over `lib/agent-tools/*.ts`: none of `lib/whatsapp` / `ownerPhone` / `WhatsAppMessage` / `sendWhatsAppMessage` / `whatsapp_` / `downloadWhatsAppMedia` (→ 0). `create-estimate.ts` also free of `@/lib/mcp` / `@langchain` / `company_id`.
- `npx tsc --noEmit` clean on all touched/created files.

## Next Phase Readiness
- Phase 122 is COMPLETE (3/3 plans). The `lib/agent-tools/` barrel is now the single neutral surface exposing all four capabilities (createEstimate, the 6 company reads, normalizeInput, askKnowledge) — Phase 124's AI-SDK chat binds these as tools without importing any channel.
- The WhatsApp parity suite + the neutrality gate remain the permanent regression guards for the extraction.

## Self-Check: PASSED

- `lib/agent-tools/create-estimate.ts`, `lib/agent-tools/ask-knowledge.ts` exist (verified).
- `lib/agent-tools/index.ts` re-exports all four (verified — createEstimate + askKnowledge added).
- `lib/whatsapp/intent-router.ts` re-pointed to askKnowledge (verified via grep).
- Both task commits exist in git history: `956a1c5`, `12f833f3` (verified below).

---
*Phase: 122-channel-neutral-domain-extraction*
*Completed: 2026-06-25*

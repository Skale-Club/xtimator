---
phase: 128-mcp-generation-parity
verified: 2026-06-25T07:00:00Z
status: passed
score: 6/6 must-haves verified
---

# Phase 128: MCP Generation Parity Verification Report

**Phase Goal:** The MCP create_estimate routes through the neutral lib/agent-tools/createEstimate (behavior-preserving) so all three channels share one generation entry; proven non-destructive by the existing MCP suite staying green.
**Verified:** 2026-06-25T07:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1   | MCP create_estimate dispatches via the neutral createEstimate (no inline inngest.send) | ✓ VERIFIED | write.ts L183-189 calls `createEstimate({...channel:'mcp'})`; `grep -c inngest.send write.ts` = 0 |
| 2   | MCP-originated estimate fires EVENT_ESTIMATE_GENERATE once with companyId/projectId/requestId/channel:'mcp' and returns {job_id,status:'queued',message} | ✓ VERIFIED | mcp-create-estimate.test.ts happy-path asserts event name `estimate/generate.requested`, payload companyId/projectId/requestId, and the envelope — 10/10 green; `companyId: auth.company_id` (trusted, not tool input) at write.ts L184 |
| 3   | Inngest idempotency id for MCP still begins `estimate-mcp-<projectId>-` | ✓ VERIFIED | create-estimate.ts L54 channel-namespaced id; mcp-create-estimate.test.ts L175 `/^estimate-mcp-p1-/` green unchanged |
| 4   | Neutral createEstimate namespaces the id by channel (`estimate-<channel>-<projectId>-<requestId>`) | ✓ VERIFIED | create-estimate.ts L54 `estimate-${args.channel ? \`${args.channel}-\` : ''}${args.projectId}-${requestId}`; create-estimate.test.ts asserts mcp / web / no-channel forms — all green |
| 5   | Static binding test proves write.ts imports createEstimate from neutral barrel, drops EVENT_ESTIMATE_GENERATE, and three channels converge | ✓ VERIFIED | mcp-generation-parity.test.ts 3 it() cases green; asserts `from '@/lib/agent-tools'`, no EVENT_ESTIMATE_GENERATE, and chat/mcp via createEstimate + whatsapp via generateEstimateForProject |
| 6   | Existing v4.1 MCP suite (create_estimate, check_job_status, registry) stays green unchanged | ✓ VERIFIED | `git diff` of mcp-create-estimate.test.ts across the 3 phase-128 commits = empty (byte-unchanged); full mcp + agent-tools run = 18 files / 164 tests passed |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `lib/agent-tools/create-estimate.ts` | Neutral dispatch with channel-namespaced id | ✓ VERIFIED | Channel-namespaced id at L54; doc comment updated (L22-27); no channel-specific token added (neutrality preserved) |
| `lib/mcp/tools/write.ts` | MCP create_estimate delegating to neutral createEstimate | ✓ VERIFIED | Imports createEstimate from `@/lib/agent-tools` (L29); delegated call L183-189 with channel:'mcp'; dead imports (randomUUID, inngest, EVENT_ESTIMATE_GENERATE, EstimateGeneratePayload) all removed; scope gate + project-ownership lookup + envelope preserved |
| `tests/unit/mcp/mcp-generation-parity.test.ts` | MPAR-01 static binding + 3-channel convergence | ✓ VERIFIED | 3 it() cases, readFileSync+grep style, no DB/mocks; passes 3/3 |
| `tests/unit/agent-tools/create-estimate.test.ts` | Updated neutral test asserting channel-namespaced id | ✓ VERIFIED | Asserts `/^estimate-mcp-proj-1-/`, `/^estimate-web-proj-1-/`, and no-channel `/^estimate-proj-1-/`; T-lrf-01 companyId assertion intact |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| write.ts handleCreateEstimate | create-estimate.ts createEstimate | `import { createEstimate } from '@/lib/agent-tools'` + call with channel:'mcp' | ✓ WIRED | Import at L29; call L183-189 confirmed |
| create-estimate.ts | @/lib/inngest/client (inngest.send) | channel-namespaced idempotency id | ✓ WIRED | L52-56 inngest.send with id template L54 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| write.ts handleCreateEstimate | jobId | `createEstimate(...)` → real inngest.send (leaf-mocked in tests only) | ✓ Yes (ids[0] from real dispatch) | ✓ FLOWING |
| create-estimate.ts | jobId | inngest.send returns ids[]; throws if empty | ✓ Yes | ✓ FLOWING |

No hollow data: the MCP envelope's job_id is the actual Inngest event id; behavior guard proves payload fields propagate from auth.company_id (trusted) and input.project_id through to the dispatched event.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| MCP + agent-tools suites green | `npx vitest run tests/unit/mcp tests/unit/agent-tools` | 18 files / 164 tests passed | ✓ PASS |
| Parity guard byte-unchanged + green | `git diff` (empty) + `npx vitest run tests/unit/mcp-create-estimate.test.ts` | 10/10 passed, no diff | ✓ PASS |
| No new tsc errors in phase files | `npx tsc --noEmit` filtered | NO ERRORS in write.ts / create-estimate.ts | ✓ PASS |
| Dead-import removal | grep counts in write.ts | EVENT_ESTIMATE_GENERATE=0, inngest.send=0, node:crypto=0, inngest/client=0 | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| MGEN-01 | 128-01 | MCP create_estimate routes through neutral createEstimate; three channels share one entry; behavior preserved | ✓ SATISFIED | write.ts delegates with channel:'mcp'; envelope + scope + ownership preserved; behavior guard green unchanged |
| MPAR-01 | 128-01 | MCP tools BIND the neutral capabilities (not a re-implementation); v4.1 MCP suite stays green unchanged | ✓ SATISFIED | Static binding test 3/3 green; mcp-create-estimate.test.ts byte-unchanged (empty git diff) + green |

No orphaned requirements — REQUIREMENTS.md maps only MGEN-01 + MPAR-01 to Phase 128, both claimed by plan 128-01 and both marked Complete.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| lib/mcp/tools/write.ts | 177 | Prose mention of `EstimateGeneratePayload` in a doc comment | ℹ️ Info | Harmless — the actual import was removed; this is an explanatory comment about how `prompt` maps to the payload. No code references the type. Not a stub or dead code. |

No blocker or warning anti-patterns. No TODO/FIXME/placeholder, no empty returns, no hardcoded stub data in the phase files.

### Human Verification Required

None. This is a behavior-preserving refactor fully covered by the static binding test (MPAR-01) and the byte-unchanged behavior guard. No visual/runtime/external-service surface introduced.

### Gaps Summary

No gaps. All 6 observable truths verified, all 4 artifacts pass levels 1-4 (exist, substantive, wired, data flowing), both key links wired, both requirements satisfied. The MCP create_estimate now delegates to the neutral createEstimate with channel:'mcp'; the channel-namespaced idempotency id keeps the existing `estimate-mcp-p1-` assertion green; the parity guard is byte-unchanged and green; and the three-channel convergence (chat/createEstimate, mcp/createEstimate, whatsapp/generateEstimateForProject) is statically proven. Note: tests/unit/mcp-route-contract.test.ts is a known parallel-only flake unrelated to any Phase-128 file and was excluded from the targeted run per the plan's note.

---

_Verified: 2026-06-25T07:00:00Z_
_Verifier: Claude (gsd-verifier)_

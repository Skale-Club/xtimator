---
phase: 121-whatsapp-knowledge-intent
verified: 2026-06-24T20:40:00Z
status: passed
score: 5/5 must-haves verified
---

# Phase 121: WhatsApp KNOWLEDGE Intent Verification Report

**Phase Goal:** Extend the WhatsApp classifyAndRoute with a 5th intent KNOWLEDGE + a QUERY-vs-KNOWLEDGE disambiguation rule (safe CREATE default preserved); a KNOWLEDGE message dispatches to lib/knowledge/answer scoped by the resolved company's industries[] + overlay, delivered via the existing chunked owner reply.
**Verified:** 2026-06-24T20:40:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1   | A KNOWLEDGE-classified message routes to dispatchKnowledge (not QUERY, not CREATE) | ✓ VERIFIED | `case 'KNOWLEDGE': { await dispatchKnowledge(...) }` (intent-router.ts:393-396); Test A asserts answer() called, makeQueryTools + processInboundMessages NOT called |
| 2   | Unrecognized classifier output STILL defaults to CREATE (safe, non-privileged) | ✓ VERIFIED | `parseIntent` final `return 'CREATE'` intact (intent-router.ts:105); KNOWLEDGE check sits ABOVE it (line 103); Test B (`'garbage-not-a-label'` → processInboundMessages) passes |
| 3   | A classifier exception STILL defaults to CREATE | ✓ VERIFIED | try/catch in classifyAndRoute sets `intent = 'CREATE'` on throw (intent-router.ts:357-362); Test C (mockInvoke rejects) passes |
| 4   | KNOWLEDGE reads industries[] via trusted service client, calls answer({industries, companyId, language}), delivers via sendWhatsAppMessage | ✓ VERIFIED | dispatchKnowledge reads `companies.industries, default_estimate_language` by `input.companyId` (lines 303-307), calls `answer(normalizedText, {industries, companyId, language})` (lines 319-323), delivers via `splitReply` + `sendOwnerReplyChunks` (lines 326-328) |
| 5   | answer()'s ctx.industries and ctx.companyId come from the server-side read / trusted input.companyId — never from the LLM | ✓ VERIFIED | industries from `input.supabase` company read; companyId is `input.companyId` (RouteInput TRUSTED, upstream-resolved). Test D asserts `ctx.industries === ['carpet_cleaning']` and `ctx.companyId === 'company-K'` from the mocked company row, not the AIMessage |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `lib/whatsapp/intent-router.ts` | 5th KNOWLEDGE intent in union + parseIntent + classify prompt; dispatchKnowledge; switch case | ✓ VERIFIED | Union line 48; parseIntent line 103; classify prompt KNOWLEDGE bullet (170) + DISAMBIGUATION (172-175) + closing enumeration (177); dispatchKnowledge (296-329); case (393-396). Wired and data-flowing. |
| `tests/unit/whatsapp/intent-router-knowledge.test.ts` | KNOWLEDGE routing + dispatch + safe-default regression coverage | ✓ VERIFIED | 247 lines; Tests A-E cover routing, both safe-default regressions, ctx scope, and static source contracts. All green. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| classifyAndRoute switch | dispatchKnowledge | `case 'KNOWLEDGE'` | ✓ WIRED | intent-router.ts:393-396 |
| dispatchKnowledge | @/lib/knowledge/answer | `answer(text, {industries, companyId, language})` | ✓ WIRED | import line 44; call lines 319-323; answer.ts is the real consumed function (verified its signature `answer(question, ctx): Promise<string>`, never-throws) |
| dispatchKnowledge | companies.industries[] | `select('industries, default_estimate_language')` | ✓ WIRED | intent-router.ts:303-307 via trusted input.supabase |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| dispatchKnowledge | `industries` | service-client read of `companies.industries` by trusted companyId | Yes (caller-supplied scope; `?? []` defensive, empty is valid) | ✓ FLOWING |
| dispatchKnowledge | `text` (reply) | `answer()` real RAG composer (retrieve → OpenRouter chat) returning answer or FALLBACK | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| WhatsApp unit suite green (incl. KNOWLEDGE + CREATE regressions) | `npx vitest run tests/unit/whatsapp` | 28 files passed, 213 tests passed, 0 failures | ✓ PASS |
| Channel-neutrality (no reverse import) | `grep -rn "lib/whatsapp" lib/knowledge/` | 0 matches | ✓ PASS |
| No migration introduced | `git diff --name-only d1909cc7~1 393a4d64` | only intent-router.ts + test file | ✓ PASS |
| Commit hashes valid | `git cat-file -t` on d1909cc7, e75cccba, 393a4d64 | all 3 = commit | ✓ PASS |

Note: tests/unit/mcp-route-contract.test.ts (known pre-existing parallel-only flake) did not surface in the scoped whatsapp run and is out-of-scope for phase 121.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| WAKB-01 | 121-01-PLAN | 5th KNOWLEDGE intent + QUERY-vs-KNOWLEDGE disambiguation; safe CREATE default preserved | ✓ SATISFIED | Truths 1-3; union/parseIntent/prompt edits; REQUIREMENTS.md:45 marked [x] Complete |
| WAKB-02 | 121-01-PLAN | KNOWLEDGE dispatches to lib/knowledge/answer scoped by industries[] + overlay, delivered via chunked owner reply | ✓ SATISFIED | Truths 4-5; dispatchKnowledge; REQUIREMENTS.md:46 marked [x] Complete |

No orphaned requirements: REQUIREMENTS.md maps only WAKB-01/02 to Phase 121, both claimed by the plan.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| intent-router.ts | 310 | `?? []` industries default | ℹ️ Info | Intentional — empty industries[] is valid (overlay-only); NOT a stub. Data still flows; no early-return on empty. |

No blocker or warning anti-patterns. No TODO/FIXME/placeholder. The `return 'CREATE'` fallback is the intended safe default, not a stub return.

### Human Verification Required

None. All behaviors are covered by deterministic unit tests over mocked boundaries; the live LLM classification quality (QUERY vs KNOWLEDGE disambiguation in production) is prompt-tuning, outside the phase's automated contract.

### Gaps Summary

No gaps. Phase 121 goal fully achieved:
- WAKB-01: KNOWLEDGE is the 5th member of the Intent union; parseIntent recognizes it ABOVE the unchanged `return 'CREATE'` safe default (confirmed byte-intact); the classify prompt carries the KNOWLEDGE bullet, the QUERY-vs-KNOWLEDGE DISAMBIGUATION block, and the updated closing enumeration; a `case 'KNOWLEDGE'` routes through the switch.
- WAKB-02: dispatchKnowledge reads `companies.industries[]` (+ language) by the caller-supplied `input.companyId` through the trusted service client, calls the real `answer()` from lib/knowledge/answer with `{industries, companyId, language}` (never LLM-supplied), and delivers via the existing splitReply + sendOwnerReplyChunks chunked owner reply.
- Channel-neutrality preserved (lib/knowledge/ has 0 references to lib/whatsapp).
- CREATE safe-default regressions, full whatsapp suite green (213 tests). No migration, no new dependency, no secret.

This was the FINAL phase of milestone v4.8 Industry Knowledge Base — milestone goal proven end-to-end over WhatsApp.

---

_Verified: 2026-06-24T20:40:00Z_
_Verifier: Claude (gsd-verifier)_

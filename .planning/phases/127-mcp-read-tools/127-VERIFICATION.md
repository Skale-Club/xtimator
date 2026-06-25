---
phase: 127-mcp-read-tools
verified: 2026-06-25T06:26:00Z
status: passed
score: 4/4 must-haves verified
---

# Phase 127: MCP Read Tools Verification Report

**Phase Goal:** Add MCP read tools binding the v4.9 neutral `lib/agent-tools/` capabilities — `ask_knowledge` + 5 query tools (`find_client`/`get_latest_estimate`/`get_project_status`/`list_recent_estimates`/`list_services`), read-only (`readOnlyHint`), `companyId` from the OAuth token (never tool input).
**Verified:** 2026-06-25T06:26:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 1 | `ask_knowledge` answers a trade question scoped to OAuth-resolved company's `industries[]`; input is `{ question }` only (MKB-01) | ✓ VERIFIED | `handleAskKnowledge` reads `companies.industries`/`default_estimate_language` `.eq('id', auth.company_id)`, then `askKnowledge(question, { industries, companyId: auth.company_id, language })`. inputSchema has one property `question` (required). |
| 2 | Each of the 5 query tools returns owner's company data by wrapping the neutral `query-company-data` fn (MQRY-01) | ✓ VERIFIED | Each handler imports + calls its neutral fn with `auth.company_id` first, service client second, parsed `name` third (listers omit name). Result emitted as `{ content: [{ type:'text', text }] }` via `textContent` — no `JSON.stringify`. |
| 3 | No new tool's `inputSchema` accepts `companyId`/`company_id`/`tenant`/`tenantId` — tenant is `auth.company_id`, trusted (MSEC-01) | ✓ VERIFIED | Grep of all 6 `inputSchema` definitions: only keys are `question`, `name`, or empty. `companyId` only appears as `auth.company_id` (closure/positional) or in comments. Schema-walk test with `company-SECRET` tripwire passes. |
| 4 | All 6 tools carry `readOnlyHint:true` + `destructiveHint:false` (MSEC-02) | ✓ VERIFIED | All 6 definitions spread verbatim `READ_ONLY_ANNOTATIONS` (`readOnlyHint:true, destructiveHint:false, idempotentHint:true, openWorldHint:false`). Annotation test asserts across all 6. |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `lib/mcp/tools/knowledge-query.ts` | 6 tool builder, binding-only | ✓ VERIFIED | 286 lines. `buildKnowledgeQueryTools(auth)` returns 6 entries; each handler gates `ensureReadScope(auth,'mcp:read')` then delegates to a neutral `@/lib/agent-tools` fn. No domain logic. |
| `lib/mcp/tools/registry.ts` | wires the 3rd builder, 12 tools | ✓ VERIFIED | Imports + spreads `buildKnowledgeQueryTools(auth)` as 3rd builder in `buildAllTools` (read 4 + write 2 + kq 6 = 12). |
| `tests/unit/mcp-knowledge-query-tools.test.ts` | MKB/MQRY/MSEC coverage | ✓ VERIFIED | Schema-walk, positional-binding, annotations, raw-string emit tests. |
| `tests/unit/mcp-tool-registry.test.ts` | count 6→12 | ✓ VERIFIED | `buildAllTools` 12-tool count + full 12-name sorted list + `tools/list` advertises 12. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `knowledge-query.ts` | `@/lib/agent-tools` | named imports (askKnowledge + 5 fns) | ✓ WIRED | All 6 imported; all 6 called inside handlers. Barrel exports confirmed present. |
| `registry.ts` | `knowledge-query.ts` | `buildKnowledgeQueryTools` import + spread | ✓ WIRED | Imported line 26, spread into `buildAllTools` line 79. |
| handlers | `auth.company_id` | positional/closure (not input) | ✓ WIRED | All 6 pass `auth.company_id` as trusted tenant; never read from args. |

### Binding-not-Reimplementation (byte-stability)

| Protected path | Status | Evidence |
| -------------- | ------ | -------- |
| `lib/mcp/tools/read.ts` | ✓ UNTOUCHED | `git diff --stat HEAD~3` empty + working tree clean |
| `lib/mcp/tools/write.ts` | ✓ UNTOUCHED | same |
| `lib/mcp/tools/server.ts` | ✓ UNTOUCHED | same |
| `lib/agent-tools/` | ✓ UNTOUCHED | same |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| MKB-01 | 127-01-PLAN | `ask_knowledge` wraps neutral ask-knowledge, scoped by industries[] | ✓ SATISFIED | Truth 1 |
| MQRY-01 | 127-01-PLAN | 5 query tools wrapping query-company-data | ✓ SATISFIED | Truth 2 |
| MSEC-01 | 127-01-PLAN | companyId from OAuth, never input; test asserts | ✓ SATISFIED | Truth 3 |
| MSEC-02 | 127-01-PLAN | readOnlyHint annotations; test asserts | ✓ SATISFIED | Truth 4 |

No orphaned requirements: REQUIREMENTS.md maps exactly MKB-01/MQRY-01/MSEC-01/MSEC-02 to Phase 127, all claimed in PLAN frontmatter.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Phase test suites green | `npx vitest run tests/unit/mcp-knowledge-query-tools.test.ts tests/unit/mcp-tool-registry.test.ts` | 2 files, 23 tests passed | ✓ PASS |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | none | — | No TODO/FIXME/placeholder/stub. `companyId` references are all `auth.company_id` (trusted) or comments. |

`find_service` intentionally omitted — MQRY-01 names exactly 5 query tools; PLAN scope_fence directs not to add the chat channel's 6th binding. Verified as deliberate scope discipline, not a gap.

### Gaps Summary

None. All 4 must-haves verified across all levels (exists, substantive, wired, data-flows-to-neutral-core). The phase is a pure binding layer: 6 read-only MCP tools delegate to the v4.9 neutral `lib/agent-tools/` fns with the trusted `auth.company_id` tenant; protected files are byte-untouched; security invariants (no tenant input, read-only annotations) hold and are test-asserted; registry count correctly bumped 6→12. Both phase test files pass.

---

_Verified: 2026-06-25T06:26:00Z_
_Verifier: Claude (gsd-verifier)_

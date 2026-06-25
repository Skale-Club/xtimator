---
phase: 127-mcp-read-tools
plan: 01
subsystem: mcp
tags: [mcp, agent-tools, channel-parity, read-tools, tdd]
requires:
  - "lib/agent-tools (v4.9 neutral core: askKnowledge + query-company-data fns)"
  - "lib/mcp/tools/read.ts (READ_ONLY_ANNOTATIONS, ensureReadScope gate)"
  - "lib/mcp/tools/registry.ts (buildAllTools, ToolDefinitionEntry shape)"
  - "lib/mcp/auth.ts (McpAuthContext.company_id — trusted tenant)"
provides:
  - "6 read-only MCP tools advertised via tools/list: ask_knowledge, find_client, get_latest_estimate, get_project_status, list_recent_estimates, list_services"
  - "buildKnowledgeQueryTools(auth) builder + __testing handles"
  - "buildAllTools now returns 12 entries (4 read + 2 write + 6 knowledge/query)"
affects:
  - "lib/mcp/tools/registry.ts (buildAllTools wiring)"
  - "tests/unit/mcp-tool-registry.test.ts (12-tool contract)"
tech-stack:
  added: []
  patterns:
    - "MCP tool = thin closure over a channel-neutral lib/agent-tools fn (binding-only, zero new domain logic)"
    - "Trusted tenant (auth.company_id) passed positionally / via closure — NEVER an inputSchema field (MSEC-01)"
    - "Neutral query fns return a plain string → emit { content: [{ type:'text', text }] } directly (no JSON.stringify)"
key-files:
  created:
    - "lib/mcp/tools/knowledge-query.ts"
    - "tests/unit/mcp-knowledge-query-tools.test.ts"
  modified:
    - "lib/mcp/tools/registry.ts"
    - "tests/unit/mcp-tool-registry.test.ts"
decisions:
  - "Followed MQRY-01 literally: 5 query tools + ask_knowledge = 6 new (did NOT add find_service, which the chat channel binds as a 6th query tool)"
  - "Re-created parseInput + READ_ONLY_ANNOTATIONS locally rather than touching read.ts, keeping read.ts/write.ts/server.ts byte-stable (MPAR-01 precursor)"
metrics:
  duration: "~25 min"
  completed: "2026-06-25"
  tasks: 3
  files: 4
---

# Phase 127 Plan 01: MCP Read Tools Summary

Bound 6 read-only MCP tools (`ask_knowledge` + 5 `query-company-data` tools) onto the existing v4.1 `/api/mcp` server as thin closures over the v4.9 channel-neutral `lib/agent-tools/` core — bringing MCP to capability parity with WhatsApp + the v4.9 web chat over ONE neutral core.

## What Shipped

- **`lib/mcp/tools/knowledge-query.ts`** (new) — `buildKnowledgeQueryTools(auth)` returns 6 `{ definition, handler }` entries:
  - `ask_knowledge` ({question}) → resolves `companies.industries` + `default_estimate_language` for the trusted `auth.company_id`, then `askKnowledge(question, { industries, companyId, language })` (MKB-01).
  - `find_client` / `get_latest_estimate` / `get_project_status` ({name}) and `list_recent_estimates` / `list_services` ({}) → each wraps one neutral `query-company-data` fn, passing `auth.company_id` positionally first + the service client second (MQRY-01).
  - Every handler gates `ensureReadScope(auth, 'mcp:read')` first, emits the neutral fn's raw string as `{ content: [{ type:'text', text }] }` (no JSON.stringify), and carries `READ_ONLY_ANNOTATIONS` (readOnlyHint:true + destructiveHint:false — MSEC-02).
- **`lib/mcp/tools/registry.ts`** — imports + spreads `buildKnowledgeQueryTools(auth)` as the 3rd builder in `buildAllTools` → 12 tools total.
- **Tests** — new `tests/unit/mcp-knowledge-query-tools.test.ts` (15 tests: MKB-01 scope read, MQRY-01 positional binding, MSEC-01 schema-walk with the `company-SECRET` tripwire, MSEC-02 annotations, raw-string emit). Updated `tests/unit/mcp-tool-registry.test.ts` 6→12 counts + the full 12-name sorted list.

## Security (MSEC-01)

No new tool's `inputSchema` accepts `companyId`/`company_id`/`tenant`/`tenantId`. The only LLM-supplied keys are `question` (ask_knowledge) and `name` (the 3 name-takers); the 2 listers expose no properties. A schema-walk test asserts this across all 6 tools. The tenant is `auth.company_id` (OAuth-resolved), passed positionally/via closure.

## Tasks & Commits

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 (RED) | Failing test for the 6 MCP read tools | `91e681a0` |
| 2 (GREEN) | Implement buildKnowledgeQueryTools (6 bindings) | `e3b4d420` |
| 3 | Wire builder into buildAllTools + update registry counts 6→12 | `0acceb2c` |

## Verification

- `npx vitest run tests/unit/mcp-knowledge-query-tools.test.ts tests/unit/mcp-tool-registry.test.ts tests/unit/mcp-read-tools.test.ts` — 51 passed.
- `npx vitest run tests/unit/mcp` — full MCP suite, 12 files / 143 tests passed.
- `npx vitest run` (full suite) — 2349 passed, 1 failed: the KNOWN parallel-only `mcp-route-contract.test.ts > GET returns 405` timeout flake (8/8 in isolation, re-confirmed this run — not a regression, documented in STATE.md).
- `git diff` after Task 3 touched ONLY `knowledge-query.ts`, `registry.ts`, and the 2 test files. `read.ts` / `write.ts` / `server.ts` / `lib/agent-tools/` byte-untouched (verified via `git diff --stat` = empty).

## Deviations from Plan

None — plan executed exactly as written. (find_service intentionally omitted per MQRY-01 scope discipline, as the plan's scope_fence directs.)

## Known Stubs

None. All 6 tools wire to live neutral fns + real Supabase reads; no placeholder data.

## Self-Check: PASSED

- FOUND: lib/mcp/tools/knowledge-query.ts
- FOUND: tests/unit/mcp-knowledge-query-tools.test.ts
- FOUND commit 91e681a0 (RED), e3b4d420 (GREEN), 0acceb2c (wire)

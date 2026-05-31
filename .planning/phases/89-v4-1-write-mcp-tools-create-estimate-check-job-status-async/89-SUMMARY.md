---
phase: 89
plan: "—"
subsystem: mcp
tags: [mcp, tools, claude-connector, write-tools, async, inngest, multi-tenant]
dependency-graph:
  requires:
    - phase-88  # buildReadTools + lib/mcp/{pagination,errors}.ts
    - phase-87  # createMcpServer factory + verifyMcpRequest + requireScope
    - phase-86  # OAuth scopes mcp:read / mcp:write
    - phase-67  # Inngest pipeline (EVENT_ESTIMATE_GENERATE, /api/jobs/[jobId])
  provides:
    - mcp-write-tools                # create_estimate (async via Inngest)
    - mcp-async-poll-pattern         # check_job_status reads Inngest /events/{id}/runs
    - mcp-tool-registry              # buildAllTools + registerAllTools (single handler pair)
  affects:
    - lib/mcp/server.ts
    - lib/mcp/tools/read.ts          # registerReadTools -> buildReadTools(auth)
    - lib/mcp/tools/registry.ts      # NEW shared dispatcher
    - lib/mcp/tools/write.ts         # NEW write/async tools
tech-stack:
  added: []
  patterns:
    - "Per-tool builder pattern: each module exports buildXTools(auth): ToolDefinitionEntry[] returning { definition, handler } pairs. The handler is closed over auth and owns its own scope gate. The shared registry concatenates builders, installs ONE tools/list + ONE tools/call handler pair, and dispatches by tool name."
    - "Async via opaque job_id: create_estimate dispatches the existing EVENT_ESTIMATE_GENERATE Inngest event (same path /api/generate-estimate uses) and returns the Inngest event id as job_id. The LLM polls check_job_status(job_id), which reads the same Inngest REST endpoint /api/jobs/[jobId] uses — no parallel job table."
    - "Idempotency key: create_estimate uses `estimate-mcp-{project_id}-{requestId}` (vs the web route's `estimate-{project_id}-{requestId}`) so an MCP-issued retry stays separate from a UI-issued retry of the same project."
    - "Status normalization: Inngest's 'Running'/'Completed'/'Failed'/'Cancelled' (capitalized, mixed) maps to the stable 4-bucket MCP shape queued|running|complete|failed. Unknown statuses default to 'running' (the route in Phase 67 also returns 'Running' when an event was accepted but the run hasn't started)."
    - "Annotation tiers in one Server: read tools (4) carry readOnlyHint=true / idempotentHint=true; create_estimate carries readOnlyHint=false / destructiveHint=false / idempotentHint=false (each call queues a fresh AI run); check_job_status is read-only despite living alongside the write tool. Claude.ai's UI groups by readOnlyHint, so check_job_status falls under 'Read-only tools' and create_estimate under 'Write tools'."
key-files:
  created:
    - lib/mcp/tools/registry.ts
    - lib/mcp/tools/write.ts
    - tests/unit/mcp-tool-registry.test.ts
    - tests/unit/mcp-create-estimate.test.ts
    - tests/unit/mcp-check-job-status.test.ts
  modified:
    - lib/mcp/server.ts
    - lib/mcp/tools/read.ts
    - tests/unit/mcp-read-tools.test.ts
    - tests/unit/mcp-server-registration.test.ts
decisions:
  - "Did not forward the free-form `prompt` arg through to Inngest. EstimateGeneratePayload's shape (companyId, projectId, requestId, language) is fixed by Phase 67 and used by both /api/generate-estimate and lib/services/generate-estimate. Adding a prompt field would be a payload-schema change beyond Phase 89's scope — flagged for Phase 90+ (which is wiring the settings page, but a follow-up phase could extend the payload). For the MVP MCP flow, the LLM seeds project context separately (via existing or future update_project tooling) before calling create_estimate."
  - "create_estimate does NOT do rate-limiting or quota checks. The web route /api/generate-estimate runs Upstash rate limits + checkQuota before dispatching; the MCP path currently skips those because (a) the Inngest function records usage anyway, (b) per-token rate limits are a separate concern best handled at the /api/mcp route layer, (c) the LLM-driven flow doesn't burst the same way a script could. If MCP traffic shows abuse, add a per-(client_id, company_id) rate limit at the route level."
  - "check_job_status reads Inngest's REST API directly (matches /api/jobs/[jobId] in Phase 67) rather than introducing a job_status DB table. Trade-off: every poll round-trips to Inngest Cloud (or the local dev server). For the LLM polling pattern (1 call every few seconds for ~30-60s) this is fine; if many MCP clients poll the same job we may want to cache."
  - "Annotation choice for check_job_status: marked readOnlyHint=true / idempotentHint=true so Claude.ai's UI groups it under 'Read-only tools' alongside the Phase 88 quartet. Logically it pairs with create_estimate, but the UI group is driven by the read-only flag, and we want the LLM to be able to poll without per-call approval."
  - "Registry pattern: builders return { definition, handler } pairs rather than the previous registerXTools(server, auth) pattern. The MCP SDK's setRequestHandler(schema, handler) accepts only ONE handler per schema (subsequent calls silently overwrite), so the prior shape would have made the read+write tools mutually exclusive. The registry now owns the single handler pair and dispatches by tool name; per-tool modules return data only."
metrics:
  duration: "~11 minutes"
  completed: "2026-05-26"
  commits: 2
  files_created: 5
  files_modified: 4
  tests_added: 37
---

# Phase 89: v4.1 Write MCP Tools (create_estimate + check_job_status async) Summary

**Two new MCP tools — `create_estimate` (mcp:write, async via Inngest) and `check_job_status` (mcp:read, polls the same Inngest REST endpoint `/api/jobs/[jobId]` uses) — ship inside `createMcpServer` on top of Phase 88's 4 read tools. Tool registration was refactored into a shared `registry.ts` so `read.ts` + `write.ts` both contribute to the single `tools/list` + `tools/call` handler pair the MCP SDK allows per Server.**

## What Shipped

### Tools

| Tool                | Scope       | readOnly | destructive | idempotent | Returns                                                     |
| ------------------- | ----------- | -------- | ----------- | ---------- | ----------------------------------------------------------- |
| `create_estimate`   | `mcp:write` | false    | false       | false      | `{ job_id, status: 'queued', message }`                     |
| `check_job_status`  | `mcp:read`  | true     | false       | true       | `{ job_id, status, result?: { estimate_id }, error? }`      |

Both tools live in `lib/mcp/tools/write.ts`. The tool registry concatenates read + write entries and registers `tools/list` + `tools/call` once each.

### Async Pattern (end-to-end)

1. LLM calls `create_estimate({ project_id, prompt, language? })`.
2. Tool gates on `mcp:write`, verifies the project belongs to `auth.company_id`.
3. Tool calls `inngest.send({ name: 'estimate/generate.requested', id: 'estimate-mcp-{project_id}-{requestId}', data: { companyId, projectId, requestId, language? } })` — the exact same event `/api/generate-estimate` dispatches from the web app.
4. Tool returns `{ job_id: <inngest event id>, status: 'queued', message: '...' }` immediately (~50-200ms).
5. LLM polls `check_job_status({ job_id })` every few seconds.
6. Tool gates on `mcp:read`, hits Inngest `GET /v1/events/{job_id}/runs` (dev mode: `http://localhost:8288`; cloud: `https://api.inngest.com`).
7. Status maps `Running -> running`, `Completed -> complete`, `Failed/Cancelled -> failed`, `Queued/Pending -> queued`. On `complete`, surfaces `result.estimate_id` so the LLM can call `get_estimate(estimate_id)` next. On `failed`, surfaces `error` string.

Typical end-to-end latency: ~30-60s (AI generation runtime). Each poll: <500ms.

### Tool Registry Refactor

The prior shape (`registerReadTools(server, auth)` called from `createMcpServer`) installed both `tools/list` and `tools/call` handlers itself. Adding `registerWriteTools` on top would silently overwrite the read handlers because `Server.setRequestHandler(schema, handler)` only keeps the last registration per schema.

New shape:

- `lib/mcp/tools/read.ts` → `buildReadTools(auth): ToolDefinitionEntry[]`
- `lib/mcp/tools/write.ts` → `buildWriteTools(auth): ToolDefinitionEntry[]`
- `lib/mcp/tools/registry.ts` → `buildAllTools(auth)` concatenates; `registerAllTools(server, auth)` installs the single `tools/list` + `tools/call` handler pair and dispatches `tools/call` by name.
- `lib/mcp/server.ts` → calls `registerAllTools(server, authContext)` once.

Each `ToolDefinitionEntry` is `{ definition, handler }` where the handler is already closed over `auth` and owns its own scope gate. Per-tool modules now return data only.

## Files

### Created (5)

- `lib/mcp/tools/registry.ts` — shared dispatcher (96 lines)
- `lib/mcp/tools/write.ts` — create_estimate + check_job_status (287 lines)
- `tests/unit/mcp-tool-registry.test.ts` — 8 tests (registry contract)
- `tests/unit/mcp-create-estimate.test.ts` — 12 tests (scope, validation, tenancy, happy path)
- `tests/unit/mcp-check-job-status.test.ts` — 17 tests (scope, validation, Inngest lookup, status normalization, response shape)

### Modified (4)

- `lib/mcp/server.ts` — `registerReadTools` → `registerAllTools`
- `lib/mcp/tools/read.ts` — `registerReadTools` → `buildReadTools(auth)`; per-entry scope gate; `ToolResult` interface import from registry
- `tests/unit/mcp-read-tools.test.ts` — drive `buildReadTools` entries directly; `registerAllTools` for the unknown-tool dispatch test
- `tests/unit/mcp-server-registration.test.ts` — assert `registerAllTools` wiring + that server.ts does NOT register `setRequestHandler` directly

## Test Coverage

| File                                          | Tests | Status |
| --------------------------------------------- | ----- | ------ |
| tests/unit/mcp-tool-registry.test.ts          | 8     | PASS   |
| tests/unit/mcp-create-estimate.test.ts        | 12    | PASS   |
| tests/unit/mcp-check-job-status.test.ts       | 17    | PASS   |
| tests/unit/mcp-read-tools.test.ts (Phase 88)  | 31    | PASS   |
| tests/unit/mcp-pagination.test.ts (Phase 88)  | 11    | PASS   |
| tests/unit/mcp-server-registration.test.ts    | 4     | PASS   |
| tests/unit/mcp-route-contract.test.ts (Ph 87) | 13    | PASS   |
| tests/unit/mcp-auth.test.ts (Phase 87)        | 12    | PASS   |
| tests/unit/mcp-scope.test.ts (Phase 87)       | 6     | PASS   |
| **Total MCP**                                 | **104** | **PASS** |

- `npx tsc --noEmit`: clean (exit 0).
- Phase 88 regression: 45 + 1 (new assertion) tests still green.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Phase 88 tests would have broken after refactoring `registerReadTools` → `buildReadTools`.**

- **Found during:** Task 1 (registry extraction).
- **Issue:** `tests/unit/mcp-read-tools.test.ts` and `tests/unit/mcp-server-registration.test.ts` imported / grep'd for `registerReadTools`, which the refactor removed.
- **Fix:** Updated both test files in-place to drive `buildReadTools` entries directly + assert `registerAllTools` wiring. Net: existing assertions preserved; one new assertion added (server.ts no longer calls `setRequestHandler` for tools/list or tools/call — proves the registry owns it exclusively).
- **Files modified:** `tests/unit/mcp-read-tools.test.ts`, `tests/unit/mcp-server-registration.test.ts`.
- **Commit:** `f2007d6`.

**2. [Rule 3 - Blocking] `ToolResult` interface as written was structurally narrower than the SDK's `ServerResult` union.**

- **Found during:** Task 1 (registry + write.ts integration with `setRequestHandler`).
- **Issue:** `tsc --noEmit` flagged `Type 'Promise<ToolResult>' is not assignable to ...` because the SDK's expected return type allows optional `task`, `_meta`, and other index-signature keys our `ToolResult` did not declare. Phase 88 sidestepped this because its handlers returned an inline literal whose type was inferred, not declared.
- **Fix:** Added an index signature `[key: string]: unknown` to `ToolResult` in `registry.ts` so it's structurally compatible with the SDK's broader union without forcing every handler to spread placeholder fields.
- **Commit:** `f2007d6`.

### Non-deviations (explicit decisions)

- **Did not extend `EstimateGeneratePayload` to forward the `prompt` arg.** That's a payload-schema change touching `lib/inngest/events.ts`, `lib/inngest/functions/generate-estimate.ts`, and `lib/services/generate-estimate.ts`. Out of scope for Phase 89; documented in decisions for a future phase.
- **Did not add a rate limiter or quota gate on the MCP write path.** The Inngest function records usage on AI success regardless. Per-token rate limits should live at the `/api/mcp` route layer (a future hardening pass), not inside the tool handler.

## Pre-existing test failures (out of scope)

A full `npx vitest run` shows 23 failing test files (admin, blog, whatsapp/otp, price-book, theme, tour-telemetry, app-icons, …). None of them import or exercise `lib/mcp/*` code. Per the GSD scope boundary, these are not Phase 89's responsibility — they're flagged in the milestone backlog if not already tracked.

## What Phase 90 Needs

Phase 90 (Settings UI for MCP connections) needs:

1. **Token issuance UI** — Phase 86 ships the OAuth flow; the settings page should let a user revoke / re-issue connections.
2. **Scope display** — show which connections hold `mcp:read` vs `mcp:read mcp:write`. The latter unlocks `create_estimate`.
3. **Connection list** — pulled from `oauth_clients` × `oauth_access_tokens` joined by `user_id`. Phase 86 already has the data model; Phase 90 just needs to render it.

No further work in `lib/mcp/tools/` is required for Phase 90 — the 6 tool MVP surface is complete.

## How to Test Locally

1. Start Inngest dev server: `npx inngest-cli dev` (binds `localhost:8288`).
2. Set `INNGEST_DEV=1` in `.env.local` (no signing key needed in dev mode).
3. Start Next.js dev: `npm run dev`.
4. Use mcp-inspector or Claude.ai with a token carrying both `mcp:read mcp:write` scopes.
5. Call `create_estimate({ project_id: '<uuid>', prompt: '...' })` → expect `{ job_id, status: 'queued' }`.
6. Poll `check_job_status({ job_id })` every ~2s; expect `running` → `complete` with `result.estimate_id`.

## Self-Check: PASSED

- `lib/mcp/tools/registry.ts` FOUND
- `lib/mcp/tools/write.ts` FOUND
- `tests/unit/mcp-tool-registry.test.ts` FOUND
- `tests/unit/mcp-create-estimate.test.ts` FOUND
- `tests/unit/mcp-check-job-status.test.ts` FOUND
- Commit `f2007d6` FOUND (refactor + write tools)
- Commit `7768b8a` FOUND (new tests)
- `npx tsc --noEmit`: exit 0
- All 104 MCP tests pass

---
phase: 88
plan: "—"
subsystem: mcp
tags: [mcp, tools, claude-connector, read-only, pagination, multi-tenant]
dependency-graph:
  requires:
    - phase-87  # createMcpServer factory + verifyMcpRequest + requireScope
    - phase-86  # OAuth scopes mcp:read / mcp:write
  provides:
    - mcp-read-tools             # list_estimates, get_estimate, list_clients, list_projects
    - mcp-keyset-pagination      # encodeCursor / decodeCursor / clampLimit
    - mcp-tool-errors            # mcpToolError / invalidInput / notFound / insufficientScope
    - mcp-tool-registration-pattern  # Phase 89 (write tools) follows same shape
  affects:
    - lib/mcp/server.ts
    - lib/mcp/tools/*
tech-stack:
  added: []
  patterns:
    - "Tool definitions live in a static TOOL_DEFINITIONS array, returned verbatim from the tools/list handler. Annotation `readOnlyHint: true` is what makes Claude.ai's UI group all 4 under one 'Always allow' toggle."
    - "Each tool handler: requireScope(mcp:read) → parseInput(zod) → Supabase service-client query with explicit .eq('company_id', auth.company_id) → keyset paginate → JSON text content block."
    - "Keyset pagination via (created_at DESC, id DESC) tuple — never offsets. nextCursor is base64(JSON({created_at,id})); opaque to clients."
    - "decodeCursor returns null on malformed input rather than throwing; a bad cursor degrades gracefully to 'no cursor' (start from top)."
    - "McpError carries `data.kind` discriminator (`invalid_input` | `not_found` | `insufficient_scope` | `internal_error`) so tests and JSON-RPC clients can branch on the cause without parsing message strings."
    - "Service-role Supabase client is used directly — we don't re-do RLS because the OAuth consent screen (Phase 86) already authorized the exact (user, company) tuple. Tenant isolation is enforced at the query layer via explicit .eq('company_id', ...) on every read."
key-files:
  created:
    - lib/mcp/pagination.ts
    - lib/mcp/errors.ts
    - lib/mcp/tools/read.ts
    - tests/unit/mcp-pagination.test.ts
    - tests/unit/mcp-read-tools.test.ts
    - tests/unit/mcp-server-registration.test.ts
  modified:
    - lib/mcp/server.ts
decisions:
  - "Did not extract per-tool files (lib/mcp/tools/list_estimates.ts, etc.) — they all share the same boilerplate (parse zod input + query Supabase + paginate + return JSON). One file with 4 handlers is easier to read and audit than 4 files each repeating the same pattern. If the surface grows beyond ~6 tools, revisit."
  - "list_estimates filters by client_id via a join through projects (estimates table has no client_id column directly). Two-query approach: fetch project ids for the (company_id, client_id), then estimates.project_id IN (...). Acceptable for MVP scale; can be optimized later if needed."
  - "list_projects excludes archived_at IS NOT NULL and deleted_at IS NOT NULL by default — matches the existing getProjectsForListPage 'active' status default. No opt-in flag yet to view archived/trashed projects via MCP; can be added in a future phase if there is demand."
  - "Tool annotations carry destructiveHint: false / idempotentHint: true / openWorldHint: false on every read tool. Claude.ai uses these to decide which UI group a tool falls into and whether to require explicit per-call approval; readOnlyHint=true with destructiveHint=false yields a single 'Always allow' toggle per the MCP UI spec."
  - "McpToolError uses ErrorCode.InternalError (-32603) for non-validation errors and ErrorCode.InvalidParams (-32602) for validation errors. The application-level kind (`not_found`, `insufficient_scope`) lives in data.kind because MCP itself does not model these categories — JSON-RPC clients that care can branch on data.kind, the rest see a typed error message."
  - "Cursor SQL: WHERE (created_at, id) < (cursor.created_at, cursor.id) implemented as supabase.or('created_at.lt.X,and(created_at.eq.X,id.lt.\"Y\")') — equivalent under the (created_at DESC, id DESC) sort and works with PostgREST's filter grammar without needing a raw SQL view."
metrics:
  duration: "~30 minutes"
  completed: "2026-05-26"
  commits: 3
  files_created: 6
  files_modified: 1
  tests_added: 45
---

# Phase 88: v4.1 Read-Only MCP Tools Summary

**Four read-only MCP tools — `list_estimates`, `get_estimate`, `list_clients`, `list_projects` — now ship inside `createMcpServer`. All are annotated `readOnlyHint: true` so Claude.ai's connector UI groups them under a single "Read-only tools (4)" toggle, every handler is scope-gated on `mcp:read`, and every Supabase query carries an explicit `.eq('company_id', auth.company_id)` filter so a stolen or replayed token can never escape the tenant boundary.**

## What Shipped

### Tools

| Tool             | Description                                              | Required Scope | Annotations                                                                |
| ---------------- | -------------------------------------------------------- | -------------- | -------------------------------------------------------------------------- |
| `list_estimates` | Paginated list of estimates for the active company.      | `mcp:read`     | `readOnlyHint`, `idempotentHint`, `destructiveHint=false`, `openWorldHint=false` |
| `get_estimate`   | Full estimate (sections + items) by id.                  | `mcp:read`     | same                                                                       |
| `list_clients`   | Paginated client list with optional substring search.    | `mcp:read`     | same                                                                       |
| `list_projects`  | Paginated project list (excludes archived / trashed).    | `mcp:read`     | same                                                                       |

All four return `{ items: [...], nextCursor?: string }` as a single `content` block of type `text` carrying `JSON.stringify(result, null, 2)` — the simplest shape every MCP client (Claude.ai, mcp-inspector) handles consistently.

### Pagination Contract

- **Sort:** `(created_at DESC, id DESC)` — deterministic even when two rows share a created_at.
- **Page size:** `limit` default 25, max 100. Out-of-range values are rejected by the zod schema (limit > 100 → invalid_input), then clamped at the handler layer via `clampLimit(...)` (defense in depth).
- **Cursor:** opaque `base64(JSON({created_at, id}))`. Returned as `nextCursor` only when an extra row beyond `limit` was fetched. Decoded via `decodeCursor` which returns `null` on any malformed input instead of throwing.
- **Continuation SQL:** `WHERE (created_at, id) < (cursor.created_at, cursor.id)` expressed via PostgREST's `.or('created_at.lt.X,and(created_at.eq.X,id.lt."Y")')` filter.

### Scope-Gate Behavior

Every `tools/call` invocation passes through `requireScope(auth, 'mcp:read')` before touching the database. A token missing `mcp:read` throws an `McpError` with `code: -32603` and `data: { kind: 'insufficient_scope' }`. The SDK serializes that to the JSON-RPC client. `tools/list` is NOT scope-gated — clients need to see the catalog before they can request a specific scope.

### Tenant Isolation

Every single query in `lib/mcp/tools/read.ts` includes `.eq('company_id', auth.company_id)`:

- `estimates` — direct filter; for `list_estimates` with `client_id`, an extra projects query also filters by company_id before the IN clause.
- `estimate_sections` / `estimate_items` — accessed only after the parent estimate was confirmed to belong to `auth.company_id` (defense-in-depth recheck before serializing).
- `clients` — direct filter.
- `projects` — direct filter plus `is('archived_at', null)` + `is('deleted_at', null)` to match the existing list-page semantics.

### Helpers

- **`lib/mcp/pagination.ts`** — `encodeCursor`, `decodeCursor`, `clampLimit`. Pure functions, no I/O, fully unit-tested.
- **`lib/mcp/errors.ts`** — `mcpToolError(kind, message)` returns an `McpError` with the application-level kind in `data`. `invalidInput`, `notFound`, `insufficientScope` are thin wrappers for the three most common cases.

### Test Coverage

`npx vitest run tests/unit/mcp-pagination.test.ts tests/unit/mcp-read-tools.test.ts tests/unit/mcp-server-registration.test.ts` → **45 / 45 passing**.

- **`mcp-pagination.test.ts` (15 tests):** round-trip, base64 shape (no raw braces), payload key presence, malformed-base64 returns null, valid-base64-non-JSON returns null, missing fields return null, non-string fields return null, undefined/null/empty input returns null; `clampLimit` default / clamp / negative / fractional behavior.
- **`mcp-read-tools.test.ts` (27 tests):** all 4 tools registered, annotations carry `readOnlyHint=true` / `destructiveHint=false` / `idempotentHint=true`, input schemas reject `limit > 100`, `get_estimate` requires `id`, `list_clients` rejects fractional limits, every handler scopes its query to `auth.company_id`, `list_projects` excludes archived + trashed rows, pagination omits `nextCursor` on the last page and emits it pointing at the last returned row when more exist, decoded cursor flows through to the `or()` filter, malformed cursor is silently ignored, `mcp:read`-less auth throws `insufficient_scope`, unknown tool name throws `invalid_input`, `tools/list` returns all 4 tools, `get_estimate` returns full sections+items on success and `not_found` on missing.
- **`mcp-server-registration.test.ts` (3 tests):** static-source grep — `lib/mcp/server.ts` imports `registerReadTools` from `./tools/read` and calls `registerReadTools(server, authContext)` inside `createMcpServer`.

Phase 87's 21 tests still pass (`mcp-auth.test.ts` + `mcp-scope.test.ts` + `mcp-route-contract.test.ts`). `npx tsc --noEmit` clean.

## Deviations from Plan

None. The spec landed exactly as written:

- Helpers (`pagination.ts`, `errors.ts`) created.
- 4 tools registered with the exact annotation set.
- `createMcpServer` calls `registerReadTools(server, authContext)`; the Phase 89 slot is preserved as a comment.
- All 3 test files at 45 tests passing.
- No DB migrations (spec said none required).

### Auto-fixed issues

None — all dependencies (service Supabase client, `requireScope`, `McpAuthContext`) were already in place from Phases 86/87.

## Integration Points for Phase 89

Phase 89 (write tool — `create_estimate`, `check_job_status`) plugs into `lib/mcp/server.ts` the same way Phase 88 did:

```ts
// In createMcpServer(authContext):
registerReadTools(server, authContext)
registerWriteTools(server, authContext)   // ← Phase 89 adds this
```

Phase 89 should:

1. Create `lib/mcp/tools/write.ts` with a `registerWriteTools(server, auth)` export.
2. Reuse `requireScope(auth, 'mcp:write')`, `invalidInput`, `notFound`, `mcpToolError` — no need to re-add helpers.
3. Annotate write tools with `readOnlyHint: false`, `destructiveHint: true` (for `create_estimate`) or `false` (for `check_job_status`), `idempotentHint: false` (for `create_estimate`) or `true` (for `check_job_status`). Claude.ai will then surface them under a separate UI group requiring per-call approval (not a single "Always allow" toggle).
4. **Important:** `tools/list` and `tools/call` request handlers can only be registered ONCE per server. Phase 89 must extend the existing handlers in `lib/mcp/tools/read.ts` or, more cleanly, refactor the SDK call sites so both modules contribute to one `TOOL_DEFINITIONS` array and one shared dispatch switch. Recommended approach: extract `TOOL_DEFINITIONS` + the dispatch switch into a new `lib/mcp/tools/index.ts` that both `read.ts` and `write.ts` register tools INTO via a small registry pattern (Map<name, handler>), then have `registerAllTools(server, auth)` register the SDK handlers exactly once.

## Self-Check: PASSED

- `lib/mcp/pagination.ts` — FOUND
- `lib/mcp/errors.ts` — FOUND
- `lib/mcp/tools/read.ts` — FOUND
- `lib/mcp/server.ts` (modified) — FOUND
- `tests/unit/mcp-pagination.test.ts` — FOUND
- `tests/unit/mcp-read-tools.test.ts` — FOUND
- `tests/unit/mcp-server-registration.test.ts` — FOUND
- Commit `b0a145f` (pagination + errors helpers) — FOUND
- Commit `3537e8b` (read tools + server wiring) — FOUND
- Commit `7b436d4` (45 unit tests) — FOUND
- `npx tsc --noEmit` — CLEAN
- `npx vitest run` (3 new files) — 45/45 PASS
- Phase 87 tests still pass — 21/21

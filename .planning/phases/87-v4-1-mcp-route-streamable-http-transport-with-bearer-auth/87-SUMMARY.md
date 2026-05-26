---
phase: 87
plan: "—"
subsystem: mcp
tags: [mcp, oauth2, bearer-auth, claude-connector, streamable-http, transport]
dependency-graph:
  requires:
    - phase-86  # OAuth 2.0 authorization server (resolveAccessToken, /.well-known)
  provides:
    - mcp-streamable-http-endpoint
    - mcp-bearer-auth
    - mcp-scope-check-helper
    - mcp-server-factory
  affects:
    - /api/mcp
    - lib/mcp/*
tech-stack:
  added:
    - "@modelcontextprotocol/sdk@^1.29.0"
  patterns:
    - "Stateless MCP sessions per request (sessionIdGenerator: undefined, enableJsonResponse: true)"
    - "Bearer token validation via Phase 86 resolveAccessToken; sha256-hashed tokens never persisted in plaintext"
    - "RFC 9728 WWW-Authenticate header on 401 points clients at /.well-known/oauth-protected-resource so token refresh is automatic"
    - "Scope helper takes both Scope[] and space-delimited string (RFC 6749 §3.3) so DB-row scopes and resolved tokens are interchangeable"
key-files:
  created:
    - lib/mcp/auth.ts
    - lib/mcp/scope.ts
    - lib/mcp/server.ts
    - app/api/mcp/route.ts
    - tests/unit/mcp-auth.test.ts
    - tests/unit/mcp-scope.test.ts
    - tests/unit/mcp-route-contract.test.ts
  modified:
    - package.json
    - package-lock.json
decisions:
  - "Chose WebStandardStreamableHTTPServerTransport over the spec's named StreamableHTTPServerTransport. The Node.js variant expects IncomingMessage/ServerResponse, which Next.js App Router Route Handlers do not expose — they speak Fetch Request/Response. The Web Standard variant accepts a Fetch Request and returns a Fetch Response, matching the runtime exactly. Same MCP wire protocol either way."
  - "Stateless mode for the MVP: every POST instantiates a fresh Server + transport, processes one JSON-RPC message, returns the response. No SSE long-poll, no resumable streams. The MCP spec explicitly allows this minimal mode via sessionIdGenerator: undefined."
  - "enableJsonResponse: true so plain application/json comes back instead of an SSE stream — there is nothing to stream in stateless single-shot mode and Claude.ai connectors handle both shapes."
  - "AuthInfo.extra carries (user_id, company_id) so Phase 88/89 tool handlers receive the tenant scope through the SDK's RequestHandlerExtra without re-resolving the token."
  - "createMcpServer(authContext) is a factory, not a singleton — captures authContext in the closure for tool handlers and ensures fresh state per request."
  - "Wildcard CORS origin (Access-Control-Allow-Origin: *) for now. Claude.ai's connector clients send arbitrary origins (claude.ai, localhost dev tools, mcp-inspector) and the Bearer token is the actual security boundary. Tightening to an allowlist can come in Phase 90 if needed."
metrics:
  duration: "~25 minutes"
  completed: "2026-05-26"
  commits: 4
  files_created: 7
  files_modified: 2
  tests_added: 21
---

# Phase 87: v4.1 MCP Streamable HTTP Route with Bearer Auth Summary

**Production `/api/mcp` endpoint wired end-to-end: Claude.ai-issued OAuth Bearer tokens (Phase 86) are now validated, resolved to `(user_id, company_id, scope)`, and handed to a one-shot `@modelcontextprotocol/sdk` `Server` over the Streamable HTTP transport — ready for Phase 88 to register read tools and Phase 89 to register the write tool.**

## What Shipped

### Endpoint

| Method  | Path       | Purpose                                                                         |
| ------- | ---------- | ------------------------------------------------------------------------------- |
| POST    | `/api/mcp` | JSON-RPC over HTTP per MCP Streamable HTTP spec. Stateless, single request/response. |
| GET     | `/api/mcp` | 405 Method Not Allowed (stateless mode — no SSE long-poll).                     |
| OPTIONS | `/api/mcp` | CORS preflight. Allows POST + Authorization/Content-Type/Mcp-Session-Id headers from claude.ai. |

### Library

- `lib/mcp/auth.ts` — `verifyMcpRequest(req)`: extracts `Authorization: Bearer <token>`, calls Phase 86's `resolveAccessToken`, returns `{ ok, auth }` or `{ ok: false, status: 401, error: 'invalid_token', headers: { WWW-Authenticate: ... } }`. The `WWW-Authenticate` header is RFC 9728-compliant and includes `resource_metadata="${issuer}/.well-known/oauth-protected-resource"` so a Claude.ai client whose token has expired can rediscover the AS and refresh without user intervention.
- `lib/mcp/scope.ts` — `requireScope(auth, 'mcp:read' | 'mcp:write')`: returns `{ ok: true }` or `{ ok: false, status: 403, error: 'insufficient_scope' }`. Accepts both array and space-delimited string scope claims. Phase 88+ tool handlers call this before performing privileged work.
- `lib/mcp/server.ts` — `createMcpServer(authContext)`: returns a fresh `Server` instance (name: `xtimator`, version: `0.1.0`, capabilities: `{ tools: { listChanged: false } }`). **No tools registered yet** — the file documents the exact integration point for Phase 88 (read tools) and Phase 89 (write tool).

### Test Coverage

`npx vitest run tests/unit/mcp-auth.test.ts tests/unit/mcp-scope.test.ts tests/unit/mcp-route-contract.test.ts` → **21 / 21 passing**.

- `mcp-auth.test.ts` (6 tests): missing Authorization → 401, non-Bearer scheme → 401, Bearer with unresolvable token → 401, valid Bearer → ok + auth context, lowercase `bearer` accepted (RFC 6750 §2.1), `Bearer` without token → 401. Asserts `WWW-Authenticate` carries `resource_metadata` URL and `error="invalid_token"`.
- `mcp-scope.test.ts` (7 tests): grant + deny matrix across both array and string scope claim shapes. Empty scope claim denied for every required scope.
- `mcp-route-contract.test.ts` (8 tests): source-shape (POST/GET/OPTIONS exports, imports of `verifyMcpRequest`, `createMcpServer`, `StreamableHTTPServerTransport`) plus behavior (GET → 405 + `Allow: POST`, OPTIONS → 204 + CORS, POST without Bearer → 401 + `WWW-Authenticate`).

Full suite: `npx vitest run` → 1083 passing, 50 failing (all pre-existing — confirmed via `git stash`, identical counts before and after Phase 87 changes). `npx tsc --noEmit` clean.

## Deviations from Plan

### Architectural choice (documented in spec as expected)

**1. [Rule 1 - SDK API] Used `WebStandardStreamableHTTPServerTransport` instead of `StreamableHTTPServerTransport`**
- **Found during:** Task 3 (route handler)
- **Issue:** The spec named `@modelcontextprotocol/sdk/server/streamableHttp.js`'s `StreamableHTTPServerTransport`, but its `handleRequest(req: IncomingMessage, res: ServerResponse)` signature expects Node.js HTTP primitives. Next.js App Router Route Handlers only expose Fetch `Request`/`Response`.
- **Fix:** Imported `WebStandardStreamableHTTPServerTransport` from `@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js`, whose `handleRequest(req: Request): Promise<Response>` matches exactly. Same MCP wire protocol; SDK README explicitly documents this variant for "Cloudflare Workers, Deno, Bun" — Next.js Route Handlers fall in the same category.
- **Files modified:** `app/api/mcp/route.ts`
- **Spec note:** The phase spec anticipated this — "If `@modelcontextprotocol/sdk` API differs from this spec (the SDK evolves quickly), follow what the SDK actually exposes and document the deviation."

### Auto-fixed issues

None. The OAuth foundation (Phase 86) cleanly exposed everything we needed.

## Integration Points for Phase 88 / Phase 89

Phase 88 and 89 should plug their tool registrations into `lib/mcp/server.ts`. The integration point is explicitly commented:

```ts
// In lib/mcp/server.ts, inside createMcpServer(authContext):
//   registerReadTools(server, authContext)   // Phase 88 — list_estimates, get_estimate, list_clients, ...
//   registerWriteTools(server, authContext)  // Phase 89 — create_estimate
```

Each tool handler must call `requireScope(authContext, 'mcp:read' | 'mcp:write')` before performing its work and return an `insufficient_scope` JSON-RPC error if the check fails. `authContext` is captured in `createMcpServer`'s closure and contains `(client_id, user_id, company_id, scope)`.

The `AuthInfo` object passed to `transport.handleRequest` carries the same context in its `extra` field for handlers that prefer the SDK's `RequestHandlerExtra` pattern over closure capture.

## Self-Check: PASSED

- `lib/mcp/auth.ts` — FOUND
- `lib/mcp/scope.ts` — FOUND
- `lib/mcp/server.ts` — FOUND
- `app/api/mcp/route.ts` — FOUND
- `tests/unit/mcp-auth.test.ts` — FOUND
- `tests/unit/mcp-scope.test.ts` — FOUND
- `tests/unit/mcp-route-contract.test.ts` — FOUND
- Commit `fb6c0bf` (SDK dependency) — FOUND
- Commit `b98290d` (lib primitives) — FOUND
- Commit `6aff138` (route handler) — FOUND
- Commit `c2c6a21` (tests) — FOUND

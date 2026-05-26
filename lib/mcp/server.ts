// Phase 87: MCP server factory.
//
// Returns a fresh `Server` instance for each authenticated request. The auth
// context is captured in the closure so any tool handler registered by future
// phases can access (user_id, company_id, scope) without threading it through
// every call site.
//
// ─── Integration point for Phase 88 / Phase 89 ────────────────────────────────
//   Phase 87 deliberately ships a server with NO tools registered. The next two
//   phases plug them in here:
//
//     Phase 88 (read tools): list_estimates, get_estimate, list_clients, etc.
//                            All require `mcp:read` scope.
//     Phase 89 (write tool): create_estimate. Requires `mcp:write`.
//
//   Recommended pattern for those phases:
//     1. Add a `registerReadTools(server, authContext)` function in `lib/mcp/tools/read.ts`.
//     2. Add a `registerWriteTools(server, authContext)` function in `lib/mcp/tools/write.ts`.
//     3. Call them from createMcpServer() below — they have access to the same
//        captured authContext via the function parameter.
//     4. Each tool handler must call `requireScope(authContext, 'mcp:read'|'mcp:write')`
//        before performing its work and return an `insufficient_scope` JSON-RPC
//        error if the check fails.
// ──────────────────────────────────────────────────────────────────────────────

import 'server-only'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import type { McpAuthContext } from './auth'

const SERVER_NAME = 'xtimator'
const SERVER_VERSION = '0.1.0'

/**
 * Create a fresh MCP `Server` instance for the given authenticated request.
 *
 * @param authContext - resolved (client_id, user_id, company_id, scope) from the Bearer token.
 *                      Reserved for use by tool handlers in Phase 88/89 — currently unused
 *                      (no tools are registered yet).
 */
export function createMcpServer(authContext: McpAuthContext): Server {
  // authContext is captured here to make it available to tool handlers in
  // future phases. We reference it once via a void expression so TypeScript's
  // noUnusedParameters / strict mode doesn't complain in the meantime.
  void authContext

  const server = new Server(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {
          // Tool list is static for the lifetime of a session — we never push
          // a notifications/tools/list_changed event.
          listChanged: false,
        },
      },
    },
  )

  // ── tool registration goes here in Phase 88 / Phase 89 ──
  // registerReadTools(server, authContext)
  // registerWriteTools(server, authContext)

  return server
}

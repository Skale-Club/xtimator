// Phase 87/88/89: MCP server factory.
//
// Returns a fresh `Server` instance for each authenticated request. The auth
// context is captured in the closure so every tool handler can access
// (user_id, company_id, scope) without threading it through call sites.
//
// Phase 89 refactor: registration of `tools/list` + `tools/call` handlers now
// lives in `lib/mcp/tools/registry.ts` (`registerAllTools`) — `setRequestHandler`
// only accepts one handler per request schema, so read + write tools share the
// same dispatcher. `read.ts` and `write.ts` each export a `buildXTools(auth)`
// builder that returns `{ definition, handler }` entries; the registry
// concatenates them and dispatches by name.

import 'server-only'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import type { McpAuthContext } from './auth'
import { registerAllTools } from './tools/registry'

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

  // Phase 88 (4 read tools: list_estimates, get_estimate, list_clients,
  // list_projects — mcp:read) + Phase 89 (2 write/async tools: create_estimate
  // — mcp:write; check_job_status — mcp:read). Registered in one call so the
  // single tools/list + tools/call handler pair advertises and dispatches all
  // 6 tools.
  registerAllTools(server, authContext)

  return server
}

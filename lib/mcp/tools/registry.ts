// Phase 89: shared MCP tool registry.
//
// The MCP SDK's `Server.setRequestHandler(schema, handler)` accepts ONE handler
// per request schema — the second call silently overwrites the first. Phase 88
// shipped a single `registerReadTools` that owned both `tools/list` and
// `tools/call`. Phase 89 adds two write tools and needs both groups to coexist,
// so registration is centralized here.
//
// Pattern:
//   read.ts / write.ts each export a `buildXTools(auth)` builder returning an
//   array of `{ definition, handler }` pairs (the handler is closed over auth
//   and already knows which scope to require). `registerAllTools` concatenates
//   the builders' output and wires one tools/list + one tools/call handler that
//   dispatches by tool name.

import 'server-only'
import type { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import type { McpAuthContext } from '@/lib/mcp/auth'
import { invalidInput } from '@/lib/mcp/errors'
import { buildReadTools } from '@/lib/mcp/tools/read'
import { buildWriteTools } from '@/lib/mcp/tools/write'
import { buildKnowledgeQueryTools } from '@/lib/mcp/tools/knowledge-query'

/**
 * Annotation flags carried on each tool definition. MCP clients (Claude.ai)
 * use these to group tools in the UI and decide which require per-call
 * approval. Phase 88 read tools and Phase 89 write tools both populate the
 * same shape.
 */
export interface ToolAnnotations {
  readOnlyHint: boolean
  destructiveHint: boolean
  idempotentHint: boolean
  openWorldHint: boolean
  title: string
}

export interface ToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  annotations: ToolAnnotations
}

/**
 * Tool call result shape — a single `content` block of text returned to the
 * MCP client. The index signature is required so the type structurally matches
 * the SDK's broader `ServerResult` union (which carries optional `_meta`,
 * `task`, etc. that we never set).
 */
export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>
  [key: string]: unknown
}

/**
 * Builder output: a definition (advertised via tools/list) plus the per-tool
 * handler (invoked via tools/call). The handler is already closed over the
 * auth context, so the dispatcher never has to thread it through.
 */
export interface ToolDefinitionEntry {
  definition: ToolDefinition
  handler: (args: unknown) => Promise<ToolResult>
}

/**
 * Concatenate read + write + knowledge/query tool entries for this auth
 * context. Used by `registerAllTools` and exposed for tests that need the full
 * list without spinning up an MCP Server.
 */
export function buildAllTools(auth: McpAuthContext): ToolDefinitionEntry[] {
  return [
    ...buildReadTools(auth),
    ...buildWriteTools(auth),
    ...buildKnowledgeQueryTools(auth),
  ]
}

/**
 * Register the single `tools/list` and `tools/call` handler pair on the given
 * server. Dispatches `tools/call` to the matching entry's handler by name.
 *
 * Phase 89 moved this responsibility out of `read.ts` (which used to own both
 * handlers) so write tools can be advertised + dispatched on the same Server.
 */
export function registerAllTools(server: Server, auth: McpAuthContext): void {
  const entries = buildAllTools(auth)
  const byName = new Map(entries.map((e) => [e.definition.name, e] as const))

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: entries.map((e) => e.definition),
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params
    const entry = byName.get(name)
    if (!entry) throw invalidInput(`Unknown tool: ${name}`)
    return entry.handler(args)
  })
}

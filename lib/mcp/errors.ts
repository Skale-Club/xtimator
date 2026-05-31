// Phase 88: typed errors for MCP tool handlers.
//
// Tool handlers throw `McpToolError` to surface a clean JSON-RPC error back to
// the client. The SDK's `setRequestHandler` will catch the throw and serialize
// it; we use the SDK's built-in `McpError` with the JSON-RPC error code
// `InternalError` (-32603) but add an `error` discriminator in the message so
// clients (and tests) can distinguish causes — MCP itself doesn't model
// application-level errors like `insufficient_scope` or `not_found` directly.

import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js'

export type McpToolErrorKind =
  | 'invalid_input'
  | 'not_found'
  | 'insufficient_scope'
  | 'internal_error'

/**
 * Build a structured McpError carrying our application-level discriminator.
 * The `data` field carries `{ kind }` so JSON-RPC clients (and our tests) can
 * branch on the cause without parsing the message string.
 */
export function mcpToolError(kind: McpToolErrorKind, message: string): McpError {
  const code = kind === 'invalid_input' ? ErrorCode.InvalidParams : ErrorCode.InternalError
  return new McpError(code, message, { kind })
}

export function invalidInput(message: string): McpError {
  return mcpToolError('invalid_input', message)
}

export function notFound(message: string): McpError {
  return mcpToolError('not_found', message)
}

export function insufficientScope(requiredScope: string): McpError {
  return mcpToolError(
    'insufficient_scope',
    `Required scope '${requiredScope}' not granted to this token`,
  )
}

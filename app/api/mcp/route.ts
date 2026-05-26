// Phase 87: MCP Streamable HTTP endpoint.
//
// POST /api/mcp — JSON-RPC over HTTP per the MCP Streamable HTTP spec
//   (https://modelcontextprotocol.io/specification/draft/basic/transports#streamable-http).
//
// Auth: RFC 6750 Bearer tokens, validated against `oauth_access_tokens` via
//   `resolveAccessToken` (Phase 86). 401 responses carry an RFC 9728-compliant
//   `WWW-Authenticate` header pointing at `/.well-known/oauth-protected-resource`.
//
// Session model (MVP): stateless. Every request spins up a fresh `Server` +
//   `WebStandardStreamableHTTPServerTransport`, processes the JSON-RPC message,
//   and returns the response. No SSE long-poll, no resumable streams. The MCP
//   spec explicitly allows this minimal mode (`sessionIdGenerator: undefined`).
//
// Why the Web-Standard transport instead of the Node.js one named in the spec?
//   `StreamableHTTPServerTransport` from `@modelcontextprotocol/sdk/server/streamableHttp.js`
//   expects Node.js `IncomingMessage`/`ServerResponse`, which Next.js App Router
//   Route Handlers do not expose. `WebStandardStreamableHTTPServerTransport`
//   accepts a Fetch `Request` and returns a Fetch `Response` — exactly what
//   Route Handlers consume. Same wire protocol either way.

import {
  WebStandardStreamableHTTPServerTransport,
} from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { verifyMcpRequest } from '@/lib/mcp/auth'
import { createMcpServer } from '@/lib/mcp/server'

// Route handlers must run on Node (Supabase service-role client uses Node crypto / pg)
// and must NOT be statically optimized — every request resolves a token from the DB.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CORS_HEADERS: Record<string, string> = {
  // Claude.ai hosts the connector UI at claude.ai; localhost is needed for `mcp inspect` / dev.
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Mcp-Session-Id, MCP-Protocol-Version',
  'Access-Control-Max-Age': '86400',
  'Access-Control-Expose-Headers': 'WWW-Authenticate, Mcp-Session-Id',
}

function withCors(res: Response): Response {
  const headers = new Headers(res.headers)
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v)
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  })
}

function jsonError(
  status: number,
  body: { error: string; error_description?: string },
  extraHeaders?: Record<string, string>,
): Response {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'cache-control': 'no-store',
    ...CORS_HEADERS,
    ...(extraHeaders ?? {}),
  }
  return new Response(JSON.stringify(body), { status, headers })
}

/**
 * Handle a JSON-RPC MCP request. Verifies the Bearer token, spins up a
 * one-shot server + transport, and lets the SDK take it from there.
 */
export async function POST(req: Request): Promise<Response> {
  const verified = await verifyMcpRequest(req)
  if (!verified.ok) {
    return jsonError(
      verified.status,
      { error: verified.error, error_description: 'Bearer access token is missing or invalid' },
      verified.headers,
    )
  }

  const server = createMcpServer(verified.auth)
  const transport = new WebStandardStreamableHTTPServerTransport({
    // stateless: no session tracking, no SSE replay
    sessionIdGenerator: undefined,
    // Prefer plain JSON responses over SSE for simple request/response — matches
    // our stateless model where there's nothing to stream after the response.
    enableJsonResponse: true,
  })

  try {
    await server.connect(transport)
    const response = await transport.handleRequest(req, {
      authInfo: {
        token: 'opaque', // not used downstream; auth context lives in createMcpServer's closure
        clientId: verified.auth.client_id,
        scopes: verified.auth.scope,
        extra: {
          user_id: verified.auth.user_id,
          company_id: verified.auth.company_id,
        },
      },
    })
    return withCors(response)
  } finally {
    // Ensure the transport tears down its internal state even on early errors.
    await transport.close().catch(() => undefined)
    await server.close().catch(() => undefined)
  }
}

/**
 * Streamable HTTP allows GET for SSE streams, but our MVP is stateless — refuse
 * GET cleanly with 405 + Allow header per RFC 9110 §15.5.6.
 */
export async function GET(): Promise<Response> {
  return new Response(
    JSON.stringify({ error: 'method_not_allowed', error_description: 'GET is not supported by this MCP endpoint (stateless mode). Use POST.' }),
    {
      status: 405,
      headers: {
        Allow: 'POST, OPTIONS',
        'content-type': 'application/json',
        ...CORS_HEADERS,
      },
    },
  )
}

/**
 * CORS preflight. Claude.ai's browser-side connector UI sends an OPTIONS probe
 * before the cross-origin POST.
 */
export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  })
}

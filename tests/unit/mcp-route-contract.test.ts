// tests/unit/mcp-route-contract.test.ts
// Phase 87: static contract checks for the /api/mcp Route Handler.
//
// We don't try to spin up the SDK transport here (it depends on Node `http`
// internals and is exercised by integration / Claude.ai end-to-end). Instead
// we assert the shape of the route module's exports and the source it imports.

import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// The MCP route loads the SDK transport tree; under vitest fork-pool contention
// the first lazy import can exceed the default 5s. Raise to match eval harness.
vi.setConfig({ testTimeout: 15_000, hookTimeout: 15_000 })

// Stub the issuer resolver so the WWW-Authenticate header is deterministic and
// so we never reach next/headers (not available in a vitest jsdom env).
vi.mock('@/lib/oauth/issuer', () => ({
  resolveIssuer: vi.fn(async () => 'https://app.example.test'),
}))

// Stub resolveAccessToken so we never reach Supabase. All requests in this
// suite are unauthenticated (no Bearer header), so the mock is a no-op.
vi.mock('@/lib/oauth/tokens', () => ({
  resolveAccessToken: vi.fn(async () => null),
}))

const ROUTE_PATH = resolve(__dirname, '../../app/api/mcp/route.ts')
const ROUTE_SRC = readFileSync(ROUTE_PATH, 'utf8')

describe('app/api/mcp/route.ts — source contract', () => {
  it('imports verifyMcpRequest from @/lib/mcp/auth', () => {
    expect(ROUTE_SRC).toMatch(/from\s+['"]@\/lib\/mcp\/auth['"]/)
    expect(ROUTE_SRC).toContain('verifyMcpRequest')
  })

  it('imports createMcpServer from @/lib/mcp/server', () => {
    expect(ROUTE_SRC).toMatch(/from\s+['"]@\/lib\/mcp\/server['"]/)
    expect(ROUTE_SRC).toContain('createMcpServer')
  })

  it('imports a StreamableHTTPServerTransport from the MCP SDK', () => {
    // We allow either the Node.js variant or the Web Standard variant — the
    // route picks whichever fits the runtime; both implement the same wire
    // protocol per the SDK README.
    expect(ROUTE_SRC).toMatch(/StreamableHTTPServerTransport/)
    expect(ROUTE_SRC).toMatch(/@modelcontextprotocol\/sdk\/server\/(streamableHttp|webStandardStreamableHttp)\.js/)
  })

  it('exports POST, GET, and OPTIONS handlers', () => {
    expect(ROUTE_SRC).toMatch(/export\s+async\s+function\s+POST\b/)
    expect(ROUTE_SRC).toMatch(/export\s+async\s+function\s+GET\b/)
    expect(ROUTE_SRC).toMatch(/export\s+async\s+function\s+OPTIONS\b/)
  })

  it('configures CORS for cross-origin connector requests', () => {
    expect(ROUTE_SRC).toContain('Access-Control-Allow-Origin')
    expect(ROUTE_SRC).toContain('Access-Control-Allow-Methods')
    expect(ROUTE_SRC).toContain('Access-Control-Allow-Headers')
    expect(ROUTE_SRC).toMatch(/Authorization/)
  })
})

describe('app/api/mcp/route.ts — behavior', () => {
  it('GET returns 405 Method Not Allowed with Allow: POST header', async () => {
    const { GET } = await import('@/app/api/mcp/route')
    const res = await GET()
    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).toMatch(/POST/i)
  })

  it('OPTIONS returns a 204 with CORS headers', async () => {
    const { OPTIONS } = await import('@/app/api/mcp/route')
    const res = await OPTIONS()
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-methods')).toMatch(/POST/i)
    expect(res.headers.get('access-control-allow-headers')).toMatch(/Authorization/i)
  })

  it('POST without Authorization returns 401 with WWW-Authenticate', async () => {
    const { POST } = await import('@/app/api/mcp/route')
    const req = new Request('https://app.example.test/api/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'ping', id: 1 }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toMatch(/^Bearer /)
    expect(res.headers.get('www-authenticate')).toContain('resource_metadata=')
  })
})

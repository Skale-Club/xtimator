// tests/unit/mcp-auth.test.ts
// Phase 87: Bearer-token extraction + resolution for the /api/mcp endpoint.
//
// We mock `resolveAccessToken` directly so we never touch Supabase. We also
// stub the issuer resolver so the WWW-Authenticate header has a deterministic
// resource_metadata URL regardless of the test env.

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/oauth/issuer', () => ({
  resolveIssuer: vi.fn(async () => 'https://app.example.test'),
}))

const resolveAccessTokenMock = vi.fn()
vi.mock('@/lib/oauth/tokens', () => ({
  resolveAccessToken: (...args: unknown[]) => resolveAccessTokenMock(...args),
}))

import { verifyMcpRequest } from '@/lib/mcp/auth'

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request('https://app.example.test/api/mcp', {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', method: 'ping', id: 1 }),
  })
}

describe('verifyMcpRequest', () => {
  beforeEach(() => {
    resolveAccessTokenMock.mockReset()
  })

  it('rejects with 401 + WWW-Authenticate when Authorization header is missing', async () => {
    const result = await verifyMcpRequest(makeRequest())
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(401)
    expect(result.error).toBe('invalid_token')
    expect(result.headers?.['WWW-Authenticate']).toMatch(/^Bearer /)
    expect(result.headers?.['WWW-Authenticate']).toContain(
      'resource_metadata="https://app.example.test/.well-known/oauth-protected-resource"',
    )
    expect(result.headers?.['WWW-Authenticate']).toContain('error="invalid_token"')
    expect(resolveAccessTokenMock).not.toHaveBeenCalled()
  })

  it('rejects with 401 when Authorization uses a non-Bearer scheme', async () => {
    const result = await verifyMcpRequest(
      makeRequest({ Authorization: 'Basic dXNlcjpwYXNz' }),
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(401)
    expect(result.error).toBe('invalid_token')
    expect(result.headers?.['WWW-Authenticate']).toBeDefined()
    expect(resolveAccessTokenMock).not.toHaveBeenCalled()
  })

  it('rejects with 401 when the Bearer token does not resolve', async () => {
    resolveAccessTokenMock.mockResolvedValueOnce(null)
    const result = await verifyMcpRequest(
      makeRequest({ Authorization: 'Bearer abc123def456' }),
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(401)
    expect(result.error).toBe('invalid_token')
    expect(resolveAccessTokenMock).toHaveBeenCalledWith('abc123def456')
  })

  it('returns ok + auth context when the Bearer token resolves', async () => {
    resolveAccessTokenMock.mockResolvedValueOnce({
      client_id: 'client-1',
      user_id: 'user-1',
      company_id: 'company-1',
      scope: ['mcp:read', 'mcp:write'],
    })
    const result = await verifyMcpRequest(
      makeRequest({ Authorization: 'Bearer the-token' }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.auth).toEqual({
      client_id: 'client-1',
      user_id: 'user-1',
      company_id: 'company-1',
      scope: ['mcp:read', 'mcp:write'],
    })
    expect(resolveAccessTokenMock).toHaveBeenCalledWith('the-token')
  })

  it('accepts lowercase "bearer" scheme per RFC 6750 §2.1 (case-insensitive)', async () => {
    resolveAccessTokenMock.mockResolvedValueOnce({
      client_id: 'c', user_id: 'u', company_id: 'co', scope: ['mcp:read'],
    })
    const result = await verifyMcpRequest(makeRequest({ Authorization: 'bearer xyz' }))
    expect(result.ok).toBe(true)
  })

  it('rejects malformed "Bearer" header without a token', async () => {
    const result = await verifyMcpRequest(makeRequest({ Authorization: 'Bearer' }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(401)
    expect(resolveAccessTokenMock).not.toHaveBeenCalled()
  })
})

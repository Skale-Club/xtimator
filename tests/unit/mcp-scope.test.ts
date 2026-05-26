// tests/unit/mcp-scope.test.ts
// Phase 87: scope-check helper used by Phase 88/89 tool handlers.

import { describe, it, expect } from 'vitest'
import { requireScope, type AuthContext } from '@/lib/mcp/scope'

function ctx(scope: AuthContext['scope']): AuthContext {
  return {
    client_id: 'c',
    user_id: 'u',
    company_id: 'co',
    scope,
  }
}

describe('requireScope', () => {
  it('grants when required scope is present in array form', () => {
    const result = requireScope(ctx(['mcp:read', 'mcp:write']), 'mcp:read')
    expect(result.ok).toBe(true)
  })

  it('grants mcp:write when the token has both scopes', () => {
    const result = requireScope(ctx(['mcp:read', 'mcp:write']), 'mcp:write')
    expect(result.ok).toBe(true)
  })

  it('denies mcp:write when the token only carries mcp:read', () => {
    const result = requireScope(ctx(['mcp:read']), 'mcp:write')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(403)
    expect(result.error).toBe('insufficient_scope')
    expect(result.message).toContain('mcp:write')
  })

  it('denies any required scope when the scope claim is empty', () => {
    const empty = requireScope(ctx([]), 'mcp:read')
    expect(empty.ok).toBe(false)
    if (empty.ok) return
    expect(empty.status).toBe(403)
    expect(empty.error).toBe('insufficient_scope')
  })

  it('accepts a space-delimited string scope claim', () => {
    const result = requireScope(ctx('mcp:read mcp:write'), 'mcp:write')
    expect(result.ok).toBe(true)
  })

  it('denies when a string scope claim is missing the required value', () => {
    const result = requireScope(ctx('mcp:read'), 'mcp:write')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(403)
    expect(result.error).toBe('insufficient_scope')
  })

  it('denies when the string scope claim is empty', () => {
    const result = requireScope(ctx(''), 'mcp:read')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('insufficient_scope')
  })
})

// tests/unit/oauth-register.test.ts
// Phase 86: RFC 7591 Dynamic Client Registration — validation tests for the pure
// validateRegistrationPayload function (no Supabase round-trip).

import { describe, it, expect } from 'vitest'
import { validateRegistrationPayload } from '@/lib/oauth/clients'

describe('validateRegistrationPayload', () => {
  it('accepts a minimal Claude-style registration body', () => {
    const result = validateRegistrationPayload({
      client_name: 'Claude',
      redirect_uris: ['https://claude.ai/api/mcp/callback/abc'],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.client_name).toBe('Claude')
      expect(result.data.redirect_uris).toEqual(['https://claude.ai/api/mcp/callback/abc'])
      expect(result.data.grant_types).toEqual(['authorization_code', 'refresh_token'])
    }
  })

  it('defaults grant_types and response_types when omitted', () => {
    const result = validateRegistrationPayload({
      redirect_uris: ['https://example.com/cb'],
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.grant_types).toEqual(['authorization_code', 'refresh_token'])
      expect(result.data.response_types).toEqual(['code'])
      expect(result.data.token_endpoint_auth_method).toBe('none')
      expect(result.data.client_name).toBe('MCP Client')
    }
  })

  it('rejects when redirect_uris is missing', () => {
    const result = validateRegistrationPayload({ client_name: 'X' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid_redirect_uri')
  })

  it('rejects when redirect_uris is empty', () => {
    const result = validateRegistrationPayload({ redirect_uris: [] })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid_redirect_uri')
  })

  it('rejects non-http(s) redirect URIs', () => {
    const result = validateRegistrationPayload({
      redirect_uris: ['javascript:alert(1)'],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid_redirect_uri')
  })

  it('rejects malformed redirect URIs', () => {
    const result = validateRegistrationPayload({
      redirect_uris: ['not a url'],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid_redirect_uri')
  })

  it('rejects unsupported grant_types', () => {
    const result = validateRegistrationPayload({
      redirect_uris: ['https://example.com/cb'],
      grant_types: ['client_credentials'],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid_client_metadata')
  })

  it('rejects unsupported response_types', () => {
    const result = validateRegistrationPayload({
      redirect_uris: ['https://example.com/cb'],
      response_types: ['token'],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid_client_metadata')
  })

  it('rejects non-"none" token_endpoint_auth_method (public client only)', () => {
    const result = validateRegistrationPayload({
      redirect_uris: ['https://example.com/cb'],
      token_endpoint_auth_method: 'client_secret_post',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid_client_metadata')
  })

  it('rejects redirect_uris that is not an array', () => {
    const result = validateRegistrationPayload({ redirect_uris: 'https://example.com/cb' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid_redirect_uri')
  })

  it('rejects redirect_uris containing non-string entries', () => {
    const result = validateRegistrationPayload({
      redirect_uris: ['https://example.com/cb', 42],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid_redirect_uri')
  })
})

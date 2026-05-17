import { describe, it, expect, beforeAll } from 'vitest'

/**
 * Wave 0 RED tests for the HMAC-signed OAuth state helpers used by the Stripe
 * Connect authorization flow (Plan 70-01 ships the implementation that turns
 * these green; Plan 70-02 consumes them in the OAuth route handlers).
 *
 * The state encodes `companyId.nonce.timestamp.signature` so that a callback
 * handler can verify the round-trip without server-side storage:
 *   - tampering with any segment invalidates the signature
 *   - states older than 10 minutes are rejected (OAuth code itself expires in 5)
 *   - states issued for a different companyId are rejected
 */

// APP_ENCRYPTION_KEY is required by the helpers under test. Use a deterministic
// 32-byte (base64-encoded) value so HMAC outputs are stable across the suite.
beforeAll(() => {
  if (!process.env.APP_ENCRYPTION_KEY) {
    // 32 zero bytes base64-encoded — only used inside this test process.
    process.env.APP_ENCRYPTION_KEY =
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
  }
})

describe('connect-oauth state helpers', () => {
  it('round-trips a freshly minted state for the same companyId', async () => {
    const { mintOAuthState, verifyOAuthState } = await import(
      '@/lib/billing/connect-oauth'
    )
    const state = mintOAuthState('company_abc')
    expect(verifyOAuthState(state, 'company_abc')).toBe(true)
  })

  it('rejects a state whose signature has been tampered with', async () => {
    const { mintOAuthState, verifyOAuthState } = await import(
      '@/lib/billing/connect-oauth'
    )
    const state = mintOAuthState('company_abc')
    // Flip a character in the trailing signature segment.
    const parts = state.split('.')
    const lastChar = parts[3].slice(-1)
    parts[3] = parts[3].slice(0, -1) + (lastChar === 'A' ? 'B' : 'A')
    const tampered = parts.join('.')
    expect(verifyOAuthState(tampered, 'company_abc')).toBe(false)
  })

  it('rejects a state older than the 10-minute TTL', async () => {
    const { verifyOAuthState } = await import('@/lib/billing/connect-oauth')
    const { createHmac } = await import('node:crypto')
    // Hand-craft a state with a 20-minute-old timestamp using the same secret.
    const oldTs = (Date.now() - 20 * 60_000).toString()
    const payload = `company_abc.deadbeefdeadbeef.${oldTs}`
    const sig = createHmac('sha256', process.env.APP_ENCRYPTION_KEY!)
      .update(payload)
      .digest('base64url')
    expect(verifyOAuthState(`${payload}.${sig}`, 'company_abc')).toBe(false)
  })

  it('rejects a state issued for a different companyId', async () => {
    const { mintOAuthState, verifyOAuthState } = await import(
      '@/lib/billing/connect-oauth'
    )
    const state = mintOAuthState('company_abc')
    expect(verifyOAuthState(state, 'company_xyz')).toBe(false)
  })
})

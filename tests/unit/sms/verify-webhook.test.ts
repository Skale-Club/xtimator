import { describe, it, expect } from 'vitest'
import { verifyTwilioSignature } from '@/lib/sms/verify-webhook'

/**
 * Phase 176 plan 02 — Task 1 TDD tests for verifyTwilioSignature (CUST-03).
 *
 * Twilio signs HMAC-SHA1 over (full URL + alphabetically-sorted-by-key,
 * concatenated `key+value` POST params) — NOT the WhatsApp HMAC-SHA256
 * raw-body pattern in lib/whatsapp/verify.ts. This is a completely
 * different construction (Pitfall B, 176-RESEARCH.md).
 *
 * Test vector below was independently re-derived via `node -e` against
 * Node's own crypto.createHmac('sha1', ...).update(...).digest('base64')
 * — not copy-pasted from any external doc. See PLAN.md task 1 <behavior>.
 */

const authToken = 'test_auth_token_12345'
const url = 'https://xtimator.example.com/api/webhooks/twilio'
const params = {
  Body: 'STOP',
  From: '+15551234567',
  To: '+15559876543',
  MessageSid: 'SM1234567890abcdef1234567890abcdef',
}
const expectedSignature = 'eCuyHtyg3a75b82UK9L9Gj7IcfQ='

describe('lib/sms/verify-webhook — verifyTwilioSignature() (CUST-03)', () => {
  it('Test 1: valid signature over the exact test vector returns true', () => {
    expect(verifyTwilioSignature(url, params, expectedSignature, authToken)).toBe(true)
  })

  it('Test 2: tampered param value (Body changed) returns false', () => {
    const tampered = { ...params, Body: 'START' }
    expect(verifyTwilioSignature(url, tampered, expectedSignature, authToken)).toBe(false)
  })

  it('Test 3: mangled signature string (one character changed) returns false', () => {
    const mangled = 'XCuyHtyg3a75b82UK9L9Gj7IcfQ='
    expect(verifyTwilioSignature(url, params, mangled, authToken)).toBe(false)
  })

  it('Test 4: null signature returns false without throwing', () => {
    expect(() => verifyTwilioSignature(url, params, null, authToken)).not.toThrow()
    expect(verifyTwilioSignature(url, params, null, authToken)).toBe(false)
  })

  it('Test 5: signature not valid base64 / wrong length returns false (timingSafeEqual throw caught)', () => {
    expect(() => verifyTwilioSignature(url, params, 'not-valid-base64-!!!', authToken)).not.toThrow()
    expect(verifyTwilioSignature(url, params, 'not-valid-base64-!!!', authToken)).toBe(false)
    expect(verifyTwilioSignature(url, params, 'short', authToken)).toBe(false)
  })

  it('Test 6: params out of alphabetical insertion order still verifies (implementation sorts, not caller)', () => {
    const outOfOrder = {
      To: '+15559876543',
      Body: 'STOP',
      MessageSid: 'SM1234567890abcdef1234567890abcdef',
      From: '+15551234567',
    }
    expect(verifyTwilioSignature(url, outOfOrder, expectedSignature, authToken)).toBe(true)
  })
})

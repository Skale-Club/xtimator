import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'

// Import before implementation exists — will fail RED
import { verifyWebhookSignature } from '@/lib/whatsapp/verify'

function makeSignature(body: string, secret: string): string {
  const hex = createHmac('sha256', secret).update(body).digest('hex')
  return `sha256=${hex}`
}

describe('verifyWebhookSignature', () => {
  const secret = 'test-app-secret'
  const body = '{"entry":[{"id":"123"}]}'

  it('returns true for a correctly signed payload', () => {
    const sig = makeSignature(body, secret)
    expect(verifyWebhookSignature(body, sig, secret)).toBe(true)
  })

  it('returns false for a tampered body', () => {
    const sig = makeSignature(body, secret)
    expect(verifyWebhookSignature('tampered-body', sig, secret)).toBe(false)
  })

  it('returns false when signature prefix is not sha256=', () => {
    expect(verifyWebhookSignature(body, 'md5=abc123', secret)).toBe(false)
  })

  it('returns false when signature is null', () => {
    expect(verifyWebhookSignature(body, null, secret)).toBe(false)
  })

  it('returns false when hex length mismatches (timingSafeEqual throws)', () => {
    // 'abc' is only 3 hex chars — not 64 — so buffers differ in length
    expect(verifyWebhookSignature(body, 'sha256=abc', secret)).toBe(false)
  })
})

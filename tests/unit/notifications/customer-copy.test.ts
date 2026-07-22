import { describe, it, expect } from 'vitest'
import { buildCustomerCopy } from '@/lib/notifications/customer-copy'

/**
 * Phase 177 plan 05 (CUST-01) — buildCustomerCopy() built-in fallback copy
 * for end-customer (client-facing) sms/email sends. This is the safety-net
 * that resolveCustomerCopy() (Task 2) degrades to whenever no DB-stored
 * scope='customer' template exists — so it must never throw and never
 * render a raw '{{' token, 'undefined', or 'null' into the output.
 */

describe('lib/notifications/customer-copy — buildCustomerCopy() (CUST-01)', () => {
  it('sms channel body contains both the business name and the URL, no {{ tokens leaked', () => {
    const copy = buildCustomerCopy('estimate.sent', 'sms', {
      businessName: 'Joe Plumbing',
      shareUrl: 'https://x.io/e/1',
    })

    expect(copy.body).toContain('Joe Plumbing')
    expect(copy.body).toContain('https://x.io/e/1')
    expect(copy.body).not.toContain('{{')
    expect(copy.subject).toBeUndefined()
  })

  it('email channel returns a non-empty subject AND a non-empty body', () => {
    const copy = buildCustomerCopy('estimate.sent', 'email', {
      businessName: 'Joe Plumbing',
      clientName: 'Alice',
      shareUrl: 'https://x.io/e/1',
    })

    expect(copy.subject).toBeTruthy()
    expect(copy.body).toBeTruthy()
    expect(copy.body).toContain('Joe Plumbing')
    expect(copy.body).toContain('https://x.io/e/1')
  })

  it('missing businessName/shareUrl never throws and never renders a literal undefined/null', () => {
    expect(() => buildCustomerCopy('estimate.sent', 'sms', {})).not.toThrow()

    const sms = buildCustomerCopy('estimate.sent', 'sms', {})
    expect(sms.body).not.toContain('undefined')
    expect(sms.body).not.toContain('null')

    const email = buildCustomerCopy('estimate.sent', 'email', {})
    expect(email.body).not.toContain('undefined')
    expect(email.body).not.toContain('null')
    expect(email.subject).not.toContain('undefined')
    expect(email.subject).not.toContain('null')
  })

  it('clientName present -> email greeting includes it', () => {
    const copy = buildCustomerCopy('estimate.sent', 'email', {
      businessName: 'Joe Plumbing',
      clientName: 'Alice',
      shareUrl: 'https://x.io/e/1',
    })

    expect(copy.body).toContain('Hi Alice,')
  })

  it('clientName absent -> generic greeting, no "Hi ," artifact', () => {
    const copy = buildCustomerCopy('estimate.sent', 'email', {
      businessName: 'Joe Plumbing',
      shareUrl: 'https://x.io/e/1',
    })

    expect(copy.body).not.toContain('Hi ,')
    expect(copy.body).toContain('Hi,')
  })
})

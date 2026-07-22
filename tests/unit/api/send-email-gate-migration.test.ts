// Quick task 260722-9sb: source-level regression proof that the legacy
// send-by-email route has been migrated onto the customer-send gate and the
// shared customer-send funnel. Mirrors the convention established in
// send-sms-gate-migration.test.ts for the SMS twin.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

describe('legacy send (email) route migrated onto the customer-send gate', () => {
  const source = readFileSync('app/api/estimates/[id]/send/route.ts', 'utf8')

  it('calls assertSendAllowed before any send', () => {
    expect(source).toMatch(/assertSendAllowed/)
  })
  it('dispatches via sendCustomerMessage, not a direct Resend call', () => {
    expect(source).toMatch(/sendCustomerMessage/)
    expect(source).not.toMatch(/from 'resend'/)
  })
  it("validates the destination email against the client's on-file email", () => {
    expect(source).toMatch(/toNormalized|email on file/)
  })
  it('no longer uses the bare-branded emailFrom sender helper', () => {
    expect(source).not.toMatch(/from '@\/lib\/email\/sender'/)
  })
})

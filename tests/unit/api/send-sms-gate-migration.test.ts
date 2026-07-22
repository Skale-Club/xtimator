// Phase 177 Plan 07 (CUST-02/05): source-level regression proof that the
// legacy send-sms route has been migrated onto the customer-send gate and
// the dedicated Messaging Service path. Mirrors the static source-assertion
// convention already established in send-sms-format-fallback.test.ts for
// this same route -- a full request/response integration harness for this
// route does not exist today and building one is out of scope for this plan.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

describe('Phase 177 (CUST-02/05): legacy send-sms route migrated onto the gate', () => {
  const source = readFileSync('app/api/estimates/[id]/send-sms/route.ts', 'utf8')

  it('calls assertSendAllowed before any send', () => {
    expect(source).toMatch(/assertSendAllowed/)
  })
  it('dispatches via sendCustomerMessage, not the bare sendSms primitive', () => {
    expect(source).toMatch(/sendCustomerMessage/)
    expect(source).not.toMatch(/from '@\/lib\/sms\/client'/)
  })
  it('validates the destination number against the client\'s on-file phone_normalized', () => {
    expect(source).toMatch(/phone_normalized/)
  })
  it('reads the dedicated customer Messaging Service config, not the shared getTwilioConfig', () => {
    expect(source).toMatch(/getTwilioCustomerMessagingConfig/)
    expect(source).not.toMatch(/getTwilioConfig\b/)
  })
})

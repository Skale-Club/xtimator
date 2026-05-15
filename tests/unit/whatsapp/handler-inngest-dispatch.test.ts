import { describe, it, expect } from 'vitest'

/**
 * INNGEST-07: lib/whatsapp/handler.ts dispatches via Inngest (Wave 0 RED stub).
 *
 * Today, processInboundMessage runs Whisper + Vision + estimate generation
 * inline. Plan 67-04 refactors it into a dispatcher. Contract:
 *   - no longer awaits Whisper inline (no fetch to api.openai.com)
 *   - no longer awaits Anthropic Vision inline (no Anthropic SDK call)
 *   - calls inngest.send() with name 'whatsapp/process.requested' for inbound batches
 *
 * Note: the existing handler.test.ts (which tests inline behavior) will be
 * updated/replaced as part of Plan 67-04 once the refactor lands.
 */
describe('INNGEST-07: lib/whatsapp/handler dispatch', () => {
  it('processInboundMessages no longer awaits Whisper inline (no fetch to api.openai.com)', () => {
    expect.fail('not implemented — Wave 1 (Plan 67-04) refactors handler to dispatch')
  })

  it('processInboundMessages no longer awaits Anthropic Vision inline (no Anthropic SDK call)', () => {
    expect.fail('not implemented — Wave 1 (Plan 67-04) refactors handler to dispatch')
  })

  it('processInboundMessages calls inngest.send() with name "whatsapp/process.requested" for inbound batches', () => {
    expect.fail('not implemented — Wave 1 (Plan 67-04) refactors handler to dispatch')
  })
})

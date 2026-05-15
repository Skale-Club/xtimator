import { describe, it, expect } from 'vitest'

/**
 * INNGEST-07: whatsAppProcessJob (Wave 0 RED stub).
 *
 * Plan 67-04 delivers lib/inngest/functions/whatsapp-process.ts. Contract:
 *   - createFunction id = 'whatsapp-process'
 *   - idempotency CEL = 'event.data.batchKey' (deduped across debounced batches)
 *   - At least 3 step.run blocks: per-message processing + generate-estimate + confirm
 */
describe('INNGEST-07: whatsAppProcessJob', () => {
  it('is created with id "whatsapp-process" and idempotency: "event.data.batchKey"', () => {
    expect.fail('not implemented — Wave 1 (Plan 67-04) delivers whatsAppProcessJob')
  })

  it('function body has at least 3 step.run blocks: per-message processing + generate-estimate + confirm', () => {
    expect.fail('not implemented — Wave 1 (Plan 67-04) delivers whatsAppProcessJob')
  })
})

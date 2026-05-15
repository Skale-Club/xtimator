import { describe, it, expect } from 'vitest'

/**
 * INNGEST-04 + INNGEST-06: analyzePhotosJob (Wave 0 RED stub).
 *
 * Plan 67-03 delivers lib/inngest/functions/analyze-photos.ts. Contract:
 *   - createFunction id = 'analyze-photos'
 *   - idempotency CEL = 'event.data.requestId'
 *   - One step.run per photo (id pattern `vision-${photoId}`) — independently retriable
 *   - recordUsage wrapped in a final step.run('record-usage', ...)
 */
describe('INNGEST-04 + INNGEST-06: analyzePhotosJob', () => {
  it('is created with id "analyze-photos" and idempotency: "event.data.requestId"', () => {
    expect.fail('not implemented — Wave 1 (Plan 67-03) delivers analyzePhotosJob')
  })

  it('function body issues ONE step.run per photo (id pattern `vision-${photoId}`)', () => {
    expect.fail('not implemented — Wave 1 (Plan 67-03) delivers analyzePhotosJob')
  })

  it('function body wraps recordUsage in a final step.run("record-usage", ...)', () => {
    expect.fail('not implemented — Wave 1 (Plan 67-03) delivers analyzePhotosJob')
  })
})

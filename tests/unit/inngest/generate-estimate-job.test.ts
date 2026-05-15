import { describe, it, expect } from 'vitest'

/**
 * INNGEST-02 + INNGEST-06: generateEstimateJob (Wave 0 RED stub).
 *
 * Plan 67-02 delivers lib/inngest/functions/generate-estimate.ts. Contract:
 *   - createFunction id = 'generate-estimate'
 *   - idempotency CEL = 'event.data.requestId'
 *   - generateEstimateForProject is wrapped in step.run('call-ai-provider', ...)
 *   - recordUsage is wrapped in a SEPARATE step.run('record-usage', ...)
 *
 * Why split? A DB-write failure must NOT re-charge Anthropic. Splitting steps
 * makes each independently retriable.
 */
describe('INNGEST-02 + INNGEST-06: generateEstimateJob', () => {
  it('is created with id "generate-estimate" and idempotency: "event.data.requestId"', () => {
    expect.fail('not implemented — Wave 1 (Plan 67-02) delivers generateEstimateJob')
  })

  it('function body wraps generateEstimateForProject in step.run("call-ai-provider", ...)', () => {
    expect.fail('not implemented — Wave 1 (Plan 67-02) delivers generateEstimateJob')
  })

  it('function body wraps recordUsage in a SEPARATE step.run("record-usage", ...) so DB retries do not re-call AI', () => {
    expect.fail('not implemented — Wave 1 (Plan 67-02) delivers generateEstimateJob')
  })
})

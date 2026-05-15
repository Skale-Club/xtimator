import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { generateEstimateJob } from '@/lib/inngest/functions/generate-estimate'

/**
 * INNGEST-02 + INNGEST-06: generateEstimateJob (Wave 1 GREEN).
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

type FnInternals = {
  opts: {
    id: string
    idempotency?: string
    retries?: number
    triggers?: Array<{ event?: string }>
  }
}

describe('INNGEST-02 + INNGEST-06: generateEstimateJob', () => {
  it('is created with id "generate-estimate" and idempotency: "event.data.requestId"', () => {
    const fn = generateEstimateJob as unknown as FnInternals
    expect(fn.opts.id).toBe('generate-estimate')
    expect(fn.opts.idempotency).toBe('event.data.requestId')
    expect(fn.opts.retries).toBe(2)
  })

  it('function body wraps generateEstimateForProject in step.run("call-ai-provider", ...)', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'lib/inngest/functions/generate-estimate.ts'),
      'utf8'
    )
    expect(src).toMatch(/step\.run\(['"]call-ai-provider['"]/)
    expect(src).toMatch(/generateEstimateForProject\s*\(/)
    // generateEstimateForProject must appear AFTER the call-ai-provider step.run
    const stepIdx = src.indexOf("'call-ai-provider'")
    const callIdx = src.indexOf('generateEstimateForProject(')
    // The .indexOf for the import statement does not match the call — confirm
    // the call appears after the step.run id token.
    expect(callIdx).toBeGreaterThan(stepIdx)
  })

  it('function body wraps recordUsage in a SEPARATE step.run("record-usage", ...) so DB retries do not re-call AI', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'lib/inngest/functions/generate-estimate.ts'),
      'utf8'
    )
    expect(src).toMatch(/step\.run\(['"]record-usage['"]/)
    expect(src).toMatch(/recordUsage\s*\(/)
    // Both step.run blocks must exist (>= 2 step.run calls)
    const stepRunCount = (src.match(/step\.run\(/g) ?? []).length
    expect(stepRunCount).toBeGreaterThanOrEqual(2)
  })
})

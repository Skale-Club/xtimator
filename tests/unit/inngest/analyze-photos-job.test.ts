import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { analyzePhotosJob } from '@/lib/inngest/functions/analyze-photos'

/**
 * INNGEST-04 + INNGEST-06: analyzePhotosJob (Wave 1 GREEN).
 *
 * Plan 67-02 delivers lib/inngest/functions/analyze-photos.ts. Contract:
 *   - createFunction id = 'analyze-photos'
 *   - idempotency CEL = 'event.data.requestId'
 *   - One step.run per photo (id pattern `vision-${photoId}`) — independently retriable
 *   - recordUsage wrapped in a final step.run('record-usage', ...)
 */

type FnInternals = {
  opts: {
    id: string
    idempotency?: string
    retries?: number
  }
}

describe('INNGEST-04 + INNGEST-06: analyzePhotosJob', () => {
  it('is created with id "analyze-photos" and idempotency: "event.data.requestId"', () => {
    const fn = analyzePhotosJob as unknown as FnInternals
    expect(fn.opts.id).toBe('analyze-photos')
    expect(fn.opts.idempotency).toBe('event.data.requestId')
    expect(fn.opts.retries).toBe(2)
  })

  it('function body issues ONE step.run per photo (id pattern `vision-${photoId}`)', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'lib/inngest/functions/analyze-photos.ts'),
      'utf8'
    )
    // Template-literal id with `vision-${...}` interpolation
    expect(src).toMatch(/step\.run\(`vision-\$\{[^}]+\}`/)
    // Photos array iteration
    expect(src).toMatch(/photos\.map\(/)
  })

  it('function body wraps recordUsage in a final step.run("record-usage", ...)', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'lib/inngest/functions/analyze-photos.ts'),
      'utf8'
    )
    expect(src).toMatch(/step\.run\(['"]record-usage['"]/)
    expect(src).toMatch(/recordUsage\s*\(/)
    // record-usage step appears AFTER the photos.map block (final step)
    const photosMapIdx = src.indexOf('photos.map(')
    const recordIdx = src.indexOf("'record-usage'")
    expect(recordIdx).toBeGreaterThan(photosMapIdx)
  })
})

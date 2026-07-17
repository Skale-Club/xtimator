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
 *
 * Phase 168 (PHOTO-02): the vision section was rewritten to process photos in
 * CHUNKS (`chunk.map(...)` inside a chunking loop) instead of one flat
 * `photos.map(...)` — concurrency is bounded, but every photo still gets its
 * own memoized `vision-${photoId}` step.run. The structural assertions below
 * were updated to match the chunked shape in the same commit as the rewrite.
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

  it('function body issues ONE step.run per photo (id pattern `vision-${photoId}`), chunked', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'lib/inngest/functions/analyze-photos.ts'),
      'utf8'
    )
    // Template-literal id with `vision-${...}` interpolation — a DIRECT child
    // of the handler (never nested inside its own step.run).
    expect(src).toMatch(/step\.run\(`vision-\$\{[^}]+\}`/)
    // Phase 168 (PHOTO-02): chunked iteration (`chunk.map(`) replaces the flat
    // `photos.map(` — concurrency is bounded via Promise.allSettled per chunk.
    expect(src).toMatch(/chunk\.map\(/)
    expect(src).toMatch(/Promise\.allSettled\(/)
  })

  it('function body wraps recordUsage in a final step.run("record-usage", ...)', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'lib/inngest/functions/analyze-photos.ts'),
      'utf8'
    )
    expect(src).toMatch(/step\.run\(['"]record-usage['"]/)
    expect(src).toMatch(/recordUsage\s*\(/)
    // record-usage step appears AFTER the chunked vision-analysis block (final step)
    const chunkMapIdx = src.indexOf('chunk.map(')
    const recordIdx = src.indexOf("'record-usage'")
    expect(chunkMapIdx).toBeGreaterThanOrEqual(0)
    expect(recordIdx).toBeGreaterThan(chunkMapIdx)
  })
})

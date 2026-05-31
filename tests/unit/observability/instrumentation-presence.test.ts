import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * EVENT-02 (static source read): each instrumented site calls recordPipelineEvent
 * with the expected `step` literal, plus the relevant status literals.
 *
 * RED until Wave 2/3 wires recordPipelineEvent into the 3 routes + 3 Inngest functions.
 * Static-read pattern mirrors tests/unit/inngest/transcribe-audio-job.test.ts.
 */

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

const ROUTES = {
  transcribe: 'app/api/transcribe/route.ts',
  analyze: 'app/api/analyze-photos/route.ts',
  generate: 'app/api/generate-estimate/route.ts',
} as const

const FUNCTIONS = {
  transcribe: 'lib/inngest/functions/transcribe-audio.ts',
  analyze: 'lib/inngest/functions/analyze-photos.ts',
  generate: 'lib/inngest/functions/generate-estimate.ts',
} as const

describe('EVENT-02: instrumentation presence', () => {
  it('the transcribe Inngest function records transcribe-step events', () => {
    const src = read(FUNCTIONS.transcribe)
    expect(src).toMatch(/recordPipelineEvent/)
    expect(src).toContain("'transcribe'")
  })

  it('the analyze-photos Inngest function records analyze-step events', () => {
    const src = read(FUNCTIONS.analyze)
    expect(src).toMatch(/recordPipelineEvent/)
    expect(src).toContain("'analyze'")
  })

  it('the generate-estimate Inngest function records generate_estimate + preview_redirect events', () => {
    const src = read(FUNCTIONS.generate)
    expect(src).toMatch(/recordPipelineEvent/)
    expect(src).toContain("'generate_estimate'")
    expect(src).toContain("'preview_redirect'")
  })

  it('every instrumented site emits started + succeeded + failed status literals', () => {
    const combined = [
      read(FUNCTIONS.transcribe),
      read(FUNCTIONS.analyze),
      read(FUNCTIONS.generate),
    ].join('\n')
    expect(combined).toContain("'started'")
    expect(combined).toContain("'succeeded'")
    expect(combined).toContain("'failed'")
  })

  it('the three dispatch routes thread inputType into the pipeline (entrypoint derivation, D-07)', () => {
    const transcribe = read(ROUTES.transcribe)
    const analyze = read(ROUTES.analyze)
    const generate = read(ROUTES.generate)
    expect(transcribe).toMatch(/inputType/)
    expect(analyze).toMatch(/inputType/)
    expect(generate).toMatch(/inputType/)
  })
})

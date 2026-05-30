import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * EVENT-03 (static source read): the photo + manual-text entrypoints must mint an
 * attemptId (crypto.randomUUID()) and thread attemptId + inputType through their
 * dispatch bodies; capture-recorder must tag inputType:'recording'; and
 * AnalyzePhotosPayload must declare attemptId + inputType.
 *
 * RED until Wave 3 threads the lineage. Static-read pattern.
 */

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

const PHOTOS_INPUT = 'components/projects/photos-input.tsx'
const TEXT_DESCRIBE = 'components/projects/text-describe.tsx'
const AI_INPUT_SUBMIT = 'components/workspace/ai-input-group/use-ai-input-submit.ts'
const CAPTURE_RECORDER = 'components/capture/capture-recorder.tsx'
const EVENTS = 'lib/inngest/events.ts'

describe('EVENT-03: attemptId + inputType threading', () => {
  it('photos-input mints an attemptId and sends attemptId + inputType:photo', () => {
    const src = read(PHOTOS_INPUT)
    expect(src).toMatch(/crypto\.randomUUID\(\)/)
    expect(src).toMatch(/attemptId/)
    expect(src).toContain("'photo'")
  })

  it('text-describe mints an attemptId and sends attemptId + inputType:manual_text', () => {
    const src = read(TEXT_DESCRIBE)
    expect(src).toMatch(/crypto\.randomUUID\(\)/)
    expect(src).toMatch(/attemptId/)
    expect(src).toContain("'manual_text'")
  })

  it('use-ai-input-submit mints an attemptId and threads attemptId + inputType', () => {
    const src = read(AI_INPUT_SUBMIT)
    expect(src).toMatch(/crypto\.randomUUID\(\)/)
    expect(src).toMatch(/attemptId/)
    expect(src).toMatch(/inputType/)
  })

  it('capture-recorder tags its dispatch with inputType:recording', () => {
    const src = read(CAPTURE_RECORDER)
    expect(src).toContain("'recording'")
    expect(src).toMatch(/inputType/)
  })

  it('AnalyzePhotosPayload declares attemptId and inputType', () => {
    const src = read(EVENTS)
    const match = src.match(/AnalyzePhotosPayload\s*=\s*\{[\s\S]*?\}/)
    expect(match, 'AnalyzePhotosPayload type not found').not.toBeNull()
    const block = match![0]
    expect(block).toMatch(/attemptId/)
    expect(block).toMatch(/inputType/)
  })
})

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { transcribeAudioJob } from '@/lib/inngest/functions/transcribe-audio'

/**
 * INNGEST-03 + INNGEST-06: transcribeAudioJob (Wave 1 GREEN).
 *
 * Plan 67-02 delivers lib/inngest/functions/transcribe-audio.ts. Contract:
 *   - createFunction id = 'transcribe-audio'
 *   - idempotency CEL = 'event.data.recordingId' (recording UUID is naturally unique)
 *   - Whisper fetch is wrapped in step.run('whisper-transcribe', ...)
 *   - DB update is wrapped in step.run('save-transcript', ...)
 */

type FnInternals = {
  opts: {
    id: string
    idempotency?: string
    retries?: number
  }
}

describe('INNGEST-03 + INNGEST-06: transcribeAudioJob', () => {
  it('is created with id "transcribe-audio" and idempotency: "event.data.recordingId"', () => {
    const fn = transcribeAudioJob as unknown as FnInternals
    expect(fn.opts.id).toBe('transcribe-audio')
    expect(fn.opts.idempotency).toBe('event.data.recordingId')
    expect(fn.opts.retries).toBe(2)
  })

  it('function body wraps Whisper fetch in step.run("whisper-transcribe", ...)', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'lib/inngest/functions/transcribe-audio.ts'),
      'utf8'
    )
    expect(src).toMatch(/step\.run\(['"]whisper-transcribe['"]/)
    expect(src).toMatch(/api\.openai\.com\/v1\/audio\/transcriptions/)
  })

  it('function body wraps DB update in step.run("save-transcript", ...)', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'lib/inngest/functions/transcribe-audio.ts'),
      'utf8'
    )
    expect(src).toMatch(/step\.run\(['"]save-transcript['"]/)
    expect(src).toMatch(/\.from\(['"]recordings['"]\)/)
    const stepRunCount = (src.match(/step\.run\(/g) ?? []).length
    expect(stepRunCount).toBeGreaterThanOrEqual(2)
  })
})

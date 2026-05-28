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

  it('wraps the Whisper fetch in step.run("whisper-transcribe") and delegates to the transcription client', () => {
    const jobSrc = readFileSync(
      resolve(process.cwd(), 'lib/inngest/functions/transcribe-audio.ts'),
      'utf8'
    )
    expect(jobSrc).toMatch(/step\.run\(['"]whisper-transcribe['"]/)
    // The job delegates the actual fetch to transcribeAudioOR; the endpoint
    // assertion below targets that client module, not the job.
    expect(jobSrc).toMatch(/transcribeAudioOR/)

    const clientSrc = readFileSync(
      resolve(process.cwd(), 'lib/ai/openrouter-client.ts'),
      'utf8'
    )
    // URL is built from OPENAI_TRANSCRIPTION_BASE + the path, so match the parts.
    expect(clientSrc).toMatch(/api\.openai\.com/)
    expect(clientSrc).toMatch(/\/audio\/transcriptions/)
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

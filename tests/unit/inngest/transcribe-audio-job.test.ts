import { describe, it, expect } from 'vitest'

/**
 * INNGEST-03 + INNGEST-06: transcribeAudioJob (Wave 0 RED stub).
 *
 * Plan 67-03 delivers lib/inngest/functions/transcribe-audio.ts. Contract:
 *   - createFunction id = 'transcribe-audio'
 *   - idempotency CEL = 'event.data.recordingId' (recording UUID is naturally unique)
 *   - Whisper fetch is wrapped in step.run('whisper-transcribe', ...)
 *   - DB update is wrapped in step.run('save-transcript', ...)
 */
describe('INNGEST-03 + INNGEST-06: transcribeAudioJob', () => {
  it('is created with id "transcribe-audio" and idempotency: "event.data.recordingId"', () => {
    expect.fail('not implemented — Wave 1 (Plan 67-03) delivers transcribeAudioJob')
  })

  it('function body wraps Whisper fetch in step.run("whisper-transcribe", ...)', () => {
    expect.fail('not implemented — Wave 1 (Plan 67-03) delivers transcribeAudioJob')
  })

  it('function body wraps DB update in step.run("save-transcript", ...)', () => {
    expect.fail('not implemented — Wave 1 (Plan 67-03) delivers transcribeAudioJob')
  })
})

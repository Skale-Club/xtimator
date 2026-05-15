import { describe, it, expect } from 'vitest'

/**
 * INNGEST-03: POST /api/transcribe dispatches Whisper via Inngest (Wave 0 RED stub).
 *
 * NEW route — does not exist yet. Today, Whisper transcription happens inside
 * the `transcribeRecording()` server action in lib/actions/recording.ts.
 * Plan 67-03 introduces app/api/transcribe/route.ts. Contract:
 *   - POST accepts { recordingId } and returns { jobId } in <1s
 *   - calls inngest.send() with name 'audio/transcribe.requested'
 *     and event id 'transcribe-{recordingId}' (recordingId is naturally unique)
 *   - does NOT call OpenAI Whisper directly (no fetch to api.openai.com)
 */
describe('INNGEST-03: POST /api/transcribe dispatch', () => {
  it('accepts { recordingId } and returns { jobId } in <1s', () => {
    expect.fail('not implemented — Wave 1 (Plan 67-03) creates app/api/transcribe/route.ts')
  })

  it('calls inngest.send() with name "audio/transcribe.requested" and event id "transcribe-{recordingId}"', () => {
    expect.fail('not implemented — Wave 1 (Plan 67-03) creates app/api/transcribe/route.ts')
  })

  it('does NOT call OpenAI Whisper directly (no fetch to api.openai.com)', () => {
    expect.fail('not implemented — Wave 1 (Plan 67-03) creates app/api/transcribe/route.ts')
  })
})

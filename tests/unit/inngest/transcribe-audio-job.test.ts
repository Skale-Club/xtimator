import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { transcribeAudioJob } from '@/lib/inngest/functions/transcribe-audio'

/**
 * INNGEST-03 + INNGEST-06: transcribeAudioJob (Wave 1 GREEN).
 *
 * Plan 67-02 delivers lib/inngest/functions/transcribe-audio.ts. Contract:
 *   - createFunction id = 'transcribe-audio'
 *   - Whisper fetch is wrapped in step.run('whisper-transcribe', ...)
 *   - DB update is wrapped in step.run('save-transcript', ...)
 *
 * 260707-lyq (P4) UPDATE: the function-level `idempotency: 'event.data.recordingId'`
 * config was REMOVED — it absorbed genuine user Retries for 24h, making the
 * capture popup's Retry button a universal no-op (260707-lyq audit). Dedup for
 * the FIRST dispatch now relies solely on the deterministic event id minted at
 * the dispatch site (`transcribe-${recordingId}`, lib/actions/recording.ts); a
 * real Retry changes that id via a `-r${dispatchNonce}` suffix, so Inngest
 * treats it as a genuinely new run instead of silently deduping it away.
 */

type FnInternals = {
  opts: {
    id: string
    idempotency?: string
    retries?: number
  }
}

describe('INNGEST-03 + INNGEST-06: transcribeAudioJob', () => {
  it('is created with id "transcribe-audio", retries: 2, and NO function-level idempotency (260707-lyq)', () => {
    const fn = transcribeAudioJob as unknown as FnInternals
    expect(fn.opts.id).toBe('transcribe-audio')
    expect(fn.opts.idempotency).toBeUndefined()
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

  // 260707-lyq (P4) dedup contract (supersedes the old REC-04 idempotency-config
  // contract): the recordingId-keyed function idempotency is GONE. Dedup for the
  // original dispatch now lives entirely in the deterministic event id minted at
  // the dispatch site; a genuine Retry bumps `dispatchNonce`, which changes the
  // event id and lets the run actually execute. The memoized whisper step still
  // protects a same-run retry (Inngest's own step-replay semantics) from
  // re-charging Whisper mid-run.
  it('has no function-level idempotency (removed so a nonce\'d retry can run) and still memoizes the whisper step per-run', () => {
    const fn = transcribeAudioJob as unknown as FnInternals
    expect(fn.opts.idempotency).toBeUndefined()

    const src = readFileSync(
      resolve(process.cwd(), 'lib/inngest/functions/transcribe-audio.ts'),
      'utf8'
    )
    // The paid provider call lives inside a step.run boundary, so Inngest
    // memoizes it across retries of the SAME run — an already-successful
    // transcription is never re-charged on a re-dispatch.
    expect(src).toMatch(/step\.run\(['"]whisper-transcribe['"]/)
  })
})

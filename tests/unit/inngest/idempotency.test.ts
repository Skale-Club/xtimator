import { describe, it, expect } from 'vitest'
import { generateEstimateJob } from '@/lib/inngest/functions/generate-estimate'
import { transcribeAudioJob } from '@/lib/inngest/functions/transcribe-audio'
import { analyzePhotosJob } from '@/lib/inngest/functions/analyze-photos'
import { whatsAppProcessJob } from '@/lib/inngest/functions/whatsapp-process'

/**
 * INNGEST-06: Idempotency contract across the Inngest functions (Wave 1 GREEN).
 *
 * Cross-cutting test — asserts every function-level-idempotent Inngest function
 * exports a non-empty `idempotency` CEL expression that references
 * `event.data.*`.
 *
 * 260707-lyq (P4) UPDATE: transcribeAudioJob's function-level idempotency
 * (`event.data.recordingId`) was REMOVED — it absorbed genuine user Retries for
 * 24h, making the capture popup's Retry a universal no-op. Dedup for the
 * original dispatch now relies solely on the deterministic event id minted at
 * the dispatch site; a real Retry changes that id (`-r${dispatchNonce}`) so the
 * run is no longer deduped away. transcribeAudioJob is therefore intentionally
 * excluded from the "has idempotency" contract below and covered by its own
 * negative assertion instead.
 */

type FnInternals = {
  opts: {
    id: string
    idempotency?: string
  }
}

describe('INNGEST-06: idempotency configuration across all functions', () => {
  it('generateEstimateJob, analyzePhotosJob, whatsAppProcessJob export config with a non-empty `idempotency` CEL expression', () => {
    const all = [
      generateEstimateJob,
      analyzePhotosJob,
      whatsAppProcessJob,
    ] as unknown as FnInternals[]

    expect(all).toHaveLength(3)
    for (const fn of all) {
      expect(fn.opts.idempotency).toBeDefined()
      expect(typeof fn.opts.idempotency).toBe('string')
      expect((fn.opts.idempotency as string).length).toBeGreaterThan(0)
      // Contract: idempotency keys MUST reference event.data.* fields so the
      // dispatcher can construct deterministic keys.
      expect(fn.opts.idempotency as string).toMatch(/^event\.data\./)
    }
  })

  it('transcribeAudioJob intentionally has NO function-level idempotency (260707-lyq — see module doc)', () => {
    const fn = transcribeAudioJob as unknown as FnInternals
    expect(fn.opts.id).toBe('transcribe-audio')
    expect(fn.opts.idempotency).toBeUndefined()
  })
})

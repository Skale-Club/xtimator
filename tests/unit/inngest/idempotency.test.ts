import { describe, it, expect } from 'vitest'
import { generateEstimateJob } from '@/lib/inngest/functions/generate-estimate'
import { transcribeAudioJob } from '@/lib/inngest/functions/transcribe-audio'
import { analyzePhotosJob } from '@/lib/inngest/functions/analyze-photos'
import { whatsAppProcessJob } from '@/lib/inngest/functions/whatsapp-process'

/**
 * INNGEST-06: Idempotency contract across all 4 Inngest functions (Wave 1 GREEN).
 *
 * Cross-cutting test — asserts every Inngest function exports a config with a
 * non-empty `idempotency` CEL expression that references `event.data.*`.
 */

type FnInternals = {
  opts: {
    id: string
    idempotency?: string
  }
}

describe('INNGEST-06: idempotency configuration across all functions', () => {
  it('all 4 Inngest functions export config with a non-empty `idempotency` CEL expression', () => {
    const all = [
      generateEstimateJob,
      transcribeAudioJob,
      analyzePhotosJob,
      whatsAppProcessJob,
    ] as unknown as FnInternals[]

    expect(all).toHaveLength(4)
    for (const fn of all) {
      expect(fn.opts.idempotency).toBeDefined()
      expect(typeof fn.opts.idempotency).toBe('string')
      expect((fn.opts.idempotency as string).length).toBeGreaterThan(0)
      // Contract: idempotency keys MUST reference event.data.* fields so the
      // dispatcher can construct deterministic keys.
      expect(fn.opts.idempotency as string).toMatch(/^event\.data\./)
    }
  })
})

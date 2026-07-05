import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * D2 (quick-260705-2gp) — empty-output guard on analyzePhotoOR.
 *
 * An HTTP-ok vision response with empty content is a wrapper "success"
 * (callWithFallback does NOT consult the Gemini fallback for it), so without
 * a post-wrapper guard an empty photo description flows silently into the
 * estimate prompt as zero context. The guard makes that state throw loudly.
 */

vi.mock('@/lib/platform-config', () => ({
  getIntegrationKey: vi.fn(async () => 'or-key-placeholder'),
}))
vi.mock('@/lib/observability/langfuse', () => ({
  langfuseClient: {
    generation: () => ({ end: () => {} }),
    flushAsync: async () => {},
  },
}))
vi.mock('@/lib/billing/record-ai-cost', () => ({
  recordAICost: vi.fn(async () => {}),
}))
// Defensive no-op — never reached: an empty-but-HTTP-ok primary is a wrapper
// "success", so the Gemini fallback is not consulted for it.
vi.mock('@/lib/ai/providers/gemini', () => ({
  analyzePhotoGemini: vi.fn(async () => 'gemini description'),
}))

import { analyzePhotoOR } from '@/lib/ai/openrouter-client'

describe('analyzePhotoOR — empty-output guard (D2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn() as unknown as typeof fetch
  })

  it('ok response with empty content → rejects with "Photo analysis produced no description"', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: '' } }] }),
    })

    await expect(analyzePhotoOR('aGVsbG8=', 'image/jpeg')).rejects.toThrow(
      /Photo analysis produced no description/
    )
  })

  it('non-empty content passes through unchanged', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'Kitchen with water-damaged drywall' } }],
      }),
    })

    await expect(analyzePhotoOR('aGVsbG8=', 'image/jpeg')).resolves.toBe(
      'Kitchen with water-damaged drywall'
    )
  })
})

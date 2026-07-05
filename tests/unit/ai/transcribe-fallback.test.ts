import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * Transcription = OpenRouter primary + OpenAI-direct fallback (HARD-03).
 *
 * Pins the post-migration contract:
 *   1. OpenRouter STT success → its text is returned (primary path).
 *   2. OpenRouter STT failure → OpenAI direct fallback serves the transcript
 *      (the proven pre-migration path — this migration can never regress).
 *   3. Both providers fail → throws (never silently returns empty).
 */

vi.mock('@/lib/platform-config', () => ({
  getIntegrationKey: vi.fn(),
}))
vi.mock('@/lib/observability/langfuse', () => ({
  langfuseClient: {
    generation: () => ({ end: () => {} }),
    flushAsync: async () => {},
  },
}))

import { transcribeAudioOR } from '@/lib/ai/openrouter-client'
import { getIntegrationKey } from '@/lib/platform-config'

const mockGetKey = getIntegrationKey as ReturnType<typeof vi.fn>

function makeAudio(): Blob {
  return new Blob(['x'], { type: 'audio/webm' })
}

describe('transcribeAudioOR — OpenRouter primary, OpenAI fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn() as unknown as typeof fetch
    // Both keys available by default; individual tests drive the fetch outcome.
    mockGetKey.mockImplementation(async (provider: string) =>
      provider === 'openrouter'
        ? 'or-key'
        : provider === 'openai'
          ? 'openai-key'
          : null
    )
  })

  it('primary — OpenRouter transcription success returns its text', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      expect(String(url)).toContain('openrouter.ai')
      return { ok: true, status: 200, json: async () => ({ text: 'openrouter transcript' }) }
    })

    const result = await transcribeAudioOR(makeAudio(), 'webm')
    expect(result).toBe('openrouter transcript')
  })

  it('fallback — OpenRouter fails, OpenAI direct serves the transcript', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (String(url).includes('openrouter.ai')) {
        return { ok: false, status: 500, text: async () => 'err' }
      }
      // OpenAI direct returns plain text (response_format: text).
      return { ok: true, status: 200, text: async () => 'openai transcript' }
    })

    const result = await transcribeAudioOR(makeAudio(), 'webm')
    expect(result).toBe('openai transcript')
  })

  it('both providers fail → throws (never silently empty)', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'err',
    })

    await expect(transcribeAudioOR(makeAudio(), 'webm')).rejects.toBeTruthy()
  })

  it('empty transcript — OpenRouter ok with { text: "" } → throws instead of saving empty (D1)', async () => {
    // An empty-but-HTTP-ok primary response is a wrapper "success": the OpenAI
    // fallback is NOT consulted. The post-wrapper guard must throw loudly so the
    // Inngest onFailure path surfaces a clear message instead of a silent empty
    // save + credit charge.
    ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      expect(String(url)).toContain('openrouter.ai')
      return { ok: true, status: 200, json: async () => ({ text: '' }) }
    })

    await expect(transcribeAudioOR(makeAudio(), 'webm')).rejects.toThrow(
      /Transcription produced no text/
    )
  })
})

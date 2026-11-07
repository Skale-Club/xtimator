import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * Transcription = OpenRouter ONLY (owner rule: no direct OpenAI fallback).
 *
 *   1. OpenRouter STT success -> its text is returned.
 *   2. OpenRouter STT failure -> throws ProvidersUnavailableError and NEVER
 *      calls api.openai.com, even when an OpenAI key is configured.
 *   3. Empty transcript -> throws (never silently returns empty).
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
import { ProvidersUnavailableError } from '@/lib/ai/with-fallback'

const mockGetKey = getIntegrationKey as ReturnType<typeof vi.fn>

function makeAudio(): Blob {
  return new Blob(['x'], { type: 'audio/webm' })
}

describe('transcribeAudioOR — OpenRouter only', () => {
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
    expect(result).toEqual({ text: 'openrouter transcript', servedBy: 'primary' })
  })

  it('OpenRouter fails -> throws ProvidersUnavailableError and NEVER calls api.openai.com', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (String(url).includes('openrouter.ai')) {
        return { ok: false, status: 500, text: async () => 'err' }
      }
      return { ok: true, status: 200, text: async () => 'openai transcript' }
    })

    await expect(transcribeAudioOR(makeAudio(), 'webm')).rejects.toBeInstanceOf(
      ProvidersUnavailableError
    )

    const urls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]))
    expect(urls.length).toBeGreaterThan(0)
    expect(urls.every((u) => u.includes('openrouter.ai'))).toBe(true)
    expect(urls.some((u) => u.includes('api.openai.com'))).toBe(false)
    // The OpenAI key is never even read.
    expect(mockGetKey).not.toHaveBeenCalledWith('openai')
  })

  it('empty transcript — OpenRouter ok with { text: "" } → throws instead of saving empty (D1)', async () => {
    // An empty-but-HTTP-ok primary response is a wrapper "success". The post-wrapper guard must throw loudly so the
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

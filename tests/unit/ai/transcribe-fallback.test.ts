import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * HARD-03 — transcribeAudioOR fallback (Wave 0 RED scaffold).
 *
 * Pins two behaviors for plan 99-01:
 *   1. key-absent path PRESERVED — when no OpenAI Whisper key is configured,
 *      transcription delegates straight to Gemini (today's behavior, must stay green).
 *   2. failure-based fallback ADDED — when an OpenAI key IS present but the Whisper
 *      fetch fails, transcription falls back to Gemini. RED today: transcribeAudioOR
 *      currently throws on a Whisper non-2xx with NO failure-based fallback.
 */

vi.mock('@/lib/platform-config', () => ({
  getIntegrationKey: vi.fn(),
}))
vi.mock('@/lib/ai/providers/gemini', () => ({
  transcribeAudioGemini: vi.fn().mockResolvedValue('gemini transcript'),
}))

import { transcribeAudioOR } from '@/lib/ai/openrouter-client'
import { getIntegrationKey } from '@/lib/platform-config'

const mockGetKey = getIntegrationKey as ReturnType<typeof vi.fn>

function makeAudio(): Blob {
  return new Blob(['x'], { type: 'audio/webm' })
}

describe('transcribeAudioOR fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Drive the Whisper path explicitly through global.fetch.
    global.fetch = vi.fn() as unknown as typeof fetch
  })

  it('key-absent path preserved — no OpenAI key delegates straight to Gemini', async () => {
    // No OpenAI key -> short-circuit to Gemini, never touch fetch.
    mockGetKey.mockImplementation(async (provider: string) =>
      provider === 'openai' ? null : 'gemini-key'
    )

    const result = await transcribeAudioOR(makeAudio(), 'webm')

    expect(result).toBe('gemini transcript')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('failure-based fallback — OpenAI key present but Whisper fetch fails -> Gemini transcript', async () => {
    // OpenAI key present -> attempts Whisper, which fails -> falls back to Gemini.
    mockGetKey.mockImplementation(async (provider: string) =>
      provider === 'openai' ? 'openai-key' : 'gemini-key'
    )
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'err',
    })

    // RED today: current transcribeAudioOR throws on Whisper failure (no failure-based fallback).
    const result = await transcribeAudioOR(makeAudio(), 'webm')

    expect(result).toBe('gemini transcript')
  })
})

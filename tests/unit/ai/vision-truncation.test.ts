import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * Phase 168 (PHOTO-04) — vision truncation handling + cap parity.
 *
 * v4.19 audit E4: `max_tokens: 300`, `finish_reason` never read — mid-sentence
 * truncated descriptions were saved as-is; the Gemini vision fallback had NO
 * cap at all (asymmetric outputs).
 *
 * This suite locks: base cap raised 300 -> 450; on finish_reason 'length' ONE
 * retry at max_tokens 600; if STILL 'length' after the retry, trim at the
 * last sentence-ending punctuation rather than persist a mid-sentence cut;
 * recordAICost fires exactly ONCE (for the final attempt), never once per
 * attempt; the pre-existing empty-output guard (D2) still holds.
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
const mockRecordAICost = vi.fn(async (..._args: unknown[]) => {})
vi.mock('@/lib/billing/record-ai-cost', () => ({
  recordAICost: (...args: unknown[]) => mockRecordAICost(...args),
}))
// Defensive no-op — never reached: primary always resolves (ok:true) in
// every case below, so the Gemini fallback is not consulted.
vi.mock('@/lib/ai/providers/gemini', () => ({
  analyzePhotoGemini: vi.fn(async () => 'gemini fallback description'),
}))

import { analyzePhotoOR } from '@/lib/ai/openrouter-client'

function mockResponse(content: string, finishReason: string | null, cost = 0.002) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content }, finish_reason: finishReason }],
      usage: { cost },
    }),
  }
}

function requestBody(callIndex: number): { max_tokens: number } {
  const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
  const init = calls[callIndex][1] as RequestInit
  return JSON.parse(init.body as string)
}

describe('analyzePhotoOR — vision truncation handling (PHOTO-04)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn() as unknown as typeof fetch
  })

  it('finish_reason "stop" (normal completion) — text unchanged, ONE fetch call at the base cap (450)', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockResponse('A tidy kitchen with granite counters.', 'stop')
    )

    const result = await analyzePhotoOR('aGVsbG8=', 'image/jpeg')

    expect(result).toBe('A tidy kitchen with granite counters.')
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(requestBody(0).max_tokens).toBe(450)
    expect(mockRecordAICost).toHaveBeenCalledOnce()
  })

  it('finish_reason "length" then "stop" on retry — retries ONCE at max_tokens 600 and uses the retry content untrimmed', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(
        mockResponse('Kitchen with cracked tile, water damage near the', 'length')
      )
      .mockResolvedValueOnce(
        mockResponse('Kitchen with cracked tile, water damage near the sink base.', 'stop')
      )

    const result = await analyzePhotoOR('aGVsbG8=', 'image/jpeg')

    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(requestBody(0).max_tokens).toBe(450)
    expect(requestBody(1).max_tokens).toBe(600)
    expect(result).toBe('Kitchen with cracked tile, water damage near the sink base.')
    // recordAICost fires ONCE, for the final (retry) attempt only — never once
    // per attempt (would double-count the vision cost).
    expect(mockRecordAICost).toHaveBeenCalledOnce()
  })

  it('finish_reason "length" on BOTH attempts — trims at the last sentence boundary instead of persisting a mid-sentence cut', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(mockResponse('Bathroom has a leaking pipe. Tile is', 'length'))
      .mockResolvedValueOnce(
        mockResponse(
          'Bathroom has a leaking pipe. Tile is cracked near the drain and needs re',
          'length'
        )
      )

    const result = await analyzePhotoOR('aGVsbG8=', 'image/jpeg')

    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(result).toBe('Bathroom has a leaking pipe.')
    expect(mockRecordAICost).toHaveBeenCalledOnce()
  })

  it('finish_reason "length" on both attempts with NO sentence-ending punctuation anywhere — returns the untrimmed text rather than emptying it', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(mockResponse('Kitchen with cracked tile and visible da', 'length'))
      .mockResolvedValueOnce(
        mockResponse('Kitchen with cracked tile and visible damage near the sink cabin', 'length')
      )

    const result = await analyzePhotoOR('aGVsbG8=', 'image/jpeg')

    expect(result).toBe('Kitchen with cracked tile and visible damage near the sink cabin')
  })

  it('empty-output guard (D2) is preserved: an ok response with empty content still throws', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse('', 'stop'))

    await expect(analyzePhotoOR('aGVsbG8=', 'image/jpeg')).rejects.toThrow(
      /Photo analysis produced no description/
    )
  })
})

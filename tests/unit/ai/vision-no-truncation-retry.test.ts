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

import { analyzePhotoOR, analyzePhotoSingleAttemptOR } from '@/lib/ai/openrouter-client'

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

describe('analyzePhotoSingleAttemptOR — no truncation retry (Haiku-first vision mode, Phase 4b)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn() as unknown as typeof fetch
  })

  it('truncated first completion: NO retry, trimmed at the last sentence boundary, one cost row', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockResponse('Kitchen with cracked tile. Water damage near the', 'length')
    )
    const result = await analyzePhotoSingleAttemptOR('aGVsbG8=', 'image/jpeg', 'anthropic/claude-sonnet-5.5')
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(requestBody(0).max_tokens).toBe(450)
    expect(result).toBe('Kitchen with cracked tile.')
    expect(mockRecordAICost).toHaveBeenCalledOnce()
  })

  it('without the option the retry at 600 is unchanged', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(mockResponse('Kitchen with cracked tile, water damage near the', 'length'))
      .mockResolvedValueOnce(mockResponse('Kitchen with cracked tile, water damage near the sink.', 'stop'))
    await analyzePhotoOR('aGVsbG8=', 'image/jpeg')
    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(requestBody(1).max_tokens).toBe(600)
  })
})

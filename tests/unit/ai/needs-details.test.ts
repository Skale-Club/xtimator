import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * QUICK-psh-01 — buildNeedsDetails coverage.
 *
 * Mirrors openrouter-cost-capture.test.ts's conventions: mock
 * lib/platform-config's getIntegrationKey (getORKey's dependency) + global
 * fetch. buildNeedsDetails is a single direct OpenRouter chat/completions call
 * (no callWithFallback), so no fallback-provider mocking is needed.
 */

vi.mock('@/lib/platform-config', () => ({
  getIntegrationKey: vi.fn(),
}))

import { buildNeedsDetails } from '@/lib/ai/needs-details'
import { getIntegrationKey } from '@/lib/platform-config'

const mockGetKey = vi.mocked(getIntegrationKey)

function makeResponse(content: string) {
  return {
    ok: true,
    json: async () => ({ choices: [{ message: { content } }] }),
  }
}

describe('buildNeedsDetails (QUICK-psh-01)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetKey.mockResolvedValue('or-key')
    global.fetch = vi.fn() as unknown as typeof fetch
  })

  it('parses a valid JSON response (missing_specifics + questions)', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeResponse(
        JSON.stringify({
          reason: 'missing_specifics',
          questions: ['How many square feet?', 'What material — fabric or leather?'],
        })
      )
    )

    const result = await buildNeedsDetails('cleaned the couch', 'en', 'cleaning')

    expect(result).toEqual({
      reason: 'missing_specifics',
      questions: ['How many square feet?', 'What material — fabric or leather?'],
    })
  })

  it('handles a fenced ```json code block the same as raw JSON', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeResponse('```json\n' + JSON.stringify({ reason: 'too_short', questions: ['q1'] }) + '\n```')
    )

    const result = await buildNeedsDetails('input', 'en')

    expect(result).toEqual({ reason: 'too_short', questions: ['q1'] })
  })

  it('mic_test reason always returns an empty questions array, even if the model supplies some', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeResponse(JSON.stringify({ reason: 'mic_test', questions: ['should be dropped'] }))
    )

    const result = await buildNeedsDetails('alo, testando', 'pt')

    expect(result).toEqual({ reason: 'mic_test', questions: [] })
  })

  it('caps questions at 4 and drops non-string / blank entries', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeResponse(
        JSON.stringify({
          reason: 'missing_specifics',
          questions: ['q1', '', 'q2', 42, 'q3', 'q4', 'q5'],
        })
      )
    )

    const result = await buildNeedsDetails('input', 'en')

    expect(result.reason).toBe('missing_specifics')
    expect(result.questions).toEqual(['q1', 'q2', 'q3', 'q4'])
  })

  it('unknown reason string from the model -> coerced to missing_specifics', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeResponse(JSON.stringify({ reason: 'not_a_real_reason', questions: ['q1'] }))
    )

    const result = await buildNeedsDetails('input', 'en')

    expect(result.reason).toBe('missing_specifics')
  })

  it('malformed JSON -> safe fallback (never throws)', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(makeResponse('not json at all'))

    const result = await buildNeedsDetails('input', 'en')

    expect(result).toEqual({ reason: 'missing_specifics', questions: [] })
  })

  it('HTTP failure -> safe fallback (never throws)', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      text: async () => 'server error',
    })

    const result = await buildNeedsDetails('input', 'en')

    expect(result).toEqual({ reason: 'missing_specifics', questions: [] })
  })

  it('OpenRouter error payload -> safe fallback (never throws)', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ error: { message: 'rate limited' } }),
    })

    const result = await buildNeedsDetails('input', 'en')

    expect(result).toEqual({ reason: 'missing_specifics', questions: [] })
  })

  it('missing API key -> safe fallback (never throws)', async () => {
    mockGetKey.mockResolvedValue(null as unknown as string)

    const result = await buildNeedsDetails('input', 'en')

    expect(result).toEqual({ reason: 'missing_specifics', questions: [] })
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('network rejection -> safe fallback (never throws)', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('ECONNRESET'))

    const result = await buildNeedsDetails('input', 'en')

    expect(result).toEqual({ reason: 'missing_specifics', questions: [] })
  })
})

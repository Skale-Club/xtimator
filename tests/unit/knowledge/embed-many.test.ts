import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * KCUR-03: embedMany(texts[]) — the batched OpenRouter /embeddings helper that
 * Plan 02's bulk import consumes.
 *
 * Locks (mocked getORKey + stubbed global fetch — ZERO live network, no real key):
 *   1. Returns vectors in INPUT ORDER even when the API returns data[] with
 *      shuffled `index` fields.
 *   2. Chunks a 200-input request into 3 fetch calls, each with input.length <= 96.
 *   3. Throws when a returned embedding length !== 1536.
 *   4. Empty input → [] with ZERO fetch calls.
 *
 * Placeholder credentials only — gitleaks-safe.
 */

const { getORKey } = vi.hoisted(() => ({
  getORKey: vi.fn(async () => 'sk-test-or-placeholder'),
}))

vi.mock('@/lib/ai/openrouter-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ai/openrouter-client')>(
    '@/lib/ai/openrouter-client'
  )
  return { ...actual, getORKey }
})

import { embedMany } from '@/lib/knowledge/embed'

// A 1536-vector whose first element encodes which input it came from, so we can
// assert ordering after a shuffled-index response.
const vec1536 = (marker: number) => {
  const v = Array.from({ length: 1536 }, (_, i) => (i % 7) * 0.001)
  v[0] = marker
  return v
}

function okResponse(body: unknown) {
  return { ok: true, status: 200, text: async () => '', json: async () => body }
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('KCUR-03: embedMany(texts[]) via OpenRouter /embeddings', () => {
  it('returns vectors in input order even when data[] index is shuffled', async () => {
    const inputs = ['alpha', 'beta', 'gamma']
    // API returns the embeddings out of order, but each carries its true index.
    const shuffled = [
      { index: 2, embedding: vec1536(2) },
      { index: 0, embedding: vec1536(0) },
      { index: 1, embedding: vec1536(1) },
    ]
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      okResponse({ data: shuffled })
    )

    const out = await embedMany(inputs)
    expect(out).toHaveLength(3)
    expect(out[0]?.[0]).toBe(0)
    expect(out[1]?.[0]).toBe(1)
    expect(out[2]?.[0]).toBe(2)
  })

  it('chunks 200 inputs into 3 fetch calls, each input array <= 96', async () => {
    const inputs = Array.from({ length: 200 }, (_, i) => `text-${i}`)
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { input: string[] }
      const data = body.input.map((_t, i) => ({ index: i, embedding: vec1536(i) }))
      return okResponse({ data })
    })

    const out = await embedMany(inputs)
    expect(out).toHaveLength(200)
    expect(fetchMock).toHaveBeenCalledTimes(3) // 96 + 96 + 8

    for (const call of fetchMock.mock.calls) {
      const init = call[1] as RequestInit
      const body = JSON.parse(String(init.body)) as { input: string[] }
      expect(Array.isArray(body.input)).toBe(true)
      expect(body.input.length).toBeLessThanOrEqual(96)
    }
  })

  it('throws when a returned embedding length !== 1536', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      okResponse({ data: [{ index: 0, embedding: [0.1, 0.2, 0.3] }] })
    )
    await expect(embedMany(['oops'])).rejects.toThrow(/shape|len/i)
  })

  it('returns [] for empty input with zero fetch calls', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    const out = await embedMany([])
    expect(out).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

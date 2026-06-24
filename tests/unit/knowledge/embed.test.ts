import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * KMOD-01: embed(text) — the OpenRouter /embeddings building block.
 *
 * Locks (mocked getORKey + stubbed global fetch — ZERO live network, no real key):
 *   1. A well-formed { data: [{ embedding: <1536 numbers> }] } → resolves to that
 *      1536-length array.
 *   2. A 3-length embedding → REJECTS (throws on bad shape). embed is the building
 *      block; retrieve() (Plan 02) is the never-throws wrapper.
 *   3. res.ok === false (status 500) → REJECTS with an error mentioning the status.
 *   4. The POST body JSON pins model 'openai/text-embedding-3-small' and carries
 *      `input`, posted to a `/embeddings` URL.
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

import { embed } from '@/lib/knowledge/embed'

const vec1536 = () => Array.from({ length: 1536 }, (_, i) => (i % 7) * 0.001)

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

describe('KMOD-01: embed(text) via OpenRouter /embeddings', () => {
  it('returns the 1536-length embedding for a well-formed response', async () => {
    const v = vec1536()
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      okResponse({ data: [{ embedding: v }] })
    )
    const out = await embed('hello')
    expect(out).toHaveLength(1536)
    expect(out).toEqual(v)
  })

  it('throws on a non-1536-length embedding (bad shape)', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      okResponse({ data: [{ embedding: [0.1, 0.2, 0.3] }] })
    )
    await expect(embed('hello')).rejects.toThrow(/shape|len/i)
  })

  it('throws mentioning the status on a non-2xx response', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'upstream error',
      json: async () => ({}),
    })
    await expect(embed('hello')).rejects.toThrow(/500/)
  })

  it('posts model openai/text-embedding-3-small and input to /embeddings', async () => {
    const v = vec1536()
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(okResponse({ data: [{ embedding: v }] }))
    await embed('measure the carpet')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toMatch(/\/embeddings$/)
    expect(init.method).toBe('POST')
    const body = JSON.parse(String(init.body))
    expect(body.model).toBe('openai/text-embedding-3-small')
    expect(body.input).toBe('measure the carpet')
  })
})

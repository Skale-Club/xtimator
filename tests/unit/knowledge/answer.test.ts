import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * KMOD-03 — answer(question, ctx): retrieve top-k → hardened RAG prompt
 * (buildKnowledgePrompt, KSEC-01) → OpenRouter chat → short conversational
 * answer string. NEVER throws — any failure returns a safe fallback string so a
 * WhatsApp/web/MCP consumer never crashes. Optional ctx.language is forwarded.
 */

import type { Passage } from '@/lib/knowledge/provider'

const retrieveMock = vi.fn()
vi.mock('@/lib/knowledge/retrieve', () => ({
  retrieve: (...args: unknown[]) => retrieveMock(...args),
}))

vi.mock('@/lib/ai/openrouter-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ai/openrouter-client')>(
    '@/lib/ai/openrouter-client'
  )
  return {
    ...actual,
    getORKey: vi.fn(async () => 'test-key'),
  }
})

import { answer } from '@/lib/knowledge/answer'

function passage(body: string, title = 'T'): Passage {
  return { id: 'p1', title, body, source: null, scope: 'industry', similarity: 0.9 }
}

const CTX = { industries: ['cleaning'], companyId: null }

let fetchMock: ReturnType<typeof vi.fn>
let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  retrieveMock.mockReset()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  warnSpy.mockRestore()
})

function okResponse(content: string) {
  return {
    ok: true,
    json: async () => ({ choices: [{ message: { content } }], usage: { cost: 0.0001 } }),
  }
}

describe('KMOD-03: answer', () => {
  it('Test 1: returns the chat answer string for a successful call', async () => {
    retrieveMock.mockResolvedValue([passage('Use a 2-inch nap roller'), passage('Prime first')])
    fetchMock.mockResolvedValue(okResponse('Use a 2-inch nap roller for textured walls.'))

    const result = await answer('how to paint a textured wall', CTX)
    expect(result).toBe('Use a 2-inch nap roller for textured walls.')
  })

  it('Test 2: builds the request via buildKnowledgePrompt (<knowledge> in the system message)', async () => {
    retrieveMock.mockResolvedValue([passage('<script>x</script>blot the stain')])
    fetchMock.mockResolvedValue(okResponse('Blot, do not rub.'))

    await answer('how to clean a pet stain', CTX)

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    const systemMsg = body.messages.find((m: { role: string }) => m.role === 'system')
    expect(systemMsg.content).toContain('<knowledge>')
    // Routed through sanitizeField — passage markup is escaped, never live.
    expect(systemMsg.content).toContain('&lt;script&gt;')
  })

  it('Test 3: returns a safe fallback string (never throws) when the chat call fails', async () => {
    retrieveMock.mockResolvedValue([passage('something')])
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })

    const result = await answer('q', CTX)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
    expect(warnSpy).toHaveBeenCalled()
  })

  it('Test 3b: returns a safe fallback string when fetch rejects', async () => {
    retrieveMock.mockResolvedValue([passage('something')])
    fetchMock.mockRejectedValue(new Error('network down'))

    const result = await answer('q', CTX)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
    expect(warnSpy).toHaveBeenCalled()
  })

  it('Test 4: returns a string even when retrieve yields no passages', async () => {
    retrieveMock.mockResolvedValue([])
    fetchMock.mockResolvedValue(okResponse("I couldn't find anything specific, but..."))

    const result = await answer('obscure question', CTX)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('Test 5: forwards ctx.language into buildKnowledgePrompt', async () => {
    retrieveMock.mockResolvedValue([passage('blot the stain')])
    fetchMock.mockResolvedValue(okResponse('Limpe a mancha.'))

    await answer('como limpar', { ...CTX, language: 'pt' })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    const systemMsg = body.messages.find((m: { role: string }) => m.role === 'system')
    expect(systemMsg.content).toContain('Brazilian Portuguese')
  })
})

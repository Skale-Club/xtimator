import { describe, it, expect, vi, beforeEach } from 'vitest'

// Module-level mock function references (accessible from hoisted vi.mock factories)
// These are assigned in beforeEach but referenced by the class in the mock factory
const anthropicCreateMock = vi.fn()

// Auth client
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

// Service client (DB reads/writes)
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(),
}))

// getIntegrationKey
vi.mock('@/lib/platform-config', () => ({
  getIntegrationKey: vi.fn(),
}))

// Anthropic SDK — class variant (constructible); delegates to module-level mock
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: anthropicCreateMock }
  },
}))

import { POST } from '@/app/api/translate/route'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getIntegrationKey } from '@/lib/platform-config'

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('/api/translate — I18N-05, I18N-08', () => {
  let getClaimsMock: ReturnType<typeof vi.fn>
  let fromMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.resetAllMocks()

    // Auth: authenticated by default
    getClaimsMock = vi.fn().mockResolvedValue({ data: { claims: { sub: 'user-1' } } })
    vi.mocked(createClient).mockResolvedValue({
      auth: { getClaims: getClaimsMock },
    } as unknown as Awaited<ReturnType<typeof createClient>>)

    // AI key: available by default
    vi.mocked(getIntegrationKey).mockResolvedValue('test-key')

    // Anthropic: returns translation by default
    anthropicCreateMock.mockResolvedValue({
      content: [{ type: 'text', text: '{"Rare string":"Frase rara"}' }],
    })

    // DB: cache miss by default
    // Route calls: .from('translations').select(...).in(...).eq(...).eq(...)
    // Route uses .upsert(..., { onConflict, ignoreDuplicates }) for writes
    fromMock = vi.fn()
    const eqMock2 = vi.fn().mockResolvedValue({ data: [] })
    const eqMock1 = vi.fn().mockReturnValue({ eq: eqMock2 })
    const inMock = vi.fn().mockReturnValue({ eq: eqMock1 })
    const selectMock = vi.fn().mockReturnValue({ in: inMock })
    const upsertMock = vi.fn().mockResolvedValue({ error: null })
    fromMock.mockReturnValue({ select: selectMock, upsert: upsertMock })

    vi.mocked(createServiceClient).mockReturnValue({
      from: fromMock,
    } as unknown as ReturnType<typeof createServiceClient>)
  })

  it('returns 401 when not authenticated', async () => {
    getClaimsMock.mockResolvedValue({ data: { claims: null } })
    const res = await POST(makeRequest({ texts: ['Save'], targetLanguage: 'pt' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when texts field is missing', async () => {
    const res = await POST(makeRequest({ targetLanguage: 'pt' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBeTruthy()
  })

  it('returns 400 when targetLanguage field is missing', async () => {
    const res = await POST(makeRequest({ texts: ['Save'] }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBeTruthy()
  })

  it('returns 503 when getIntegrationKey returns null and no cache hit', async () => {
    vi.mocked(getIntegrationKey).mockResolvedValue(null)
    const res = await POST(makeRequest({ texts: ['Rare string'], targetLanguage: 'pt' }))
    expect(res.status).toBe(503)
  })

  it('returns cached translation without calling Claude when DB hit exists', async () => {
    // Override: cache hit for 'Save' — two chained .eq() required
    const eqMock2 = vi.fn().mockResolvedValue({
      data: [{ source_text: 'Save', translated_text: 'Salvar' }],
    })
    const eqMock1 = vi.fn().mockReturnValue({ eq: eqMock2 })
    const inMock = vi.fn().mockReturnValue({ eq: eqMock1 })
    const selectMock = vi.fn().mockReturnValue({ in: inMock })
    const upsertMock = vi.fn().mockResolvedValue({ error: null })
    fromMock.mockReturnValue({ select: selectMock, upsert: upsertMock })

    const res = await POST(makeRequest({ texts: ['Save'], targetLanguage: 'pt' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.translations['Save']).toBe('Salvar')
    // Claude should NOT have been called (all strings cached)
    expect(anthropicCreateMock).not.toHaveBeenCalled()
  })

  it('calls Claude and inserts with onConflict when DB cache miss', async () => {
    // Build fresh upsert mock to verify call (route uses upsert with ignoreDuplicates)
    const upsertMock = vi.fn().mockResolvedValue({ error: null })
    const eqMock2 = vi.fn().mockResolvedValue({ data: [] })
    const eqMock1 = vi.fn().mockReturnValue({ eq: eqMock2 })
    const inMock = vi.fn().mockReturnValue({ eq: eqMock1 })
    const selectMock = vi.fn().mockReturnValue({ in: inMock })
    fromMock.mockReturnValue({ select: selectMock, upsert: upsertMock })

    anthropicCreateMock.mockResolvedValue({
      content: [{ type: 'text', text: '{"Rare string":"Frase rara"}' }],
    })

    const res = await POST(makeRequest({ texts: ['Rare string'], targetLanguage: 'pt' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.translations['Rare string']).toBe('Frase rara')

    // Verify Claude was called with haiku model
    expect(anthropicCreateMock).toHaveBeenCalledOnce()
    expect(anthropicCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-haiku-4-20250514' })
    )

    // Verify upsert was called with onConflict (ignoreDuplicates = ON CONFLICT DO NOTHING)
    expect(upsertMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          source_text: 'Rare string',
          source_language: 'en',
          target_language: 'pt',
          translated_text: 'Frase rara',
        }),
      ]),
      expect.objectContaining({
        onConflict: 'source_text,source_language,target_language',
        ignoreDuplicates: true,
      })
    )
  })
})

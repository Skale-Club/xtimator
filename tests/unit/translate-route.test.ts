import { describe, it, expect, vi, beforeEach } from 'vitest'

// Auth client
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

// Service client (DB cache reads/writes)
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(),
}))

// AI translation goes through OpenRouter (translateTextsOR), not the Anthropic SDK.
vi.mock('@/lib/ai/openrouter-client', () => ({
  translateTextsOR: vi.fn(),
}))

vi.mock('@/lib/demo/guard', () => ({
  demoGuardResponse: vi.fn(),
}))

vi.mock('@/lib/queries/active-company', () => ({
  getActiveCompanyId: vi.fn(),
}))

import { POST } from '@/app/api/translate/route'
import { createClient } from '@/lib/supabase/server'
import { requireServiceClient } from '@/lib/supabase/service'
import { translateTextsOR } from '@/lib/ai/openrouter-client'
import { demoGuardResponse } from '@/lib/demo/guard'
import { getActiveCompanyId } from '@/lib/queries/active-company'

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
  let upsertMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.resetAllMocks()

    // Auth: authenticated by default
    getClaimsMock = vi.fn().mockResolvedValue({ data: { claims: { sub: 'user-1' } } })
    vi.mocked(createClient).mockResolvedValue({
      auth: { getClaims: getClaimsMock },
    } as unknown as Awaited<ReturnType<typeof createClient>>)
    vi.mocked(getActiveCompanyId).mockResolvedValue('company-1')
    vi.mocked(demoGuardResponse).mockResolvedValue(null)

    // OpenRouter: returns a translation by default
    vi.mocked(translateTextsOR).mockResolvedValue({ 'Rare string': 'Frase rara' })

    // DB: cache miss by default.
    // Route reads: .from('translations').select(...).in(...).eq(...).eq(...)
    // Route writes: .upsert(rows, { onConflict, ignoreDuplicates })
    upsertMock = vi.fn().mockResolvedValue({ error: null })
    const eqMock2 = vi.fn().mockResolvedValue({ data: [] })
    const eqMock1 = vi.fn().mockReturnValue({ eq: eqMock2 })
    const inMock = vi.fn().mockReturnValue({ eq: eqMock1 })
    const selectMock = vi.fn().mockReturnValue({ in: inMock })
    fromMock = vi.fn().mockReturnValue({ select: selectMock, upsert: upsertMock })

    vi.mocked(requireServiceClient).mockReturnValue({
      from: fromMock,
    } as unknown as ReturnType<typeof requireServiceClient>)
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

  it('returns 400 when texts has more than 200 entries (pre-launch audit fix)', async () => {
    const texts = Array.from({ length: 201 }, (_, i) => `string ${i}`)
    const res = await POST(makeRequest({ texts, targetLanguage: 'pt' }))
    expect(res.status).toBe(400)
    expect(translateTextsOR).not.toHaveBeenCalled()
  })

  it('returns 400 when a single string exceeds 2000 characters (pre-launch audit fix)', async () => {
    const res = await POST(makeRequest({ texts: ['x'.repeat(2001)], targetLanguage: 'pt' }))
    expect(res.status).toBe(400)
    expect(translateTextsOR).not.toHaveBeenCalled()
  })

  it('returns 503 when the AI is unavailable and there is no cache hit', async () => {
    vi.mocked(translateTextsOR).mockRejectedValue(new Error('AI down'))
    const res = await POST(makeRequest({ texts: ['Rare string'], targetLanguage: 'pt' }))
    expect(res.status).toBe(503)
  })

  it('returns cached translation without calling the AI when DB hit exists', async () => {
    // Override: cache hit for 'Save' — two chained .eq() required
    const eqMock2 = vi.fn().mockResolvedValue({
      data: [{ source_text: 'Save', translated_text: 'Salvar' }],
    })
    const eqMock1 = vi.fn().mockReturnValue({ eq: eqMock2 })
    const inMock = vi.fn().mockReturnValue({ eq: eqMock1 })
    const selectMock = vi.fn().mockReturnValue({ in: inMock })
    fromMock.mockReturnValue({ select: selectMock, upsert: upsertMock })

    const res = await POST(makeRequest({ texts: ['Save'], targetLanguage: 'pt' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.translations['Save']).toBe('Salvar')
    // All strings cached → AI must NOT be called.
    expect(translateTextsOR).not.toHaveBeenCalled()
  })

  it('translates via OpenRouter and upserts with onConflict when DB cache miss', async () => {
    vi.mocked(translateTextsOR).mockResolvedValue({ 'Rare string': 'Frase rara' })

    const res = await POST(makeRequest({ texts: ['Rare string'], targetLanguage: 'pt' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.translations['Rare string']).toBe('Frase rara')

    // OpenRouter translator invoked with the missing strings + target language.
    expect(translateTextsOR).toHaveBeenCalledOnce()
    expect(translateTextsOR).toHaveBeenCalledWith(['Rare string'], 'pt')

    // Result cached via upsert with ON CONFLICT DO NOTHING.
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

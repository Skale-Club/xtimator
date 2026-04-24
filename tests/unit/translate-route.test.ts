import { describe, it, expect, vi, beforeEach } from 'vitest'

// Stubs for source modules that don't exist yet — created in Plan 03
// Auth client
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve({
    auth: { getClaims: vi.fn().mockResolvedValue({ data: { claims: { sub: 'user-1' } } }) },
  })),
}))

// Service client (DB reads/writes)
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
    }),
  })),
}))

// getIntegrationKey
vi.mock('@/lib/platform-config', () => ({
  getIntegrationKey: vi.fn().mockResolvedValue('test-key'),
}))

// Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: '{"Save":"Salvar"}' }] }) }
  },
}))

// Stub the route module itself — created in Plan 03
vi.mock('@/app/api/translate/route', () => ({
  POST: vi.fn().mockResolvedValue(new Response(JSON.stringify({ translations: {} }), { status: 200 })),
}))

import { POST } from '@/app/api/translate/route'

describe('/api/translate — I18N-05, I18N-08', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns 401 when not authenticated', () => {
    expect(true).toBe(false) // stub — implement in Plan 03
  })

  it('returns 400 when texts field is missing', () => {
    expect(true).toBe(false) // stub — implement in Plan 03
  })

  it('returns 400 when targetLanguage field is missing', () => {
    expect(true).toBe(false) // stub — implement in Plan 03
  })

  it('returns 503 when getIntegrationKey returns null and no cache hit', () => {
    expect(true).toBe(false) // stub — implement in Plan 03
  })

  it('returns cached translation without calling Claude when DB hit exists', () => {
    expect(true).toBe(false) // stub — implement in Plan 03
  })

  it('calls Claude and inserts with onConflict when DB cache miss', () => {
    expect(true).toBe(false) // stub — implement in Plan 03
  })
})

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// ----- Mocks -----
const sendWhatsAppMessageMock = vi.fn()
vi.mock('@/lib/whatsapp/client', () => ({
  sendWhatsAppMessage: (...args: unknown[]) => sendWhatsAppMessageMock(...args),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

// In-memory DB row keyed by companyId
let stored: Record<string, unknown> | null = null
let lastUpdate: Record<string, unknown> | null = null

function makeSupabase(authed = true) {
  return {
    auth: {
      getClaims: vi.fn().mockResolvedValue(
        authed
          ? { data: { claims: { sub: 'user-1' } } }
          : { data: { claims: null } }
      ),
    },
    from: (table: string) => {
      if (table === 'companies') {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                authed
                  ? Promise.resolve({ data: { id: 'company-1' }, error: null })
                  : Promise.resolve({ data: null, error: { message: 'No company found' } }),
            }),
          }),
        }
      }
      if (table === 'company_whatsapp') {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: stored,
                  error: stored ? null : { code: 'PGRST116' },
                }),
            }),
          }),
          upsert: (data: Record<string, unknown>) => {
            stored = { ...stored, ...data }
            return Promise.resolve({ error: null })
          },
          update: (data: Record<string, unknown>) => ({
            eq: () => {
              lastUpdate = data
              stored = stored ? { ...stored, ...data } : { ...data }
              return Promise.resolve({ error: null })
            },
          }),
          delete: () => ({
            eq: () => {
              stored = null
              return Promise.resolve({ error: null })
            },
          }),
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    },
  }
}

const createClientMock = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => createClientMock(),
}))

// Webhook route mocks (for WASTATUS-04)
vi.mock('@/lib/whatsapp/verify', () => ({
  verifyWebhookSignature: vi.fn(),
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(),
  requireServiceClient: vi.fn(),
}))

const processInboundWithDebounceMock = vi.fn()
vi.mock('@/lib/whatsapp/handler', () => ({
  processInboundWithDebounce: (...args: unknown[]) => processInboundWithDebounceMock(...args),
}))

vi.mock('@/lib/ratelimit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}))

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: vi.fn(async (fn: () => Promise<void>) => { await fn() }) }
})

import {
  confirmWhatsAppVerification,
  updateWhatsAppStatus,
} from '@/lib/actions/whatsapp-settings'
import { verifyWebhookSignature } from '@/lib/whatsapp/verify'
import { requireServiceClient } from '@/lib/supabase/service'
import { POST } from '@/app/api/webhooks/whatsapp/route'

const mockVerify = vi.mocked(verifyWebhookSignature)
const mockServiceClient = vi.mocked(requireServiceClient)

beforeEach(() => {
  stored = null
  lastUpdate = null
  sendWhatsAppMessageMock.mockReset()
  sendWhatsAppMessageMock.mockResolvedValue(undefined)
  createClientMock.mockReset()
  createClientMock.mockReturnValue(makeSupabase(true))
  processInboundWithDebounceMock.mockReset()
  mockVerify.mockReset()
  mockServiceClient.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

// -----------------------------------------------------------------------
// WASTATUS-02: OTP confirmation sets status='active' (not 'verified')
// -----------------------------------------------------------------------
describe('WASTATUS-02: OTP sets status=active', () => {
  beforeEach(() => {
    stored = {
      status: 'pending',
      verification_code: '555444',
      verification_attempts: 0,
      verification_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    }
  })

  it('update payload contains status=active (not verified) on correct code', async () => {
    const r = await confirmWhatsAppVerification('555444')
    expect(r.ok).toBe(true)
    // The stored row must have status='active'
    expect(stored!.status).toBe('active')
    // verified_at must be set
    expect(stored!.verified_at).toBeTruthy()
    // verification fields cleared
    expect(stored!.verification_code).toBeNull()
    expect(stored!.verification_attempts).toBe(0)
  })

  it('status is never set to verified — only active', async () => {
    await confirmWhatsAppVerification('555444')
    // Confirm the lastUpdate written to DB contains 'active' not 'verified'
    expect(lastUpdate).not.toBeNull()
    expect(lastUpdate!.status).toBe('active')
    expect(lastUpdate!.status).not.toBe('verified')
  })
})

// -----------------------------------------------------------------------
// WASTATUS-03: updateWhatsAppStatus suspend and reactivate
// -----------------------------------------------------------------------
describe('WASTATUS-03: updateWhatsAppStatus suspend/reactivate', () => {
  beforeEach(() => {
    stored = { status: 'active' }
  })

  it('suspends: calls update with status=suspended and returns ok:true', async () => {
    const r = await updateWhatsAppStatus('suspended')
    expect(r.ok).toBe(true)
    expect(lastUpdate).not.toBeNull()
    expect(lastUpdate!.status).toBe('suspended')
    expect(stored!.status).toBe('suspended')
  })

  it('reactivates: calls update with status=active and returns ok:true', async () => {
    // Start suspended
    stored = { status: 'suspended' }
    const r = await updateWhatsAppStatus('active')
    expect(r.ok).toBe(true)
    expect(lastUpdate).not.toBeNull()
    expect(lastUpdate!.status).toBe('active')
    expect(stored!.status).toBe('active')
  })

  it('returns error when not authenticated (getClaims returns null)', async () => {
    // Override createClientMock to return unauthenticated supabase
    createClientMock.mockReturnValue({
      auth: {
        getClaims: vi.fn().mockResolvedValue({ data: { claims: null } }),
      },
      from: () => {
        throw new Error('should not reach DB')
      },
    })
    const r = await updateWhatsAppStatus('suspended')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('Not authenticated')
  })
})

// -----------------------------------------------------------------------
// WASTATUS-04: Webhook gate rejects non-active connections
// -----------------------------------------------------------------------
describe('WASTATUS-04: webhook ignores non-active connections', () => {
  function makeMessagePayload(fromPhone = '15551234567') {
    return JSON.stringify({
      entry: [{
        changes: [{
          value: {
            messages: [{
              id: 'wamid.abc123',
              from: fromPhone,
              type: 'text',
              text: { body: 'Hello' },
            }],
          },
        }],
      }],
    })
  }

  function makeServiceSupabase(whatsappRow: Record<string, unknown> | null) {
    let dedupCallCount = 0
    return {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'company_whatsapp') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: whatsappRow, error: null }),
                }),
              }),
            }),
          }
        }
        if (table === 'whatsapp_processed_messages') {
          dedupCallCount++
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          }
        }
        throw new Error(`Unexpected table: ${table}`)
      }),
    } as unknown as ReturnType<typeof requireServiceClient>
  }

  it('processInboundWithDebounce is NOT called when status != active (no matching row)', async () => {
    mockVerify.mockReturnValue(true)
    // company_whatsapp query returns null (status is 'pending' or 'suspended' — not active)
    mockServiceClient.mockReturnValue(makeServiceSupabase(null))

    const req = new Request('http://localhost/api/webhooks/whatsapp', {
      method: 'POST',
      body: makeMessagePayload(),
      headers: { 'content-type': 'application/json' },
    }) as unknown as import('next/server').NextRequest

    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(processInboundWithDebounceMock).not.toHaveBeenCalled()
  })

  it('processInboundWithDebounce IS called when company_whatsapp row is active', async () => {
    mockVerify.mockReturnValue(true)
    // company_whatsapp query returns a row (status='active' matched)
    mockServiceClient.mockReturnValue(makeServiceSupabase({ company_id: 'company-1' }))

    const req = new Request('http://localhost/api/webhooks/whatsapp', {
      method: 'POST',
      body: makeMessagePayload(),
      headers: { 'content-type': 'application/json' },
    }) as unknown as import('next/server').NextRequest

    const res = await POST(req)
    expect(res.status).toBe(200)
    // after() is fire-and-forget in the route — use vi.waitFor to poll until the
    // async callback (handleInboundMessage) completes and calls processInboundWithDebounce
    await vi.waitFor(() => expect(processInboundWithDebounceMock).toHaveBeenCalledOnce(), { timeout: 2000 })
  })
})

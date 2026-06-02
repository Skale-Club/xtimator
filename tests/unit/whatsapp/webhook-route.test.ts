import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Mocks ---
vi.mock('@/lib/whatsapp/verify', () => ({
  verifyWebhookSignature: vi.fn(),
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(),
  requireServiceClient: vi.fn(),
}))

vi.mock('@/lib/whatsapp/handler', () => ({
  processInboundMessage: vi.fn(),
}))

// Mock next/server after() to be a no-op in tests
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: vi.fn((fn: () => Promise<void>) => fn()) }
})

import { verifyWebhookSignature } from '@/lib/whatsapp/verify'
import { requireServiceClient } from '@/lib/supabase/service'
import { GET, POST } from '@/app/api/webhooks/whatsapp/route'

const mockVerify = vi.mocked(verifyWebhookSignature)
const mockServiceClient = vi.mocked(requireServiceClient)

function makeRequest(method: string, url: string, body?: string, headers?: Record<string, string>) {
  return new Request(url, {
    method,
    body,
    headers: { 'content-type': 'application/json', ...headers },
  }) as unknown as import('next/server').NextRequest
}

describe('GET /api/webhooks/whatsapp', () => {
  beforeEach(() => {
    process.env.META_WHATSAPP_VERIFY_TOKEN = 'my-verify-token'
  })

  it('returns hub.challenge when token matches', async () => {
    const req = makeRequest(
      'GET',
      'http://localhost/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=my-verify-token&hub.challenge=challenge-abc'
    )
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('challenge-abc')
  })

  it('returns 403 when token does not match', async () => {
    const req = makeRequest(
      'GET',
      'http://localhost/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=challenge-abc'
    )
    const res = await GET(req)
    expect(res.status).toBe(403)
  })
})

describe('POST /api/webhooks/whatsapp', () => {
  beforeEach(() => {
    mockVerify.mockReset()
    mockServiceClient.mockReset()
  })

  it('returns 401 when signature verification fails', async () => {
    mockVerify.mockReturnValue(false)
    const req = makeRequest('POST', 'http://localhost/api/webhooks/whatsapp', '{}')
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 200 immediately for status update webhooks (early exit)', async () => {
    mockVerify.mockReturnValue(true)
    const statusPayload = JSON.stringify({
      entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.abc', status: 'delivered' }] } }] }],
    })
    const req = makeRequest('POST', 'http://localhost/api/webhooks/whatsapp', statusPayload)
    const res = await POST(req)
    expect(res.status).toBe(200)
    // No DB calls for status updates
    expect(mockServiceClient).not.toHaveBeenCalled()
  })

  it('returns 200 for valid message payload (unknown sender — silent ignore)', async () => {
    mockVerify.mockReturnValue(true)

    // Mock Supabase: unknown sender — no conversation row, no client row
    // New routing: whatsapp_conversations (order/limit/maybeSingle) then clients (limit/maybeSingle)
    mockServiceClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
            limit: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      }),
    } as unknown as ReturnType<typeof requireServiceClient>)

    const messagePayload = JSON.stringify({
      entry: [{
        changes: [{
          value: {
            messages: [{ id: 'wamid.abc123', from: '15551234567', type: 'text', text: { body: 'Hello' } }],
          },
        }],
      }],
    })
    const req = makeRequest('POST', 'http://localhost/api/webhooks/whatsapp', messagePayload)
    const res = await POST(req)
    expect(res.status).toBe(200)
  })
})

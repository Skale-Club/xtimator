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
  processInboundWithDebounce: vi.fn(),
}))

vi.mock('@/lib/whatsapp/client', () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/whatsapp/send-welcome', () => ({
  welcomeOnFirstContact: vi.fn().mockResolvedValue(true),
}))

vi.mock('@/lib/whatsapp/account-registry', () => ({
  findActiveWhatsAppSender: vi.fn().mockResolvedValue(null),
  getWhatsAppAccountStatus: vi.fn(),
  normalizeWhatsAppPhone: vi.fn((p: string) => {
    if (!p) return null
    const digits = p.replace(/[^\d]/g, '')
    if (digits.length < 7 || digits.length > 15) return null
    return `+${digits}`
  }),
}))

// Mock next/server after() to be a no-op in tests
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: vi.fn((fn: () => Promise<void>) => fn()) }
})

import { verifyWebhookSignature } from '@/lib/whatsapp/verify'
import { requireServiceClient } from '@/lib/supabase/service'
import { processInboundWithDebounce } from '@/lib/whatsapp/handler'
import { sendWhatsAppMessage } from '@/lib/whatsapp/client'
import { welcomeOnFirstContact } from '@/lib/whatsapp/send-welcome'
import { findActiveWhatsAppSender } from '@/lib/whatsapp/account-registry'
import { GET, POST } from '@/app/api/webhooks/whatsapp/route'

const mockVerify = vi.mocked(verifyWebhookSignature)
const mockServiceClient = vi.mocked(requireServiceClient)
const mockProcessInbound = vi.mocked(processInboundWithDebounce)
const mockSendWhatsApp = vi.mocked(sendWhatsAppMessage)
const mockWelcome = vi.mocked(welcomeOnFirstContact)
const mockFindSender = vi.mocked(findActiveWhatsAppSender)

/** fromMock for an owner resolved via Route 1 (findActiveWhatsAppSender). */
function makeOwnerResolvedFromMock(companyId: string, dedupError: unknown = null) {
  return vi.fn().mockImplementation((table: string) => {
    if (table === 'whatsapp_processed_messages') {
      return { insert: vi.fn().mockResolvedValue({ error: dedupError }) }
    }
    // conversations logging + any other table: permissive catch-all
    return {
      insert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }),
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    }
  })
}

function ownerTextPayload(messageId = 'wamid.owner1') {
  return JSON.stringify({
    entry: [{
      changes: [{
        value: {
          contacts: [{ profile: { name: 'Owner' }, wa_id: '15551234567' }],
          messages: [{ id: messageId, from: '15551234567', type: 'text', text: { body: 'Hi' } }],
        },
      }],
    }],
  })
}

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
    mockProcessInbound.mockReset()
    mockSendWhatsApp.mockReset()
    mockSendWhatsApp.mockResolvedValue(undefined)
    mockWelcome.mockReset()
    mockWelcome.mockResolvedValue(true)
    mockFindSender.mockReset()
    mockFindSender.mockResolvedValue(null)
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

  it('returns 200 and replies with admin guidance for an unknown sender', async () => {
    mockVerify.mockReturnValue(true)
    // findActiveWhatsAppSender returns null (no active sender for this phone)
    mockFindSender.mockResolvedValue(null)

    const fromMock = vi.fn().mockImplementation((table: string) => {
      if (table === 'whatsapp_conversations') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
        }
      }
      if (table === 'clients') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }
      }
      return { insert: vi.fn().mockResolvedValue({ error: null }) }
    })
    mockServiceClient.mockReturnValue({
      from: fromMock,
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
    expect(mockProcessInbound).not.toHaveBeenCalled()
    await vi.waitFor(() => {
      expect(mockSendWhatsApp).toHaveBeenCalledWith(
        '+15551234567',
        expect.objectContaining({
          type: 'text',
          text: expect.objectContaining({
            body: expect.stringContaining('administrator'),
          }),
        })
      )
    })
  })

  it('fires the first-contact welcome for an owner-resolved message, then still processes it', async () => {
    mockVerify.mockReturnValue(true)
    // Route 1: findActiveWhatsAppSender returns a match
    mockFindSender.mockResolvedValue({
      companyId: 'company-7',
      userId: 'user-owner',
      phoneE164: '+15551234567',
    })
    const serviceClient = { from: makeOwnerResolvedFromMock('company-7') } as unknown as ReturnType<typeof requireServiceClient>
    mockServiceClient.mockReturnValue(serviceClient)

    const req = makeRequest('POST', 'http://localhost/api/webhooks/whatsapp', ownerTextPayload())
    const res = await POST(req)
    expect(res.status).toBe(200)

    await vi.waitFor(() => {
      // Welcome attempted for the owner, scoped to their company + their phone (with +)
      expect(mockWelcome).toHaveBeenCalledWith(serviceClient, 'company-7', '+15551234567')
      // Message is still handed to normal processing
      expect(mockProcessInbound).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'wamid.owner1', type: 'text' }),
        'company-7',
        '15551234567',
        serviceClient
      )
    })
  })

  it('does NOT fire the welcome when the message is a duplicate (dedup short-circuits)', async () => {
    mockVerify.mockReturnValue(true)
    mockFindSender.mockResolvedValue({
      companyId: 'company-7',
      userId: 'user-owner',
      phoneE164: '+15551234567',
    })
    const serviceClient = {
      from: makeOwnerResolvedFromMock('company-7', { code: '23505' }),
    } as unknown as ReturnType<typeof requireServiceClient>
    mockServiceClient.mockReturnValue(serviceClient)

    const req = makeRequest('POST', 'http://localhost/api/webhooks/whatsapp', ownerTextPayload('wamid.dupe'))
    const res = await POST(req)
    expect(res.status).toBe(200)

    // Give after() a tick; welcome and processing must both be skipped on duplicates
    await new Promise((r) => setTimeout(r, 10))
    expect(mockWelcome).not.toHaveBeenCalled()
    expect(mockProcessInbound).not.toHaveBeenCalled()
  })

  it('routes via conversation fallback when sender is not active but conversation exists in exactly one company', async () => {
    mockVerify.mockReturnValue(true)
    // Route 1: no active sender
    mockFindSender.mockResolvedValue(null)

    const fromMock = vi.fn().mockImplementation((table: string) => {
      if (table === 'whatsapp_conversations') {
        // Single company in conversation history → exact match
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [{ company_id: 'company-conv' }],
                  error: null,
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'whatsapp_processed_messages') {
        return { insert: vi.fn().mockResolvedValue({ error: null }) }
      }
      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }),
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }
    })
    const serviceClient = { from: fromMock } as unknown as ReturnType<typeof requireServiceClient>
    mockServiceClient.mockReturnValue(serviceClient)

    const messagePayload = JSON.stringify({
      entry: [{
        changes: [{
          value: {
            messages: [{ id: 'wamid.conv1', from: '15551234567', type: 'text', text: { body: 'Hi again' } }],
          },
        }],
      }],
    })
    const req = makeRequest('POST', 'http://localhost/api/webhooks/whatsapp', messagePayload)
    const res = await POST(req)

    expect(res.status).toBe(200)
    await vi.waitFor(() => {
      expect(mockProcessInbound).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'wamid.conv1', type: 'text' }),
        'company-conv',
        '15551234567',
        serviceClient
      )
    })
  })

  it('fails closed on ambiguous conversation (multiple companies) — no routing', async () => {
    mockVerify.mockReturnValue(true)
    // Route 1: no active sender
    mockFindSender.mockResolvedValue(null)

    const fromMock = vi.fn().mockImplementation((table: string) => {
      if (table === 'whatsapp_conversations') {
        // Two different companies in conversation history → ambiguous
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [{ company_id: 'company-a' }, { company_id: 'company-b' }],
                  error: null,
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'clients') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }
      }
      return { insert: vi.fn().mockResolvedValue({ error: null }) }
    })
    mockServiceClient.mockReturnValue({
      from: fromMock,
    } as unknown as ReturnType<typeof requireServiceClient>)

    const messagePayload = JSON.stringify({
      entry: [{
        changes: [{
          value: {
            messages: [{ id: 'wamid.ambig1', from: '15551234567', type: 'text', text: { body: 'Hello' } }],
          },
        }],
      }],
    })
    const req = makeRequest('POST', 'http://localhost/api/webhooks/whatsapp', messagePayload)
    const res = await POST(req)
    expect(res.status).toBe(200)

    // Should NOT process — ambiguous conversation, fail closed
    await new Promise((r) => setTimeout(r, 10))
    expect(mockProcessInbound).not.toHaveBeenCalled()
    // Should reply with guidance
    expect(mockSendWhatsApp).toHaveBeenCalledWith(
      '+15551234567',
      expect.objectContaining({ type: 'text' })
    )
  })
})

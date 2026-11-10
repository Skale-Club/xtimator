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

vi.mock('@/lib/billing/messaging-cost', () => ({
  applyWhatsAppStatuses: vi.fn().mockResolvedValue(undefined),
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

vi.mock('@/lib/ratelimit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ allowed: true, count: 1, max: 1 }),
}))

vi.mock('@/lib/whatsapp/conversations', () => ({
  logInboundMessage: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/demo/guard', () => ({
  assertCompanyWritable: vi.fn().mockResolvedValue(null),
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
import { rateLimit } from '@/lib/ratelimit'
import { logInboundMessage } from '@/lib/whatsapp/conversations'
import { applyWhatsAppStatuses } from '@/lib/billing/messaging-cost'
import { GET, POST } from '@/app/api/webhooks/whatsapp/route'

const mockVerify = vi.mocked(verifyWebhookSignature)
const mockServiceClient = vi.mocked(requireServiceClient)
const mockProcessInbound = vi.mocked(processInboundWithDebounce)
const mockSendWhatsApp = vi.mocked(sendWhatsAppMessage)
const mockWelcome = vi.mocked(welcomeOnFirstContact)
const mockFindSender = vi.mocked(findActiveWhatsAppSender)
const mockRateLimit = vi.mocked(rateLimit)
const mockLogInbound = vi.mocked(logInboundMessage)

/** fromMock for an owner resolved via Route 1 (findActiveWhatsAppSender). */
function makeOwnerResolvedFromMock(
  companyId: string,
  dedupError: unknown = null
) {
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
    mockSendWhatsApp.mockResolvedValue(null)
    mockWelcome.mockReset()
    mockWelcome.mockResolvedValue(true)
    mockFindSender.mockReset()
    mockFindSender.mockResolvedValue(null)
    mockRateLimit.mockReset()
    mockRateLimit.mockResolvedValue({ allowed: true, count: 1, max: 1 })
    mockLogInbound.mockReset()
    mockLogInbound.mockResolvedValue(undefined as never)
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
    // No inbound DB work for status updates
    expect(mockServiceClient).not.toHaveBeenCalled()
    expect(mockProcessInbound).not.toHaveBeenCalled()
    // Phase 2b: the statuses are handed to the cost/delivery handler (after()).
    expect(applyWhatsAppStatuses).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'wamid.abc', status: 'delivered' }),
    ])
  })

  it('collects statuses from every entry and change of a status payload', async () => {
    mockVerify.mockReturnValue(true)
    vi.mocked(applyWhatsAppStatuses).mockClear()
    const payload = JSON.stringify({
      entry: [
        { changes: [{ value: { statuses: [{ id: 'wamid.1', status: 'sent' }] } }] },
        {
          changes: [
            { value: { statuses: [{ id: 'wamid.2', status: 'delivered', pricing: { billable: true, category: 'utility' } }] } },
          ],
        },
      ],
    })
    const res = await POST(makeRequest('POST', 'http://localhost/api/webhooks/whatsapp', payload))
    expect(res.status).toBe(200)
    expect(applyWhatsAppStatuses).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'wamid.1' }),
      expect.objectContaining({ id: 'wamid.2', pricing: { billable: true, category: 'utility' } }),
    ])
  })

  it('returns 200 and replies with the signup guidance for an unknown sender', async () => {
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
            body: expect.stringContaining('xtimator.com'),
          }),
        }),
        // Platform cost: recorded without a tenant, never billed.
        expect.objectContaining({ companyId: null, purpose: 'unknown_sender', billable: false })
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
      // Welcome attempted for the owner, scoped to their company + their phone (with +).
      // Language resolution lives inside welcomeOnFirstContact (post-claim).
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

  it('logs but does NOT process a client phone resolved via conversation history (Route 2)', async () => {
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
      expect(mockLogInbound).toHaveBeenCalledWith(
        serviceClient,
        expect.objectContaining({ companyId: 'company-conv', waMessageId: 'wamid.conv1' })
      )
    })
    expect(mockProcessInbound).not.toHaveBeenCalled()
    expect(mockWelcome).not.toHaveBeenCalled()
    expect(mockSendWhatsApp).not.toHaveBeenCalled()
  })

  it('logs but does NOT process a client phone resolved via the clients table (Route 3)', async () => {
    mockVerify.mockReturnValue(true)
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
              limit: vi.fn().mockResolvedValue({ data: [{ company_id: 'company-client' }], error: null }),
            }),
          }),
        }
      }
      return { insert: vi.fn().mockResolvedValue({ error: null }) }
    })
    const serviceClient = { from: fromMock } as unknown as ReturnType<typeof requireServiceClient>
    mockServiceClient.mockReturnValue(serviceClient)

    const payload = JSON.stringify({
      entry: [{ changes: [{ value: {
        messages: [{ id: 'wamid.client1', from: '15551234567', type: 'text', text: { body: 'Hi' } }],
      } }] }],
    })
    const res = await POST(makeRequest('POST', 'http://localhost/api/webhooks/whatsapp', payload))
    expect(res.status).toBe(200)

    await vi.waitFor(() => {
      expect(mockLogInbound).toHaveBeenCalledWith(
        serviceClient,
        expect.objectContaining({ companyId: 'company-client', waMessageId: 'wamid.client1' })
      )
    })
    expect(mockProcessInbound).not.toHaveBeenCalled()
    expect(mockSendWhatsApp).not.toHaveBeenCalled()
  })

  it('processes every message of a payload (two changes, two messages) in order', async () => {
    mockVerify.mockReturnValue(true)
    mockFindSender.mockResolvedValue({
      companyId: 'company-7',
      userId: 'user-owner',
      phoneE164: '+15551234567',
    })
    mockServiceClient.mockReturnValue({
      from: makeOwnerResolvedFromMock('company-7'),
    } as unknown as ReturnType<typeof requireServiceClient>)

    const msg = (id: string) => ({ id, from: '15551234567', type: 'text', text: { body: id } })
    const payload = JSON.stringify({
      entry: [{
        changes: [
          { value: { messages: [msg('wamid.m1'), msg('wamid.m2')] } },
          { value: { messages: [msg('wamid.m3')] } },
        ],
      }],
    })
    const res = await POST(makeRequest('POST', 'http://localhost/api/webhooks/whatsapp', payload))
    expect(res.status).toBe(200)

    await vi.waitFor(() => {
      expect(mockProcessInbound).toHaveBeenCalledTimes(3)
    })
    expect(mockProcessInbound.mock.calls.map((c) => (c[0] as { id: string }).id)).toEqual([
      'wamid.m1',
      'wamid.m2',
      'wamid.m3',
    ])
  })

  it('keeps processing the remaining messages when one message throws', async () => {
    mockVerify.mockReturnValue(true)
    mockFindSender.mockResolvedValue({
      companyId: 'company-7',
      userId: 'user-owner',
      phoneE164: '+15551234567',
    })
    mockServiceClient.mockReturnValue({
      from: makeOwnerResolvedFromMock('company-7'),
    } as unknown as ReturnType<typeof requireServiceClient>)
    mockProcessInbound.mockRejectedValueOnce(new Error('boom'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const msg = (id: string) => ({ id, from: '15551234567', type: 'text', text: { body: id } })
    const payload = JSON.stringify({
      entry: [{ changes: [{ value: { messages: [msg('wamid.f1'), msg('wamid.f2')] } }] }],
    })
    const res = await POST(makeRequest('POST', 'http://localhost/api/webhooks/whatsapp', payload))
    expect(res.status).toBe(200)

    await vi.waitFor(() => {
      expect(mockProcessInbound).toHaveBeenCalledTimes(2)
    })
  })

  it('replies to an unknown sender once, then stays silent while the 24h window is active', async () => {
    mockVerify.mockReturnValue(true)
    mockFindSender.mockResolvedValue(null)
    const emptyFrom = vi.fn().mockImplementation((table: string) => {
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
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }
    })
    mockServiceClient.mockReturnValue({
      from: emptyFrom,
    } as unknown as ReturnType<typeof requireServiceClient>)
    // First call allowed, second call blocked (window active)
    mockRateLimit
      .mockResolvedValueOnce({ allowed: true, count: 1, max: 1 })
      .mockResolvedValueOnce({ allowed: false, count: 2, max: 1, retryAfter: 80000 })

    const payload = (id: string) =>
      JSON.stringify({
        entry: [{ changes: [{ value: {
          messages: [{ id, from: '5511999990000', type: 'text', text: { body: 'oi' } }],
        } }] }],
      })

    await POST(makeRequest('POST', 'http://localhost/api/webhooks/whatsapp', payload('wamid.u1')))
    await vi.waitFor(() => expect(mockSendWhatsApp).toHaveBeenCalledTimes(1))
    expect(mockSendWhatsApp).toHaveBeenCalledWith(
      '+5511999990000',
      expect.objectContaining({
        type: 'text',
        text: expect.objectContaining({ body: expect.stringContaining('Xtimator') }),
      }),
      expect.objectContaining({ companyId: null, purpose: 'unknown_sender', billable: false })
    )
    expect(mockRateLimit).toHaveBeenCalledWith('whatsappUnknownSenderReply', '5511999990000')

    await POST(makeRequest('POST', 'http://localhost/api/webhooks/whatsapp', payload('wamid.u2')))
    await new Promise((r) => setTimeout(r, 10))
    expect(mockSendWhatsApp).toHaveBeenCalledTimes(1)
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
      expect.objectContaining({ type: 'text' }),
      expect.objectContaining({ companyId: null, purpose: 'unknown_sender', billable: false })
    )
  })
})

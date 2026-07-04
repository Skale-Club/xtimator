import { describe, it, expect, vi, beforeEach } from 'vitest'

// Billing v2: the credit gate now runs before dispatch — stub it permissive so
// these tests stay focused on their own contract (the gate has its own tests).
vi.mock('@/lib/billing/credit-ledger', () => ({
  // plain async fn (not vi.fn) so global mock resets can never strip the value
  checkCredits: async () => ({ allowed: true, balance: 1000, shortfall: 0 }),
}))

/**
 * Quick task 260603-lrf — Task 3.
 *
 * handler.ts no longer rejects awaiting_confirm media with a canned "reply send
 * or cancel". Instead, awaiting_confirm inbound (audio/photo/text) dispatches
 * EVENT_WHATSAPP_INTENT so the intent router (running in Inngest) decides.
 * The no-session path still dispatches EVENT_WHATSAPP_PROCESS, and the read
 * receipt + typing indicator still fire BEFORE any dispatch.
 */

const mockInngestSend = vi.fn().mockResolvedValue({ ids: ['evt-1'] })
vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: (...args: unknown[]) => mockInngestSend(...args) },
}))

vi.mock('@/lib/entitlements', () => ({
  getEntitlements: vi.fn(),
}))

const mockMarkRead = vi.fn().mockResolvedValue(undefined)
const mockTyping = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/whatsapp/client', () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue(undefined),
  downloadWhatsAppMedia: vi.fn(),
  markMessageAsRead: (...a: unknown[]) => mockMarkRead(...a),
  sendTypingIndicator: (...a: unknown[]) => mockTyping(...a),
}))

vi.mock('@/lib/whatsapp/confirm', () => ({
  processConfirmationReply: vi.fn(),
}))

// Redis buffer — force the Redis-unavailable fast path for no-session so the
// dispatch happens synchronously without a debounce timer.
vi.mock('@/lib/whatsapp/buffer', () => ({
  pushToBuffer: vi.fn().mockResolvedValue(false),
  tryClaimBuffer: vi.fn(),
  debounceWait: vi.fn().mockResolvedValue(undefined),
}))

import { processInboundWithDebounce } from '@/lib/whatsapp/handler'
import { sendWhatsAppMessage } from '@/lib/whatsapp/client'
import { pushToBuffer, tryClaimBuffer } from '@/lib/whatsapp/buffer'
import { getEntitlements } from '@/lib/entitlements'
import type { WhatsAppMessage } from '@/lib/whatsapp/types'

const mockSend = vi.mocked(sendWhatsAppMessage)
const mockGetEntitlements = vi.mocked(getEntitlements)

function makeSupabaseMock({
  existingSession = null,
  projectId = 'proj-1',
  companyTier = 'trial',
}: {
  existingSession?: object | null
  projectId?: string
  companyTier?: string
} = {}) {
  const fromMock = vi.fn().mockImplementation((table: string) => {
    if (table === 'companies') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { tier: companyTier }, error: null }),
          }),
        }),
      }
    }
    if (table === 'whatsapp_sessions') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              gt: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({ data: existingSession, error: null }),
                  }),
                }),
              }),
            }),
          }),
        }),
      }
    }
    if (table === 'projects') {
      return {
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: projectId }, error: null }),
          }),
        }),
      }
    }
    return { insert: vi.fn().mockResolvedValue({ error: null }) }
  })
  return { client: { from: fromMock } as never }
}

const TEXT: WhatsAppMessage = {
  id: 'wamid.text',
  from: '15551234567',
  timestamp: '1',
  type: 'text',
  text: { body: 'send it now' },
}

const AUDIO: WhatsAppMessage = {
  id: 'wamid.audio',
  from: '15551234567',
  timestamp: '1',
  type: 'audio',
  audio: { id: 'media-a', mime_type: 'audio/ogg' },
}

beforeEach(() => {
  vi.clearAllMocks()
  mockInngestSend.mockResolvedValue({ ids: ['evt-1'] })
  mockMarkRead.mockResolvedValue(undefined)
  mockTyping.mockResolvedValue(undefined)
  mockGetEntitlements.mockReturnValue({
    whatsappEnabled: true,
    maxEstimatesPerMonth: null,
    maxEstimatesPerDay: 20,
    maxPhotosPerEstimate: 10,
    maxAudioMinutesPerEstimate: 5,
    maxPriceResearchPerMonth: null,
    monthlyCreditGrant: 2000,
    pdfEnabled: true,
    priceBookEnabled: true,
    customDomainEnabled: false,
  })
})

const CONFIRM_SESSION = {
  id: 'sess-1',
  state: 'awaiting_confirm',
  draft_project_id: 'p-1',
  draft_estimate_id: 'e-1',
}

describe('handler intent routing (Task 3)', () => {
  it('Test 1: awaiting_confirm + audio → dispatches EVENT_WHATSAPP_INTENT (not the canned reply)', async () => {
    const { client } = makeSupabaseMock({ existingSession: CONFIRM_SESSION })

    await processInboundWithDebounce(AUDIO, 'company-1', '15551234567', client)

    expect(mockInngestSend).toHaveBeenCalledTimes(1)
    const event = mockInngestSend.mock.calls[0][0] as {
      name: string
      data: { message: WhatsAppMessage; session: unknown; fromPhone: string; ownerPhone: string }
    }
    expect(event.name).toBe('whatsapp/intent.requested')
    expect(event.data.message.type).toBe('audio')
    expect(event.data.session).toBeTruthy()
    expect(event.data.fromPhone).toBe('15551234567')
    expect(event.data.ownerPhone).toBe('+15551234567')
    // No canned "reply send or cancel" reminder
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('Test 2: awaiting_confirm + text → still dispatches EVENT_WHATSAPP_INTENT (classifier decides)', async () => {
    const { client } = makeSupabaseMock({ existingSession: CONFIRM_SESSION })

    await processInboundWithDebounce(TEXT, 'company-1', '15551234567', client)

    expect(mockInngestSend).toHaveBeenCalledTimes(1)
    const event = mockInngestSend.mock.calls[0][0] as { name: string }
    expect(event.name).toBe('whatsapp/intent.requested')
  })

  it('Test 3: no session (Redis-unavailable) → dispatches EVENT_WHATSAPP_INTENT with session=null', async () => {
    // Standalone questions like "qual o último estimate do cliente X" must reach
    // the QUERY path even with no active session — a single no-session message now
    // goes through the intent classifier instead of straight to CREATE.
    const { client } = makeSupabaseMock({ existingSession: null, projectId: 'proj-new' })

    await processInboundWithDebounce(TEXT, 'company-1', '15551234567', client)

    expect(mockInngestSend).toHaveBeenCalledTimes(1)
    const event = mockInngestSend.mock.calls[0][0] as { name: string; data: { session: unknown } }
    expect(event.name).toBe('whatsapp/intent.requested')
    expect(event.data.session).toBeNull()
  })

  it('Test 4: markMessageAsRead + sendTypingIndicator fire before any dispatch', async () => {
    const { client } = makeSupabaseMock({ existingSession: CONFIRM_SESSION })

    const order: string[] = []
    mockMarkRead.mockImplementation(async () => {
      order.push('read')
    })
    mockTyping.mockImplementation(async () => {
      order.push('typing')
    })
    mockInngestSend.mockImplementation(async () => {
      order.push('dispatch')
      return { ids: ['x'] }
    })

    await processInboundWithDebounce(AUDIO, 'company-1', '15551234567', client)

    expect(order[0]).toBe('read')
    expect(order[1]).toBe('typing')
    expect(order).toContain('dispatch')
    expect(order.indexOf('dispatch')).toBeGreaterThan(order.indexOf('typing'))
  })

  it('intent batchKey uses the wa-intent-{messageId} idempotency pattern', async () => {
    const { client } = makeSupabaseMock({ existingSession: CONFIRM_SESSION })
    await processInboundWithDebounce(AUDIO, 'company-1', '15551234567', client)
    const event = mockInngestSend.mock.calls[0][0] as {
      id: string
      data: { batchKey: string }
    }
    expect(event.data.batchKey).toBe('wa-intent-wamid.audio')
    expect(event.id).toBe('wa-intent-wamid.audio')
  })

  it('Test 5: no session + debounced single-message batch → EVENT_WHATSAPP_INTENT (session=null)', async () => {
    vi.mocked(pushToBuffer).mockResolvedValueOnce(true)
    vi.mocked(tryClaimBuffer).mockResolvedValueOnce([{ message: TEXT }] as never)
    const { client } = makeSupabaseMock({ existingSession: null })

    await processInboundWithDebounce(TEXT, 'company-1', '15551234567', client)

    expect(mockInngestSend).toHaveBeenCalledTimes(1)
    const event = mockInngestSend.mock.calls[0][0] as { name: string; data: { session: unknown } }
    expect(event.name).toBe('whatsapp/intent.requested')
    expect(event.data.session).toBeNull()
  })

  it('Test 6: no session + debounced multi-message batch → EVENT_WHATSAPP_PROCESS (batch CREATE preserved)', async () => {
    vi.mocked(pushToBuffer).mockResolvedValueOnce(true)
    vi.mocked(tryClaimBuffer).mockResolvedValueOnce([
      { message: AUDIO },
      { message: TEXT },
    ] as never)
    const { client } = makeSupabaseMock({ existingSession: null, projectId: 'proj-batch' })

    await processInboundWithDebounce(AUDIO, 'company-1', '15551234567', client)

    expect(mockInngestSend).toHaveBeenCalledTimes(1)
    const event = mockInngestSend.mock.calls[0][0] as { name: string }
    expect(event.name).toBe('whatsapp/process.requested')
  })
})

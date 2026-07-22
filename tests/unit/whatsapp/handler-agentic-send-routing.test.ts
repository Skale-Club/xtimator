import { describe, it, expect, vi, beforeEach } from 'vitest'

// Billing v2: the credit gate now runs on every request — stub it permissive so
// these tests stay focused on their own contract (the gate has its own tests).
vi.mock('@/lib/billing/credit-ledger', () => ({
  // plain async fn (not vi.fn) so global mock resets can never strip the value
  checkCredits: async () => ({ allowed: true, balance: 1000, shortfall: 0 }),
}))

/**
 * Phase 178 Plan 03 (AGENT-01) — Task 2.
 *
 * BOTH processInboundWithDebounce and processInboundMessage gain an early
 * pending-confirmation check (resolvePendingByChannelRef), inserted right
 * after markMessageAsRead/sendTypingIndicator and BEFORE the whatsapp_sessions
 * query — bypassing debounce/batching entirely, mirroring the awaiting_confirm
 * branch but independent of it (a pending send is not a whatsapp_sessions row).
 * Mock harness cloned from tests/unit/whatsapp/handler.test.ts.
 */

const mockInngestSend = vi.fn().mockResolvedValue({ ids: ['evt-1'] })
vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: (...args: unknown[]) => mockInngestSend(...args) },
}))

vi.mock('@/lib/entitlements-server', () => ({
  getEntitlementsForTier: vi.fn(),
}))

vi.mock('@/lib/whatsapp/client', () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue(undefined),
  downloadWhatsAppMedia: vi.fn(),
  markMessageAsRead: vi.fn().mockResolvedValue(undefined),
  sendTypingIndicator: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/whatsapp/confirm', () => ({
  processConfirmationReply: vi.fn(),
}))

// --- agentic-send pending-confirmation pre-check (new for 178-03) ---------
const mockResolvePending = vi.fn()
vi.mock('@/lib/notifications/agentic-send-confirm', () => ({
  resolvePendingByChannelRef: (...a: unknown[]) => mockResolvePending(...a),
}))

import { processInboundMessage, processInboundWithDebounce } from '@/lib/whatsapp/handler'
import { sendWhatsAppMessage } from '@/lib/whatsapp/client'
import { processConfirmationReply } from '@/lib/whatsapp/confirm'
import { getEntitlementsForTier } from '@/lib/entitlements-server'
import type { WhatsAppMessage } from '@/lib/whatsapp/types'

const mockSend = vi.mocked(sendWhatsAppMessage)
const mockConfirm = vi.mocked(processConfirmationReply)
const mockGetEntitlements = vi.mocked(getEntitlementsForTier)

function makeSupabaseMock({
  existingSession = null,
  projectId = 'project-wa-1',
  companyTier = 'trial',
}: {
  existingSession?: object | null
  projectId?: string
  companyTier?: string
} = {}) {
  const projectInsertSpy = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: { id: projectId }, error: null }),
    }),
  })

  const fromMock = vi.fn().mockImplementation((table: string) => {
    if (table === 'companies') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi
              .fn()
              .mockResolvedValue({ data: { tier: companyTier }, error: null }),
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
                    single: vi
                      .fn()
                      .mockResolvedValue({ data: existingSession, error: null }),
                  }),
                }),
              }),
            }),
          }),
        }),
      }
    }

    if (table === 'projects') {
      return { insert: projectInsertSpy }
    }

    return { insert: vi.fn().mockResolvedValue({ error: null }) }
  })

  return { client: { from: fromMock } as never, projectInsertSpy }
}

const TEXT_MESSAGE: WhatsAppMessage = {
  id: 'wamid.abc',
  from: '15551234567',
  timestamp: '1234567890',
  type: 'text',
  text: { body: 'Replace my kitchen cabinets and countertops' },
}

const PENDING_ROW = {
  id: 'pending-1',
  companyId: 'company-1',
  clientId: 'client-1',
  channel: 'sms' as const,
  subject: null,
  body: 'hello',
  triggerSource: 'agentic-whatsapp' as const,
  channelRef: '+15551234567',
  token: null,
  status: 'pending' as const,
  expiresAt: '2099-01-01T00:00:00.000Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockInngestSend.mockResolvedValue({ ids: ['evt-1'] })
  mockResolvePending.mockResolvedValue(null)
  mockGetEntitlements.mockResolvedValue({
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
    chatEnabled: true,
  })
})

describe.each([
  ['processInboundMessage', processInboundMessage],
  ['processInboundWithDebounce', processInboundWithDebounce],
] as const)('%s — agentic-send pending-confirmation early routing (Phase 178-03)', (_name, fn) => {
  it('pending row → dispatches EVENT_WHATSAPP_INTENT (session: null) BEFORE any whatsapp_sessions query result is consulted, even with no awaiting_confirm session', async () => {
    mockResolvePending.mockResolvedValue(PENDING_ROW)
    const { client } = makeSupabaseMock({ existingSession: null })

    await fn(TEXT_MESSAGE, 'company-1', '15551234567', client)

    expect(mockResolvePending).toHaveBeenCalledTimes(1)
    expect(mockInngestSend).toHaveBeenCalledOnce()
    const event = mockInngestSend.mock.calls[0][0] as { name: string; data: { session: unknown } }
    expect(event.name).toBe('whatsapp/intent.requested')
    expect(event.data.session).toBeNull()
    // No canned reply, no confirmation-reply flow — the intent router owns it.
    expect(mockConfirm).not.toHaveBeenCalled()
  })
})

// The "no pending row" regression is asserted PER function, since the two
// twins' no-session behavior legitimately differs (processInboundMessage
// dispatches EVENT_WHATSAPP_PROCESS directly; processInboundWithDebounce
// routes a no-session single message through the debounce buffer, which
// falls back to EVENT_WHATSAPP_INTENT when Redis is unavailable in this test
// env — see tests/unit/whatsapp/handler-intent-routing.test.ts Test 3). The
// pending-confirmation check itself must be a strict no-op either way.
describe('processInboundMessage — no pending row (regression)', () => {
  it('existing behavior completely unchanged: no session, single text → dispatches CREATE path', async () => {
    mockResolvePending.mockResolvedValue(null)
    const { client } = makeSupabaseMock({ projectId: 'proj-text' })

    await processInboundMessage(TEXT_MESSAGE, 'company-1', '15551234567', client)

    expect(mockInngestSend).toHaveBeenCalledOnce()
    const event = mockInngestSend.mock.calls[0][0] as {
      name: string
      data: { companyId: string; projectId: string; ownerPhone: string }
    }
    expect(event.name).toBe('whatsapp/process.requested')
    expect(event.data.companyId).toBe('company-1')
    expect(event.data.projectId).toBe('proj-text')
    expect(event.data.ownerPhone).toBe('+15551234567')
  })
})

describe('processInboundWithDebounce — no pending row (regression)', () => {
  it('existing behavior completely unchanged: no session, single text (Redis unavailable in test env) → dispatches via the intent classifier with session=null', async () => {
    mockResolvePending.mockResolvedValue(null)
    const { client } = makeSupabaseMock({ existingSession: null, projectId: 'proj-text' })

    await processInboundWithDebounce(TEXT_MESSAGE, 'company-1', '15551234567', client)

    expect(mockInngestSend).toHaveBeenCalledOnce()
    const event = mockInngestSend.mock.calls[0][0] as { name: string; data: { session: unknown } }
    expect(event.name).toBe('whatsapp/intent.requested')
    expect(event.data.session).toBeNull()
  })
})

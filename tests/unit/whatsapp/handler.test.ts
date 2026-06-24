import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Phase 67 (INNGEST-07): handler.ts is dispatch-only.
 *
 * After Plan 67-04 refactor, processInboundMessage:
 *   1. UX feedback (markMessageAsRead + sendTypingIndicator)
 *   2. Session gate — if awaiting_confirm, delegate to processConfirmationReply
 *   3. Otherwise delegate to processInboundMessages([msg]) which:
 *      - Entitlement gate (free tier rejection — no orphan drafts)
 *      - Draft project insert
 *      - inngest.send({ name: 'whatsapp/process.requested', ... })
 *
 * Inline Whisper / Vision / generate-estimate / session-create / confirmation-reply
 * moved to the whatsAppProcessJob Inngest function (Plan 67-02). Those flows are
 * covered by tests/unit/inngest/* — not retested here.
 */

const mockInngestSend = vi.fn().mockResolvedValue({ ids: ['evt-1'] })
vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: (...args: unknown[]) => mockInngestSend(...args) },
}))

vi.mock('@/lib/entitlements', () => ({
  getEntitlements: vi.fn(),
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

import { processInboundMessage } from '@/lib/whatsapp/handler'
import { sendWhatsAppMessage } from '@/lib/whatsapp/client'
import { processConfirmationReply } from '@/lib/whatsapp/confirm'
import { getEntitlements } from '@/lib/entitlements'
import type { WhatsAppMessage } from '@/lib/whatsapp/types'

const mockSend = vi.mocked(sendWhatsAppMessage)
const mockConfirm = vi.mocked(processConfirmationReply)
const mockGetEntitlements = vi.mocked(getEntitlements)

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

const AUDIO_MESSAGE: WhatsAppMessage = {
  id: 'wamid.audio1',
  from: '15551234567',
  timestamp: '1234567890',
  type: 'audio',
  audio: { id: 'media-audio-id', mime_type: 'audio/ogg' },
}

const IMAGE_MESSAGE: WhatsAppMessage = {
  id: 'wamid.img1',
  from: '15551234567',
  timestamp: '1234567890',
  type: 'image',
  image: { id: 'media-img-id', mime_type: 'image/jpeg', caption: 'broken tile' },
}

describe('processInboundMessage (handler.ts — dispatch-only after Plan 67-04)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInngestSend.mockResolvedValue({ ids: ['evt-1'] })
    mockGetEntitlements.mockReturnValue({
      whatsappEnabled: true,
      maxEstimatesPerMonth: null,
      maxEstimatesPerDay: 20,
      maxPhotosPerEstimate: 10,
      maxAudioMinutesPerEstimate: 5,
      maxPriceResearchPerMonth: null,
      pdfEnabled: true,
      priceBookEnabled: true,
      customDomainEnabled: false,
    })
  })

  describe('awaiting_confirm session gate (Quick task 260603-lrf: routed via intent classifier)', () => {
    it('dispatches a text reply to EVENT_WHATSAPP_INTENT (classifier decides, not a regex)', async () => {
      const { client } = makeSupabaseMock({
        existingSession: {
          id: 'session-1',
          state: 'awaiting_confirm',
          draft_project_id: 'p-1',
          draft_estimate_id: 'e-1',
        },
      })

      await processInboundMessage(TEXT_MESSAGE, 'company-1', '15551234567', client)

      expect(mockInngestSend).toHaveBeenCalledOnce()
      const event = mockInngestSend.mock.calls[0][0] as { name: string }
      expect(event.name).toBe('whatsapp/intent.requested')
      // No inline confirmation reply — the router owns that now.
      expect(mockConfirm).not.toHaveBeenCalled()
    })

    it('dispatches non-text (audio) to EVENT_WHATSAPP_INTENT instead of the old canned reminder', async () => {
      const { client } = makeSupabaseMock({
        existingSession: {
          id: 'session-1',
          state: 'awaiting_confirm',
          draft_project_id: 'p-1',
          draft_estimate_id: 'e-1',
        },
      })

      await processInboundMessage(AUDIO_MESSAGE, 'company-1', '15551234567', client)

      expect(mockInngestSend).toHaveBeenCalledOnce()
      const event = mockInngestSend.mock.calls[0][0] as {
        name: string
        data: { message: { type: string } }
      }
      expect(event.name).toBe('whatsapp/intent.requested')
      expect(event.data.message.type).toBe('audio')
      // No canned "reply send or cancel" reminder
      expect(mockSend).not.toHaveBeenCalled()
    })
  })

  describe('awaiting_details session routing', () => {
    it('re-dispatches to the SAME project without creating a new one', async () => {
      const { client, projectInsertSpy } = makeSupabaseMock({
        existingSession: {
          id: 'session-1',
          state: 'awaiting_details',
          draft_project_id: 'p-1',
          draft_estimate_id: null,
        },
      })

      await processInboundMessage(TEXT_MESSAGE, 'company-1', '15551234567', client)

      // Re-dispatched once to the existing project
      expect(mockInngestSend).toHaveBeenCalledOnce()
      const event = mockInngestSend.mock.calls[0][0] as {
        data: { projectId: string }
      }
      expect(event.data.projectId).toBe('p-1')

      // No new project, no confirmation reply
      expect(projectInsertSpy).not.toHaveBeenCalled()
      expect(mockConfirm).not.toHaveBeenCalled()
    })
  })

  describe('dispatch path (no session)', () => {
    it('dispatches text message via inngest.send with batch payload', async () => {
      const { client } = makeSupabaseMock({ projectId: 'proj-text' })

      await processInboundMessage(TEXT_MESSAGE, 'company-1', '15551234567', client)

      expect(mockInngestSend).toHaveBeenCalledOnce()
      const event = mockInngestSend.mock.calls[0][0] as {
        name: string
        id: string
        data: {
          companyId: string
          projectId: string
          ownerPhone: string
          messages: unknown[]
        }
      }
      expect(event.name).toBe('whatsapp/process.requested')
      expect(event.id).toBe('wa-batch-wamid.abc')
      expect(event.data.companyId).toBe('company-1')
      expect(event.data.projectId).toBe('proj-text')
      expect(event.data.ownerPhone).toBe('+15551234567')
      expect(event.data.messages).toHaveLength(1)
    })

    it('dispatches audio message without any inline Whisper / OpenAI fetch', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        text: async () => '',
      } as Response)

      const { client } = makeSupabaseMock()
      await processInboundMessage(AUDIO_MESSAGE, 'company-1', '15551234567', client)

      const openaiCalls = fetchSpy.mock.calls.filter((c) =>
        String(c[0]).includes('api.openai.com')
      )
      expect(openaiCalls.length).toBe(0)
      expect(mockInngestSend).toHaveBeenCalledOnce()

      fetchSpy.mockRestore()
    })

    it('dispatches image message without any inline Vision / Anthropic call', async () => {
      const { client } = makeSupabaseMock()
      await processInboundMessage(IMAGE_MESSAGE, 'company-1', '15551234567', client)

      expect(mockInngestSend).toHaveBeenCalledOnce()
      const event = mockInngestSend.mock.calls[0][0] as {
        data: { messages: WhatsAppMessage[] }
      }
      expect(event.data.messages[0]?.type).toBe('image')
    })

    it('creates one draft project before dispatch (pre-flight stays)', async () => {
      const { client, projectInsertSpy } = makeSupabaseMock()
      await processInboundMessage(TEXT_MESSAGE, 'company-1', '15551234567', client)
      expect(projectInsertSpy).toHaveBeenCalledOnce()
    })
  })

  describe('WhatsApp entitlement gate', () => {
    it('rejects free tier before any dispatch and sends upgrade message', async () => {
      mockGetEntitlements.mockReturnValue({
        whatsappEnabled: false,
        maxEstimatesPerMonth: 10,
        maxEstimatesPerDay: 3,
        maxPhotosPerEstimate: 3,
        maxAudioMinutesPerEstimate: 2,
        maxPriceResearchPerMonth: 50,
        pdfEnabled: true,
        priceBookEnabled: false,
        customDomainEnabled: false,
      })

      const { client, projectInsertSpy } = makeSupabaseMock({ companyTier: 'free' })
      await processInboundMessage(AUDIO_MESSAGE, 'company-1', '15551234567', client)

      expect(projectInsertSpy).not.toHaveBeenCalled()
      expect(mockInngestSend).not.toHaveBeenCalled()
      expect(mockSend).toHaveBeenCalledWith(
        '+15551234567',
        expect.objectContaining({
          type: 'text',
          text: expect.objectContaining({
            body: expect.stringContaining('/settings/billing'),
          }),
        })
      )
    })
  })
})

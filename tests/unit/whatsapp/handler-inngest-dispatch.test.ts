import { describe, it, expect, vi, beforeEach } from 'vitest'

// Billing v2: the credit gate now runs on every request — stub it permissive so
// these tests stay focused on their own contract (the gate has its own tests).
vi.mock('@/lib/billing/credit-ledger', () => ({
  // plain async fn (not vi.fn) so global mock resets can never strip the value
  checkCredits: async () => ({ allowed: true, balance: 1000, shortfall: 0 }),
}))

/**
 * INNGEST-07 / Plan 67-04: lib/whatsapp/handler.ts dispatches via Inngest.
 *
 * processInboundMessages used to run Whisper + Vision + estimate generation
 * inline. After Plan 67-04 it must:
 *   - keep pre-flight (entitlements check, project draft creation, sendTypingIndicator)
 *   - dispatch the batch via inngest.send({ name: 'whatsapp/process.requested', ... })
 *   - NOT call fetch to api.openai.com (no inline Whisper)
 *   - NOT instantiate Anthropic SDK (no inline Vision)
 *   - NOT call generateEstimateForProject directly (deferred to Inngest worker)
 */

// ---- Mocks ----
const mockInngestSend = vi.fn().mockResolvedValue({ ids: ['evt-1'] })
vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: (...args: unknown[]) => mockInngestSend(...args) },
}))

vi.mock('@/lib/entitlements-server', () => ({
  getEntitlementsForTier: vi.fn(),
}))

vi.mock('@/lib/services/generate-estimate', () => ({
  generateEstimateForProject: vi.fn(),
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

vi.mock('@/lib/platform-config', () => ({
  getIntegrationKey: vi.fn(),
}))

const mockAnthropicCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: (...args: unknown[]) => mockAnthropicCreate(...args) }
  },
}))

import { processInboundMessages } from '@/lib/whatsapp/handler'
import { generateEstimateForProject } from '@/lib/services/generate-estimate'
import { getEntitlementsForTier } from '@/lib/entitlements-server'
import { sendWhatsAppMessage, downloadWhatsAppMedia } from '@/lib/whatsapp/client'
import { getIntegrationKey } from '@/lib/platform-config'
import type { WhatsAppMessage } from '@/lib/whatsapp/types'

const mockGenerate = vi.mocked(generateEstimateForProject)
const mockGetEntitlements = vi.mocked(getEntitlementsForTier)
const mockSend = vi.mocked(sendWhatsAppMessage)
const mockDownload = vi.mocked(downloadWhatsAppMedia)
const mockGetKey = vi.mocked(getIntegrationKey)

function makeSupabase({
  companyTier = 'trial',
  projectId = 'project-wa-1',
}: { companyTier?: string; projectId?: string } = {}) {
  const insertSpy = vi.fn().mockResolvedValue({ error: null })

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
    if (table === 'projects') {
      return {
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi
              .fn()
              .mockResolvedValue({ data: { id: projectId }, error: null }),
          }),
        }),
      }
    }
    return { insert: insertSpy }
  })

  return { client: { from: fromMock } as never, insertSpy }
}

const TEXT_MSG: WhatsAppMessage = {
  id: 'wamid.text1',
  from: '15551234567',
  timestamp: '0',
  type: 'text',
  text: { body: 'kitchen reno' },
}
const AUDIO_MSG: WhatsAppMessage = {
  id: 'wamid.audio1',
  from: '15551234567',
  timestamp: '0',
  type: 'audio',
  audio: { id: 'media-aud', mime_type: 'audio/ogg' },
}
const IMAGE_MSG: WhatsAppMessage = {
  id: 'wamid.img1',
  from: '15551234567',
  timestamp: '0',
  type: 'image',
  image: { id: 'media-img', mime_type: 'image/jpeg' },
}

describe('INNGEST-07: lib/whatsapp/handler dispatch', () => {
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
      monthlyCreditGrant: 2000,
      pdfEnabled: true,
      priceBookEnabled: true,
      customDomainEnabled: false,
    })
  })

  it('calls inngest.send with name "whatsapp/process.requested" for inbound batches', async () => {
    const { client } = makeSupabase()
    await processInboundMessages([TEXT_MSG], 'company-1', '15551234567', client)
    expect(mockInngestSend).toHaveBeenCalledOnce()
    const event = mockInngestSend.mock.calls[0][0] as { name: string }
    expect(event.name).toBe('whatsapp/process.requested')
  })

  it('no longer awaits Whisper inline (no fetch to api.openai.com) for audio messages', async () => {
    mockGetKey.mockResolvedValue('sk-openai-test')
    mockDownload.mockResolvedValue(Buffer.from('fake'))
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => '',
    } as Response)

    const { client } = makeSupabase()
    await processInboundMessages([AUDIO_MSG], 'company-1', '15551234567', client)

    const openaiCalls = fetchSpy.mock.calls.filter((c) =>
      String(c[0]).includes('api.openai.com')
    )
    expect(openaiCalls.length).toBe(0)
    expect(mockDownload).not.toHaveBeenCalled()

    fetchSpy.mockRestore()
  })

  it('no longer instantiates Anthropic SDK / calls Vision inline for image messages', async () => {
    mockGetKey.mockResolvedValue('anthropic-key-test')
    mockDownload.mockResolvedValue(Buffer.from('fake-image'))

    const { client } = makeSupabase()
    await processInboundMessages([IMAGE_MSG], 'company-1', '15551234567', client)

    expect(mockAnthropicCreate).not.toHaveBeenCalled()
    expect(mockDownload).not.toHaveBeenCalled()
  })

  it('does NOT call generateEstimateForProject directly (deferred to Inngest worker)', async () => {
    const { client } = makeSupabase()
    await processInboundMessages([TEXT_MSG], 'company-1', '15551234567', client)
    expect(mockGenerate).not.toHaveBeenCalled()
  })

  it('event id uses pattern wa-batch-{lastMessageId} for idempotency', async () => {
    const { client } = makeSupabase()
    const second: WhatsAppMessage = { ...TEXT_MSG, id: 'wamid.text2' }
    await processInboundMessages(
      [TEXT_MSG, second],
      'company-1',
      '15551234567',
      client
    )
    const event = mockInngestSend.mock.calls[0][0] as {
      id: string
      data: { batchKey: string }
    }
    expect(event.id).toBe('wa-batch-wamid.text2')
    expect(event.data.batchKey).toBe('wa-batch-wamid.text2')
  })

  it('event payload contains companyId, projectId, ownerPhone, messages', async () => {
    const { client } = makeSupabase({ projectId: 'project-xyz' })
    await processInboundMessages(
      [TEXT_MSG, AUDIO_MSG],
      'company-abc',
      '15551234567',
      client
    )
    const event = mockInngestSend.mock.calls[0][0] as {
      data: {
        companyId: string
        projectId: string
        ownerPhone: string
        messages: unknown[]
      }
    }
    expect(event.data.companyId).toBe('company-abc')
    expect(event.data.projectId).toBe('project-xyz')
    expect(event.data.ownerPhone).toBe('+15551234567')
    expect(event.data.messages).toHaveLength(2)
  })

  it('entitlement gate still rejects free tier (no dispatch, sends rejection message)', async () => {
    mockGetEntitlements.mockReturnValue({
      whatsappEnabled: false,
      maxEstimatesPerMonth: 10,
      maxEstimatesPerDay: 3,
      maxPhotosPerEstimate: 3,
      maxAudioMinutesPerEstimate: 2,
      maxPriceResearchPerMonth: 50,
      monthlyCreditGrant: 0,
      pdfEnabled: true,
      priceBookEnabled: false,
      customDomainEnabled: false,
    })
    const { client } = makeSupabase({ companyTier: 'free' })
    await processInboundMessages([AUDIO_MSG], 'company-1', '15551234567', client)

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

  it('empty messages array returns early without dispatch', async () => {
    const { client } = makeSupabase()
    await processInboundMessages([], 'company-1', '15551234567', client)
    expect(mockInngestSend).not.toHaveBeenCalled()
  })

  it('creates a single draft project (pre-flight stays) and passes its id in the event', async () => {
    const { client } = makeSupabase({ projectId: 'draft-proj-1' })
    await processInboundMessages([TEXT_MSG], 'company-1', '15551234567', client)
    const event = mockInngestSend.mock.calls[0][0] as {
      data: { projectId: string }
    }
    expect(event.data.projectId).toBe('draft-proj-1')
  })
})

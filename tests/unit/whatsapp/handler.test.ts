import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/services/generate-estimate', () => ({
  generateEstimateForProject: vi.fn(),
}))

vi.mock('@/lib/whatsapp/client', () => ({
  sendWhatsAppMessage: vi.fn(),
  downloadWhatsAppMedia: vi.fn(),
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

import { processInboundMessage } from '@/lib/whatsapp/handler'
import { generateEstimateForProject } from '@/lib/services/generate-estimate'
import { sendWhatsAppMessage, downloadWhatsAppMedia } from '@/lib/whatsapp/client'
import { getIntegrationKey } from '@/lib/platform-config'
import type { WhatsAppMessage } from '@/lib/whatsapp/types'

const mockGenerate = vi.mocked(generateEstimateForProject)
const mockSend = vi.mocked(sendWhatsAppMessage)
const mockDownload = vi.mocked(downloadWhatsAppMedia)
const mockGetKey = vi.mocked(getIntegrationKey)

function makeSupabaseMock({
  existingSession = null,
  projectId = 'project-wa-1',
  estimateId = 'estimate-wa-1',
}: {
  existingSession?: object | null
  projectId?: string
  estimateId?: string
} = {}) {
  const insertSpy = vi.fn().mockResolvedValue({ error: null })
  const deleteSpy = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })

  const fromMock = vi.fn().mockImplementation((table: string) => {
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
        insert: insertSpy,
      }
    }

    if (table === 'projects') {
      return {
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: projectId },
              error: null,
            }),
          }),
        }),
        delete: deleteSpy,
      }
    }

    if (table === 'recordings') {
      return { insert: insertSpy }
    }

    if (table === 'photos') {
      return {
        insert: insertSpy,
        storage: {
          from: vi.fn().mockReturnValue({
            upload: vi.fn().mockResolvedValue({ error: null }),
          }),
        },
      }
    }

    if (table === 'estimates') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                total: 2500,
                summary: 'Kitchen renovation',
                sections: [{ title: 'Labor', subtotal: 1500 }, { title: 'Materials', subtotal: 1000 }],
              },
              error: null,
            }),
          }),
        }),
      }
    }

    return {
      insert: insertSpy,
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    }
  })

  // Storage mock at top-level supabase
  const storageMock = {
    from: vi.fn().mockReturnValue({
      upload: vi.fn().mockResolvedValue({ error: null }),
    }),
  }

  return { fromMock, insertSpy, deleteSpy, storageMock }
}

function makeSupabase(opts?: Parameters<typeof makeSupabaseMock>[0]) {
  const { fromMock, storageMock, insertSpy, deleteSpy } = makeSupabaseMock(opts)
  return {
    client: { from: fromMock, storage: storageMock } as never,
    insertSpy,
    deleteSpy,
  }
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

describe('processInboundMessage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockGenerate.mockResolvedValue({
      estimateId: 'estimate-wa-1',
      version: 1,
      clientSuggestion: null,
    })
    mockSend.mockResolvedValue(undefined)
    mockAnthropicCreate.mockReset()
  })

  describe('awaiting_confirm session gate', () => {
    it('sends reminder and returns when owner already has pending session', async () => {
      const { client } = makeSupabase({
        existingSession: { id: 'session-1', state: 'awaiting_confirm' },
      })

      await processInboundMessage(TEXT_MESSAGE, 'company-1', '15551234567', client)

      expect(mockSend).toHaveBeenCalledOnce()
      const [, body] = mockSend.mock.calls[0]
      expect((body as { text: { body: string } }).text.body).toMatch(/pending/)
      expect(mockGenerate).not.toHaveBeenCalled()
    })
  })

  describe('text message', () => {
    it('creates recording from text body, generates estimate, creates session, sends summary', async () => {
      const { client, insertSpy } = makeSupabase()

      await processInboundMessage(TEXT_MESSAGE, 'company-1', '15551234567', client)

      // Recording inserted
      expect(insertSpy).toHaveBeenCalledWith(
        expect.objectContaining({ transcript: TEXT_MESSAGE.text!.body })
      )

      // Estimate generated
      expect(mockGenerate).toHaveBeenCalledWith('company-1', 'project-wa-1')

      // Session created with awaiting_confirm
      expect(insertSpy).toHaveBeenCalledWith(
        expect.objectContaining({ state: 'awaiting_confirm' })
      )

      // Confirmation sent to owner
      expect(mockSend).toHaveBeenCalledWith('+15551234567', expect.any(Object))
      const confirmBody = (mockSend.mock.calls[0][1] as { text: { body: string } }).text.body
      expect(confirmBody).toMatch(/\$2,500/)
      expect(confirmBody).toMatch(/send/)
    })
  })

  describe('audio message', () => {
    it('transcribes audio via Whisper, creates recording, generates estimate', async () => {
      mockGetKey.mockResolvedValue('sk-openai-test')
      mockDownload.mockResolvedValue(Buffer.from('fake-audio'))

      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        text: async () => 'Replace the kitchen cabinets',
      } as Response)

      const { client } = makeSupabase()

      await processInboundMessage(AUDIO_MESSAGE, 'company-1', '15551234567', client)

      expect(mockDownload).toHaveBeenCalledWith('media-audio-id')
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.openai.com/v1/audio/transcriptions',
        expect.any(Object)
      )
      expect(mockGenerate).toHaveBeenCalledWith('company-1', 'project-wa-1')
      expect(mockSend).toHaveBeenCalledWith('+15551234567', expect.any(Object))

      fetchSpy.mockRestore()
    })

    it('sends error and cleans up project when Whisper fails', async () => {
      mockGetKey.mockResolvedValue('sk-openai-test')
      mockDownload.mockResolvedValue(Buffer.from('fake-audio'))

      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        text: async () => 'Rate limit',
      } as Response)

      const { client, deleteSpy } = makeSupabase()

      await processInboundMessage(AUDIO_MESSAGE, 'company-1', '15551234567', client)

      expect(mockGenerate).not.toHaveBeenCalled()
      const sentBody = (mockSend.mock.calls[0][1] as { text: { body: string } }).text.body
      expect(sentBody).toMatch(/trouble/)
      expect(deleteSpy).toHaveBeenCalled()

      fetchSpy.mockRestore()
    })
  })

  describe('image message', () => {
    it('downloads image, runs Claude Vision, saves photo, generates estimate', async () => {
      mockGetKey.mockResolvedValue('anthropic-key-test')
      mockDownload.mockResolvedValue(Buffer.from('fake-image'))
      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Cracked tile near window, needs replacement.' }],
      })

      const { client } = makeSupabase()

      await processInboundMessage(IMAGE_MESSAGE, 'company-1', '15551234567', client)

      expect(mockDownload).toHaveBeenCalledWith('media-img-id')
      expect(mockAnthropicCreate).toHaveBeenCalledOnce()
      expect(mockGenerate).toHaveBeenCalledWith('company-1', 'project-wa-1')
      expect(mockSend).toHaveBeenCalledWith('+15551234567', expect.any(Object))
    })
  })

  describe('unknown message type', () => {
    it('sends help message and does not generate estimate', async () => {
      const unknownMessage: WhatsAppMessage = {
        id: 'wamid.unknown',
        from: '15551234567',
        timestamp: '1234567890',
        type: 'unknown',
      }

      const { client, deleteSpy } = makeSupabase()

      await processInboundMessage(unknownMessage, 'company-1', '15551234567', client)

      expect(mockGenerate).not.toHaveBeenCalled()
      const sentBody = (mockSend.mock.calls[0][1] as { text: { body: string } }).text.body
      expect(sentBody).toMatch(/audio|text|photo/i)
      expect(deleteSpy).toHaveBeenCalled()
    })
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/whatsapp/client', () => ({
  sendWhatsAppMessage: vi.fn(),
}))

import { processConfirmationReply } from '@/lib/whatsapp/confirm'
import { sendWhatsAppMessage } from '@/lib/whatsapp/client'

const mockSend = vi.mocked(sendWhatsAppMessage)

const OWNER_PHONE = '+15551234567'
const COMPANY_ID = 'company-1'

const BASE_SESSION = {
  id: 'session-1',
  state: 'awaiting_confirm',
  draft_project_id: 'project-1',
  draft_estimate_id: 'estimate-1',
}

function makeSupabase({
  clientPhone = null as string | null,
  clientName = 'Johnson' as string | null,
} = {}) {
  const deleteSpy = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  })
  const updateSpy = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  })

  const fromMock = vi.fn().mockImplementation((table: string) => {
    if (table === 'estimates') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'estimate-1', share_token: 'tok-abc', total: 2500, summary: 'Reno' },
              error: null,
            }),
          }),
        }),
        update: updateSpy,
      }
    }
    if (table === 'projects') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'project-1', client_id: clientPhone ? 'client-1' : null },
              error: null,
            }),
          }),
        }),
        update: updateSpy,
        delete: deleteSpy,
      }
    }
    if (table === 'clients') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { phone: clientPhone, name: clientName },
              error: null,
            }),
          }),
        }),
      }
    }
    if (table === 'whatsapp_sessions') {
      return { delete: deleteSpy }
    }
    return { delete: deleteSpy, update: updateSpy }
  })

  return { client: { from: fromMock } as never, deleteSpy, updateSpy }
}

describe('processConfirmationReply', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockSend.mockResolvedValue(undefined)
    process.env.NEXT_PUBLIC_APP_URL = 'https://xtimator.com'
  })

  describe('command parsing', () => {
    it('sends help message for unrecognized input', async () => {
      const { client } = makeSupabase()
      await processConfirmationReply('sure thing', BASE_SESSION, COMPANY_ID, OWNER_PHONE, client)

      expect(mockSend).toHaveBeenCalledOnce()
      const body = (mockSend.mock.calls[0][1] as { text: { body: string } }).text.body
      expect(body).toMatch(/send.*cancel/i)
    })

    it('handles "send" with different casing', async () => {
      const { client } = makeSupabase()
      await processConfirmationReply('SEND', BASE_SESSION, COMPANY_ID, OWNER_PHONE, client)
      // Should not send help message — should send owner confirmation
      const body = (mockSend.mock.calls[mockSend.mock.calls.length - 1][1] as { text: { body: string } }).text.body
      expect(body).not.toMatch(/valid command/i)
      expect(body).toMatch(/estimate/i)
    })

    it('handles "cancel" with trailing punctuation', async () => {
      const { client } = makeSupabase()
      await processConfirmationReply('cancel!', BASE_SESSION, COMPANY_ID, OWNER_PHONE, client)
      const body = (mockSend.mock.calls[0][1] as { text: { body: string } }).text.body
      expect(body).toMatch(/discarded/i)
    })
  })

  describe('"send" command — no client phone', () => {
    it('marks estimate+project as sent, deletes session, sends share link to owner', async () => {
      const { client, deleteSpy, updateSpy } = makeSupabase({ clientPhone: null })

      await processConfirmationReply('send', BASE_SESSION, COMPANY_ID, OWNER_PHONE, client)

      // estimate + project updated to "sent"
      expect(updateSpy).toHaveBeenCalledWith({ status: 'sent' })

      // session deleted
      expect(deleteSpy).toHaveBeenCalled()

      // owner notified with share link
      const ownerMsg = (mockSend.mock.calls[mockSend.mock.calls.length - 1][1] as { text: { body: string } }).text.body
      expect(ownerMsg).toMatch(/estimate ready/i)
      expect(ownerMsg).toMatch(/xtimator\.com\/estimate\/tok-abc/)
    })
  })

  describe('"send" command — client has phone', () => {
    it('delivers share link to client phone and confirms to owner', async () => {
      const { client, updateSpy } = makeSupabase({ clientPhone: '+15559876543', clientName: 'Johnson' })

      await processConfirmationReply('send', BASE_SESSION, COMPANY_ID, OWNER_PHONE, client)

      // Client receives message
      const clientCall = mockSend.mock.calls.find(([to]) => to === '+15559876543')
      expect(clientCall).toBeDefined()
      expect((clientCall![1] as { text: { body: string } }).text.body).toMatch(/Johnson/)
      expect((clientCall![1] as { text: { body: string } }).text.body).toMatch(/xtimator\.com\/estimate\/tok-abc/)

      // Owner gets delivery confirmation
      const ownerMsg = (mockSend.mock.calls[mockSend.mock.calls.length - 1][1] as { text: { body: string } }).text.body
      expect(ownerMsg).toMatch(/sent/i)

      expect(updateSpy).toHaveBeenCalledWith({ status: 'sent' })
    })
  })

  describe('"cancel" command', () => {
    it('deletes project (cascade), deletes session, confirms to owner', async () => {
      const { client, deleteSpy } = makeSupabase()

      await processConfirmationReply('cancel', BASE_SESSION, COMPANY_ID, OWNER_PHONE, client)

      // project deleted
      expect(deleteSpy).toHaveBeenCalled()

      // owner notified
      const body = (mockSend.mock.calls[0][1] as { text: { body: string } }).text.body
      expect(body).toMatch(/discarded/i)
    })

    it('does not call generate or update estimate status on cancel', async () => {
      const { client, updateSpy } = makeSupabase()

      await processConfirmationReply('cancel', BASE_SESSION, COMPANY_ID, OWNER_PHONE, client)

      expect(updateSpy).not.toHaveBeenCalled()
    })
  })
})

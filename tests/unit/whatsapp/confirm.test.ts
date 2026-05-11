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

const BASE_ESTIMATE = {
  id: 'estimate-1',
  share_token: 'tok-abc',
  total: 2750,
  subtotal: 2500,
  tax_rate: 0.1,
  tax_amount: 250,
  summary: 'Kitchen reno',
  payment_terms: 'Net 30',
  timeline: '2 weeks',
  sections: [
    {
      title: 'Labor',
      subtotal: 2500,
      items: [{ description: 'Demo', quantity: 1, unit: null, unit_price: 2500, total: 2500 }],
    },
  ],
}

function makeSupabase({
  clientPhone = null as string | null,
  clientName = 'Johnson' as string | null,
  deliveryFormat = 'share_link' as string,
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
            single: vi.fn().mockResolvedValue({ data: BASE_ESTIMATE, error: null }),
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
    if (table === 'company_whatsapp') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { delivery_format: deliveryFormat },
              error: null,
            }),
          }),
        }),
      }
    }
    if (table === 'companies') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { name: 'Acme Builders' },
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
      expect(body).toMatch(/send/i)
      expect(body).toMatch(/cancel/i)
    })

    it('handles "send" with different casing', async () => {
      const { client } = makeSupabase()
      await processConfirmationReply('SEND', BASE_SESSION, COMPANY_ID, OWNER_PHONE, client)
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

  describe('"send" — share_link format (default)', () => {
    it('marks estimate+project as sent, deletes session, sends share link to owner', async () => {
      const { client, deleteSpy, updateSpy } = makeSupabase({ clientPhone: null })

      await processConfirmationReply('send', BASE_SESSION, COMPANY_ID, OWNER_PHONE, client)

      expect(updateSpy).toHaveBeenCalledWith({ status: 'sent' })
      expect(deleteSpy).toHaveBeenCalled()

      const ownerMsg = (mockSend.mock.calls[mockSend.mock.calls.length - 1][1] as { text: { body: string } }).text.body
      expect(ownerMsg).toMatch(/estimate ready/i)
      expect(ownerMsg).toMatch(/xtimator\.com\/estimate\/tok-abc/)
    })

    it('delivers share link to client phone and confirms to owner', async () => {
      const { client, updateSpy } = makeSupabase({
        clientPhone: '+15559876543',
        clientName: 'Johnson',
        deliveryFormat: 'share_link',
      })

      await processConfirmationReply('send', BASE_SESSION, COMPANY_ID, OWNER_PHONE, client)

      const clientCall = mockSend.mock.calls.find(([to]) => to === '+15559876543')
      expect(clientCall).toBeDefined()
      const clientBody = (clientCall![1] as { text: { body: string } }).text.body
      expect(clientBody).toMatch(/Johnson/)
      expect(clientBody).toMatch(/xtimator\.com\/estimate\/tok-abc/)
      // share_link should NOT contain section breakdowns
      expect(clientBody).not.toMatch(/Labor/)

      const ownerMsg = (mockSend.mock.calls[mockSend.mock.calls.length - 1][1] as { text: { body: string } }).text.body
      expect(ownerMsg).toMatch(/sent/i)
      expect(updateSpy).toHaveBeenCalledWith({ status: 'sent' })
    })
  })

  describe('"send" — formatted_text delivery format', () => {
    it('sends full formatted estimate to client instead of share link', async () => {
      const { client } = makeSupabase({
        clientPhone: '+15559876543',
        clientName: 'Johnson',
        deliveryFormat: 'formatted_text',
      })

      await processConfirmationReply('send', BASE_SESSION, COMPANY_ID, OWNER_PHONE, client)

      const clientCall = mockSend.mock.calls.find(([to]) => to === '+15559876543')
      expect(clientCall).toBeDefined()
      const clientBody = (clientCall![1] as { text: { body: string } }).text.body
      // Formatted text includes section title and total
      expect(clientBody).toMatch(/Labor/)
      expect(clientBody).toMatch(/Total/)
      // Formatted text includes company name
      expect(clientBody).toMatch(/Acme Builders/)
    })
  })

  describe('"cancel" command', () => {
    it('deletes project (cascade), deletes session, confirms to owner', async () => {
      const { client, deleteSpy } = makeSupabase()

      await processConfirmationReply('cancel', BASE_SESSION, COMPANY_ID, OWNER_PHONE, client)

      expect(deleteSpy).toHaveBeenCalled()
      const body = (mockSend.mock.calls[0][1] as { text: { body: string } }).text.body
      expect(body).toMatch(/discarded/i)
    })

    it('does not update estimate or project status on cancel', async () => {
      const { client, updateSpy } = makeSupabase()

      await processConfirmationReply('cancel', BASE_SESSION, COMPANY_ID, OWNER_PHONE, client)

      expect(updateSpy).not.toHaveBeenCalled()
    })
  })
})

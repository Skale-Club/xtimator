import { describe, it, expect, vi, beforeEach } from 'vitest'

// Imports the real confirm-actions chain at runtime; under
// vitest's reused forked worker the import can exceed the 5s default (import
// latency under contention). A timed-out sibling also bleeds a sendWhatsAppMessage
// spy call into this file's "help message" count assertion (called 2 times instead
// of once). Per-file timeout removes both. (Not a global config / mock-reset flag.)
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

vi.mock('@/lib/whatsapp/client', () => ({
  sendWhatsAppMessage: vi.fn(),
}))

// The end client is reached through the platform (email/SMS), never WhatsApp.
vi.mock('@/lib/notifications/deliver-estimate-to-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/notifications/deliver-estimate-to-client')>()
  return {
    ...actual,
    getClientContacts: vi.fn(),
    deliverEstimateToClient: vi.fn(),
  }
})

// The real agent calls the OpenAI API — replace with a deterministic stub that
// routes "send"/"cancel" through the real confirm-actions layer so the live
// confirm path (processConfirmationReply → actionSend/actionCancel → delivery
// formats) keeps its coverage without an LLM. Natural-language edits are the
// agent's job and are covered by the agent's own tests, not here.
const HELP_REPLY = 'Reply *send* to deliver the estimate to your client, or *cancel* to discard it.'

vi.mock('@/lib/whatsapp/agent', () => ({
  runConfirmationAgent: vi.fn(async (
    text: string,
    session: { id: string; draft_project_id: string | null; draft_estimate_id: string | null },
    companyId: string,
    ownerPhone: string,
    supabase: import('@supabase/supabase-js').SupabaseClient,
  ) => {
    const { actionSend, actionCancel } = await import('@/lib/whatsapp/confirm-actions')
    const { describeSendResult } = await import('@/lib/whatsapp/send-result-message')
    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/client')
    const { logOutboundMessage } = await import('@/lib/whatsapp/conversations')

    // Minimal verb detection: lowercase the first word, strip punctuation.
    const verb = text.trim().split(/\s+/)[0].toLowerCase().replace(/[^\w]/g, '')

    const reply = async (body: string) => {
      await sendWhatsAppMessage(ownerPhone, { type: 'text', text: { body } })
      logOutboundMessage(supabase, { companyId, contactPhone: ownerPhone, body, msgType: 'text', status: 'sent' }).catch(() => undefined)
    }

    if (verb === 'send') {
      const result = await actionSend(session as never, companyId, supabase)
      await reply(describeSendResult(result))
      return
    }
    if (verb === 'cancel') {
      await actionCancel(session as never, supabase)
      await reply("❌ Estimate discarded. Send a new audio, text, or photo when you're ready.")
      return
    }
    await reply(HELP_REPLY)
  }),
}))

import { processConfirmationReply } from '@/lib/whatsapp/confirm'
import { sendWhatsAppMessage } from '@/lib/whatsapp/client'
import { deliverEstimateToClient, getClientContacts } from '@/lib/notifications/deliver-estimate-to-client'

const mockSend = vi.mocked(sendWhatsAppMessage)
const mockContacts = vi.mocked(getClientContacts)
const mockDeliver = vi.mocked(deliverEstimateToClient)

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
  public_slug_token: null,
  language: 'en',
}

function makeSupabase({ clientId = 'client-1' as string | null } = {}) {
  const deleteSpy = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  })
  // Chainable update builder: supports .eq().eq().is() and is directly awaitable
  const makeUpdateChain = (): object => {
    const chain: Record<string, unknown> = {}
    chain['eq'] = vi.fn().mockReturnValue(chain)
    chain['is'] = vi.fn().mockReturnValue(chain)
    chain['then'] = (res: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(res)
    chain['catch'] = (rej: (e: unknown) => unknown) => Promise.resolve({ error: null }).catch(rej)
    return chain
  }
  const updateSpy = vi.fn().mockImplementation(makeUpdateChain)
  const single = (data: unknown) => ({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data, error: null }) }),
    }),
    update: updateSpy,
    delete: deleteSpy,
  })

  const fromMock = vi.fn().mockImplementation((table: string) => {
    if (table === 'estimates') return single(BASE_ESTIMATE)
    if (table === 'projects') return single({ id: 'project-1', client_id: clientId, name: 'Kitchen' })
    if (table === 'companies') return single({ name: 'Acme Builders', slug: 'acme' })
    if (table === 'whatsapp_sessions') return { delete: deleteSpy }
    return { delete: deleteSpy, update: updateSpy }
  })

  return { client: { from: fromMock } as never, deleteSpy, updateSpy }
}

const ownerMessage = () =>
  (mockSend.mock.calls[mockSend.mock.calls.length - 1]![1] as { text: { body: string } }).text.body

describe('processConfirmationReply', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockSend.mockResolvedValue(null)
    process.env.NEXT_PUBLIC_APP_URL = 'https://xtimator.com'
  })

  describe('command parsing', () => {
    it('sends help message for unrecognized input', async () => {
      const { client } = makeSupabase()
      await processConfirmationReply('sure thing', BASE_SESSION, COMPANY_ID, OWNER_PHONE, client)

      expect(mockSend).toHaveBeenCalledOnce()
      expect(ownerMessage()).toMatch(/send/i)
      expect(ownerMessage()).toMatch(/cancel/i)
    })

    it('handles "cancel" with trailing punctuation', async () => {
      const { client } = makeSupabase()
      await processConfirmationReply('cancel!', BASE_SESSION, COMPANY_ID, OWNER_PHONE, client)
      expect(ownerMessage()).toMatch(/discarded/i)
    })
  })

  describe('"send" — client delivery by email/SMS only', () => {
    it('with email and phone: delivers through the platform, marks sent, deletes session, never WhatsApps the client', async () => {
      const { client, deleteSpy, updateSpy } = makeSupabase()
      mockContacts.mockResolvedValue({ clientId: 'client-1', clientName: 'Johnson', email: 'j@example.com', phone: '+15559876543' })
      mockDeliver.mockResolvedValue({ status: 'sent', sent: ['email', 'sms'], failed: [] })

      await processConfirmationReply('send', BASE_SESSION, COMPANY_ID, OWNER_PHONE, client)

      expect(mockDeliver).toHaveBeenCalledOnce()
      const args = mockDeliver.mock.calls[0]![0]
      expect(args.businessName).toBe('Acme Builders')
      expect(args.shareUrl).toMatch(/xtimator\.com\/estimate\/.*tok-abc/)

      // No WhatsApp to the client phone: the only WhatsApp message is the owner's.
      expect(mockSend.mock.calls.some(([to]) => to === '+15559876543')).toBe(false)
      expect(mockSend).toHaveBeenCalledOnce()
      expect(mockSend.mock.calls[0]![0]).toBe(OWNER_PHONE)

      // One short owner confirmation naming the channels.
      expect(ownerMessage()).toMatch(/sent to Johnson by email and SMS/)
      expect(updateSpy).toHaveBeenCalledWith({ status: 'sent' })
      expect(deleteSpy).toHaveBeenCalled()
    })

    it('with only a phone: SMS only, confirmed to the owner', async () => {
      const { client } = makeSupabase()
      mockContacts.mockResolvedValue({ clientId: 'client-1', clientName: 'Johnson', email: null, phone: '+15559876543' })
      mockDeliver.mockResolvedValue({ status: 'sent', sent: ['sms'], failed: [] })

      await processConfirmationReply('send', BASE_SESSION, COMPANY_ID, OWNER_PHONE, client)

      expect(ownerMessage()).toMatch(/by SMS/)
      expect(ownerMessage()).not.toMatch(/email/)
    })

    it('with no phone and no email: nothing is sent or changed, owner is asked for a contact', async () => {
      const { client, deleteSpy, updateSpy } = makeSupabase({ clientId: null })
      mockContacts.mockResolvedValue(null)

      await processConfirmationReply('send', BASE_SESSION, COMPANY_ID, OWNER_PHONE, client)

      expect(mockDeliver).not.toHaveBeenCalled()
      expect(updateSpy).not.toHaveBeenCalled()
      expect(deleteSpy).not.toHaveBeenCalled()
      expect(mockSend).toHaveBeenCalledOnce()
      expect(ownerMessage()).toMatch(/no phone or email on file/i)
      expect(ownerMessage()).toMatch(/set_client/)
    })

    it('when every channel is blocked: not marked sent, session kept, reason given', async () => {
      const { client, deleteSpy, updateSpy } = makeSupabase()
      mockContacts.mockResolvedValue({ clientId: 'client-1', clientName: 'Johnson', email: null, phone: '+15559876543' })
      mockDeliver.mockResolvedValue({ status: 'not_delivered', failed: [{ channel: 'sms', ok: false, reason: 'no_consent' }] })

      await processConfirmationReply('send', BASE_SESSION, COMPANY_ID, OWNER_PHONE, client)

      expect(ownerMessage()).toMatch(/Not sent to Johnson/)
      expect(ownerMessage()).toMatch(/not agreed to SMS/)
      expect(updateSpy).not.toHaveBeenCalledWith({ status: 'sent' })
      expect(deleteSpy).not.toHaveBeenCalled()
    })
  })

  describe('"cancel" command', () => {
    it('deletes project (cascade), deletes session, confirms to owner', async () => {
      const { client, deleteSpy } = makeSupabase()

      await processConfirmationReply('cancel', BASE_SESSION, COMPANY_ID, OWNER_PHONE, client)

      expect(deleteSpy).toHaveBeenCalled()
      expect(ownerMessage()).toMatch(/discarded/i)
    })

    it('does not update estimate or project status on cancel', async () => {
      const { client, updateSpy } = makeSupabase()

      await processConfirmationReply('cancel', BASE_SESSION, COMPANY_ID, OWNER_PHONE, client)

      expect(updateSpy).not.toHaveBeenCalled()
    })
  })
})

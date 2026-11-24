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
const HELP_REPLY = 'Reply *send* to deliver the estimate to your client, or *cancel* to close the confirmation.'

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

    const scope = { session: session as never, companyId, ownerPhone, messageId: 'wamid.confirm' }
    if (verb === 'send') {
      const result = await actionSend(scope, supabase)
      await reply(describeSendResult(result))
      return
    }
    if (verb === 'cancel') {
      await actionCancel(scope, supabase)
      await reply('WhatsApp confirmation closed. The estimate stays in the app.')
      return
    }
    await reply(HELP_REPLY)
  }),
}))

import { processConfirmationReply } from '@/lib/whatsapp/confirm'
import { sendWhatsAppMessage } from '@/lib/whatsapp/client'
import { deliverEstimateToClient, getClientContacts } from '@/lib/notifications/deliver-estimate-to-client'
import { runStandaloneConfirmation } from '@/lib/whatsapp/agent-tools'

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
  const single = (data: unknown) => {
    const query = { select: () => query, eq: () => query, single: async () => ({ data, error: null }) }
    return query
  }
  const from = vi.fn((table: string) => {
    if (table === 'estimates') return single(BASE_ESTIMATE)
    if (table === 'projects') return single({ id: 'project-1', client_id: clientId, name: 'Kitchen' })
    if (table === 'companies') return single({ name: 'Acme Builders', slug: 'acme' })
    throw new Error(`Unexpected table ${table}`)
  })
  const rpc = vi.fn(async (name: string) => ({ data: name === 'whatsapp_claim_estimate_command'
    ? { status: 'claimed', command_id: 'command-1' } : null, error: null }))
  return { client: { from, rpc } as never, from, rpc }

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
      expect(ownerMessage()).toMatch(/confirmation closed/i)
    })
  })

  describe('"send" — client delivery by email/SMS only', () => {
    it('a standalone confirmation cannot deliver against a stale session', async () => {
      const { client, from, rpc } = makeSupabase()
      rpc.mockResolvedValueOnce({ data: { status: 'stale', command_id: 'closed' }, error: null })
      const reply = await runStandaloneConfirmation({
        session: BASE_SESSION, companyId: COMPANY_ID, ownerPhone: OWNER_PHONE, messageId: 'wamid.stale',
      }, client, 'send', 'en')
      expect(reply).toMatch(/changed or expired/i)
      expect(from).not.toHaveBeenCalled()
      expect(mockDeliver).not.toHaveBeenCalled()
    })

    it('with email and phone: delivers through the platform, marks sent, deletes session, never WhatsApps the client', async () => {
      const { client, rpc } = makeSupabase()
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
      expect(rpc.mock.calls.map(([name]) => name)).toEqual([
        'whatsapp_claim_estimate_command', 'whatsapp_prepare_estimate_delivery', 'whatsapp_finish_estimate_command',
      ])
      expect(args.command?.commandId).toBe('command-1')
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
      const { client, rpc } = makeSupabase({ clientId: null })
      mockContacts.mockResolvedValue(null)

      await processConfirmationReply('send', BASE_SESSION, COMPANY_ID, OWNER_PHONE, client)

      expect(mockDeliver).not.toHaveBeenCalled()
      expect(rpc.mock.calls.map(([name]) => name)).toEqual(['whatsapp_claim_estimate_command', 'whatsapp_finish_estimate_command'])
      expect(mockSend).toHaveBeenCalledOnce()
      expect(ownerMessage()).toMatch(/no phone or email on file/i)
      expect(ownerMessage()).toMatch(/send me their name and phone/i)
    })

    it('when every channel is blocked: not marked sent, session kept, reason given', async () => {
      const { client, rpc } = makeSupabase()
      mockContacts.mockResolvedValue({ clientId: 'client-1', clientName: 'Johnson', email: null, phone: '+15559876543' })
      mockDeliver.mockResolvedValue({ status: 'not_delivered', failed: [{ channel: 'sms', ok: false, reason: 'no_consent' }] })

      await processConfirmationReply('send', BASE_SESSION, COMPANY_ID, OWNER_PHONE, client)

      expect(ownerMessage()).toMatch(/Not sent to Johnson/)
      expect(ownerMessage()).toMatch(/not agreed to SMS/)
      expect(rpc.mock.calls.map(([name]) => name)).toEqual([
        'whatsapp_claim_estimate_command', 'whatsapp_prepare_estimate_delivery', 'whatsapp_finish_estimate_command',
      ])
    })
  })

  describe('"cancel" command', () => {
    it('closes only the approved session and preserves estimate and project access', async () => {
      const { client, from, rpc } = makeSupabase()
      await processConfirmationReply('cancel', BASE_SESSION, COMPANY_ID, OWNER_PHONE, client)
      expect(rpc.mock.calls.map(([name]) => name)).toEqual([
        'whatsapp_claim_estimate_command', 'whatsapp_cancel_estimate_session', 'whatsapp_finish_estimate_command',
      ])
      expect(from).not.toHaveBeenCalledWith('projects')
      expect(from).not.toHaveBeenCalledWith('estimates')
      expect(ownerMessage()).toMatch(/estimate stays in the app/i)
    })

  })
})

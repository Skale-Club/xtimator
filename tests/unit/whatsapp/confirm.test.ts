import { describe, it, expect, vi, beforeEach } from 'vitest'

// Imports the real confirm-actions / edit-commands chain at runtime; under
// vitest's reused forked worker the import can exceed the 5s default (import
// latency under contention). A timed-out sibling also bleeds a sendWhatsAppMessage
// spy call into this file's "help message" count assertion (called 2 times instead
// of once). Per-file timeout removes both. (Not a global config / mock-reset flag.)
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

vi.mock('@/lib/whatsapp/client', () => ({
  sendWhatsAppMessage: vi.fn(),
}))

vi.mock('@/lib/whatsapp/pdf-delivery', () => ({
  generateAndUploadEstimatePDF: vi.fn(),
}))

vi.mock('@/lib/whatsapp/account-registry', () => ({
  getWhatsAppAccountStatus: vi.fn(async (_companyId: string) => ({
    configured: true,
    active: true,
    status: 'active',
    deliveryFormat: 'share_link',
  })),
}))

// The real agent calls the OpenAI API — replace with the deterministic
// confirm-actions layer so existing unit tests keep their coverage.
vi.mock('@/lib/whatsapp/agent', () => ({
  runConfirmationAgent: vi.fn(async (
    text: string,
    session: { id: string; draft_project_id: string | null; draft_estimate_id: string | null },
    companyId: string,
    ownerPhone: string,
    supabase: import('@supabase/supabase-js').SupabaseClient,
  ) => {
    const { parseEditCommand, EDIT_HELP_MESSAGE } = await import('@/lib/whatsapp/edit-commands')
    const {
      actionSend, actionCancel, actionUpdateField, actionSetClient, actionRegenerate,
      actionGetEstimateContext, formatEstimateContext,
    } = await import('@/lib/whatsapp/confirm-actions')
    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/client')
    const { logOutboundMessage } = await import('@/lib/whatsapp/conversations')

    const cmd = parseEditCommand(text)

    const reply = async (body: string) => {
      await sendWhatsAppMessage(ownerPhone, { type: 'text', text: { body } })
      logOutboundMessage(supabase, { companyId, contactPhone: ownerPhone, body, msgType: 'text', status: 'sent' }).catch(() => undefined)
    }

    const resend = async (prefix: string) => {
      if (!session.draft_estimate_id) return
      const ctx = await actionGetEstimateContext(supabase, session.draft_estimate_id)
      await reply(`${prefix}\n\n${formatEstimateContext(ctx)}`)
    }

    switch (cmd.kind) {
      case 'send': {
        const result = await actionSend(session as never, companyId, supabase)
        const ownerMsg = result.deliveredToClient
          ? `✅ *Estimate sent!*\n\nYour client received the estimate via WhatsApp.\n\nShare link: ${result.shareUrl}`
          : `✅ *Estimate ready!*\n\nShare link: ${result.shareUrl}\n\n_(No client phone on file — send the link manually)_`
        await reply(ownerMsg)
        break
      }
      case 'cancel': {
        await actionCancel(session as never, supabase)
        await reply("❌ Estimate discarded. Send a new audio, text, or photo when you're ready.")
        break
      }
      case 'edit-total':
        await actionUpdateField(session as never, supabase, { total: cmd.value })
        await resend('✏️ *Updated*')
        break
      case 'edit-timeline':
        await actionUpdateField(session as never, supabase, { timeline: cmd.value })
        await resend('✏️ *Updated*')
        break
      case 'edit-payment':
        await actionUpdateField(session as never, supabase, { payment_terms: cmd.value })
        await resend('✏️ *Updated*')
        break
      case 'edit-summary':
        await actionUpdateField(session as never, supabase, { summary: cmd.value })
        await resend('✏️ *Updated*')
        break
      case 'set-client': {
        await actionSetClient(session as never, companyId, supabase, cmd.name, cmd.phone)
        await reply(`👤 Client set to *${cmd.name}* (${cmd.phone}).\n\nReply *send* to deliver, *cancel* to discard, or use *edit* commands to adjust the estimate.`)
        break
      }
      case 'regenerate': {
        const r = await actionRegenerate(session as never, companyId, supabase)
        await reply(`🔄 *Regenerated*\n\n${formatEstimateContext(r.context)}`)
        break
      }
      default:
        await reply(EDIT_HELP_MESSAGE)
    }
  }),
}))

import { processConfirmationReply } from '@/lib/whatsapp/confirm'
import { sendWhatsAppMessage } from '@/lib/whatsapp/client'
import { generateAndUploadEstimatePDF } from '@/lib/whatsapp/pdf-delivery'
import { getWhatsAppAccountStatus } from '@/lib/whatsapp/account-registry'

const mockSend = vi.mocked(sendWhatsAppMessage)
const mockGeneratePdf = vi.mocked(generateAndUploadEstimatePDF)

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
  // Chainable update builder: supports .eq().eq() and is directly awaitable
  const makeUpdateChain = (): object => {
    const chain: Record<string, unknown> = {}
    chain['eq'] = vi.fn().mockReturnValue(chain)
    chain['then'] = (res: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(res)
    chain['catch'] = (rej: (e: unknown) => unknown) => Promise.resolve({ error: null }).catch(rej)
    return chain
  }
  const updateSpy = vi.fn().mockImplementation(makeUpdateChain)

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
    mockGeneratePdf.mockResolvedValue({
      signedUrl: 'https://supabase.co/storage/v1/sign/pdfs/co/wa-pdf/est-123.pdf?token=abc',
      filename: 'Estimate-Johnson-2026-05-11.pdf',
    })
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
      vi.mocked(getWhatsAppAccountStatus).mockResolvedValueOnce({
        configured: true, active: true, status: 'active', deliveryFormat: 'formatted_text',
      })
      const { client } = makeSupabase({
        clientPhone: '+15559876543',
        clientName: 'Johnson',
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

  describe('"send" — pdf_attachment format (WAPDF-03 + WAPDF-04)', () => {
    it('sends document message to client when pdf_attachment format succeeds (WAPDF-03)', async () => {
      vi.mocked(getWhatsAppAccountStatus).mockResolvedValueOnce({
        configured: true, active: true, status: 'active', deliveryFormat: 'pdf_attachment',
      })
      const { client } = makeSupabase({ clientPhone: '+15559876543', clientName: 'Johnson' })

      await processConfirmationReply('send', BASE_SESSION, COMPANY_ID, OWNER_PHONE, client)

      const documentCall = mockSend.mock.calls.find(
        ([, body]) => (body as { type: string }).type === 'document'
      )
      expect(documentCall).toBeDefined()
      const doc = (documentCall![1] as { document: { link: string; filename: string; caption: string } }).document
      expect(doc.link).toMatch(/https:\/\//)
      expect(doc.filename).toMatch(/^Estimate-/)
      expect(doc.caption).toMatch(/Acme Builders/)
    })

    it('falls back to share_link when PDF generation throws (WAPDF-04)', async () => {
      vi.mocked(getWhatsAppAccountStatus).mockResolvedValueOnce({
        configured: true, active: true, status: 'active', deliveryFormat: 'pdf_attachment',
      })
      mockGeneratePdf.mockRejectedValue(new Error('Bucket full'))
      const { client } = makeSupabase({ clientPhone: '+15559876543' })

      await processConfirmationReply('send', BASE_SESSION, COMPANY_ID, OWNER_PHONE, client)

      // No document message should have been sent
      const documentCall = mockSend.mock.calls.find(
        ([, body]) => (body as { type: string }).type === 'document'
      )
      expect(documentCall).toBeUndefined()

      // A text message with share link should have been sent to client
      const textToClientCall = mockSend.mock.calls.find(
        ([to, body]) => to === '+15559876543' && (body as { type: string }).type === 'text'
      )
      expect(textToClientCall).toBeDefined()
      const body = (textToClientCall![1] as { text: { body: string } }).text.body
      expect(body).toMatch(/xtimator\.com\/estimate\//)
    })
  })
})

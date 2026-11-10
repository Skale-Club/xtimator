import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/billing/credit-ledger', () => ({
  checkCredits: async () => ({ allowed: true, balance: 1000, shortfall: 0 }),
}))

/**
 * Phase 4 — batch (processInboundMessages) and awaiting-details (dispatchToExistingProject)
 * paths apply the SAME per-type policy as the single-message router.
 */

const mockInngestSend = vi.fn().mockResolvedValue({ ids: ['evt-1'] })
vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: (...args: unknown[]) => mockInngestSend(...args) },
}))

vi.mock('@/lib/entitlements-server', () => ({
  getEntitlementsForTier: vi.fn().mockResolvedValue({ whatsappEnabled: true }),
}))

const mockSend = vi.fn().mockResolvedValue('wamid.out')
vi.mock('@/lib/whatsapp/client', () => ({
  sendWhatsAppMessage: (...a: unknown[]) => mockSend(...a),
  downloadWhatsAppMedia: vi.fn(),
  markMessageAsRead: vi.fn().mockResolvedValue(undefined),
  sendTypingIndicator: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/whatsapp/confirm', () => ({ processConfirmationReply: vi.fn() }))

import { processInboundMessage, processInboundMessages } from '@/lib/whatsapp/handler'
import type { WhatsAppMessage } from '@/lib/whatsapp/types'

function makeSupabase(session: object | null = null, lang: string | null = 'pt') {
  const from = vi.fn().mockImplementation((table: string) => {
    if (table === 'companies') {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { tier: 'trial', default_estimate_language: lang }, error: null }),
          }),
        }),
      }
    }
    if (table === 'whatsapp_sessions') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              gt: () => ({ order: () => ({ limit: () => ({ single: async () => ({ data: session, error: null }) }) }) }),
              eq: () => ({
                gt: () => ({
                  order: () => ({ limit: () => ({ single: async () => ({ data: session, error: null }) }) }),
                }),
              }),
            }),
          }),
        }),
      }
    }
    if (table === 'projects') {
      return { insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'proj-1' }, error: null }) }) }) }
    }
    return { insert: vi.fn().mockResolvedValue({ error: null }) }
  })
  return { from } as never
}

const base = { from: '15551234567', timestamp: '1' }
const TEXT: WhatsAppMessage = { ...base, id: 'wamid.t', type: 'text', text: { body: 'paint the fence' } }
const LOCATION: WhatsAppMessage = {
  ...base,
  id: 'wamid.l',
  type: 'location',
  location: { latitude: 1, longitude: 2, name: 'Site', address: '1 Main St' },
}
const CONTACT: WhatsAppMessage = {
  ...base,
  id: 'wamid.c',
  type: 'contacts',
  contacts: [{ name: { formatted_name: 'John Smith' }, phones: [{ wa_id: '15552223333' }] }],
}
const STICKER: WhatsAppMessage = { ...base, id: 'wamid.s', type: 'sticker', sticker: { id: 's' } }
const REACTION: WhatsAppMessage = { ...base, id: 'wamid.r', type: 'reaction', reaction: { message_id: 'x', emoji: 'ok' } }
const VIDEO: WhatsAppMessage = { ...base, id: 'wamid.v', type: 'video', video: { id: 'v' } }
const VIDEO2: WhatsAppMessage = { ...base, id: 'wamid.v2', type: 'video', video: { id: 'v2' } }
const DOC: WhatsAppMessage = { ...base, id: 'wamid.d', type: 'document', document: { id: 'd', filename: 'a.pdf' } }

const bodies = () => mockSend.mock.calls.map((c) => (c[1] as { text: { body: string } }).text.body)
const dispatchedIds = () =>
  (mockInngestSend.mock.calls[0][0] as { data: { messages: WhatsAppMessage[] } }).data.messages.map((m) => m.id)

beforeEach(() => {
  vi.clearAllMocks()
  mockInngestSend.mockResolvedValue({ ids: ['evt-1'] })
  mockSend.mockResolvedValue('wamid.out')
})

describe('batch path (processInboundMessages)', () => {
  it('keeps text/location/contacts, drops stickers/reactions silently, and sends the batch', async () => {
    await processInboundMessages([TEXT, LOCATION, STICKER, CONTACT, REACTION], 'company-1', '15551234567', makeSupabase())

    expect(dispatchedIds()).toEqual(['wamid.t', 'wamid.l', 'wamid.c'])
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('a batch of only stickers/reactions: no reply, no project, no dispatch', async () => {
    await processInboundMessages([STICKER, REACTION], 'company-1', '15551234567', makeSupabase())

    expect(mockSend).not.toHaveBeenCalled()
    expect(mockInngestSend).not.toHaveBeenCalled()
  })

  it('video: one localized (pt) reply per distinct reason, however many videos; rest still dispatched', async () => {
    await processInboundMessages([TEXT, VIDEO, VIDEO2, DOC], 'company-1', '15551234567', makeSupabase())

    expect(bodies()).toEqual([
      'Não consigo processar vídeos. Me manda fotos ou um áudio do serviço.',
      'Ainda não leio documentos nem PDFs. Me manda fotos ou um áudio do serviço.',
    ])
    expect(dispatchedIds()).toEqual(['wamid.t'])
  })

  it('a batch that is ONLY a video: one reply, nothing dispatched', async () => {
    await processInboundMessages([VIDEO], 'company-1', '15551234567', makeSupabase())

    expect(mockSend).toHaveBeenCalledTimes(1)
    expect(mockInngestSend).not.toHaveBeenCalled()
  })
})

describe('awaiting-details path (dispatchToExistingProject)', () => {
  const SESSION = { id: 's1', state: 'awaiting_details', draft_project_id: 'p-1', draft_estimate_id: null }

  it('a location sent while awaiting details is re-dispatched to the SAME project', async () => {
    await processInboundMessage(LOCATION, 'company-1', '15551234567', makeSupabase(SESSION))

    expect(mockInngestSend).toHaveBeenCalledOnce()
    const ev = mockInngestSend.mock.calls[0][0] as { data: { projectId: string; messages: WhatsAppMessage[] } }
    expect(ev.data.projectId).toBe('p-1')
    expect(ev.data.messages.map((m) => m.type)).toEqual(['location'])
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('a sticker while awaiting details: ignored (no reply, no dispatch)', async () => {
    await processInboundMessage(STICKER, 'company-1', '15551234567', makeSupabase(SESSION))

    expect(mockInngestSend).not.toHaveBeenCalled()
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('a video while awaiting details: one reply, no dispatch', async () => {
    await processInboundMessage(VIDEO, 'company-1', '15551234567', makeSupabase(SESSION, 'en'))

    expect(bodies()).toEqual(["I can't process videos. Send me photos or a voice message of the job."])
    expect(mockInngestSend).not.toHaveBeenCalled()
  })
})

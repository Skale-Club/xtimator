import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendMessage = vi.fn()
const sendTemplate = vi.fn()

vi.mock('@/lib/whatsapp/client', async () => {
  // Real typed errors, mocked senders.
  const actual = await vi.importActual<typeof import('@/lib/whatsapp/client')>('@/lib/whatsapp/client')
  return {
    ...actual,
    sendWhatsAppMessage: (...a: unknown[]) => sendMessage(...a),
    sendWhatsAppTemplate: (...a: unknown[]) => sendTemplate(...a),
  }
})

import { getOwnerLastInboundAt, sendOwnerWhatsApp, type OwnerTemplate } from '@/lib/whatsapp/owner-send'
import {
  WhatsAppMarketingLimitError,
  WhatsAppReengagementRequiredError,
  WhatsAppSendError,
} from '@/lib/whatsapp/client'

const META = { companyId: 'co-1', purpose: 'owner_notification' as const, billable: true }
const TEMPLATE: OwnerTemplate = { name: 'owner_estimate_update', languageCode: 'pt_BR', bodyVariables: ['T', 'B'] }

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString()

function run(lastInboundAt: string | null, template: OwnerTemplate | null = TEMPLATE) {
  return sendOwnerWhatsApp({
    to: '+15551230000',
    companyId: 'co-1',
    text: 'T\nB',
    template,
    meta: META,
    lastInboundAt,
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  sendMessage.mockResolvedValue('wamid.free')
  sendTemplate.mockResolvedValue('wamid.tpl')
})

describe('sendOwnerWhatsApp: 24h window', () => {
  it('inside the window: free-form text, no template', async () => {
    const res = await run(hoursAgo(2))
    expect(res).toEqual({ ok: true, mode: 'freeform', wamid: 'wamid.free', fellBack: false })
    expect(sendMessage).toHaveBeenCalledWith(
      '+15551230000',
      { type: 'text', text: { body: 'T\nB' } },
      META,
    )
    expect(sendTemplate).not.toHaveBeenCalled()
  })

  it('outside the window: the mapped template with its language and variables, no free-form', async () => {
    const res = await run(hoursAgo(30))
    expect(res).toEqual({ ok: true, mode: 'template', wamid: 'wamid.tpl', fellBack: false })
    expect(sendTemplate).toHaveBeenCalledWith(
      '+15551230000',
      { name: 'owner_estimate_update', languageCode: 'pt_BR', bodyVariables: ['T', 'B'] },
      META,
    )
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('no inbound ever recorded counts as outside the window', async () => {
    const res = await run(null)
    expect(res).toMatchObject({ ok: true, mode: 'template' })
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('outside the window with no template: nothing is sent', async () => {
    const res = await run(hoursAgo(30), null)
    expect(res).toEqual({ ok: false, error: 'outside_window_no_template' })
    expect(sendMessage).not.toHaveBeenCalled()
    expect(sendTemplate).not.toHaveBeenCalled()
  })
})

describe('sendOwnerWhatsApp: Meta 131047 / 131049', () => {
  it('131047 on free-form falls back to the template exactly once', async () => {
    sendMessage.mockRejectedValue(new WhatsAppReengagementRequiredError(400, '{"error":{"code":131047}}'))
    const res = await run(hoursAgo(1))
    expect(res).toEqual({ ok: true, mode: 'template', wamid: 'wamid.tpl', fellBack: true })
    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(sendTemplate).toHaveBeenCalledTimes(1)
  })

  it('131049 on free-form also falls back to the template once', async () => {
    sendMessage.mockRejectedValue(new WhatsAppMarketingLimitError(400, '{"error":{"code":131049}}'))
    const res = await run(hoursAgo(1))
    expect(res).toMatchObject({ ok: true, mode: 'template', fellBack: true })
    expect(sendTemplate).toHaveBeenCalledTimes(1)
  })

  it('a failing template after the fallback is final: no loop, no third attempt', async () => {
    sendMessage.mockRejectedValue(new WhatsAppReengagementRequiredError(400, 'x'))
    sendTemplate.mockRejectedValue(new WhatsAppReengagementRequiredError(400, 'x'))
    const res = await run(hoursAgo(1))
    expect(res).toMatchObject({ ok: false, error: 'send_failed' })
    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(sendTemplate).toHaveBeenCalledTimes(1)
  })

  it('131047 with no template available: reported, not retried', async () => {
    sendMessage.mockRejectedValue(new WhatsAppReengagementRequiredError(400, 'x'))
    const res = await run(hoursAgo(1), null)
    expect(res).toEqual({ ok: false, error: 'outside_window_no_template' })
    expect(sendMessage).toHaveBeenCalledTimes(1)
  })

  it('any other free-form error does not trigger a template', async () => {
    sendMessage.mockRejectedValue(new WhatsAppSendError(500, null, 'boom'))
    const res = await run(hoursAgo(1))
    expect(res).toMatchObject({ ok: false, error: 'send_failed' })
    expect(sendTemplate).not.toHaveBeenCalled()
  })
})

describe('getOwnerLastInboundAt', () => {
  it('reads last_inbound_at from the owner conversation and is null on failure', async () => {
    const chain: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'order', 'limit']) chain[m] = vi.fn().mockReturnValue(chain)
    chain.maybeSingle = vi.fn().mockResolvedValue({ data: { last_inbound_at: '2026-11-09T10:00:00Z' } })
    const svc = { from: vi.fn().mockReturnValue(chain) }
    expect(await getOwnerLastInboundAt(svc as never, 'co-1', '+1 (555) 123-0000')).toBe('2026-11-09T10:00:00Z')
    expect((chain.eq as ReturnType<typeof vi.fn>).mock.calls).toContainEqual(['contact_phone', '+15551230000'])

    const broken = { from: () => { throw new Error('db down') } }
    expect(await getOwnerLastInboundAt(broken as never, 'co-1', '+15551230000')).toBeNull()
  })
})

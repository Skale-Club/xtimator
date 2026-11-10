import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/platform-config', () => ({
  getWhatsAppPlatformConfig: vi.fn(async () => ({ accessToken: 'tok', phoneNumberId: 'pn-1' })),
}))
vi.mock('@/lib/whatsapp/outbound-guard', () => ({
  isWhatsAppOutboundBlocked: () => false,
  logOutboundBlocked: vi.fn(),
}))
vi.mock('@/lib/billing/messaging-events', () => ({
  marketFromPhone: () => 'US',
  recordMessagingEvent: vi.fn(),
  resolveBillable: () => true,
}))

import {
  buildWhatsAppSendError,
  isTemplateRequiredError,
  sendWhatsAppMessage,
  WhatsAppMarketingLimitError,
  WhatsAppReengagementRequiredError,
  WhatsAppSendError,
} from '@/lib/whatsapp/client'

const metaBody = (code: number) =>
  JSON.stringify({ error: { message: 'x', type: 'OAuthException', code } })

describe('buildWhatsAppSendError', () => {
  it('131047 -> re-engagement required (needs a template)', () => {
    const err = buildWhatsAppSendError(400, metaBody(131047))
    expect(err).toBeInstanceOf(WhatsAppReengagementRequiredError)
    expect(err.code).toBe(131047)
    expect(isTemplateRequiredError(err)).toBe(true)
  })

  it('131049 -> marketing limit (needs a template)', () => {
    const err = buildWhatsAppSendError(400, metaBody(131049))
    expect(err).toBeInstanceOf(WhatsAppMarketingLimitError)
    expect(isTemplateRequiredError(err)).toBe(true)
  })

  it('other codes and non-JSON bodies stay generic and keep the old message shape', () => {
    const generic = buildWhatsAppSendError(400, metaBody(131026))
    expect(generic).toBeInstanceOf(WhatsAppSendError)
    expect(isTemplateRequiredError(generic)).toBe(false)
    expect(generic.message).toMatch(/^\[WhatsApp\] sendMessage failed 400:/)
    const text = buildWhatsAppSendError(502, 'Bad gateway')
    expect(text.code).toBeNull()
    expect(isTemplateRequiredError(new Error('nope'))).toBe(false)
  })
})

describe('sendWhatsAppMessage throws the typed error', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(metaBody(131047), { status: 400 })),
    )
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('a 131047 response surfaces as WhatsAppReengagementRequiredError', async () => {
    await expect(
      sendWhatsAppMessage('+15551230000', { type: 'text', text: { body: 'hi' } }),
    ).rejects.toBeInstanceOf(WhatsAppReengagementRequiredError)
  })
})

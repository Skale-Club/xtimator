import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock fetch globally
const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

process.env.META_WHATSAPP_ACCESS_TOKEN = 'test-token'
process.env.META_WHATSAPP_PHONE_NUMBER_ID = 'phone-123'

// client.ts reads credentials from getWhatsAppPlatformConfig() — mock it so the
// supabase config lookup never runs and never consumes the stubbed fetch.
vi.mock('@/lib/platform-config', () => ({
  getWhatsAppPlatformConfig: vi
    .fn()
    .mockResolvedValue({ accessToken: 'test-token', phoneNumberId: 'phone-123' }),
}))

import { sendWhatsAppTemplate } from '@/lib/whatsapp/client'

describe('sendWhatsAppTemplate (Phase 98 — WANOTIF-01)', () => {
  beforeEach(() => fetchMock.mockReset())

  it('POSTs a type:"template" message with name + language code', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))
    await sendWhatsAppTemplate('+15551234567', {
      name: 'estimate_accepted',
      languageCode: 'en_US',
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toMatch(/graph\.facebook\.com\/v\d+\.\d+\/phone-123\/messages/)
    expect(opts.method).toBe('POST')
    expect(opts.headers.Authorization).toBe('Bearer test-token')

    const body = JSON.parse(opts.body as string)
    expect(body.messaging_product).toBe('whatsapp')
    expect(body.to).toBe('+15551234567')
    expect(body.type).toBe('template')
    expect(body.template.name).toBe('estimate_accepted')
    expect(body.template.language).toEqual({ code: 'en_US' })
  })

  it('builds body + header components from the variable arrays in {{n}} order', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))
    await sendWhatsAppTemplate('+15551234567', {
      name: 'payment_received',
      languageCode: 'en_US',
      headerVariables: ['Receipt'],
      bodyVariables: ['Acme Co', '$1,200'],
    })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.template.components).toEqual([
      { type: 'header', parameters: [{ type: 'text', text: 'Receipt' }] },
      {
        type: 'body',
        parameters: [
          { type: 'text', text: 'Acme Co' },
          { type: 'text', text: '$1,200' },
        ],
      },
    ])
  })

  it('omits the components array entirely when no variables are given', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))
    await sendWhatsAppTemplate('+15551234567', {
      name: 'estimate_viewed',
      languageCode: 'en_US',
    })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.template.components).toBeUndefined()
  })

  it('throws on a non-2xx Meta response (same contract as sendWhatsAppMessage)', async () => {
    fetchMock.mockResolvedValueOnce(new Response('bad', { status: 400 }))
    await expect(
      sendWhatsAppTemplate('+15551234567', { name: 't', languageCode: 'en_US' }),
    ).rejects.toThrow(/sendMessage failed 400/)
  })
})

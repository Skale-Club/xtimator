import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock fetch globally
const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

// Set required env vars before import
process.env.META_WHATSAPP_ACCESS_TOKEN = 'test-token'
process.env.META_WHATSAPP_PHONE_NUMBER_ID = 'phone-123'

import { sendWhatsAppMessage, downloadWhatsAppMedia } from '@/lib/whatsapp/client'

describe('sendWhatsAppMessage', () => {
  beforeEach(() => fetchMock.mockReset())

  it('calls graph.facebook.com/v21.0/{phoneNumberId}/messages with POST', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))
    await sendWhatsAppMessage('+15551234567', { type: 'text', text: { body: 'Hello' } })
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toContain('graph.facebook.com/v21.0/phone-123/messages')
    expect(opts.method).toBe('POST')
    expect(opts.headers.Authorization).toBe('Bearer test-token')
  })
})

describe('downloadWhatsAppMedia', () => {
  beforeEach(() => fetchMock.mockReset())

  it('fetches media URL then downloads binary', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ url: 'https://cdn.example.com/media/file.ogg' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]).buffer, { status: 200 }))
    const buf = await downloadWhatsAppMedia('media-id-abc')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][0]).toContain('graph.facebook.com/v21.0/media-id-abc')
    expect(Buffer.isBuffer(buf)).toBe(true)
  })
})

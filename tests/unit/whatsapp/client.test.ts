import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock fetch globally
const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

// Set required env vars before import
process.env.META_WHATSAPP_ACCESS_TOKEN = 'test-token'
process.env.META_WHATSAPP_PHONE_NUMBER_ID = 'phone-123'

// client.ts reads credentials from getWhatsAppPlatformConfig() (encrypted platform-config),
// not env vars. Mock it so the supabase config lookup never runs (it would otherwise consume
// the stubbed fetch and leave the real Graph API call with an undefined response).
vi.mock('@/lib/platform-config', () => ({
  getWhatsAppPlatformConfig: vi
    .fn()
    .mockResolvedValue({ accessToken: 'test-token', phoneNumberId: 'phone-123' }),
}))

import {
  sendWhatsAppMessage,
  downloadWhatsAppMedia,
  markMessageAsRead,
  sendTypingIndicator,
} from '@/lib/whatsapp/client'

describe('sendWhatsAppMessage', () => {
  beforeEach(() => fetchMock.mockReset())

  it('calls graph.facebook.com/v21.0/{phoneNumberId}/messages with POST', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))
    await sendWhatsAppMessage('+15551234567', { type: 'text', text: { body: 'Hello' } })
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toMatch(/graph\.facebook\.com\/v\d+\.\d+\/phone-123\/messages/)
    expect(opts.method).toBe('POST')
    expect(opts.headers.Authorization).toBe('Bearer test-token')
  })
})

describe('development outbound kill switch', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.spyOn(console, 'info').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('does not call fetch for sendWhatsAppMessage when NODE_ENV=development', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    await expect(
      sendWhatsAppMessage('+15551234567', { type: 'text', text: { body: 'Hello' } })
    ).resolves.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not call fetch for read receipts or typing indicators in development', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    await markMessageAsRead('wamid.XYZ')
    await sendTypingIndicator('wamid.XYZ')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends for real in development when WHATSAPP_ALLOW_DEV_SEND=true', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('WHATSAPP_ALLOW_DEV_SEND', 'true')
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))
    await sendWhatsAppMessage('+15551234567', { type: 'text', text: { body: 'Hello' } })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('sends normally under the default test environment', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))
    await sendWhatsAppMessage('+15551234567', { type: 'text', text: { body: 'Hello' } })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('does not block media downloads in development', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ url: 'https://cdn.example.com/f' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1]).buffer, { status: 200 }))
    await downloadWhatsAppMedia('media-id-abc')
    expect(fetchMock).toHaveBeenCalledTimes(2)
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
    expect(fetchMock.mock.calls[0][0]).toMatch(/graph\.facebook\.com\/v\d+\.\d+\/media-id-abc/)
    expect(Buffer.isBuffer(buf)).toBe(true)
  })
})

describe('markMessageAsRead', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('sends status=read with the message_id', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))
    await markMessageAsRead('wamid.XYZ')
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toMatch(/graph\.facebook\.com\/v\d+\.\d+\/phone-123\/messages/)
    expect(opts.method).toBe('POST')
    const body = JSON.parse(opts.body as string)
    expect(body.messaging_product).toBe('whatsapp')
    expect(body.status).toBe('read')
    expect(body.message_id).toBe('wamid.XYZ')
    expect(body.typing_indicator).toBeUndefined()
  })

  it('swallows Meta API errors (fire-and-forget)', async () => {
    fetchMock.mockResolvedValueOnce(new Response('error', { status: 500 }))
    await expect(markMessageAsRead('wamid.XYZ')).resolves.toBeUndefined()
  })

  it('swallows network errors', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'))
    await expect(markMessageAsRead('wamid.XYZ')).resolves.toBeUndefined()
  })
})

describe('sendTypingIndicator', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('sends typing_indicator alongside read receipt', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))
    await sendTypingIndicator('wamid.XYZ')
    const [, opts] = fetchMock.mock.calls[0]
    const body = JSON.parse(opts.body as string)
    expect(body.status).toBe('read')
    expect(body.message_id).toBe('wamid.XYZ')
    expect(body.typing_indicator).toEqual({ type: 'text' })
  })

  it('swallows Meta API errors', async () => {
    fetchMock.mockResolvedValueOnce(new Response('error', { status: 500 }))
    await expect(sendTypingIndicator('wamid.XYZ')).resolves.toBeUndefined()
  })
})

describe('downloadWhatsAppMedia size guard (Phase 4)', () => {
  beforeEach(() => fetchMock.mockReset())

  const meta = (file_size: number, mime_type: string) =>
    new Response(JSON.stringify({ url: 'https://cdn.example.com/f', file_size, mime_type }), { status: 200 })

  it('rejects an audio over 16 MB from the metadata alone: the binary is never downloaded', async () => {
    fetchMock.mockResolvedValueOnce(meta(16 * 1024 * 1024 + 1, 'audio/ogg'))
    await expect(downloadWhatsAppMedia('big-audio')).rejects.toMatchObject({
      name: 'MediaTooLargeError',
      kind: 'audio',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1) // only the metadata lookup
  })

  it('rejects an image over 10 MB without downloading', async () => {
    fetchMock.mockResolvedValueOnce(meta(10 * 1024 * 1024 + 1, 'image/jpeg'))
    await expect(downloadWhatsAppMedia('big-image')).rejects.toMatchObject({ kind: 'image' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('downloads files at or under the limit, and files with no declared size', async () => {
    fetchMock
      .mockResolvedValueOnce(meta(10 * 1024 * 1024, 'image/jpeg'))
      .mockResolvedValueOnce(new Response(new Uint8Array([1]).buffer, { status: 200 }))
    await downloadWhatsAppMedia('ok-image')
    expect(fetchMock).toHaveBeenCalledTimes(2)

    fetchMock.mockReset()
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ url: 'https://cdn.example.com/f' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1]).buffer, { status: 200 }))
    await downloadWhatsAppMedia('no-size')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('an explicit maxBytes overrides the per-kind default', async () => {
    fetchMock.mockResolvedValueOnce(meta(2000, 'audio/ogg'))
    await expect(downloadWhatsAppMedia('x', { maxBytes: 1000 })).rejects.toMatchObject({
      name: 'MediaTooLargeError',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

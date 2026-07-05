import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * lib/telegram/client.ts — the server-only outbound Telegram client for the
 * platform-owner ops-alert channel (mirrors lib/whatsapp/client.ts).
 *
 * Covers:
 *  1. configured        → POSTs to https://api.telegram.org/bot<token>/sendMessage
 *                         with JSON body { chat_id, text, parse_mode: 'HTML' }.
 *  2. dormant (null cfg) → throws /not configured/i and fetch is NOT called.
 *  3. non-2xx response   → throws with the status + response body text.
 *
 * The bot token here is a placeholder — no real secret ever appears in tests.
 */

// Mock fetch globally
const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

// The client reads credentials from getTelegramConfig() (encrypted platform-config),
// not env vars. Mock it so the supabase config lookup never runs (it would otherwise
// consume the stubbed fetch and leave the real Telegram call with an undefined response).
const getTelegramConfigMock = vi.fn()
vi.mock('@/lib/platform-config', () => ({
  getTelegramConfig: () => getTelegramConfigMock(),
}))

import { sendTelegramMessage } from '@/lib/telegram/client'

const TEST_TOKEN = '000000000:TEST_PLACEHOLDER_TOKEN'
const TEST_CHAT_ID = '123456789'

beforeEach(() => {
  fetchMock.mockReset()
  getTelegramConfigMock.mockReset()
})

describe('sendTelegramMessage', () => {
  it('posts to the Telegram sendMessage API with the token, chat_id, text, and HTML parse_mode', async () => {
    getTelegramConfigMock.mockResolvedValueOnce({
      botToken: TEST_TOKEN,
      chatId: TEST_CHAT_ID,
    })
    fetchMock.mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }))

    await sendTelegramMessage('Hello ops')

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe(`https://api.telegram.org/bot${TEST_TOKEN}/sendMessage`)
    expect(opts.method).toBe('POST')
    expect(opts.headers['Content-Type']).toBe('application/json')
    const body = JSON.parse(opts.body as string)
    expect(body.chat_id).toBe(TEST_CHAT_ID)
    expect(body.text).toBe('Hello ops')
    expect(body.parse_mode).toBe('HTML')
  })

  it('throws "not configured" and never calls fetch when the config is null (dormant)', async () => {
    getTelegramConfigMock.mockResolvedValueOnce(null)

    await expect(sendTelegramMessage('Hello ops')).rejects.toThrow(/not configured/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('throws with the status and response body on a non-2xx response', async () => {
    getTelegramConfigMock.mockResolvedValueOnce({
      botToken: TEST_TOKEN,
      chatId: TEST_CHAT_ID,
    })
    fetchMock.mockResolvedValueOnce(
      new Response('Bad Request: chat not found', { status: 400 })
    )

    await expect(sendTelegramMessage('Hello ops')).rejects.toThrow(
      /400.*chat not found/
    )
  })
})

// @vitest-environment node
import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/whatsapp/durable-ingress', () => ({ acceptWhatsAppWebhook: vi.fn() }))
import { acceptWhatsAppWebhook } from '@/lib/whatsapp/durable-ingress'
import { GET, POST } from '@/app/api/webhooks/whatsapp/route'
const accept = vi.mocked(acceptWhatsAppWebhook)
const SECRET = 'test-app-secret'
const payload = { object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: {
  messages: [{ id: 'wamid.1', from: '15555550100', type: 'text', text: { body: 'Paint the fence' } }],
} }] }] }
function request(body = JSON.stringify(payload), signature: string | null = 'valid') {
  const sig = signature === 'valid' ? `sha256=${createHmac('sha256', SECRET).update(body).digest('hex')}` : signature
  return new Request('https://xtimator.com/api/webhooks/whatsapp', { method: 'POST', body,
    headers: { 'content-type': 'application/json', ...(sig ? { 'x-hub-signature-256': sig } : {}) },
  }) as never
}
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('META_WHATSAPP_APP_SECRET', SECRET); accept.mockResolvedValue('event-id') })
afterEach(() => vi.unstubAllEnvs())

describe('Meta webhook durable ACK boundary', () => {
  it.each([null, 'sha256=wrong', `sha256=${'0'.repeat(64)}`])('rejects missing or forged signature before persistence (%s)', async signature => {
    expect((await POST(request(undefined, signature))).status).toBe(401)
    expect(accept).not.toHaveBeenCalled()
  })
  it('fails closed without the signing secret', async () => {
    vi.stubEnv('META_WHATSAPP_APP_SECRET', '')
    expect((await POST(request())).status).toBe(401)
    expect(accept).not.toHaveBeenCalled()
  })
  it('verifies the exact body: a whitespace change invalidates the signature', async () => {
    const original = JSON.stringify(payload)
    const signature = `sha256=${createHmac('sha256', SECRET).update(original).digest('hex')}`
    expect((await POST(request(original + ' ', signature))).status).toBe(401)
    expect(accept).not.toHaveBeenCalled()
  })
  it('waits for durable acceptance before returning 200', async () => {
    let resolve!: (id: string) => void
    accept.mockImplementation(() => new Promise(r => { resolve = r }))
    let returned = false
    const response = POST(request()).then(r => { returned = true; return r })
    await vi.waitFor(() => expect(accept).toHaveBeenCalledOnce())
    expect(returned).toBe(false)
    resolve('persisted')
    expect((await response).status).toBe(200)
    expect(accept).toHaveBeenCalledWith(JSON.stringify(payload), payload)
  })
  it('returns 503 when durable persistence fails so Meta can redeliver', async () => {
    accept.mockRejectedValue(new Error('database unavailable'))
    expect((await POST(request())).status).toBe(503)
  })
  it.each(['{', '{}', '{"object":"whatsapp_business_account","entry":[null]}',
    '{"object":"whatsapp_business_account","entry":[{"changes":[{"value":{"messages":{}}}]}]}'])('rejects a malformed signed envelope (%s)', async body => {
    expect((await POST(request(body))).status).toBe(400)
    expect(accept).not.toHaveBeenCalled()
  })
  it('accepts a mixed batch as one durable envelope without early-return loss', async () => {
    const mixed = structuredClone(payload)
    mixed.entry[0].changes.push({ field: 'messages', value: { statuses: [{ id: 'outgoing', status: 'delivered' }] } } as never)
    expect((await POST(request(JSON.stringify(mixed)))).status).toBe(200)
    expect(accept).toHaveBeenCalledWith(JSON.stringify(mixed), mixed)
  })
})

describe('Meta verification challenge', () => {
  it('returns only a challenge matching a configured token', async () => {
    vi.stubEnv('META_WHATSAPP_VERIFY_TOKEN', 'verify')
    expect(await (await GET(new Request('https://xtimator.com/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify&hub.challenge=challenge') as never)).text()).toBe('challenge')
  })
  it.each(['', 'other'])('fails closed on missing/wrong token (%s)', async token => {
    vi.stubEnv('META_WHATSAPP_VERIFY_TOKEN', token)
    expect((await GET(new Request('https://xtimator.com/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify&hub.challenge=challenge') as never)).status).toBe(403)
  })
})

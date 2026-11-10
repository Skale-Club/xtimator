import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { makeFakeDb } from '../billing/messaging-fake-db'

/**
 * Phase 2b - sendWhatsAppMessage returns the Meta message id (wamid) and records
 * a messaging_cost_events row (status 'sent', cost unknown until Meta's delivered
 * webhook) with the caller's attribution. Recording never breaks the send.
 */

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

let db = makeFakeDb()
let serviceClient: () => unknown = () => db.client

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => serviceClient(),
  requireServiceClient: () => serviceClient(),
}))

vi.mock('@/lib/platform-config', () => ({
  getWhatsAppPlatformConfig: vi
    .fn()
    .mockResolvedValue({ accessToken: 'test-token', phoneNumberId: 'phone-123' }),
}))

import { sendWhatsAppMessage, sendWhatsAppTemplate } from '@/lib/whatsapp/client'

function metaOk(id: string | null) {
  return new Response(JSON.stringify(id ? { messaging_product: 'whatsapp', messages: [{ id }] } : {}), { status: 200 })
}

beforeEach(() => {
  fetchMock.mockReset()
  db = makeFakeDb()
  serviceClient = () => db.client
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('sendWhatsAppMessage cost recording', () => {
  it('returns the wamid and records the row with purpose, billable, company and market', async () => {
    fetchMock.mockResolvedValueOnce(metaOk('wamid.HBg1'))
    const wamid = await sendWhatsAppMessage(
      '+5511999990000',
      { type: 'text', text: { body: 'Hello' } },
      { companyId: 'co-1', purpose: 'bot_reply', billable: true }
    )
    expect(wamid).toBe('wamid.HBg1')
    expect(db.tables.messaging_cost_events).toHaveLength(1)
    expect(db.tables.messaging_cost_events[0]).toMatchObject({
      company_id: 'co-1',
      channel: 'whatsapp',
      provider: 'meta',
      provider_message_id: 'wamid.HBg1',
      purpose: 'bot_reply',
      billable: true,
      market: 'BR',
      status: 'sent',
      cost_usd: null, // priced only when Meta's delivered status arrives
    })
  })

  it('records the onboarding welcome as a non-billable platform cost, even if a caller asks to bill it', async () => {
    fetchMock.mockResolvedValueOnce(metaOk('wamid.W'))
    await sendWhatsAppMessage('+15551234567', { type: 'text', text: { body: 'Welcome' } }, { companyId: 'co-1', purpose: 'welcome', billable: true })
    expect(db.tables.messaging_cost_events[0]).toMatchObject({ purpose: 'welcome', billable: false, company_id: 'co-1' })
  })

  it('records the unknown-sender reply without a company, never billable', async () => {
    fetchMock.mockResolvedValueOnce(metaOk('wamid.U'))
    await sendWhatsAppMessage('+15551234567', { type: 'text', text: { body: 'Sign up' } }, { companyId: null, purpose: 'unknown_sender', billable: false })
    expect(db.tables.messaging_cost_events[0]).toMatchObject({ purpose: 'unknown_sender', billable: false, company_id: null })
  })

  it('a caller that passes no meta is recorded as unclassified and non-billable', async () => {
    fetchMock.mockResolvedValueOnce(metaOk('wamid.N'))
    await sendWhatsAppMessage('+15551234567', { type: 'text', text: { body: 'x' } })
    expect(db.tables.messaging_cost_events[0]).toMatchObject({ purpose: 'unclassified', billable: false, company_id: null })
  })

  it('returns null and records nothing when Meta returns no message id', async () => {
    fetchMock.mockResolvedValueOnce(metaOk(null))
    const wamid = await sendWhatsAppMessage('+15551234567', { type: 'text', text: { body: 'x' } }, { companyId: 'co-1', purpose: 'bot_reply' })
    expect(wamid).toBeNull()
    expect(db.tables.messaging_cost_events ?? []).toHaveLength(0)
  })

  it('records nothing and still throws on a non-2xx Meta response', async () => {
    fetchMock.mockResolvedValueOnce(new Response('bad', { status: 400 }))
    await expect(
      sendWhatsAppMessage('+15551234567', { type: 'text', text: { body: 'x' } }, { companyId: 'co-1', purpose: 'bot_reply' })
    ).rejects.toThrow(/sendMessage failed 400/)
    expect(db.tables.messaging_cost_events ?? []).toHaveLength(0)
  })

  it('never throws into the send path when recording fails', async () => {
    fetchMock.mockResolvedValueOnce(metaOk('wamid.OK'))
    serviceClient = () => {
      throw new Error('db down')
    }
    await expect(
      sendWhatsAppMessage('+15551234567', { type: 'text', text: { body: 'x' } }, { companyId: 'co-1', purpose: 'bot_reply' })
    ).resolves.toBe('wamid.OK')
  })

  it('the development kill switch returns null, sends nothing and records nothing', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const wamid = await sendWhatsAppMessage('+15551234567', { type: 'text', text: { body: 'x' } }, { companyId: 'co-1', purpose: 'bot_reply' })
    expect(wamid).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(db.tables.messaging_cost_events ?? []).toHaveLength(0)
  })

  it('sendWhatsAppTemplate returns the wamid and carries the attribution (owner notification)', async () => {
    fetchMock.mockResolvedValueOnce(metaOk('wamid.T'))
    const wamid = await sendWhatsAppTemplate(
      '+15551234567',
      { name: 'estimate_viewed', languageCode: 'en_US', bodyVariables: ['Jane'] },
      { companyId: 'co-2', purpose: 'owner_notification', billable: true }
    )
    expect(wamid).toBe('wamid.T')
    expect(db.tables.messaging_cost_events[0]).toMatchObject({
      company_id: 'co-2',
      purpose: 'owner_notification',
      billable: true,
      market: 'US',
    })
  })
})

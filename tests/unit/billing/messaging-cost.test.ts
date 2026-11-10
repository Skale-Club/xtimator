import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeFakeDb, type Row } from './messaging-fake-db'

/**
 * Phase 2b - pricing of WhatsApp / SMS / email sends and the Meta delivery-status
 * handler (lib/billing/messaging-cost.ts, lib/billing/messaging-events.ts, the
 * messagingRates part of billing_config). No DB, no network: the supabase client is
 * an in-memory fake.
 */

let db = makeFakeDb()

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => db.client,
  requireServiceClient: () => db.client,
}))

import {
  applyWhatsAppStatus,
  applyWhatsAppStatuses,
  emailCostUsd,
  recordEmailSent,
  recordSmsSent,
  smsCostUsd,
  whatsappCostUsd,
} from '@/lib/billing/messaging-cost'
import { estimateSmsSegments, marketFromPhone, resolveBillable } from '@/lib/billing/messaging-events'
import {
  DEFAULT_BILLING_CONFIG,
  DEFAULT_MESSAGING_RATES,
  invalidateBillingConfigCache,
  mergeStoredBillingConfig,
} from '@/lib/billing/billing-config'

beforeEach(() => {
  db = makeFakeDb()
  invalidateBillingConfigCache()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

function costRow(over: Row = {}): Row {
  return {
    id: 'evt-1',
    company_id: 'co-1',
    channel: 'whatsapp',
    provider: 'meta',
    provider_message_id: 'wamid.A',
    purpose: 'bot_reply',
    billable: true,
    category: null,
    market: 'US',
    units: 1,
    cost_usd: null,
    status: 'sent',
    delivered_at: null,
    debited_at: null,
    debit_batch_id: null,
    ...over,
  }
}

describe('estimateSmsSegments', () => {
  it('counts GSM-7 bodies as 160 single / 153 per concatenated segment', () => {
    expect(estimateSmsSegments('Hello')).toBe(1)
    expect(estimateSmsSegments('a'.repeat(160))).toBe(1)
    expect(estimateSmsSegments('a'.repeat(161))).toBe(2)
    expect(estimateSmsSegments('a'.repeat(306))).toBe(2)
    expect(estimateSmsSegments('a'.repeat(307))).toBe(3)
  })

  it('counts GSM extension characters as two septets', () => {
    expect(estimateSmsSegments('€'.repeat(80))).toBe(1) // 160 septets
    expect(estimateSmsSegments('€'.repeat(81))).toBe(2) // 162 septets
  })

  it('switches to UCS-2 (70 / 67) as soon as one character is outside GSM', () => {
    expect(estimateSmsSegments(`${'a'.repeat(68)}😀`)).toBe(1) // exactly 70 UTF-16 units
    expect(estimateSmsSegments(`${'a'.repeat(70)}😀`)).toBe(2) // 72 UTF-16 units
    expect(estimateSmsSegments(`${'a'.repeat(133)}😀`)).toBe(3) // 135 units > 134
    expect(estimateSmsSegments('Olá, tudo bem? ✅')).toBe(1)
  })

  it('never returns 0 for an empty body', () => {
    expect(estimateSmsSegments('')).toBe(1)
  })
})

describe('marketFromPhone / resolveBillable', () => {
  it('maps calling codes: 1 -> US, 55 -> BR, anything else -> default', () => {
    expect(marketFromPhone('+15551234567')).toBe('US')
    expect(marketFromPhone('15551234567')).toBe('US')
    expect(marketFromPhone('+5511999990000')).toBe('BR')
    expect(marketFromPhone('351912345678')).toBe('default')
    expect(marketFromPhone(null)).toBe('default')
  })

  it('platform purposes and tenant-less sends are never billable', () => {
    expect(resolveBillable({ companyId: 'co-1', purpose: 'bot_reply', billable: true })).toBe(true)
    expect(resolveBillable({ companyId: 'co-1', purpose: 'bot_reply' })).toBe(true)
    expect(resolveBillable({ companyId: 'co-1', purpose: 'welcome', billable: true })).toBe(false)
    expect(resolveBillable({ companyId: 'co-1', purpose: 'otp', billable: true })).toBe(false)
    expect(resolveBillable({ companyId: null, purpose: 'bot_reply', billable: true })).toBe(false)
    expect(resolveBillable({ companyId: 'co-1', purpose: 'bot_reply', billable: false })).toBe(false)
  })
})

describe('rates', () => {
  it('prices WhatsApp per market and category, falling back to the default market', () => {
    const r = DEFAULT_MESSAGING_RATES
    expect(whatsappCostUsd(r, 'US', 'utility')).toBe(0.0034)
    expect(whatsappCostUsd(r, 'CA', 'service')).toBe(0.0034)
    expect(whatsappCostUsd(r, 'US', 'marketing')).toBe(0.025)
    expect(whatsappCostUsd(r, 'BR', 'utility')).toBe(0.0068)
    expect(whatsappCostUsd(r, 'BR', 'marketing')).toBe(0.0625)
    expect(whatsappCostUsd(r, 'AR', 'authentication')).toBe(0.0034) // unknown market -> default
    expect(whatsappCostUsd(undefined, 'BR', 'marketing')).toBe(0.025) // no config at all -> built-in default market
  })

  it('prices SMS per segment of the destination country', () => {
    const r = DEFAULT_MESSAGING_RATES
    expect(smsCostUsd(r, 'US', 1)).toBeCloseTo(0.013, 6)
    expect(smsCostUsd(r, 'US', 3)).toBeCloseTo(0.039, 6)
    expect(smsCostUsd(r, 'BR', 2)).toBeCloseTo(0.12, 6)
    expect(smsCostUsd(r, 'default', 1)).toBe(0.06)
    expect(smsCostUsd(r, 'AR', 1)).toBe(0.06)
  })

  it('prices email per message', () => {
    expect(emailCostUsd(DEFAULT_MESSAGING_RATES)).toBe(0.0004)
    expect(emailCostUsd(undefined)).toBe(0.0004)
  })

  it('a stored billing_config without messagingRates falls back to the defaults', () => {
    const cfg = mergeStoredBillingConfig({ markup: 3 })
    expect(cfg.markup).toBe(3)
    expect(cfg.messagingRates).toEqual(DEFAULT_MESSAGING_RATES)
    expect(DEFAULT_BILLING_CONFIG.messagingRates).toEqual(DEFAULT_MESSAGING_RATES)
  })

  it('a partially stored messagingRates keeps the other markets, categories and channels', () => {
    const cfg = mergeStoredBillingConfig({
      messagingRates: {
        whatsapp: { BR: { marketing: 0.1 } },
        sms: { US: 0.01 },
      } as never,
    })
    expect(cfg.messagingRates.whatsapp.BR).toEqual({ ...DEFAULT_MESSAGING_RATES.whatsapp.BR, marketing: 0.1 })
    expect(cfg.messagingRates.whatsapp.US).toEqual(DEFAULT_MESSAGING_RATES.whatsapp.US)
    expect(cfg.messagingRates.sms).toEqual({ ...DEFAULT_MESSAGING_RATES.sms, US: 0.01 })
    expect(cfg.messagingRates.emailUsd).toBe(0.0004)
  })
})

describe('applyWhatsAppStatus', () => {
  it('prices a delivered message by recipient market and Meta category, and is idempotent', async () => {
    db = makeFakeDb({
      messaging_cost_events: [costRow()],
      whatsapp_messages: [{ wa_message_id: 'wamid.A', status: 'sent' }],
    })
    const entry = {
      id: 'wamid.A',
      status: 'delivered',
      timestamp: '1760000000',
      recipient_id: '5511999990000',
      pricing: { billable: true, category: 'utility', pricing_model: 'PMP' },
    }
    await applyWhatsAppStatus(entry)

    const row = db.tables.messaging_cost_events[0]
    expect(row.status).toBe('delivered')
    expect(row.cost_usd).toBe(0.0068) // BR utility
    expect(row.market).toBe('BR')
    expect(row.category).toBe('utility')
    expect(row.delivered_at).toBe(new Date(1760000000 * 1000).toISOString())
    expect(db.tables.whatsapp_messages[0].status).toBe('delivered')

    const updatesAfterFirst = db.log.filter((l) => l.table === 'messaging_cost_events' && l.op === 'update').length
    await applyWhatsAppStatus(entry) // Meta retries the webhook
    await applyWhatsAppStatus({ ...entry, pricing: { billable: true, category: 'marketing' } }) // even with other data
    expect(db.log.filter((l) => l.table === 'messaging_cost_events' && l.op === 'update').length).toBe(updatesAfterFirst)
    expect(row.cost_usd).toBe(0.0068)
  })

  it('prices marketing higher than utility in the same market', async () => {
    db = makeFakeDb({ messaging_cost_events: [costRow()] })
    await applyWhatsAppStatus({
      id: 'wamid.A',
      status: 'delivered',
      recipient_id: '15551234567',
      pricing: { billable: true, category: 'marketing' },
    })
    expect(db.tables.messaging_cost_events[0].cost_usd).toBe(0.025)
    expect(db.tables.messaging_cost_events[0].market).toBe('US')
  })

  it('costs 0 when Meta says the message is not billable', async () => {
    db = makeFakeDb({ messaging_cost_events: [costRow()] })
    await applyWhatsAppStatus({
      id: 'wamid.A',
      status: 'delivered',
      recipient_id: '15551234567',
      pricing: { billable: false, category: 'service' },
    })
    const row = db.tables.messaging_cost_events[0]
    expect(row.status).toBe('delivered')
    expect(row.cost_usd).toBe(0)
  })

  it.each(['free_customer_service', 'free_entry_point'])('costs 0 for pricing.type %s', async (type) => {
    db = makeFakeDb({ messaging_cost_events: [costRow()] })
    await applyWhatsAppStatus({
      id: 'wamid.A',
      status: 'delivered',
      recipient_id: '15551234567',
      pricing: { billable: true, category: 'service', type },
    })
    expect(db.tables.messaging_cost_events[0].cost_usd).toBe(0)
  })

  it('falls back to the category recorded at send, then to service, when Meta sends no pricing block', async () => {
    db = makeFakeDb({ messaging_cost_events: [costRow({ category: 'marketing' }), costRow({ id: 'evt-2', provider_message_id: 'wamid.B' })] })
    await applyWhatsAppStatus({ id: 'wamid.A', status: 'delivered', recipient_id: '15551234567' })
    await applyWhatsAppStatus({ id: 'wamid.B', status: 'delivered', recipient_id: '15551234567' })
    expect(db.tables.messaging_cost_events[0].cost_usd).toBe(0.025)
    expect(db.tables.messaging_cost_events[1].cost_usd).toBe(0.0034)
  })

  it('failed -> status failed, cost 0, and a late delivered never overwrites it', async () => {
    db = makeFakeDb({
      messaging_cost_events: [costRow()],
      whatsapp_messages: [{ wa_message_id: 'wamid.A', status: 'sent' }],
    })
    await applyWhatsAppStatus({ id: 'wamid.A', status: 'failed', errors: [{ code: 131026, title: 'Undeliverable' }] })
    const row = db.tables.messaging_cost_events[0]
    expect(row.status).toBe('failed')
    expect(row.cost_usd).toBe(0)
    expect(db.tables.whatsapp_messages[0].status).toBe('failed')
    expect(db.tables.whatsapp_messages[0].error_message).toBe('Undeliverable')

    await applyWhatsAppStatus({ id: 'wamid.A', status: 'delivered', recipient_id: '15551234567', pricing: { billable: true, category: 'utility' } })
    expect(row.status).toBe('failed')
    expect(row.cost_usd).toBe(0)
  })

  it("a 'sent' status carrying pricing only remembers the category (no cost yet)", async () => {
    db = makeFakeDb({ messaging_cost_events: [costRow()] })
    await applyWhatsAppStatus({ id: 'wamid.A', status: 'sent', pricing: { billable: true, category: 'utility' } })
    const row = db.tables.messaging_cost_events[0]
    expect(row.category).toBe('utility')
    expect(row.status).toBe('sent')
    expect(row.cost_usd).toBeNull()
  })

  it("'read' settles a row whose delivered webhook was missed, and never downgrades the inbox status", async () => {
    db = makeFakeDb({
      messaging_cost_events: [costRow()],
      whatsapp_messages: [{ wa_message_id: 'wamid.A', status: 'sent' }],
    })
    await applyWhatsAppStatus({ id: 'wamid.A', status: 'read', recipient_id: '15551234567', pricing: { billable: true, category: 'utility' } })
    expect(db.tables.messaging_cost_events[0].status).toBe('delivered')
    expect(db.tables.messaging_cost_events[0].cost_usd).toBe(0.0034)
    expect(db.tables.whatsapp_messages[0].status).toBe('read')
    await applyWhatsAppStatus({ id: 'wamid.A', status: 'delivered', recipient_id: '15551234567' })
    expect(db.tables.whatsapp_messages[0].status).toBe('read')
  })

  it('ignores a wamid we never recorded and never throws', async () => {
    db = makeFakeDb({ messaging_cost_events: [costRow()] })
    await expect(
      applyWhatsAppStatuses([{ id: 'wamid.unknown', status: 'delivered', recipient_id: '15551234567' }])
    ).resolves.toBeUndefined()
    expect(db.tables.messaging_cost_events[0].status).toBe('sent')
  })

  it('uses a stored rate override from billing_config', async () => {
    db = makeFakeDb({
      messaging_cost_events: [costRow()],
      platform_integrations: [
        { provider: 'billing_config', metadata: { messagingRates: { whatsapp: { US: { utility: 0.01 } } } } },
      ],
    })
    await applyWhatsAppStatus({
      id: 'wamid.A',
      status: 'delivered',
      recipient_id: '15551234567',
      pricing: { billable: true, category: 'utility' },
    })
    expect(db.tables.messaging_cost_events[0].cost_usd).toBe(0.01)
  })
})

describe('recordSmsSent / recordEmailSent', () => {
  it('records an SMS with Twilio-reported segments and the destination rate', async () => {
    await recordSmsSent({
      to: '+15551234567',
      body: 'hi',
      sid: 'SM1',
      numSegments: 3,
      meta: { companyId: 'co-1', purpose: 'customer_message', billable: true },
    })
    const row = db.tables.messaging_cost_events[0]
    expect(row).toMatchObject({
      company_id: 'co-1',
      channel: 'sms',
      provider: 'twilio',
      provider_message_id: 'SM1',
      purpose: 'customer_message',
      billable: true,
      market: 'US',
      units: 3,
      status: 'sent',
    })
    expect(row.cost_usd as number).toBeCloseTo(0.0249, 6)
  })

  it('estimates segments from the body when Twilio reports none (Brazil = 0.05 per segment)', async () => {
    await recordSmsSent({
      to: '+5511999990000',
      body: 'a'.repeat(200),
      sid: 'SM2',
      meta: { companyId: 'co-1', purpose: 'owner_notification', billable: true },
    })
    const row = db.tables.messaging_cost_events[0]
    expect(row.units).toBe(2)
    expect(row.market).toBe('BR')
    expect(row.cost_usd as number).toBeCloseTo(0.1, 6)
  })

  it('records login/OTP-style sends as non-billable', async () => {
    await recordSmsSent({ to: '+15551234567', body: 'code 123456', sid: 'SM3', meta: { companyId: null, purpose: 'otp', billable: true } })
    expect(db.tables.messaging_cost_events[0].billable).toBe(false)
  })

  it('a duplicate provider id is swallowed (retry-safe)', async () => {
    const input = { to: '+15551234567', body: 'x', sid: 'SM4', meta: { companyId: 'co-1', purpose: 'customer_message' as const } }
    await recordSmsSent(input)
    await recordSmsSent(input)
    expect(db.tables.messaging_cost_events).toHaveLength(1)
  })

  it('records an email with the per-message rate, billable only with a company and a customer purpose', async () => {
    await recordEmailSent({ id: 're_1', meta: { companyId: 'co-1', purpose: 'customer_message', billable: true } })
    await recordEmailSent({ id: 're_2', meta: { companyId: null, purpose: 'otp', billable: false } })
    const [a, b] = db.tables.messaging_cost_events
    expect(a).toMatchObject({ channel: 'email', provider: 'resend', billable: true, cost_usd: 0.0004, company_id: 'co-1' })
    expect(b).toMatchObject({ billable: false, company_id: null })
  })
})

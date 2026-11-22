import { describe, expect, it } from 'vitest'
import {
  buildAcquisition,
  consentAllows,
  parseConsentCookie,
  parseGaClientId,
  parseGaSessionId,
  resolveFbc,
  GA_SESSION_COOKIE,
  type Acquisition,
} from '@/lib/marketing/signals'
import { serializeAttribution } from '@/lib/marketing/attribution'
import {
  buildGa4Payload,
  buildMetaPayload,
  normalizePhoneDigits,
  sha256,
  type ConversionInput,
} from '@/lib/marketing/conversions/payloads'
import { splitKey } from '@/lib/marketing/conversions/config'

const NOW = new Date('2026-11-21T12:00:00.000Z')

const attribution = {
  first: { landing: '/', utm_source: 'meta', fbclid: 'FBCLID1', gclid: 'GCLID1', ts: NOW.toISOString() },
  last: { landing: '/', utm_source: 'meta', fbclid: 'FBCLID1', gclid: 'GCLID1', ts: NOW.toISOString() },
}

function cookies(values: Record<string, string>) {
  return (name: string) => values[name]
}

describe('consentAllows', () => {
  it('rejection blocks everything in both policies', () => {
    const rejected = parseConsentCookie('rejected')
    for (const policy of ['require_accept', 'unless_rejected'] as const) {
      expect(consentAllows(rejected, policy)).toEqual({ analytics: false, ads: false })
    }
  })

  it('GPC blocks ads in both policies, from the header or the banner flag', () => {
    expect(consentAllows(parseConsentCookie('accepted', true), 'unless_rejected').ads).toBe(false)
    expect(consentAllows(parseConsentCookie('accepted_gpc'), 'unless_rejected')).toEqual({ analytics: true, ads: false })
    expect(consentAllows(parseConsentCookie(undefined, true), 'unless_rejected')).toEqual({ analytics: true, ads: false })
    expect(consentAllows(parseConsentCookie('accepted', true), 'require_accept').ads).toBe(false)
  })

  it('no answer: allowed under unless_rejected, blocked under require_accept', () => {
    const none = parseConsentCookie(undefined)
    expect(consentAllows(none, 'unless_rejected')).toEqual({ analytics: true, ads: true })
    expect(consentAllows(none, 'require_accept')).toEqual({ analytics: false, ads: false })
  })

  it('accept allows everything', () => {
    expect(consentAllows(parseConsentCookie('accepted'), 'require_accept')).toEqual({ analytics: true, ads: true })
  })
})

describe('cookie parsers', () => {
  it('reads the GA client and session ids', () => {
    expect(parseGaClientId('GA1.1.1234567890.1700000000')).toBe('1234567890.1700000000')
    expect(parseGaClientId('nope')).toBeNull()
    expect(parseGaSessionId('GS1.1.1700000000.3.1.1700000100.0.0.0')).toBe('1700000000')
    expect(parseGaSessionId('GS2.1.s1700000000$o3$g1$t1700000100')).toBe('1700000000')
    expect(GA_SESSION_COOKIE).toBe('_ga_3YK0P9K6G5')
  })

  it('builds fbc from the cookie or the stored fbclid', () => {
    expect(resolveFbc('fb.1.1700000000000.XYZ', null)).toBe('fb.1.1700000000000.XYZ')
    expect(resolveFbc(undefined, attribution)).toBe(`fb.1.${NOW.getTime()}.FBCLID1`)
    expect(resolveFbc(undefined, null)).toBeNull()
  })
})

describe('buildAcquisition', () => {
  it('keeps ids and click ids when not rejected', () => {
    const acq = buildAcquisition(
      cookies({ xt_consent: 'accepted', xt_attr: serializeAttribution(attribution), _ga: 'GA1.1.111.222', _fbp: 'fb.1.1700000000000.555' }),
      NOW,
    )
    expect(acq.consent).toEqual({ choice: 'accepted', gpc: false })
    expect(acq.gaClientId).toBe('111.222')
    expect(acq.fbp).toBe('fb.1.1700000000000.555')
    expect(acq.attribution?.last.gclid).toBe('GCLID1')
  })

  it('drops click ids and browser ids after a rejection', () => {
    const acq = buildAcquisition(
      cookies({ xt_consent: 'rejected', xt_attr: serializeAttribution(attribution), _ga: 'GA1.1.111.222' }),
      NOW,
    )
    expect(acq.attribution?.last.gclid).toBeUndefined()
    expect(acq.attribution?.last.utm_source).toBe('meta')
    expect(acq.gaClientId).toBeNull()
    expect(acq.fbc).toBeNull()
  })

  it('records GPC from the request header', () => {
    expect(buildAcquisition(cookies({}), NOW, { gpcHeader: true }).consent.gpc).toBe(true)
  })
})

const input: ConversionInput = {
  name: 'purchase',
  eventId: 'purchase:in:in_123',
  companyId: '00000000-0000-0000-0000-000000000001',
  occurredAt: NOW,
  value: 29,
  currency: 'usd',
  sourceUrl: 'https://xtimator.com/settings/billing',
  email: ' Owner@Example.com ',
  phone: '(555) 123-4567',
}

function acq(overrides: Partial<Acquisition> = {}): Acquisition {
  return {
    v: 1,
    channel: 'web',
    capturedAt: NOW.toISOString(),
    consent: { choice: 'accepted', gpc: false },
    attribution,
    gaClientId: '111.222',
    gaSessionId: '1700000000',
    fbp: 'fb.1.1700000000000.555',
    fbc: 'fb.1.1700000000000.FBCLID1',
    ...overrides,
  }
}

describe('buildGa4Payload', () => {
  it('sends a purchase with value, session and hashed user data when ads are allowed', () => {
    const built = buildGa4Payload(input, acq(), 'unless_rejected')
    if (!('body' in built)) throw new Error('expected a body')
    const event = (built.body.events as Array<{ name: string; params: Record<string, unknown> }>)[0]
    expect(event.name).toBe('purchase')
    expect(event.params).toMatchObject({ transaction_id: input.eventId, value: 29, currency: 'USD', session_id: '1700000000' })
    expect(built.body.client_id).toBe('111.222')
    expect(built.body.user_data).toEqual({
      sha256_email_address: [sha256('owner@example.com')],
      sha256_phone_number: [sha256('+15551234567')],
    })
  })

  it('no user data and ads signals denied under GPC', () => {
    const built = buildGa4Payload(input, acq({ consent: { choice: 'accepted', gpc: true } }), 'unless_rejected')
    if (!('body' in built)) throw new Error('expected a body')
    expect(built.body.user_data).toBeUndefined()
    expect(built.body.consent).toEqual({ ad_user_data: 'DENIED', ad_personalization: 'DENIED' })
  })

  it('skips without consent or without a GA client id', () => {
    expect(buildGa4Payload(input, acq({ consent: { choice: 'rejected', gpc: false } }), 'unless_rejected')).toEqual({ skip: 'no_consent' })
    expect(buildGa4Payload(input, acq({ gaClientId: null }), 'unless_rejected')).toEqual({ skip: 'no_browser_id' })
    expect(buildGa4Payload(input, null, 'unless_rejected')).toEqual({ skip: 'no_consent' })
  })
})

describe('buildMetaPayload', () => {
  it('sends Purchase with hashed ids, fbc/fbp, dedupe id and the test code', () => {
    const built = buildMetaPayload(input, acq(), 'unless_rejected', { testEventCode: 'TEST1' })
    if (!('body' in built)) throw new Error('expected a body')
    const event = (built.body.data as Array<Record<string, unknown>>)[0]
    expect(event).toMatchObject({
      event_name: 'Purchase',
      event_id: input.eventId,
      action_source: 'website',
      custom_data: { value: 29, currency: 'USD' },
    })
    expect(event.user_data).toMatchObject({
      em: [sha256('owner@example.com')],
      ph: [sha256('15551234567')],
      fbc: 'fb.1.1700000000000.FBCLID1',
      fbp: 'fb.1.1700000000000.555',
    })
    expect(built.body.test_event_code).toBe('TEST1')
  })

  it('never sends after a rejection or with GPC', () => {
    expect(buildMetaPayload(input, acq({ consent: { choice: 'rejected', gpc: false } }), 'unless_rejected', {})).toEqual({ skip: 'no_consent' })
    expect(buildMetaPayload(input, acq({ consent: { choice: null, gpc: true } }), 'unless_rejected', {})).toEqual({ skip: 'no_consent' })
    expect(buildMetaPayload(input, acq({ consent: { choice: null, gpc: false } }), 'require_accept', {})).toEqual({ skip: 'no_consent' })
  })

  it('maps sign_up to CompleteRegistration without value', () => {
    const built = buildMetaPayload({ ...input, name: 'sign_up', value: null }, acq(), 'unless_rejected', {})
    if (!('body' in built)) throw new Error('expected a body')
    const event = (built.body.data as Array<Record<string, unknown>>)[0]
    expect(event.event_name).toBe('CompleteRegistration')
    expect(event.custom_data).toBeUndefined()
  })
})

describe('helpers', () => {
  it('normalizes phones and splits keys', () => {
    expect(normalizePhoneDigits('+55 11 99999-0000')).toBe('5511999990000')
    expect(normalizePhoneDigits('5551234567')).toBe('15551234567')
    expect(normalizePhoneDigits('')).toBeNull()
    expect(splitKey('G-ABC:sec:ret')).toEqual(['G-ABC', 'sec:ret'])
    expect(splitKey('nocolon')).toBeNull()
    expect(splitKey(':x')).toBeNull()
  })
})

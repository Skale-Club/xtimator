/**
 * Server-side conversion payloads for GA4 (Measurement Protocol) and Meta
 * (Conversions API). Pure: no I/O, no secrets. The job in
 * lib/inngest/functions/marketing-conversion.ts sends them.
 *
 * Consent (stored at signup in companies.acquisition.consent, judged by
 * consentAllows() under the admin policy; rejection and GPC always win):
 *   - GA4 receives an event only when analytics is allowed AND a GA client id
 *     exists. Hashed email/phone ride along only when ads are allowed.
 *   - Meta receives an event only when ads are allowed.
 */

import { createHash } from 'node:crypto'
import { consentAllows, type Acquisition, type ConsentPolicy } from '@/lib/marketing/signals'

export type ConversionName = 'sign_up' | 'first_estimate' | 'purchase'

export interface ConversionInput {
  name: ConversionName
  eventId: string
  companyId: string
  occurredAt: Date
  value?: number | null
  currency?: string | null
  /** The page the conversion belongs to (Meta event_source_url). */
  sourceUrl: string
  email?: string | null
  phone?: string | null
}

const GA4_EVENT: Record<ConversionName, string> = {
  sign_up: 'sign_up',
  first_estimate: 'first_estimate',
  purchase: 'purchase',
}

/** Meta standard events where one fits; a custom event for the first estimate. */
const META_EVENT: Record<ConversionName, string> = {
  sign_up: 'CompleteRegistration',
  first_estimate: 'FirstEstimate',
  purchase: 'Purchase',
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function normalizeEmail(email: string | null | undefined): string | null {
  const e = email?.trim().toLowerCase()
  return e && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e : null
}

/** Digits with country code, no '+' (US numbers without one get 1). */
export function normalizePhoneDigits(phone: string | null | undefined): string | null {
  if (!phone) return null
  const hasPlus = phone.trim().startsWith('+')
  let digits = phone.replace(/\D/g, '')
  if (!digits) return null
  if (!hasPlus && digits.length === 10) digits = `1${digits}`
  return digits.length >= 8 && digits.length <= 15 ? digits : null
}

function money(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null
}

export type SkipReason = 'no_consent' | 'no_browser_id'

export function buildGa4Payload(
  input: ConversionInput,
  acquisition: Acquisition | null,
  policy: ConsentPolicy,
): { body: Record<string, unknown> } | { skip: SkipReason } {
  const allowed = consentAllows(acquisition?.consent, policy)
  if (!acquisition || !allowed.analytics) return { skip: 'no_consent' }
  if (!acquisition.gaClientId) return { skip: 'no_browser_id' }

  const ads = allowed.ads
  const params: Record<string, unknown> = { engagement_time_msec: 1 }
  if (acquisition.gaSessionId) params.session_id = acquisition.gaSessionId
  if (input.name === 'sign_up') params.method = 'web'
  const value = money(input.value)
  if (input.name === 'purchase') {
    params.transaction_id = input.eventId
    if (value !== null) {
      params.value = value
      params.currency = (input.currency ?? 'usd').toUpperCase()
    }
  }

  const body: Record<string, unknown> = {
    client_id: acquisition.gaClientId,
    timestamp_micros: input.occurredAt.getTime() * 1000,
    non_personalized_ads: !ads,
    consent: {
      ad_user_data: ads ? 'GRANTED' : 'DENIED',
      ad_personalization: ads ? 'GRANTED' : 'DENIED',
    },
    events: [{ name: GA4_EVENT[input.name], params }],
  }

  if (ads) {
    const email = normalizeEmail(input.email)
    const phone = normalizePhoneDigits(input.phone)
    const userData: Record<string, unknown> = {}
    if (email) userData.sha256_email_address = [sha256(email)]
    if (phone) userData.sha256_phone_number = [sha256(`+${phone}`)]
    if (Object.keys(userData).length > 0) body.user_data = userData
  }
  return { body }
}

export function buildMetaPayload(
  input: ConversionInput,
  acquisition: Acquisition | null,
  policy: ConsentPolicy,
  options: { testEventCode?: string | null },
): { body: Record<string, unknown> } | { skip: SkipReason } {
  if (!acquisition || !consentAllows(acquisition.consent, policy).ads) return { skip: 'no_consent' }

  const userData: Record<string, unknown> = { external_id: [sha256(input.companyId)] }
  const email = normalizeEmail(input.email)
  const phone = normalizePhoneDigits(input.phone)
  if (email) userData.em = [sha256(email)]
  if (phone) userData.ph = [sha256(phone)]
  if (acquisition.fbp) userData.fbp = acquisition.fbp
  if (acquisition.fbc) userData.fbc = acquisition.fbc

  const event: Record<string, unknown> = {
    event_name: META_EVENT[input.name],
    event_time: Math.floor(input.occurredAt.getTime() / 1000),
    event_id: input.eventId,
    action_source: 'website',
    event_source_url: input.sourceUrl,
    user_data: userData,
  }
  const value = money(input.value)
  if (input.name === 'purchase' && value !== null) {
    event.custom_data = { value, currency: (input.currency ?? 'usd').toUpperCase() }
  }

  const body: Record<string, unknown> = { data: [event] }
  if (options.testEventCode) body.test_event_code = options.testEventCode
  return { body }
}

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// --- Mocks ---
vi.mock('@/lib/sms/verify-webhook', () => ({
  verifyTwilioSignature: vi.fn(),
}))

vi.mock('@/lib/platform-config', () => ({
  getTwilioConfig: vi.fn(),
}))

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(),
}))

vi.mock('@/lib/utils/site-url', () => ({
  resolveBaseUrl: vi.fn(),
}))

import { verifyTwilioSignature } from '@/lib/sms/verify-webhook'
import { getTwilioConfig } from '@/lib/platform-config'
import { requireServiceClient } from '@/lib/supabase/service'
import { resolveBaseUrl } from '@/lib/utils/site-url'
import { POST } from '@/app/api/webhooks/twilio/route'

const mockVerify = vi.mocked(verifyTwilioSignature)
const mockGetTwilioConfig = vi.mocked(getTwilioConfig)
const mockServiceClient = vi.mocked(requireServiceClient)
const mockResolveBaseUrl = vi.mocked(resolveBaseUrl)

const TWILIO_CONFIG = { accountSid: 'AC_test', authToken: 'tok_test', fromPhone: '+15550000000' }

type ClientMatch = { id: string; company_id: string | null; sms_consent_status: string }

function makeRequest(fields: Record<string, string>) {
  const bodyStr = new URLSearchParams(fields).toString()
  return new Request('http://0.0.0.0:3000/api/webhooks/twilio', {
    method: 'POST',
    body: bodyStr,
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-twilio-signature': 'sig-abc',
    },
  })
}

/**
 * Mocked service client covering the `clients` (select/update) and
 * `client_message_events` (select/insert) chains this route uses.
 */
function makeServiceClient(
  opts: {
    existingEvent?: boolean
    clientMatches?: ClientMatch[]
    rejectUpdate?: boolean
  } = {}
) {
  const eventSelectLimit = vi.fn().mockResolvedValue({
    data: opts.existingEvent ? [{ id: 'evt-existing' }] : [],
    error: null,
  })
  const eventSelectEq = vi.fn().mockReturnValue({ limit: eventSelectLimit })
  const eventSelect = vi.fn().mockReturnValue({ eq: eventSelectEq })
  const eventInsert = vi.fn().mockResolvedValue({ data: null, error: null })

  const clientSelectEq = vi.fn().mockResolvedValue({
    data: opts.clientMatches ?? [],
    error: null,
  })
  const clientSelect = vi.fn().mockReturnValue({ eq: clientSelectEq })

  const clientUpdateEq = vi.fn().mockImplementation(() => {
    if (opts.rejectUpdate) return Promise.reject(new Error('update failed'))
    return Promise.resolve({ data: null, error: null })
  })
  const clientUpdate = vi.fn().mockReturnValue({ eq: clientUpdateEq })

  const from = vi.fn().mockImplementation((table: string) => {
    if (table === 'client_message_events') {
      return { select: eventSelect, insert: eventInsert }
    }
    if (table === 'clients') {
      return { select: clientSelect, update: clientUpdate }
    }
    throw new Error(`Unexpected table in test mock: ${table}`)
  })

  return {
    from,
    eventSelect,
    eventSelectEq,
    eventSelectLimit,
    eventInsert,
    clientSelect,
    clientSelectEq,
    clientUpdate,
    clientUpdateEq,
  }
}

describe('POST /api/webhooks/twilio', () => {
  beforeEach(() => {
    mockVerify.mockReset()
    mockGetTwilioConfig.mockReset()
    mockServiceClient.mockReset()
    mockResolveBaseUrl.mockReset()
    mockGetTwilioConfig.mockResolvedValue(TWILIO_CONFIG)
    mockResolveBaseUrl.mockReturnValue('https://xtimator.com')
    mockVerify.mockReturnValue(true)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns 401 and logs a warning when signature verification fails, without touching the DB', async () => {
    mockVerify.mockReturnValue(false)
    const svc = makeServiceClient()
    mockServiceClient.mockReturnValue(svc as unknown as ReturnType<typeof requireServiceClient>)

    const req = makeRequest({ Body: 'STOP', From: '+15551234567', MessageSid: 'SM1' })
    const res = await POST(req)

    expect(res.status).toBe(401)
    expect(svc.from).not.toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalled()
  })

  it('returns 401 without calling verifyTwilioSignature when Twilio is unconfigured', async () => {
    mockGetTwilioConfig.mockResolvedValue(null)

    const req = makeRequest({ Body: 'STOP', From: '+15551234567', MessageSid: 'SM1' })
    const res = await POST(req)

    expect(res.status).toBe(401)
    expect(mockVerify).not.toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalled()
  })

  it('STOP with a single matched client: suppresses that row and logs the event', async () => {
    const svc = makeServiceClient({
      clientMatches: [{ id: 'c1', company_id: 'co1', sms_consent_status: 'granted' }],
    })
    mockServiceClient.mockReturnValue(svc as unknown as ReturnType<typeof requireServiceClient>)

    const req = makeRequest({ Body: 'STOP', From: '+15551234567', MessageSid: 'SM1' })
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(svc.clientUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ sms_consent_status: 'revoked', sms_opted_out_at: expect.any(String) })
    )
    expect(svc.clientUpdateEq).toHaveBeenCalledWith('id', 'c1')
    expect(svc.eventInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        company_id: 'co1',
        client_id: 'c1',
        keyword_type: 'stop',
        twilio_message_sid: 'SM1',
      }),
    ])
  })

  it('STOP fan-out: suppresses every matched row across every company', async () => {
    const svc = makeServiceClient({
      clientMatches: [
        { id: 'c1', company_id: 'co1', sms_consent_status: 'granted' },
        { id: 'c2', company_id: 'co2', sms_consent_status: 'unknown' },
      ],
    })
    mockServiceClient.mockReturnValue(svc as unknown as ReturnType<typeof requireServiceClient>)

    const req = makeRequest({ Body: 'STOP', From: '+15551234567', MessageSid: 'SM2' })
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(svc.clientUpdate).toHaveBeenCalledTimes(2)
    expect(svc.clientUpdateEq).toHaveBeenCalledWith('id', 'c1')
    expect(svc.clientUpdateEq).toHaveBeenCalledWith('id', 'c2')
    for (const call of svc.clientUpdate.mock.calls) {
      expect(call[0]).toMatchObject({ sms_consent_status: 'revoked' })
    }
    expect(svc.eventInsert).toHaveBeenCalledWith([
      expect.objectContaining({ company_id: 'co1', client_id: 'c1', keyword_type: 'stop' }),
      expect.objectContaining({ company_id: 'co2', client_id: 'c2', keyword_type: 'stop' }),
    ])
  })

  it('STOP with no matched client: never drops the event, still returns 200', async () => {
    const svc = makeServiceClient({ clientMatches: [] })
    mockServiceClient.mockReturnValue(svc as unknown as ReturnType<typeof requireServiceClient>)

    const req = makeRequest({ Body: 'STOP', From: '+15559999999', MessageSid: 'SM3' })
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(svc.clientUpdate).not.toHaveBeenCalled()
    expect(svc.eventInsert).toHaveBeenCalledTimes(1)
    expect(svc.eventInsert).toHaveBeenCalledWith([
      expect.objectContaining({ client_id: null, company_id: null, from_phone: '+15559999999' }),
    ])
  })

  it('START with a matched client whose prior status was revoked: restores granted + explicit_opt_in', async () => {
    const svc = makeServiceClient({
      clientMatches: [{ id: 'c1', company_id: 'co1', sms_consent_status: 'revoked' }],
    })
    mockServiceClient.mockReturnValue(svc as unknown as ReturnType<typeof requireServiceClient>)

    const req = makeRequest({ Body: 'START', From: '+15551234567', MessageSid: 'SM4' })
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(svc.clientUpdate).toHaveBeenCalledWith({
      sms_opted_out_at: null,
      sms_consent_status: 'granted',
      sms_consent_method: 'explicit_opt_in',
      sms_consent_recorded_at: expect.any(String),
    })
  })

  it('START with a matched client whose prior status was unknown: clears suppression only, never manufactures consent', async () => {
    const svc = makeServiceClient({
      clientMatches: [{ id: 'c1', company_id: 'co1', sms_consent_status: 'unknown' }],
    })
    mockServiceClient.mockReturnValue(svc as unknown as ReturnType<typeof requireServiceClient>)

    const req = makeRequest({ Body: 'START', From: '+15551234567', MessageSid: 'SM5' })
    const res = await POST(req)

    expect(res.status).toBe(200)
    const [payload] = svc.clientUpdate.mock.calls[0] as [Record<string, unknown>]
    expect(payload).toEqual({ sms_opted_out_at: null })
    expect(payload).not.toHaveProperty('sms_consent_status')
  })

  it('START fan-out: restores granted only for the previously-revoked row, leaves the unknown row unknown', async () => {
    const svc = makeServiceClient({
      clientMatches: [
        { id: 'c1', company_id: 'co1', sms_consent_status: 'revoked' },
        { id: 'c2', company_id: 'co2', sms_consent_status: 'unknown' },
      ],
    })
    mockServiceClient.mockReturnValue(svc as unknown as ReturnType<typeof requireServiceClient>)

    const req = makeRequest({ Body: 'START', From: '+15551234567', MessageSid: 'SM6' })
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(svc.clientUpdate).toHaveBeenCalledTimes(2)
    const updateCalls = svc.clientUpdate.mock.calls as Array<[Record<string, unknown>]>
    const eqCalls = svc.clientUpdateEq.mock.calls as Array<[string, string]>
    const c1Index = eqCalls.findIndex((c) => c[1] === 'c1')
    const c2Index = eqCalls.findIndex((c) => c[1] === 'c2')
    expect(updateCalls[c1Index][0]).toMatchObject({ sms_consent_status: 'granted' })
    expect(updateCalls[c2Index][0]).toEqual({ sms_opted_out_at: null })
  })

  it('an unrelated reply (classified "other") logs the event but never mutates clients', async () => {
    const svc = makeServiceClient({
      clientMatches: [{ id: 'c1', company_id: 'co1', sms_consent_status: 'granted' }],
    })
    mockServiceClient.mockReturnValue(svc as unknown as ReturnType<typeof requireServiceClient>)

    const req = makeRequest({ Body: 'call me back please', From: '+15551234567', MessageSid: 'SM7' })
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(svc.clientUpdate).not.toHaveBeenCalled()
    expect(svc.eventInsert).toHaveBeenCalledWith([expect.objectContaining({ keyword_type: 'other' })])
  })

  it('a HELP reply logs the event but never mutates clients', async () => {
    const svc = makeServiceClient({
      clientMatches: [{ id: 'c1', company_id: 'co1', sms_consent_status: 'granted' }],
    })
    mockServiceClient.mockReturnValue(svc as unknown as ReturnType<typeof requireServiceClient>)

    const req = makeRequest({ Body: 'HELP', From: '+15551234567', MessageSid: 'SM8' })
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(svc.clientUpdate).not.toHaveBeenCalled()
    expect(svc.eventInsert).toHaveBeenCalledWith([expect.objectContaining({ keyword_type: 'help' })])
  })

  it('idempotency: a duplicate MessageSid short-circuits to 200 with no further DB work', async () => {
    const svc = makeServiceClient({ existingEvent: true })
    mockServiceClient.mockReturnValue(svc as unknown as ReturnType<typeof requireServiceClient>)

    const req = makeRequest({ Body: 'STOP', From: '+15551234567', MessageSid: 'SM-dupe' })
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(svc.clientSelect).not.toHaveBeenCalled()
    expect(svc.clientUpdate).not.toHaveBeenCalled()
    expect(svc.eventInsert).not.toHaveBeenCalled()
  })

  it('matches clients via phone_normalized on the digit-stripped last-10 of From', async () => {
    const svc = makeServiceClient({ clientMatches: [] })
    mockServiceClient.mockReturnValue(svc as unknown as ReturnType<typeof requireServiceClient>)

    // Deliberately formatted with characters Twilio wouldn't actually send,
    // to prove the normalization strips everything but digits.
    const req = makeRequest({ Body: 'STOP', From: '+1 (555) 123-4567', MessageSid: 'SM9' })
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(svc.clientSelectEq).toHaveBeenCalledWith('phone_normalized', '5551234567')
  })

  it('builds the signature-verification URL from resolveBaseUrl, not request.url', async () => {
    mockResolveBaseUrl.mockReturnValue('https://xtimator.com')
    const svc = makeServiceClient({ clientMatches: [] })
    mockServiceClient.mockReturnValue(svc as unknown as ReturnType<typeof requireServiceClient>)

    // request.url itself resolves to an obviously-wrong internal address —
    // if the route used it directly the signature would be built against
    // that wrong URL instead of the mocked resolveBaseUrl() value.
    const req = makeRequest({ Body: 'STOP', From: '+15551234567', MessageSid: 'SM10' })
    await POST(req)

    expect(mockVerify).toHaveBeenCalledWith(
      'https://xtimator.com/api/webhooks/twilio',
      expect.any(Object),
      'sig-abc',
      TWILIO_CONFIG.authToken
    )
  })

  it('never throws on an internal error during the DB-mutation phase — still returns 200 and logs', async () => {
    const svc = makeServiceClient({
      clientMatches: [{ id: 'c1', company_id: 'co1', sms_consent_status: 'granted' }],
      rejectUpdate: true,
    })
    mockServiceClient.mockReturnValue(svc as unknown as ReturnType<typeof requireServiceClient>)

    const req = makeRequest({ Body: 'STOP', From: '+15551234567', MessageSid: 'SM11' })
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(console.error).toHaveBeenCalled()
  })
})

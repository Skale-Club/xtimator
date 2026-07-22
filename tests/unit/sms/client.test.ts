import { describe, it, expect, vi, afterEach } from 'vitest'

/**
 * Phase 104 plan 00 — Wave-0 RED test for the SMS client primitive (NOTIF-04).
 *
 * `@/lib/sms/client` does NOT exist yet — Wave 2 extracts `sendSms(to, body)`
 * from the proven Twilio REST path in `app/api/estimates/[id]/send-sms/route.ts`.
 * It POSTs to `Messages.json` with Basic auth + a From/To/Body urlencoded body,
 * returns `{ ok: true, sid }` on success, `{ ok: false, error }` when Twilio is
 * unconfigured (no fetch, no throw), and never throws on fetch failure.
 *
 * RED form: module-not-found until Wave 2. Lazy `await import` keeps the file
 * collectable now. Mocks are scoped + cleared in afterEach so cross-suite forks
 * runs don't leak. Twilio creds are PLACEHOLDERS only (no real SID/token).
 *
 * Owner: Wave 2 (104.2 — SMS sender).
 */

vi.mock('@/lib/platform-config', () => ({
  getTwilioConfig: vi.fn(),
  getTwilioCustomerMessagingConfig: vi.fn(),
}))

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

const TWILIO_PLACEHOLDER = {
  accountSid: 'AC_test',
  authToken: 'tok_test',
  fromPhone: '+15550000000',
}

const TWILIO_CUSTOMER_MESSAGING_PLACEHOLDER = {
  accountSid: 'AC_test',
  authToken: 'tok_test',
  messagingServiceSid: 'MG_test',
}

describe('lib/sms/client — sendSms() (NOTIF-04 RED)', () => {
  it('POSTs to Messages.json with Basic auth + From/To/Body body', async () => {
    const { sendSms } = await import('@/lib/sms/client')
    const { getTwilioConfig } = await import('@/lib/platform-config')
    ;(getTwilioConfig as ReturnType<typeof vi.fn>).mockResolvedValue(TWILIO_PLACEHOLDER)

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ sid: 'SM_test' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await sendSms('+15551234567', 'Hello from Xtimator')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC_test/Messages.json')
    const headers = init.headers as Record<string, string>
    expect(String(headers.Authorization)).toMatch(/^Basic /)
    const sentBody = String(init.body)
    expect(sentBody).toContain('From=')
    expect(sentBody).toContain('To=')
    expect(sentBody).toContain('Body=')
  })

  it('returns { ok: true, sid } on a 2xx Twilio response', async () => {
    const { sendSms } = await import('@/lib/sms/client')
    const { getTwilioConfig } = await import('@/lib/platform-config')
    ;(getTwilioConfig as ReturnType<typeof vi.fn>).mockResolvedValue(TWILIO_PLACEHOLDER)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ sid: 'SM_test' }) }),
    )

    const result = await sendSms('+15551234567', 'Hi')
    expect(result.ok).toBe(true)
    expect(result.sid).toBe('SM_test')
  })

  it('returns { ok: false } WITHOUT calling fetch when Twilio is unconfigured', async () => {
    const { sendSms } = await import('@/lib/sms/client')
    const { getTwilioConfig } = await import('@/lib/platform-config')
    ;(getTwilioConfig as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await sendSms('+15551234567', 'Hi')
    expect(result.ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('never throws when fetch rejects → returns { ok: false }', async () => {
    const { sendSms } = await import('@/lib/sms/client')
    const { getTwilioConfig } = await import('@/lib/platform-config')
    ;(getTwilioConfig as ReturnType<typeof vi.fn>).mockResolvedValue(TWILIO_PLACEHOLDER)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

    const result = await sendSms('+15551234567', 'Hi')
    expect(result.ok).toBe(false)
  })

  it('never throws on a non-ok Twilio response → returns { ok: false }', async () => {
    const { sendSms } = await import('@/lib/sms/client')
    const { getTwilioConfig } = await import('@/lib/platform-config')
    ;(getTwilioConfig as ReturnType<typeof vi.fn>).mockResolvedValue(TWILIO_PLACEHOLDER)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ message: 'bad' }) }),
    )

    const result = await sendSms('+15551234567', 'Hi')
    expect(result.ok).toBe(false)
  })
})

describe('lib/sms/client — sendCustomerSms()', () => {
  it('POSTs to Messages.json with Basic auth + MessagingServiceSid/To/Body body, and NO From', async () => {
    const { sendCustomerSms } = await import('@/lib/sms/client')
    const { getTwilioCustomerMessagingConfig } = await import('@/lib/platform-config')
    ;(getTwilioCustomerMessagingConfig as ReturnType<typeof vi.fn>).mockResolvedValue(
      TWILIO_CUSTOMER_MESSAGING_PLACEHOLDER,
    )

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ sid: 'SM_test' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await sendCustomerSms('+15551234567', 'Hello from Xtimator')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC_test/Messages.json')
    const headers = init.headers as Record<string, string>
    expect(String(headers.Authorization)).toMatch(/^Basic /)
    const sentBody = String(init.body)
    expect(sentBody).toContain('MessagingServiceSid=')
    expect(sentBody).toContain('To=')
    expect(sentBody).toContain('Body=')
    expect(sentBody).not.toContain('From=')
  })

  it('returns { ok: true, sid } on a 2xx Twilio response', async () => {
    const { sendCustomerSms } = await import('@/lib/sms/client')
    const { getTwilioCustomerMessagingConfig } = await import('@/lib/platform-config')
    ;(getTwilioCustomerMessagingConfig as ReturnType<typeof vi.fn>).mockResolvedValue(
      TWILIO_CUSTOMER_MESSAGING_PLACEHOLDER,
    )
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ sid: 'SM_test' }) }),
    )

    const result = await sendCustomerSms('+15551234567', 'Hi')
    expect(result.ok).toBe(true)
    expect(result.sid).toBe('SM_test')
  })

  it('returns { ok: false, error: "messaging_service_unconfigured" } WITHOUT calling fetch when unconfigured', async () => {
    const { sendCustomerSms } = await import('@/lib/sms/client')
    const { getTwilioCustomerMessagingConfig } = await import('@/lib/platform-config')
    ;(getTwilioCustomerMessagingConfig as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await sendCustomerSms('+15551234567', 'Hi')
    expect(result.ok).toBe(false)
    expect(result.error).toBe('messaging_service_unconfigured')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('never throws when fetch rejects → returns { ok: false }', async () => {
    const { sendCustomerSms } = await import('@/lib/sms/client')
    const { getTwilioCustomerMessagingConfig } = await import('@/lib/platform-config')
    ;(getTwilioCustomerMessagingConfig as ReturnType<typeof vi.fn>).mockResolvedValue(
      TWILIO_CUSTOMER_MESSAGING_PLACEHOLDER,
    )
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

    const result = await sendCustomerSms('+15551234567', 'Hi')
    expect(result.ok).toBe(false)
  })

  it('never throws on a non-ok Twilio response → returns { ok: false }', async () => {
    const { sendCustomerSms } = await import('@/lib/sms/client')
    const { getTwilioCustomerMessagingConfig } = await import('@/lib/platform-config')
    ;(getTwilioCustomerMessagingConfig as ReturnType<typeof vi.fn>).mockResolvedValue(
      TWILIO_CUSTOMER_MESSAGING_PLACEHOLDER,
    )
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ message: 'bad' }) }),
    )

    const result = await sendCustomerSms('+15551234567', 'Hi')
    expect(result.ok).toBe(false)
  })
})

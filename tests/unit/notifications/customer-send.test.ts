import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Phase 177 Plan 06 (CUST-01/02/05) — sendCustomerMessage() is the ONE
 * neutral orchestrator every end-customer send (177-07's legacy route
 * today, Phase 178's agentic paths tomorrow) funnels through.
 *
 * This suite mocks all four dependency modules at their boundaries
 * ('@/lib/supabase/service', '@/lib/email/customer-emails',
 * '@/lib/sms/client' — only sendCustomerSms, never the shared sendSms —
 * '@/lib/notifications/customer-template-resolver', and
 * '@/lib/notifications/customer-message-log'). It does NOT mock
 * '@/lib/notifications/customer-send-gate' — SendPermit is structurally
 * unconstructable outside that module (a module-private branded symbol),
 * so tests obtain a REAL permit by calling the REAL (unmocked)
 * assertSendAllowed() against the SAME mocked service-client `clients`
 * row. That row is a merge of the gate's consent/suppression/state/phone
 * columns and this module's own email/phone/name columns — the mocked
 * `.maybeSingle()` returns whatever object it's handed regardless of
 * which columns `.select()` named, and both modules query the SAME
 * `clients` table through the SAME mocked `requireServiceClient()`, so
 * one merged row correctly serves both call sites. Reuses the
 * `.select().eq().eq().maybeSingle()` chained-mock shape established in
 * customer-send-gate.test.ts.
 */

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(),
  createServiceClient: vi.fn(),
}))

vi.mock('@/lib/email/customer-emails', () => ({
  sendCustomerEmail: vi.fn(),
}))

vi.mock('@/lib/sms/client', () => ({
  sendCustomerSms: vi.fn(),
}))

vi.mock('@/lib/notifications/customer-template-resolver', () => ({
  resolveCustomerCopy: vi.fn(),
}))

vi.mock('@/lib/notifications/customer-message-log', () => ({
  logCustomerMessage: vi.fn(),
}))

import { sendCustomerMessage } from '@/lib/notifications/customer-send'
import { assertSendAllowed, type SendPermit } from '@/lib/notifications/customer-send-gate'
import { requireServiceClient } from '@/lib/supabase/service'
import { sendCustomerEmail } from '@/lib/email/customer-emails'
import { sendCustomerSms } from '@/lib/sms/client'
import { resolveCustomerCopy } from '@/lib/notifications/customer-template-resolver'
import { logCustomerMessage } from '@/lib/notifications/customer-message-log'

const mockRequireServiceClient = vi.mocked(requireServiceClient)
const mockSendCustomerEmail = vi.mocked(sendCustomerEmail)
const mockSendCustomerSms = vi.mocked(sendCustomerSms)
const mockResolveCustomerCopy = vi.mocked(resolveCustomerCopy)
const mockLogCustomerMessage = vi.mocked(logCustomerMessage)

type Row = Record<string, unknown> | null

/** Builds a `.select().eq().eq().maybeSingle()`-shaped mock for `clients`. */
function makeClientsQuery(data: Row, error: { message: string } | null = null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data, error })
  const eq2 = vi.fn().mockReturnValue({ maybeSingle })
  const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
  const select = vi.fn().mockReturnValue({ eq: eq1 })
  return { select, eq1, eq2, maybeSingle }
}

/** Builds a `.select().eq().maybeSingle()`-shaped mock for `companies`. */
function makeCompaniesQuery(data: Row, error: { message: string } | null = null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data, error })
  const eq = vi.fn().mockReturnValue({ maybeSingle })
  const select = vi.fn().mockReturnValue({ eq })
  return { select, eq, maybeSingle }
}

function buildServiceClient(clientRow: Row, companyRow: Row = CLEAR_COMPANY) {
  const clientsQuery = makeClientsQuery(clientRow)
  const companiesQuery = makeCompaniesQuery(companyRow)
  const from = vi.fn().mockImplementation((table: string) => {
    if (table === 'clients') return clientsQuery
    if (table === 'companies') return companiesQuery
    throw new Error(`unexpected table: ${table}`)
  })
  return { from } as unknown as ReturnType<typeof requireServiceClient>
}

/** Merged row: customer-send-gate.ts's consent/suppression/state/phone
 * columns PLUS customer-send.ts's own email/phone/name contact columns —
 * see file-header comment for why one row correctly serves both queries. */
const FULL_CLIENT = {
  sms_opted_out_at: null,
  sms_consent_status: 'granted',
  state: 'NY',
  phone: '+15551234567',
  email: 'client@example.com',
  name: 'Jane Client',
}
const CLEAR_COMPANY = { state: 'NY' }
const BUSINESS_NAME = "Joe's Plumbing"

/**
 * Obtains a REAL SendPermit via the unmocked assertSendAllowed(), driven
 * against a caller-supplied `clients`/`companies` mock. Fake timers must
 * already be set to noon EDT (within SMS quiet hours) before calling this.
 */
async function grantPermit(
  channel: 'sms' | 'email',
  companyId: string,
  clientId: string,
  clientRow: Row = FULL_CLIENT,
  companyRow: Row = CLEAR_COMPANY,
): Promise<SendPermit> {
  const svc = buildServiceClient(clientRow, companyRow)
  mockRequireServiceClient.mockReturnValue(svc)
  const result = await assertSendAllowed(companyId, clientId, channel)
  if (!result.allowed || !result.permit) {
    throw new Error(`test setup failed to obtain a permit: reason=${result.reason}`)
  }
  return result.permit
}

describe('lib/notifications/customer-send — sendCustomerMessage()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    // Noon EDT (NY, UTC-4 mid-summer) = 16:00 UTC — within SMS quiet hours,
    // so grantPermit()'s real assertSendAllowed() call succeeds for sms.
    vi.setSystemTime(new Date('2026-07-15T16:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('permit.clientId !== params.clientId -> permit_client_mismatch; no clients fetch, no dispatch, no log', async () => {
    const permit = await grantPermit('sms', 'company-1', 'client-1')
    vi.clearAllMocks()

    const result = await sendCustomerMessage({
      permit,
      companyId: 'company-1',
      clientId: 'client-DIFFERENT',
      businessName: BUSINESS_NAME,
      triggerSource: 'manual',
      freeform: { body: 'hi' },
    })

    expect(result).toEqual({ ok: false, channel: 'sms', error: 'permit_client_mismatch' })
    expect(mockRequireServiceClient).not.toHaveBeenCalled()
    expect(mockSendCustomerSms).not.toHaveBeenCalled()
    expect(mockSendCustomerEmail).not.toHaveBeenCalled()
    expect(mockLogCustomerMessage).not.toHaveBeenCalled()
  })

  it('neither template nor freeform provided -> no_content; no dispatch, no log', async () => {
    const permit = await grantPermit('sms', 'company-1', 'client-1')
    vi.clearAllMocks()

    const result = await sendCustomerMessage({
      permit,
      companyId: 'company-1',
      clientId: 'client-1',
      businessName: BUSINESS_NAME,
      triggerSource: 'manual',
    })

    expect(result).toEqual({ ok: false, channel: 'sms', error: 'no_content' })
    expect(mockSendCustomerSms).not.toHaveBeenCalled()
    expect(mockSendCustomerEmail).not.toHaveBeenCalled()
    expect(mockLogCustomerMessage).not.toHaveBeenCalled()
  })

  it('email channel, client has email: null -> no_recipient_email; sendCustomerEmail never called, no log', async () => {
    const permit = await grantPermit('email', 'company-1', 'client-1')
    vi.clearAllMocks()
    mockRequireServiceClient.mockReturnValue(buildServiceClient({ ...FULL_CLIENT, email: null }))

    const result = await sendCustomerMessage({
      permit,
      companyId: 'company-1',
      clientId: 'client-1',
      businessName: BUSINESS_NAME,
      triggerSource: 'manual',
      freeform: { body: 'hi' },
    })

    expect(result).toEqual({ ok: false, channel: 'email', error: 'no_recipient_email' })
    expect(mockSendCustomerEmail).not.toHaveBeenCalled()
    expect(mockLogCustomerMessage).not.toHaveBeenCalled()
  })

  it('sms channel, client has phone: null -> no_recipient_phone; sendCustomerSms never called, no log', async () => {
    const permit = await grantPermit('sms', 'company-1', 'client-1')
    vi.clearAllMocks()
    mockRequireServiceClient.mockReturnValue(buildServiceClient({ ...FULL_CLIENT, phone: null }))

    const result = await sendCustomerMessage({
      permit,
      companyId: 'company-1',
      clientId: 'client-1',
      businessName: BUSINESS_NAME,
      triggerSource: 'manual',
      freeform: { body: 'hi' },
    })

    expect(result).toEqual({ ok: false, channel: 'sms', error: 'no_recipient_phone' })
    expect(mockSendCustomerSms).not.toHaveBeenCalled()
    expect(mockLogCustomerMessage).not.toHaveBeenCalled()
  })

  it('template mode + sms -> resolveCustomerCopy called, sendCustomerSms called with the resolved body, logs isTemplate:true/templateEventType/status:sent on success', async () => {
    const permit = await grantPermit('sms', 'company-1', 'client-1')
    vi.clearAllMocks()
    mockRequireServiceClient.mockReturnValue(buildServiceClient(FULL_CLIENT))
    mockResolveCustomerCopy.mockResolvedValue({
      body: "Joe's Plumbing sent you an estimate. Review and approve it here: https://x.test/e/1",
    })
    mockSendCustomerSms.mockResolvedValue({ ok: true, sid: 'SM123' })

    const result = await sendCustomerMessage({
      permit,
      companyId: 'company-1',
      clientId: 'client-1',
      businessName: BUSINESS_NAME,
      triggerSource: 'manual',
      template: { eventType: 'estimate.sent', vars: { shareUrl: 'https://x.test/e/1' } },
    })

    expect(mockResolveCustomerCopy).toHaveBeenCalledWith(
      'estimate.sent',
      'sms',
      expect.objectContaining({
        businessName: BUSINESS_NAME,
        clientName: 'Jane Client',
        shareUrl: 'https://x.test/e/1',
      }),
    )
    expect(mockSendCustomerSms).toHaveBeenCalledWith(
      FULL_CLIENT.phone,
      "Joe's Plumbing sent you an estimate. Review and approve it here: https://x.test/e/1",
    )
    expect(mockLogCustomerMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        isTemplate: true,
        templateEventType: 'estimate.sent',
        status: 'sent',
        providerMessageId: 'SM123',
      }),
    )
    expect(result).toEqual({ ok: true, channel: 'sms', providerMessageId: 'SM123', error: undefined })
  })

  it("freeform mode + sms -> resolveCustomerCopy is NEVER called; sendCustomerSms called with businessName PREPENDED to the body (CUST-02: business name leads the body on BOTH template and freeform paths)", async () => {
    const permit = await grantPermit('sms', 'company-1', 'client-1')
    vi.clearAllMocks()
    mockRequireServiceClient.mockReturnValue(buildServiceClient(FULL_CLIENT))
    mockSendCustomerSms.mockResolvedValue({ ok: true, sid: 'SM456' })

    const result = await sendCustomerMessage({
      permit,
      companyId: 'company-1',
      clientId: 'client-1',
      businessName: BUSINESS_NAME,
      triggerSource: 'manual',
      freeform: { body: 'Your appointment is confirmed for 3pm tomorrow.' },
    })

    expect(mockResolveCustomerCopy).not.toHaveBeenCalled()
    const expectedBody = "Joe's Plumbing: Your appointment is confirmed for 3pm tomorrow."
    expect(mockSendCustomerSms).toHaveBeenCalledWith(FULL_CLIENT.phone, expectedBody)
    expect(mockLogCustomerMessage).toHaveBeenCalledWith(
      expect.objectContaining({ isTemplate: false, templateEventType: null, body: expectedBody }),
    )
    expect(result.ok).toBe(true)
  })

  it('freeform mode + email -> body is NOT prefixed with businessName (the friendly-from already carries the branding); sendCustomerEmail receives the exact freeform subject/body', async () => {
    const permit = await grantPermit('email', 'company-1', 'client-1')
    vi.clearAllMocks()
    mockRequireServiceClient.mockReturnValue(buildServiceClient(FULL_CLIENT))
    mockSendCustomerEmail.mockResolvedValue({ ok: true, id: 'email-1' })

    await sendCustomerMessage({
      permit,
      companyId: 'company-1',
      clientId: 'client-1',
      businessName: BUSINESS_NAME,
      triggerSource: 'manual',
      freeform: { subject: 'Quick update', body: 'Your project is on schedule.' },
    })

    expect(mockResolveCustomerCopy).not.toHaveBeenCalled()
    expect(mockSendCustomerEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        toEmail: FULL_CLIENT.email,
        businessName: BUSINESS_NAME,
        subject: 'Quick update',
        html: 'Your project is on schedule.',
        text: 'Your project is on schedule.',
      }),
    )
  })

  it('email dispatch failure -> logs status:failed with errorMessage, returns { ok:false, error } (does NOT throw)', async () => {
    const permit = await grantPermit('email', 'company-1', 'client-1')
    vi.clearAllMocks()
    mockRequireServiceClient.mockReturnValue(buildServiceClient(FULL_CLIENT))
    mockSendCustomerEmail.mockResolvedValue({ ok: false, error: 'resend_unconfigured' })

    const result = await sendCustomerMessage({
      permit,
      companyId: 'company-1',
      clientId: 'client-1',
      businessName: BUSINESS_NAME,
      triggerSource: 'manual',
      freeform: { body: 'hi' },
    })

    expect(mockLogCustomerMessage).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', errorMessage: 'resend_unconfigured' }),
    )
    expect(result).toEqual({ ok: false, channel: 'email', error: 'resend_unconfigured' })
  })

  it('email dispatch: text has no HTML tags even when the resolved body is HTML (stripHtmlTags fallback proof)', async () => {
    const permit = await grantPermit('email', 'company-1', 'client-1')
    vi.clearAllMocks()
    mockRequireServiceClient.mockReturnValue(buildServiceClient(FULL_CLIENT))
    mockResolveCustomerCopy.mockResolvedValue({
      subject: "Joe's Plumbing sent you an estimate",
      body: '<p>Hi Jane,</p><p>Joe\'s Plumbing sent you an estimate. Review and approve it here: https://x.test/e/1</p>',
    })
    mockSendCustomerEmail.mockResolvedValue({ ok: true, id: 'email-2' })

    await sendCustomerMessage({
      permit,
      companyId: 'company-1',
      clientId: 'client-1',
      businessName: BUSINESS_NAME,
      triggerSource: 'manual',
      template: { eventType: 'estimate.sent', vars: { shareUrl: 'https://x.test/e/1' } },
    })

    const call = mockSendCustomerEmail.mock.calls[0]![0]
    expect(call.text).not.toMatch(/</)
    expect(call.text.length).toBeGreaterThan(0)
  })

  it('unexpected thrown error (e.g. clients fetch throws) -> resolves { ok:false, error: unexpected_error }, never rejects', async () => {
    const permit = await grantPermit('sms', 'company-1', 'client-1')
    vi.clearAllMocks()
    mockRequireServiceClient.mockImplementation(() => {
      throw new Error('boom')
    })

    await expect(
      sendCustomerMessage({
        permit,
        companyId: 'company-1',
        clientId: 'client-1',
        businessName: BUSINESS_NAME,
        triggerSource: 'manual',
        freeform: { body: 'hi' },
      }),
    ).resolves.toEqual({ ok: false, channel: 'sms', error: 'unexpected_error' })
  })
})

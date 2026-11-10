import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))
// Phase 2b: cost recording is covered in tests/unit/billing/messaging-cost.test.ts.
vi.mock('@/lib/billing/messaging-cost', () => ({
  recordSmsSent: vi.fn().mockResolvedValue(undefined),
  recordEmailSent: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/platform-config', () => ({
  getIntegrationKey: vi.fn(),
}))

const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn().mockResolvedValue({ data: { id: 'email-id' }, error: null }),
}))
vi.mock('resend', () => ({
  Resend: function MockResend() {
    return { emails: { send: sendMock } }
  },
}))

import { customerEmailFrom } from '@/lib/email/sender'
import { sendCustomerEmail } from '@/lib/email/customer-emails'
import { getIntegrationKey } from '@/lib/platform-config'

describe('customerEmailFrom', () => {
  it('builds the honest "{{business}} via Xtimator" friendly-from exactly', () => {
    expect(customerEmailFrom("Joe's Plumbing")).toBe(
      "Joe's Plumbing via Xtimator <notifications@xtimator.com>"
    )
  })

  it('never returns a bare "Xtimator <...>" or a bare business-name-only from — always "via Xtimator"', () => {
    const result = customerEmailFrom('ACME Roofing')
    expect(result).toMatch(/ via Xtimator </)
    expect(result).not.toBe('Xtimator <notifications@xtimator.com>')
    expect(result).not.toBe('ACME Roofing <notifications@xtimator.com>')
  })
})

describe('sendCustomerEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getIntegrationKey).mockResolvedValue('re_test_key')
    sendMock.mockResolvedValue({ data: { id: 'email-id' }, error: null })
  })

  it('returns no_recipient when toEmail is empty, without calling Resend', async () => {
    const result = await sendCustomerEmail({
      toEmail: '',
      businessName: 'ACME',
      subject: 'Hi',
      html: '<p>Hi</p>',
      text: 'Hi',
    })
    expect(result).toEqual({ ok: false, error: 'no_recipient' })
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('returns resend_unconfigured when no Resend key is set, without calling Resend, and warns', async () => {
    vi.mocked(getIntegrationKey).mockResolvedValue(null)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await sendCustomerEmail({
      toEmail: 'client@example.com',
      businessName: 'ACME',
      subject: 'Hi',
      html: '<p>Hi</p>',
      text: 'Hi',
    })

    expect(result).toEqual({ ok: false, error: 'resend_unconfigured' })
    expect(sendMock).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('sends via Resend with the honest friendly-from and passes subject/html/text verbatim, returning ok:true with the id', async () => {
    const result = await sendCustomerEmail({
      toEmail: 'client@example.com',
      toName: 'Jane Client',
      businessName: "Joe's Plumbing",
      subject: 'Your estimate is ready',
      html: '<p>Body</p>',
      text: 'Body',
    })

    expect(sendMock).toHaveBeenCalledOnce()
    const call = sendMock.mock.calls[0]![0]
    expect(call.from).toBe(customerEmailFrom("Joe's Plumbing"))
    expect(call.to).toBe('client@example.com')
    expect(call.subject).toBe('Your estimate is ready')
    expect(call.html).toBe('<p>Body</p>')
    expect(call.text).toBe('Body')

    expect(result).toEqual({ ok: true, id: 'email-id' })
  })

  it('returns the Resend error message when Resend responds with an error', async () => {
    sendMock.mockResolvedValue({ data: null, error: { message: 'bad request' } })

    const result = await sendCustomerEmail({
      toEmail: 'client@example.com',
      businessName: 'ACME',
      subject: 'Hi',
      html: '<p>Hi</p>',
      text: 'Hi',
    })

    expect(result).toEqual({ ok: false, error: 'bad request' })
  })

  it('never throws when Resend rejects — returns send_failed and warns', async () => {
    sendMock.mockRejectedValue(new Error('network down'))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await sendCustomerEmail({
      toEmail: 'client@example.com',
      businessName: 'ACME',
      subject: 'Hi',
      html: '<p>Hi</p>',
      text: 'Hi',
    })

    expect(result).toEqual({ ok: false, error: 'send_failed' })
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})

describe('sendCustomerEmail per-message cost recording (Phase 2b)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getIntegrationKey).mockResolvedValue('re_test_key')
    sendMock.mockResolvedValue({ data: { id: 'email-id' }, error: null })
  })

  const base = { toEmail: 'client@example.com', businessName: 'ACME', subject: 'Hi', html: '<p>Hi</p>', text: 'Hi' }

  it('records the send with the Resend id and the caller attribution', async () => {
    const { recordEmailSent } = await import('@/lib/billing/messaging-cost')
    await sendCustomerEmail({ ...base, meta: { companyId: 'co-1', purpose: 'customer_message', billable: true } })
    expect(recordEmailSent).toHaveBeenCalledWith({
      id: 'email-id',
      meta: { companyId: 'co-1', purpose: 'customer_message', billable: true },
    })
  })

  it('records an unattributed send as unclassified and non-billable', async () => {
    const { recordEmailSent } = await import('@/lib/billing/messaging-cost')
    await sendCustomerEmail(base)
    expect(recordEmailSent).toHaveBeenCalledWith({
      id: 'email-id',
      meta: { companyId: null, purpose: 'unclassified', billable: false },
    })
  })

  it('records nothing when Resend rejects the send', async () => {
    const { recordEmailSent } = await import('@/lib/billing/messaging-cost')
    sendMock.mockResolvedValue({ data: null, error: { message: 'rejected' } })
    await sendCustomerEmail({ ...base, meta: { companyId: 'co-1', purpose: 'customer_message', billable: true } })
    expect(recordEmailSent).not.toHaveBeenCalled()
  })
})

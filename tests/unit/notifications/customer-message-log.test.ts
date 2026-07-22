import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Phase 177 Plan 02 (CUST-05): logCustomerMessage() best-effort audit writer
 * contract. Mirrors recordAICost (tests/unit/billing/record-ai-cost.test.ts) /
 * lib/admin/audit-log.ts's try/catch + console.warn-on-failure discipline:
 *   (a) maps every camelCase LogCustomerMessageParams field -> snake_case
 *       customer_messages row and calls .from('customer_messages').insert(...)
 *       via requireServiceClient()
 *   (b) status: 'sent' -> sent_at is a non-null ISO timestamp;
 *       status: 'failed' -> sent_at: null, error_message from params.errorMessage
 *   (c) omitted optional params map to null, never undefined
 *   (d) BEST-EFFORT (never-throw): requireServiceClient() throwing synchronously,
 *       or .insert() resolving with a Supabase `error`, both resolve (never
 *       throw) and console.warn is called
 */

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(),
}))

import { logCustomerMessage, type LogCustomerMessageParams } from '@/lib/notifications/customer-message-log'
import { requireServiceClient } from '@/lib/supabase/service'

const mockRequireServiceClient = vi.mocked(requireServiceClient)

const captured: { insertRow?: Record<string, unknown> } = {}

/**
 * Chainable supabase mock: `.from('customer_messages').insert(row)` captures
 * the row and resolves with { data: null, error } (error defaults to null).
 */
function makeServiceMock(opts: { error?: { message: string } | null } = {}) {
  const { error = null } = opts
  const insert = vi.fn().mockImplementation((row: Record<string, unknown>) => {
    captured.insertRow = row
    return Promise.resolve({ data: null, error })
  })
  const from = vi.fn().mockReturnValue({ insert })
  return { from } as unknown as ReturnType<typeof requireServiceClient>
}

const baseParams: LogCustomerMessageParams = {
  companyId: 'company-1',
  clientId: 'client-1',
  channel: 'email',
  recipientEmail: 'customer@example.com',
  recipientPhone: null,
  provider: 'resend',
  providerMessageId: 'msg-123',
  isTemplate: true,
  templateEventType: 'estimate_sent',
  triggerSource: 'manual',
  subject: 'Your estimate is ready',
  body: 'Hello, please find your estimate attached.',
  status: 'sent',
  errorMessage: null,
}

describe('CUST-05: logCustomerMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    captured.insertRow = undefined
  })

  it("status: 'sent' -> inserts a row with sent_at set to a non-null ISO timestamp", async () => {
    const svc = makeServiceMock()
    mockRequireServiceClient.mockReturnValue(svc)

    await logCustomerMessage(baseParams)

    const fromMock = vi.mocked((svc as unknown as { from: ReturnType<typeof vi.fn> }).from)
    expect(fromMock).toHaveBeenCalledWith('customer_messages')
    expect(captured.insertRow?.sent_at).not.toBeNull()
    expect(typeof captured.insertRow?.sent_at).toBe('string')
    expect(() => new Date(captured.insertRow!.sent_at as string).toISOString()).not.toThrow()
  })

  it("status: 'failed' -> inserts a row with sent_at: null and error_message from params.errorMessage", async () => {
    const svc = makeServiceMock()
    mockRequireServiceClient.mockReturnValue(svc)

    await logCustomerMessage({
      ...baseParams,
      status: 'failed',
      errorMessage: 'Twilio 21211: invalid phone number',
    })

    expect(captured.insertRow?.sent_at).toBeNull()
    expect(captured.insertRow?.error_message).toBe('Twilio 21211: invalid phone number')
  })

  it('maps every param to the correct snake_case column (exact insert payload)', async () => {
    const svc = makeServiceMock()
    mockRequireServiceClient.mockReturnValue(svc)

    await logCustomerMessage(baseParams)

    expect(captured.insertRow).toMatchObject({
      company_id: 'company-1',
      client_id: 'client-1',
      channel: 'email',
      recipient_email: 'customer@example.com',
      recipient_phone: null,
      provider: 'resend',
      provider_message_id: 'msg-123',
      is_template: true,
      template_event_type: 'estimate_sent',
      trigger_source: 'manual',
      subject: 'Your estimate is ready',
      body: 'Hello, please find your estimate attached.',
      status: 'sent',
      error_message: null,
    })
  })

  it('omitted optional params map to null, never undefined', async () => {
    const svc = makeServiceMock()
    mockRequireServiceClient.mockReturnValue(svc)

    await logCustomerMessage({
      companyId: null,
      clientId: null,
      channel: 'sms',
      recipientPhone: '+15551234567',
      provider: 'twilio',
      isTemplate: false,
      triggerSource: 'agentic-whatsapp',
      body: 'Your estimate is ready.',
      status: 'sent',
    })

    const row = captured.insertRow!
    for (const key of ['provider_message_id', 'template_event_type', 'subject', 'error_message', 'recipient_email']) {
      expect(row[key], `expected ${key} to be null`).toBeNull()
      expect(row[key], `expected ${key} to not be undefined`).not.toBeUndefined()
    }
  })

  it('requireServiceClient() throwing synchronously -> resolves (never throws), console.warn called', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockRequireServiceClient.mockImplementation(() => {
      throw new Error('missing env vars')
    })

    await expect(logCustomerMessage(baseParams)).resolves.toBeUndefined()
    expect(warnSpy).toHaveBeenCalled()

    warnSpy.mockRestore()
  })

  it('.insert() resolving with a Supabase error object -> resolves (never throws), console.warn called with the error message', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const svc = makeServiceMock({ error: { message: 'duplicate key value violates unique constraint' } })
    mockRequireServiceClient.mockReturnValue(svc)

    await expect(logCustomerMessage(baseParams)).resolves.toBeUndefined()
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[logCustomerMessage]'),
      expect.objectContaining({ message: 'duplicate key value violates unique constraint' })
    )

    warnSpy.mockRestore()
  })
})

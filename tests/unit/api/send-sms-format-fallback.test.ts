import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/estimates/[id]/send-sms/route'
import { createClient } from '@/lib/supabase/server'
import { requireServiceClient } from '@/lib/supabase/service'
import { sendCustomerSms } from '@/lib/sms/client'
import { sendCustomerEmail } from '@/lib/email/customer-emails'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/service', () => ({ requireServiceClient: vi.fn(), createServiceClient: () => null }))
vi.mock('@/lib/queries/active-company', () => ({ getActiveCompanyId: async () => 'qa-company' }))
vi.mock('@/lib/ratelimit', () => ({ rateLimit: async () => ({ allowed: true }) }))
vi.mock('@/lib/platform-config', () => ({
  getBranding: async () => ({ canonicalBaseUrl: 'https://example.invalid' }),
  getTwilioCustomerMessagingConfig: async () => ({ messagingServiceSid: 'MG-synthetic' }),
}))
vi.mock('@/lib/sms/client', () => ({ sendCustomerSms: vi.fn() }))
vi.mock('@/lib/email/customer-emails', () => ({ sendCustomerEmail: vi.fn() }))

const DESTINATION = '+12125550139'
const ESTIMATE_ID = 'qa-estimate'
const COMPANY_ID = 'qa-company'
const CLIENT_ID = 'qa-client'
const PROJECT_ID = 'qa-project'
const FORMATS = ['online_link', 'pdf', 'plain_text'] as const
const BODY = 'QA Contractor sent you an estimate. Review and approve it here: https://example.invalid/estimate/qa-contractor/estimate-aaaaaaaaaaaa'
const company = { id: COMPANY_ID, name: 'QA Contractor', slug: 'qa-contractor', state: 'NY', sms_delivery_enabled: true }
const client = {
  phone: DESTINATION, phone_normalized: '2125550139', name: 'QA Client', email: null,
  state: 'NY', sms_consent_status: 'granted', sms_opted_out_at: null,
}
const insertDelivery = vi.fn()
const updateEstimate = vi.fn()

function selectRow(data: Record<string, unknown>) {
  const finish = async () => ({ data, error: null })
  const query = { eq() { return this }, single: finish, maybeSingle: finish }
  return { select: () => query }
}

async function sendEstimate(format?: string) {
  const request = new Request(`https://example.invalid/api/estimates/${ESTIMATE_ID}/send-sms`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ to: DESTINATION, format }),
  })
  return POST(request, { params: Promise.resolve({ id: ESTIMATE_ID }) })
}

describe('SENDHUB-02: SMS format fallback', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-07-15T16:00:00Z'))
    vi.mocked(sendCustomerSms).mockResolvedValue({ ok: true, sid: 'SM-synthetic' })
    insertDelivery.mockResolvedValue({ error: null })
    updateEstimate.mockReturnValue({ eq: () => ({ is: async () => ({ error: null }) }) })

    vi.mocked(createClient).mockResolvedValue({
      auth: { getClaims: async () => ({ data: { claims: { sub: 'qa-owner' } } }) },
      from(table: string) {
        if (table === 'companies') return selectRow(company)
        if (table === 'projects') return selectRow({ client_id: CLIENT_ID })
        if (table === 'estimates') return {
          ...selectRow({
            id: ESTIMATE_ID, project_id: PROJECT_ID, company_id: COMPANY_ID,
            public_slug_token: 'aaaaaaaaaaaa', share_token: 'qa-long-token',
          }),
          update: updateEstimate,
        }
        throw new Error(`Unexpected session table: ${table}`)
      },
    } as never)
    vi.mocked(requireServiceClient).mockReturnValue({
      from(table: string) {
        if (table === 'clients') return selectRow(client)
        if (table === 'companies') return selectRow(company)
        if (table === 'estimate_deliveries') return { insert: insertDelivery }
        if (table === 'customer_messages' || table === 'estimate_activity') {
          return { insert: async () => ({ error: null }) }
        }
        throw new Error(`Unexpected service table: ${table}`)
      },
    } as never)
  })

  afterEach(() => vi.useRealTimers())

  it('rejects an unknown format before dispatch or delivery logging', async () => {
    const response = await sendEstimate('attachment')
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: "Invalid format (must be 'online_link', 'pdf', or 'plain_text')" })
    expect(sendCustomerSms).not.toHaveBeenCalled()
    expect(sendCustomerEmail).not.toHaveBeenCalled()
    expect(insertDelivery).not.toHaveBeenCalled()
  })

  it('dispatches the same exact link-only SMS for PDF, plain text and online link', async () => {
    for (const format of FORMATS) {
      const response = await sendEstimate(format)
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ success: true, sid: 'SM-synthetic' })
    }

    expect(vi.mocked(sendCustomerSms).mock.calls).toEqual(FORMATS.map(() => [
      DESTINATION, BODY, { companyId: COMPANY_ID, purpose: 'customer_message', billable: true },
    ]))
    expect(sendCustomerEmail).not.toHaveBeenCalled()
  })

  it('records requested formats and the omitted-format default on successful and failed dispatch', async () => {
    for (const format of [...FORMATS, undefined]) {
      expect((await sendEstimate(format)).status).toBe(200)
    }
    vi.mocked(sendCustomerSms).mockResolvedValueOnce({ ok: false, error: 'Synthetic provider refusal' })
    expect((await sendEstimate('pdf')).status).toBe(500)

    const deliveries = insertDelivery.mock.calls.map(([delivery]) => delivery)
    expect(deliveries).toHaveLength(5)
    expect(deliveries.map(({ format, status }) => ({ format, status }))).toEqual([
      ...FORMATS.map(format => ({ format, status: 'sent' })),
      { format: 'online_link', status: 'sent' },
      { format: 'pdf', status: 'failed' },
    ])
    for (const delivery of deliveries) expect(delivery).toMatchObject({
      estimate_id: ESTIMATE_ID, company_id: COMPANY_ID, channel: 'sms', recipient_phone: DESTINATION, provider: 'twilio',
    })
    expect(deliveries.at(-1)).toMatchObject({ error_message: 'Synthetic provider refusal' })
  })
})

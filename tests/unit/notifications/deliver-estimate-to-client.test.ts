import { describe, it, expect, vi, beforeEach } from 'vitest'

const assertSendAllowed = vi.fn()
const sendCustomerMessage = vi.fn()

vi.mock('@/lib/notifications/customer-send-gate', () => ({
  assertSendAllowed: (...a: unknown[]) => assertSendAllowed(...a),
}))
vi.mock('@/lib/notifications/customer-send', () => ({
  sendCustomerMessage: (...a: unknown[]) => sendCustomerMessage(...a),
}))

import {
  deliverEstimateToClient,
  describeChannels,
  describeFailure,
  getClientContacts,
  type ClientContacts,
} from '@/lib/notifications/deliver-estimate-to-client'

const PERMIT = { clientId: 'client-1', channel: 'email', grantedAt: 'now' }

function makeSvc(smsEnabled = true) {
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = []
  const updates: Array<{ table: string; row: Record<string, unknown> }> = []
  const chain = (table: string, row: Record<string, unknown>) => {
    updates.push({ table, row })
    const c: Record<string, unknown> = {}
    c.eq = vi.fn().mockReturnValue(c)
    c.is = vi.fn().mockReturnValue(c)
    c.then = (res: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(res)
    return c
  }
  const svc = {
    from: vi.fn((table: string) => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: { sms_delivery_enabled: smsEnabled }, error: null }),
        }),
      }),
      insert: vi.fn((row: Record<string, unknown>) => {
        inserts.push({ table, row })
        return Promise.resolve({ error: null })
      }),
      update: vi.fn((row: Record<string, unknown>) => chain(table, row)),
    })),
  }
  return { svc: svc as never, inserts, updates }
}

const BOTH: ClientContacts = {
  clientId: 'client-1',
  clientName: 'Johnson',
  email: 'j@example.com',
  phone: '+15559876543',
}

function params(svc: never, contacts: ClientContacts) {
  return {
    svc,
    companyId: 'co-1',
    estimateId: 'est-1',
    projectId: 'proj-1',
    businessName: 'Acme Builders',
    shareUrl: 'https://xtimator.com/estimate/tok',
    contacts,
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  assertSendAllowed.mockImplementation(async (_c: string, _cl: string, channel: string) => ({
    allowed: true,
    permit: { ...PERMIT, channel },
  }))
  sendCustomerMessage.mockImplementation(async ({ permit }: { permit: { channel: string } }) => ({
    ok: true,
    channel: permit.channel,
    providerMessageId: 'id-' + permit.channel,
  }))
})

describe('deliverEstimateToClient', () => {
  it('client with email and phone gets BOTH email and SMS through sendCustomerMessage', async () => {
    const { svc, inserts, updates } = makeSvc()
    const out = await deliverEstimateToClient(params(svc, BOTH))

    expect(out).toEqual({ status: 'sent', sent: ['email', 'sms'], failed: [] })
    const channels = sendCustomerMessage.mock.calls.map(([a]) => a.permit.channel)
    expect(channels).toEqual(['email', 'sms'])
    const first = sendCustomerMessage.mock.calls[0]![0]
    expect(first.businessName).toBe('Acme Builders')
    expect(first.template.eventType).toBe('estimate.sent')
    expect(first.template.vars.shareUrl).toBe('https://xtimator.com/estimate/tok')
    expect(first.triggerSource).toBe('agentic-whatsapp')

    // Delivery rows carry the format and the right recipient/provider.
    const deliveries = inserts.filter((i) => i.table === 'estimate_deliveries').map((i) => i.row)
    expect(deliveries).toHaveLength(2)
    expect(deliveries[0]).toMatchObject({
      channel: 'email',
      format: 'online_link',
      recipient_email: 'j@example.com',
      provider: 'resend',
      status: 'sent',
    })
    expect(deliveries[1]).toMatchObject({
      channel: 'sms',
      format: 'online_link',
      recipient_phone: '+15559876543',
      provider: 'twilio',
      status: 'sent',
    })

    // Same bookkeeping as the editor's Send: sent_at, share expiry, project status.
    expect(updates.some((u) => u.table === 'estimates' && 'sent_at' in u.row)).toBe(true)
    expect(updates.some((u) => u.table === 'estimates' && 'share_expires_at' in u.row)).toBe(true)
    expect(updates.some((u) => u.table === 'projects' && u.row.status === 'sent')).toBe(true)
  })

  it('email only: no SMS attempt', async () => {
    const { svc } = makeSvc()
    const out = await deliverEstimateToClient(params(svc, { ...BOTH, phone: null }))
    expect(out).toMatchObject({ status: 'sent', sent: ['email'] })
    expect(sendCustomerMessage).toHaveBeenCalledTimes(1)
  })

  it('phone only: SMS only', async () => {
    const { svc } = makeSvc()
    const out = await deliverEstimateToClient(params(svc, { ...BOTH, email: null }))
    expect(out).toMatchObject({ status: 'sent', sent: ['sms'] })
    expect(assertSendAllowed).toHaveBeenCalledWith('co-1', 'client-1', 'sms')
  })

  it('no email and no phone: nothing is sent or written', async () => {
    const { svc, inserts, updates } = makeSvc()
    const out = await deliverEstimateToClient(params(svc, { ...BOTH, email: null, phone: null }))
    expect(out).toEqual({ status: 'no_contact' })
    expect(sendCustomerMessage).not.toHaveBeenCalled()
    expect(inserts).toHaveLength(0)
    expect(updates).toHaveLength(0)
  })

  it('SMS blocked by the consent gate: email still goes, SMS is reported', async () => {
    assertSendAllowed.mockImplementation(async (_c: string, _cl: string, channel: string) =>
      channel === 'sms' ? { allowed: false, reason: 'no_consent' } : { allowed: true, permit: { ...PERMIT, channel } },
    )
    const { svc } = makeSvc()
    const out = await deliverEstimateToClient(params(svc, BOTH))
    expect(out).toMatchObject({ status: 'sent', sent: ['email'], failed: [{ channel: 'sms', reason: 'no_consent' }] })
    expect(sendCustomerMessage).toHaveBeenCalledTimes(1)
  })

  it('every channel fails: not_delivered and the estimate is NOT marked sent', async () => {
    sendCustomerMessage.mockResolvedValue({ ok: false, channel: 'email', error: 'resend_unconfigured' })
    const { svc, inserts, updates } = makeSvc()
    const out = await deliverEstimateToClient(params(svc, { ...BOTH, phone: null }))
    expect(out.status).toBe('not_delivered')
    expect(inserts.find((i) => i.table === 'estimate_deliveries')?.row).toMatchObject({
      status: 'failed',
      format: 'online_link',
    })
    expect(updates).toHaveLength(0)
  })

  it('SMS delivery disabled for the company: SMS skipped', async () => {
    const { svc } = makeSvc(false)
    const out = await deliverEstimateToClient(params(svc, BOTH))
    expect(out).toMatchObject({ status: 'sent', sent: ['email'], failed: [{ channel: 'sms', reason: 'sms_disabled' }] })
  })

  it('never uses a WhatsApp sender (the module does not import one)', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('lib/notifications/deliver-estimate-to-client.ts', 'utf8')
    expect(src).not.toMatch(/whatsapp\/client|sendWhatsApp/)
  })
})

describe('getClientContacts', () => {
  it('returns null without a client id and turns blank values into null', async () => {
    expect(await getClientContacts({} as never, 'co-1', null)).toBeNull()
    const svc = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { name: 'J', email: '  ', phone: '+1555' }, error: null }),
            }),
          }),
        }),
      }),
    }
    expect(await getClientContacts(svc as never, 'co-1', 'client-1')).toEqual({
      clientId: 'client-1',
      clientName: 'J',
      email: null,
      phone: '+1555',
    })
  })
})

describe('owner-facing wording', () => {
  it('names the channels and the failure reasons briefly', () => {
    expect(describeChannels(['email'])).toBe('email')
    expect(describeChannels(['email', 'sms'])).toBe('email and SMS')
    expect(describeFailure({ channel: 'sms', ok: false, reason: 'no_consent' })).toMatch(/agreed to SMS/)
    expect(describeFailure({ channel: 'email', ok: false, reason: 'suppressed' })).toMatch(/opted out/)
  })
})

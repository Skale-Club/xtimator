import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeFakeSupabase } from './fake-supabase'

const notify = vi.fn()
vi.mock('@/lib/notifications/dispatch', () => ({ notify: (...a: unknown[]) => notify(...a) }))
const getIntegrationKey = vi.fn()
vi.mock('@/lib/platform-config', () => ({
  getIntegrationKey: (...a: unknown[]) => getIntegrationKey(...a),
  getBranding: async () => ({ appName: 'Xtimator' }),
}))
vi.mock('@/lib/email/sender', () => ({ emailFrom: (n: string) => `${n} <no-reply@x.test>` }))
const send = vi.fn()
vi.mock('resend', () => ({ Resend: class { emails = { send: (...a: unknown[]) => send(...a) } } }))

let company: Record<string, unknown>
let fake: ReturnType<typeof makeFakeSupabase>
vi.mock('@/lib/supabase/service', () => ({ requireServiceClient: () => fake.client }))

import { notifyChangeOrderResponse, buildChangeOrderNotificationCopy } from '@/lib/change-orders/notify'

const CO = {
  id: 'co-1',
  number: 2,
  project_id: 'proj-1',
  company_id: 'comp-1',
  estimate_number: 'SK-1045',
  client_name: 'Bob',
}

beforeEach(() => {
  vi.clearAllMocks()
  getIntegrationKey.mockResolvedValue('re_key')
  company = { notify_on_accept: true, notify_on_decline: true, email: 'owner@example.com', name: 'Acme' }
  fake = makeFakeSupabase((c) => (c.table === 'companies' ? { data: company } : { data: { name: 'Kitchen' } }))
})

describe('notifyChangeOrderResponse', () => {
  it('builds English copy with the document number', () => {
    expect(buildChangeOrderNotificationCopy(CO, 'accepted')).toEqual({
      title: 'Change order approved',
      body: 'Bob approved SK-1045-CO2.',
    })
    expect(buildChangeOrderNotificationCopy({ number: 3, estimate_number: null, client_name: null }, 'declined')).toEqual({
      title: 'Change order declined',
      body: 'A client declined Change order #3.',
    })
  })

  it('sends the in-app notification and the email when the owner opted in', async () => {
    await notifyChangeOrderResponse(CO, 'accepted')
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'comp-1',
        eventType: 'estimate.accepted',
        resourceType: 'change_order',
        resourceId: 'co-1',
        linkUrl: '/projects/proj-1/change-orders/co-1',
      }),
    )
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'owner@example.com', subject: 'Change order approved - Kitchen' }),
    )
  })

  it('uses notify_on_decline for a decline and skips the email when the flag is off', async () => {
    company = { ...company, notify_on_decline: false }
    await notifyChangeOrderResponse(CO, 'declined')
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'estimate.declined' }))
    expect(send).not.toHaveBeenCalled()
  })

  it('skips the email without a Resend key and never throws when the send fails', async () => {
    getIntegrationKey.mockResolvedValue(null)
    await notifyChangeOrderResponse(CO, 'accepted')
    expect(send).not.toHaveBeenCalled()
    getIntegrationKey.mockResolvedValue('re_key')
    send.mockRejectedValue(new Error('down'))
    await expect(notifyChangeOrderResponse(CO, 'accepted')).resolves.toBeUndefined()
  })
})

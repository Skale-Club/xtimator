import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DROPPED_EVENT_TYPES } from '@/lib/notifications/event-types'

const neqMock = vi.fn()
const builder: Record<string, unknown> = {}

for (const method of ['from', 'select', 'eq', 'or', 'order', 'limit']) {
  builder[method] = vi.fn(() => builder)
}
builder.neq = (...args: unknown[]) => {
  neqMock(...args)
  return builder
}
builder.then = (
  resolve: (value: unknown) => unknown,
  reject: (reason: unknown) => unknown,
) => Promise.resolve({
  data: [{
    id: 'visible',
    company_id: 'co_1',
    user_id: 'user_1',
    event_type: 'estimate.viewed',
    title: 'Estimate viewed',
    body: 'A client viewed an estimate.',
    link_url: null,
    resource_type: 'estimate',
    resource_id: 'est_1',
    metadata: {},
    read_at: null,
    pinned: false,
    created_at: '2026-06-26T12:00:00.000Z',
    expires_at: null,
  }],
  error: null,
}).then(resolve, reject)

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => builder,
}))

import { listNotificationsPage } from '@/lib/notifications/queries'

describe('listNotificationsPage visibility', () => {
  beforeEach(() => {
    neqMock.mockClear()
  })

  it('excludes every dropped event type before pagination resolves', async () => {
    const result = await listNotificationsPage({
      companyId: 'co_1',
      userId: 'user_1',
      limit: 20,
    })

    expect(neqMock.mock.calls).toEqual(
      DROPPED_EVENT_TYPES.map((eventType) => ['event_type', eventType]),
    )
    expect(result.items.map((item) => item.id)).toEqual(['visible'])
  })
})

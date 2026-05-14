// Wave 0 stub — tests/unit/billing/portal.test.ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/billing/stripe-client', () => ({ getStripeClient: vi.fn() }))

describe('POST /api/billing/create-portal-session', () => {
  it('returns { url } for company with stripe_customer_id', async () => {
    expect.fail('Wave 0 stub — implement after route is built')
  })

  it('returns 400 when company has no stripe_customer_id', async () => {
    expect.fail('Wave 0 stub — implement after route is built')
  })

  it('returns 401 for unauthenticated requests', async () => {
    expect.fail('Wave 0 stub — implement after route is built')
  })
})

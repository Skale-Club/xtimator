// Wave 0 stub — tests/unit/billing/checkout.test.ts
// These tests will go GREEN when Plan 02 implements the webhook handler
// and Plan 01 route is verified via integration test.
// For unit coverage of the route itself, we verify the module shape here.
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/billing/stripe-client', () => ({ getStripeClient: vi.fn() }))

describe('POST /api/billing/create-checkout-session', () => {
  it('returns { url } for authenticated company with valid plan', async () => {
    expect.fail('Wave 0 stub — implement after route is built')
  })

  it('returns 401 for unauthenticated requests', async () => {
    expect.fail('Wave 0 stub — implement after route is built')
  })

  it('returns 400 when company is not found', async () => {
    expect.fail('Wave 0 stub — implement after route is built')
  })
})

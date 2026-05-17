import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

/**
 * Wave 0 tests for `/settings/payments` (Plan 70-02). The page is a server
 * component; we await its returned JSX, then render it with React Testing
 * Library to assert the visible state matrix:
 *   1. not-connected — "Connect Stripe Account" CTA button
 *   2. connected — "Connected as [display name]" + email + Disconnect button
 *   3. platform-not-configured — friendly support message (no CTA)
 */

vi.mock('@/lib/queries/auth', () => ({
  getAuthClaims: vi.fn(),
}))
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(),
}))
vi.mock('@/lib/platform-config', () => ({
  getIntegrationKey: vi.fn(),
}))
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))

const { getAuthClaims } = await import('@/lib/queries/auth')
const { requireServiceClient } = await import('@/lib/supabase/service')
const { getIntegrationKey } = await import('@/lib/platform-config')
const PaymentsPageMod = await import('@/app/(app)/settings/payments/page')
const PaymentsSettingsPage = PaymentsPageMod.default

function mockSupabase(company: Record<string, unknown> | null) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: company, error: null }),
    }),
  } as never
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getAuthClaims).mockResolvedValue({ sub: 'user_1' } as never)
})

describe('/settings/payments page', () => {
  it('renders the Connect CTA when company has no stripe_account_id', async () => {
    vi.mocked(getIntegrationKey).mockResolvedValue('ca_test_123')
    vi.mocked(requireServiceClient).mockReturnValue(
      mockSupabase({
        id: 'company_1',
        stripe_account_id: null,
        stripe_connect_status: null,
        stripe_account_email: null,
        stripe_account_display_name: null,
      })
    )

    const ui = await PaymentsSettingsPage({
      searchParams: Promise.resolve({}),
    })
    const { container } = render(ui)
    const html = container.innerHTML
    expect(html).toContain('Connect Stripe Account')
    expect(html).toContain('/api/stripe/connect/initiate')
    expect(html).not.toContain('Disconnect')
  })

  it('renders the connected state with display name and email', async () => {
    vi.mocked(getIntegrationKey).mockResolvedValue('ca_test_123')
    vi.mocked(requireServiceClient).mockReturnValue(
      mockSupabase({
        id: 'company_1',
        stripe_account_id: 'acct_abc',
        stripe_connect_status: 'active',
        stripe_account_email: 'owner@biz.com',
        stripe_account_display_name: 'Demo Biz LLC',
      })
    )

    const ui = await PaymentsSettingsPage({
      searchParams: Promise.resolve({}),
    })
    const { container } = render(ui)
    const html = container.innerHTML
    expect(html).toContain('Demo Biz LLC')
    expect(html).toContain('owner@biz.com')
    expect(html).toContain('Disconnect')
    expect(html).not.toContain('Connect Stripe Account')
  })

  it('renders the platform-not-configured message when client_id is unset', async () => {
    vi.mocked(getIntegrationKey).mockResolvedValue(null)
    vi.mocked(requireServiceClient).mockReturnValue(
      mockSupabase({
        id: 'company_1',
        stripe_account_id: null,
        stripe_connect_status: null,
        stripe_account_email: null,
        stripe_account_display_name: null,
      })
    )

    const ui = await PaymentsSettingsPage({
      searchParams: Promise.resolve({}),
    })
    const { container } = render(ui)
    const html = container.innerHTML
    expect(html).toContain('not yet enabled')
    expect(html).not.toContain('Connect Stripe Account')
    expect(html).not.toContain('Disconnect')
  })
})

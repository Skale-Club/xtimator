import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

/**
 * DISCLOSE-01 — the /settings/payments Connect card discloses the platform fee
 * at the connection moment, and the disclosed % is DRIVEN BY billing_config
 * (estimateFeePct × 100), never hard-coded. These tests mock getBillingConfig
 * and assert the rendered % tracks the config value, and that the disclosure is
 * scoped to the not_connected state (absent once connected).
 *
 * Mirrors the mock+render convention of payments-page.test.tsx (the server
 * component is awaited, then rendered with RTL; we assert on container.innerHTML).
 * t() returns the source English unchanged with no i18n provider, so asserting on
 * the rendered "2%" / "separate from Stripe" substring is valid.
 */

vi.mock('@/lib/queries/auth', () => ({ getAuthClaims: vi.fn() }))
// Fix 3: the page now resolves the ACTIVE company via getActiveCompanyId().
vi.mock('@/lib/queries/active-company', () => ({ getActiveCompanyId: vi.fn() }))
vi.mock('@/lib/supabase/service', () => ({ requireServiceClient: vi.fn() }))
vi.mock('@/lib/platform-config', () => ({ getIntegrationKey: vi.fn() }))
vi.mock('@/lib/billing/billing-config', () => ({ getBillingConfig: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))

const { getAuthClaims } = await import('@/lib/queries/auth')
const { getActiveCompanyId } = await import('@/lib/queries/active-company')
const { requireServiceClient } = await import('@/lib/supabase/service')
const { getIntegrationKey } = await import('@/lib/platform-config')
const { getBillingConfig } = await import('@/lib/billing/billing-config')
const PaymentsPageMod = await import('@/app/(app)/settings/integrations/stripe/page')
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

const NOT_CONNECTED = {
  id: 'company_1',
  stripe_account_id: null,
  stripe_connect_status: null,
  stripe_account_email: null,
  stripe_account_display_name: null,
}
const CONNECTED = {
  id: 'company_1',
  stripe_account_id: 'acct_abc',
  stripe_connect_status: 'active',
  stripe_account_email: 'owner@biz.com',
  stripe_account_display_name: 'Demo Biz LLC',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getAuthClaims).mockResolvedValue({ sub: 'user_1' } as never)
  vi.mocked(getActiveCompanyId).mockResolvedValue('company_1')
  vi.mocked(getIntegrationKey).mockResolvedValue('ca_test_123')
})

describe('DISCLOSE-01: fee disclosure at the Connect moment (config-driven %)', () => {
  it('renders the live config % (0.02 → "2%") in the not_connected disclosure', async () => {
    vi.mocked(getBillingConfig).mockResolvedValue({ estimateFeePct: 0.02 } as never)
    vi.mocked(requireServiceClient).mockReturnValue(mockSupabase(NOT_CONNECTED))

    const ui = await PaymentsSettingsPage({ searchParams: Promise.resolve({}) })
    const { container } = render(ui)
    const html = container.innerHTML

    // Proves the % is config-driven, not a hard-coded "1%": mock 0.02 → "2%".
    expect(html).toContain('2%')
    expect(html).toContain('separate from Stripe')
    expect(html).toContain('data-testid="fee-disclosure"')
  })

  it('renders the default config % (0.01 → "1%") via the same code path', async () => {
    vi.mocked(getBillingConfig).mockResolvedValue({ estimateFeePct: 0.01 } as never)
    vi.mocked(requireServiceClient).mockReturnValue(mockSupabase(NOT_CONNECTED))

    const ui = await PaymentsSettingsPage({ searchParams: Promise.resolve({}) })
    const { container } = render(ui)
    const html = container.innerHTML

    expect(html).toContain('1%')
    expect(html).toContain('data-testid="fee-disclosure"')
  })

  it('ALSO renders the fee disclosure once the company is connected (Fix 1: no longer connection-moment-only)', async () => {
    // Before Fix 1, a connected merchant never saw the fee again after the
    // initial connect — data-testid="fee-disclosure" only existed in the
    // not_connected branch. It must now render in the connected branch too.
    vi.mocked(getBillingConfig).mockResolvedValue({ estimateFeePct: 0.02 } as never)
    vi.mocked(requireServiceClient).mockReturnValue(mockSupabase(CONNECTED))

    const ui = await PaymentsSettingsPage({ searchParams: Promise.resolve({}) })
    const { container } = render(ui)
    const html = container.innerHTML

    expect(html).toContain('data-testid="fee-disclosure"')
    expect(html).toContain('2%')
    expect(html).toContain('Demo Biz LLC')
  })
})

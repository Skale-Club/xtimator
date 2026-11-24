import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

/**
 * /settings/client-actions (owner decision XTM-D-20261121-feature-switches).
 * The server page is awaited, then rendered with RTL; assertions use the
 * rendered HTML. A feature the platform does not allow must render nothing.
 */

vi.mock('@/lib/queries/auth', () => ({ getAuthClaims: vi.fn() }))
vi.mock('@/lib/queries/active-company', () => ({ getActiveCompanyId: vi.fn() }))
vi.mock('@/lib/supabase/service', () => ({ requireServiceClient: vi.fn() }))
vi.mock('@/lib/platform-config', () => ({ getIntegrationKey: vi.fn() }))
vi.mock('@/lib/billing/billing-config', () => ({
  getBillingConfig: vi.fn().mockResolvedValue({ estimateFeePct: 0.01 }),
}))
vi.mock('@/lib/features/platform-feature-state', () => ({
  getPlatformFeatureState: vi.fn(),
}))
vi.mock('@/lib/auth/require-company-role', () => ({ requireCompanyOwner: vi.fn() }))
vi.mock('@/lib/actions/client-actions', () => ({
  setDigitalSignatureEnabled: vi.fn(),
  setOnlinePaymentsEnabled: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
  useRouter: () => ({ refresh: vi.fn() }),
}))

const { getAuthClaims } = await import('@/lib/queries/auth')
const { getActiveCompanyId } = await import('@/lib/queries/active-company')
const { requireServiceClient } = await import('@/lib/supabase/service')
const { getIntegrationKey } = await import('@/lib/platform-config')
const { getPlatformFeatureState } = await import('@/lib/features/platform-feature-state')
const { requireCompanyOwner } = await import('@/lib/auth/require-company-role')
const { getBillingConfig } = await import('@/lib/billing/billing-config')
const Page = (await import('@/app/(app)/settings/client-actions/page')).default

let openInvoices = 0

function mockSupabase(company: Record<string, unknown> | null) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'invoices') {
        const q: Record<string, unknown> = {}
        q.select = vi.fn(() => q)
        q.eq = vi.fn(() => q)
        q.then = (resolve: (v: unknown) => void) => resolve({ count: openInvoices, error: null })
        return q
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: company, error: null }),
      }
    }),
  } as never
}

const BASE = {
  id: 'company_1',
  online_payments_allowed: true,
  online_payments_enabled: true,
  digital_signature_allowed: true,
  digital_signature_enabled: false,
  stripe_account_id: null,
  stripe_connect_status: null,
  stripe_charges_enabled: null,
  stripe_account_email: null,
  stripe_account_display_name: null,
}
const CONNECTED = {
  ...BASE,
  stripe_account_id: 'acct_test_123',
  stripe_connect_status: 'active',
  stripe_account_email: 'owner@biz.com',
  stripe_account_display_name: 'Demo Biz LLC',
}

async function html(company: Record<string, unknown>, sp: Record<string, string | undefined> = {}) {
  vi.mocked(requireServiceClient).mockReturnValue(mockSupabase(company))
  const ui = await Page({ searchParams: Promise.resolve(sp) })
  return render(ui).container.innerHTML
}

beforeEach(() => {
  vi.clearAllMocks()
  openInvoices = 0
  vi.mocked(getAuthClaims).mockResolvedValue({ sub: 'user_1' } as never)
  vi.mocked(getActiveCompanyId).mockResolvedValue('company_1')
  vi.mocked(getIntegrationKey).mockResolvedValue('ca_test123')
  vi.mocked(getPlatformFeatureState).mockResolvedValue({ connectPaymentsOpen: true })
  vi.mocked(requireCompanyOwner).mockResolvedValue({} as never)
  vi.mocked(getBillingConfig).mockResolvedValue({ estimateFeePct: 0.01 } as never)
})

describe('/settings/client-actions page', () => {
  it('shows the header, the always-on row and both switches when everything is allowed', async () => {
    const out = await html(BASE)
    expect(out).toContain('Client actions')
    expect(out).toContain('Choose what your client can do on the estimate link.')
    expect(out).toContain('View and download')
    expect(out).toContain('data-testid="client-action-signature"')
    expect(out).toContain('data-testid="client-action-payments"')
  })

  it('renders only the view row when the platform allows neither feature', async () => {
    const out = await html({
      ...BASE,
      online_payments_allowed: false,
      digital_signature_allowed: false,
    })
    expect(out).toContain('View and download')
    expect(out).not.toContain('client-action-signature')
    expect(out).not.toContain('client-action-payments')
    expect(out).not.toContain('Pay online')
    expect(out).not.toContain('Approve and sign')
    expect(out).not.toContain('Stripe payments')
  })

  it('hides the signature row when only the signature is not allowed', async () => {
    const out = await html({ ...BASE, digital_signature_allowed: false })
    expect(out).not.toContain('client-action-signature')
    expect(out).toContain('client-action-payments')
  })

  it('hides the payments section when the global stop is closed and nothing is linked', async () => {
    vi.mocked(getPlatformFeatureState).mockResolvedValue({ connectPaymentsOpen: false })
    const out = await html(BASE)
    expect(out).not.toContain('client-action-payments')
    expect(out).not.toContain('/api/stripe/connect/initiate')
  })

  it('shows the Connect CTA when payments are on and no account is linked', async () => {
    const out = await html(BASE)
    expect(out).toContain('Connect Stripe Account')
    expect(out).toContain('/api/stripe/connect/initiate')
    expect(out).not.toContain('Disconnect')
  })

  it('shows no Stripe card while the payments switch is off and nothing is linked', async () => {
    const out = await html({ ...BASE, online_payments_enabled: false })
    expect(out).toContain('client-action-payments')
    expect(out).not.toContain('Stripe payments')
  })

  it('shows not-enabled (no CTA) when the platform Connect client id is unset', async () => {
    vi.mocked(getIntegrationKey).mockResolvedValue(null)
    const out = await html(BASE)
    expect(out).toContain('not yet enabled')
    expect(out).not.toContain('Connect Stripe Account')
  })

  it('renders the connected account with Disconnect', async () => {
    const out = await html(CONNECTED)
    expect(out).toContain('Demo Biz LLC')
    expect(out).toContain('owner@biz.com')
    expect(out).toContain('Disconnect')
    expect(out).not.toContain('Connect Stripe Account')
  })

  it('renders the restricted state with the warning and reason', async () => {
    const out = await html({
      ...CONNECTED,
      stripe_connect_status: 'restricted',
      stripe_charges_enabled: false,
      stripe_connect_disabled_reason: 'requirements.past_due',
    })
    expect(out).toContain('data-testid="restricted-warning"')
    expect(out).toContain('requirements.past_due')
    expect(out).toContain('Disconnect')
  })

  it('platform no longer allows payments but an account is linked: no switch, note and Disconnect kept', async () => {
    const out = await html({ ...CONNECTED, online_payments_allowed: false })
    expect(out).not.toContain('client-action-payments')
    expect(out).toContain('Online payments are turned off for your account.')
    expect(out).toContain('Demo Biz LLC')
    expect(out).toContain('Disconnect')
  })

  it('non-owners see the state read-only: no Connect CTA, no Disconnect', async () => {
    vi.mocked(requireCompanyOwner).mockRejectedValue(new Error('forbidden'))
    const out = await html(CONNECTED)
    expect(out).toContain('Demo Biz LLC')
    expect(out).not.toContain('Disconnect')
    const notConnected = await html(BASE)
    expect(notConnected).not.toContain('/api/stripe/connect/initiate')
  })

  it('queries open invoices for the company and passes the count to the card (dialog closed until Disconnect is clicked)', async () => {
    openInvoices = 2
    const out = await html(CONNECTED)
    expect(out).toContain('Disconnect')
    expect(out).not.toContain('open invoice')
  })

  it('shows the success card for ?connected=1', async () => {
    const out = await html(CONNECTED, { connected: '1' })
    expect(out).toContain('Stripe account connected successfully.')
  })

  it('maps known error codes to friendly text and falls back for unknown codes', async () => {
    expect(await html(BASE, { error: 'payments_off' })).toContain('Turn on Pay online first')
    expect(await html(BASE, { error: 'owner_required' })).toContain('Only the company owner')
    expect(await html(BASE, { error: 'insufficient_scope' })).toContain('did not grant the access')
    expect(await html(BASE, { error: 'mode_mismatch' })).toContain('different mode')
    expect(await html(BASE, { error: 'account_in_use' })).toContain('already connected to another company')
    expect(await html(BASE, { error: 'save_failed' })).toContain('could not save the Stripe connection')
    expect(await html(BASE, { error: 'access_denied' })).toContain('Connection failed: access_denied')
  })

  it('redirects to /onboarding without an active company and to /?auth=login without a session', async () => {
    vi.mocked(getActiveCompanyId).mockResolvedValue(null)
    await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow('REDIRECT:/onboarding')
    vi.mocked(getAuthClaims).mockResolvedValue(null as never)
    await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow('REDIRECT:/?auth=login')
  })
})

describe('fee disclosure (config-driven %)', () => {
  it('renders the live config % and the refund line, not a hard-coded one', async () => {
    vi.mocked(getBillingConfig).mockResolvedValue({ estimateFeePct: 0.02 } as never)
    const out = await html(BASE)
    expect(out).toContain('data-testid="fee-disclosure"')
    expect(out).toContain('2%')
    expect(out).toContain('separate from Stripe')
    expect(out).toContain('If you refund a payment, the Xtimator fee is not returned.')
  })

  it('keeps the disclosure once connected', async () => {
    vi.mocked(getBillingConfig).mockResolvedValue({ estimateFeePct: 0.005 } as never)
    const out = await html(CONNECTED)
    expect(out).toContain('data-testid="fee-disclosure"')
    expect(out).toContain('0.50%')
  })
})

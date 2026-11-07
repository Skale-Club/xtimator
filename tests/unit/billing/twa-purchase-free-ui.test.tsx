import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (k: string) => k, language: 'en' }),
}))
const toastError = vi.fn()
vi.mock('sonner', () => ({ toast: { error: (...a: unknown[]) => toastError(...a) } }))

import { PaywallBanner } from '@/components/billing/paywall-banner'
import { CaptureBlocked } from '@/components/billing/capture-blocked'
import { CreditBalanceCard } from '@/components/billing/credit-balance-card'
import { UpgradeButtons } from '@/components/billing/upgrade-buttons'
import { TopUpButton } from '@/components/billing/top-up-button'
import { ManageSubscriptionButton } from '@/components/billing/manage-subscription-button'
import { TwaProvider } from '@/components/pwa/twa-provider'
import { showBillingBlockToast } from '@/lib/billing/block-toast'

const COPY = "You've used your available credits. Manage your plan on xtimator.com from a web browser."

const inTwa = (ui: React.ReactElement) => render(<TwaProvider isTwa>{ui}</TwaProvider>)

beforeEach(() => toastError.mockReset())

describe.each(['paywalled', 'out_of_credits'] as const)('PaywallBanner (%s) in the TWA', (state) => {
  it('shows neutral copy with no link, price or purchase CTA', () => {
    inTwa(<PaywallBanner state={state} priceLabel="$29" />)
    const banner = screen.getByTestId('paywall-banner')
    expect(banner.textContent).toBe(COPY)
    expect(banner.textContent).not.toMatch(/\$|Subscribe|Buy credits|Upgrade/)
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })
})

describe('CaptureBlocked in the TWA', () => {
  it('has no purchase CTA or price', () => {
    const { container } = inTwa(<CaptureBlocked state="paywalled" priceLabel="$29" />)
    expect(container.textContent).toContain(COPY)
    expect(container.textContent).not.toMatch(/\$29|Subscribe|Buy credits/)
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual(['/dashboard'])
  })
})

describe('CreditBalanceCard low-credit warning', () => {
  it('links to purchase on the web', () => {
    render(<CreditBalanceCard percentUsed={95} tier="pro" balance={5} />)
    expect(screen.getByText('Top up now')).toBeTruthy()
  })
  it('has no purchase link when hidePurchase is on', () => {
    render(<CreditBalanceCard percentUsed={95} tier="pro" balance={5} hidePurchase />)
    expect(screen.queryByText('Top up now')).toBeNull()
    expect(screen.queryByText('Subscribe to Pro')).toBeNull()
    expect(screen.getByTestId('credit-low-warning')).toBeTruthy()
  })
})

describe('purchase buttons render nothing in the TWA', () => {
  it('UpgradeButtons / TopUpButton / ManageSubscriptionButton', () => {
    const { container } = inTwa(
      <>
        <UpgradeButtons />
        <TopUpButton packIndex={0} />
        <ManageSubscriptionButton />
      </>,
    )
    expect(container.querySelectorAll('button')).toHaveLength(0)
  })
  it('render normally outside the TWA', () => {
    const { container } = render(
      <>
        <UpgradeButtons />
        <ManageSubscriptionButton />
      </>,
    )
    expect(container.querySelectorAll('button').length).toBeGreaterThan(0)
  })
})

describe('showBillingBlockToast in the TWA', () => {
  beforeEach(() => {
    document.cookie = 'xt_twa=1; Path=/'
  })
  afterEach(() => {
    document.cookie = 'xt_twa=; Max-Age=0; Path=/'
  })
  it('is action-less with the neutral note', () => {
    const router = { push: vi.fn() }
    expect(showBillingBlockToast('out_of_credits', router, (k) => k)).toBe(true)
    const [title, opts] = toastError.mock.calls[0] as [string, Record<string, unknown>]
    expect(title).toBe("You're out of credits")
    expect(opts.description).toBe(COPY)
    expect(opts.action).toBeUndefined()
  })
})

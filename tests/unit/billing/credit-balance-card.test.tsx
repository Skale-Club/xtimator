import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

/**
 * Phase 152 Plan 01 (CREDITUI-03 / CREDITUI-04) — CreditBalanceCard rewrite.
 *
 * The card now accepts ONLY `{ percentUsed, tier }` — the raw `balance` /
 * `lowBalanceThresholds` props are GONE (server computes percentUsed via
 * lib/billing/usage-percent.ts before this component ever sees a number).
 *
 * We mock <T> to a passthrough so copy assertions run on plain English text.
 *
 * Phase 153-01 (CREDITUI-06): the low-balance CTA is a plain "Top up now" link
 * to the always-visible TopUpPacksGrid section (`#topup-packs`), not a
 * duplicated inline TopUpButton — the card no longer imports TopUpButton.
 *
 * Cardinal rule under test (CREDITUI-04): the owner NEVER sees a raw credit
 * count or a dollar figure — no "$", no standalone multi-digit "N credits".
 */

vi.mock('@/components/i18n/t', () => ({
  T: ({ children, text }: { children?: string; text?: string }) => <>{text ?? children}</>,
}))
vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s }),
}))

const { CreditBalanceCard } = await import('@/components/billing/credit-balance-card')

describe('CreditBalanceCard (CREDITUI-03 / CREDITUI-04)', () => {
  it('Test 1: renders the UsageProgressBar with "{percentUsed}% used" text', () => {
    const { container } = render(<CreditBalanceCard percentUsed={42} tier="pro" />)
    expect(container.innerHTML).toContain('42% used')
  })

  it('Test 2: renders card title "Credit balance" and its description', () => {
    const { container } = render(<CreditBalanceCard percentUsed={10} tier="pro" />)
    const html = container.innerHTML
    expect(html).toContain('Credit balance')
    expect(html).toContain('Your credits by type, and when they expire.')
  })

  it('Test 3: healthy band (percentUsed=50, <70) renders no amber/red warning', () => {
    const { queryByTestId } = render(<CreditBalanceCard percentUsed={50} tier="pro" />)
    expect(queryByTestId('credit-low-warning')).toBeNull()
  })

  it('Test 4: warning band (percentUsed=75, 70-89) renders amber warning + CTAs', () => {
    const { container, getByTestId } = render(<CreditBalanceCard percentUsed={75} tier="pro" />)
    expect(getByTestId('credit-low-warning')).toBeTruthy()
    const html = container.innerHTML
    expect(html).toContain('You’re running low on credits for this cycle.')
    expect(html).toContain('#topup-packs')
    expect(html).not.toContain('?topup=1')
    expect(html).toContain('Top up now')
    expect(html).not.toContain('Upgrade plan')
  })

  it('Test 5: critical band (percentUsed=95, 90-100) renders red warning + CTAs', () => {
    const { container, getByTestId } = render(<CreditBalanceCard percentUsed={95} tier="pro" />)
    expect(getByTestId('credit-low-warning')).toBeTruthy()
    const html = container.innerHTML
    expect(html).toContain('You’re almost out of credits for this cycle.')
    expect(html).toContain('#topup-packs')
    expect(html).not.toContain('?topup=1')
    expect(html).toContain('Top up now')
    expect(html).not.toContain('Upgrade plan')
  })

  it('Test 5b: a non-eligible company (not a live Pro subscriber) is pointed at Subscribe, not at top-ups', () => {
    const { container } = render(
      <CreditBalanceCard percentUsed={95} tier="free" topupEligible={false} />
    )
    const html = container.innerHTML
    expect(html).toContain('Subscribe to Pro')
    expect(html).toContain('#choose-plan')
    expect(html).not.toContain('#topup-packs')
    expect(html).not.toContain('Top up now')
  })

  it('Test 6a: free tier caption says free credits never expire', () => {
    const { container } = render(<CreditBalanceCard percentUsed={10} tier="free" />)
    expect(container.innerHTML).toContain('Free credits never expire. Subscribe to Pro when they run out.')
  })

  it('Test 6b: paid tier caption says monthly credits expire at renewal', () => {
    const { container } = render(<CreditBalanceCard percentUsed={10} tier="pro" />)
    expect(container.innerHTML).toContain('Monthly credits expire when your billing cycle renews.')
  })

  describe('credits split by live lot (SEED-055 Phase E)', () => {
    const lots = [
      { source: 'monthly' as const, remaining: 1240, expiresAt: '2099-12-03T00:00:00Z' },
      { source: 'topup' as const, remaining: 1300, expiresAt: '2099-02-06T00:00:00Z' },
      { source: 'signup' as const, remaining: 380, expiresAt: null },
      { source: 'adjust' as const, remaining: 50, expiresAt: null },
    ]

    it('renders one row per lot with its label, amount and expiry', () => {
      const { getAllByTestId } = render(
        <CreditBalanceCard percentUsed={null} tier="pro" balance={2970} lots={lots} />
      )
      const rows = getAllByTestId('credit-lot-row')
      expect(rows).toHaveLength(4)
      expect(rows[0].textContent).toContain('Monthly credits')
      expect(rows[0].textContent).toContain('1,240')
      expect(rows[0].textContent).toContain('Dec 3, 2099')
      expect(rows[1].textContent).toContain('Purchased credits')
      expect(rows[1].textContent).toContain('1,300')
      expect(rows[1].textContent).toContain('Feb 6, 2099')
      expect(rows[2].textContent).toContain('Free credits')
      expect(rows[2].textContent).toContain('380')
      expect(rows[2].textContent).not.toContain('Expires')
      expect(rows[3].textContent).toContain('Adjustments')
      expect(rows[3].textContent).not.toContain('Expires')
    })

    it('renders no lot list when there are no live lots', () => {
      const { queryByTestId } = render(<CreditBalanceCard percentUsed={null} tier="free" balance={0} />)
      expect(queryByTestId('credit-lots')).toBeNull()
    })

    it('never converts credits into an estimate count', () => {
      const { container } = render(
        <CreditBalanceCard percentUsed={null} tier="pro" balance={2970} lots={lots} />
      )
      expect(container.innerHTML).not.toContain('≈')
      expect(container.innerHTML.toLowerCase()).not.toContain('estimates')
    })
  })

  it('Test 7 (CREDITUI-04 cardinal rule): never renders "$", a raw credit count, or markup/token', () => {
    const { container } = render(<CreditBalanceCard percentUsed={95} tier="pro" />)
    const html = container.innerHTML
    expect(html).not.toContain('$')
    expect(html).not.toMatch(/\d{2,}\s*credits?/i)
    expect(html.toLowerCase()).not.toContain('markup')
    expect(html.toLowerCase()).not.toContain('token')
  })

  // CREDITFIX-01 (audit finding #1): percentUsed is nullable — when nothing
  // has been granted this cycle a percentage has no valid denominator, so no
  // bar/band/warning renders; the raw balance is shown instead of a
  // misleading 0%/100% bar.
  describe('null percentUsed (nothing granted this cycle) — CREDITFIX-01', () => {
    it('Test 8: renders the balance instead of a "% used" bar', () => {
      const { container } = render(<CreditBalanceCard percentUsed={null} tier="pro" balance={2000} />)
      const html = container.innerHTML
      expect(html).toContain('2,000')
      expect(html).not.toContain('% used')
    })

    it('Test 9: renders no low-balance warning banner (no valid band to escalate)', () => {
      const { queryByTestId } = render(
        <CreditBalanceCard percentUsed={null} tier="pro" balance={2000} />
      )
      expect(queryByTestId('credit-low-warning')).toBeNull()
    })

    it('Test 10: defaults to 0 when balance is omitted', () => {
      const { container } = render(<CreditBalanceCard percentUsed={null} tier="pro" />)
      expect(container.innerHTML).toContain('0')
    })
  })
})

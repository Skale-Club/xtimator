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

  it('Test 2: renders card title "Usage" and description "Your usage this billing cycle."', () => {
    const { container } = render(<CreditBalanceCard percentUsed={10} tier="pro" />)
    const html = container.innerHTML
    expect(html).toContain('Usage')
    expect(html).toContain('Your usage this billing cycle.')
  })

  it('Test 3: healthy band (percentUsed=50, <70) renders no amber/red warning', () => {
    const { queryByTestId } = render(<CreditBalanceCard percentUsed={50} tier="pro" />)
    expect(queryByTestId('credit-low-warning')).toBeNull()
  })

  it('Test 4: warning band (percentUsed=75, 70-89) renders amber warning + CTAs', () => {
    const { container, getByTestId } = render(<CreditBalanceCard percentUsed={75} tier="pro" />)
    expect(getByTestId('credit-low-warning')).toBeTruthy()
    const html = container.innerHTML
    expect(html).toContain('You’re approaching your usage limit for this cycle.')
    expect(html).toContain('/settings/billing?topup=1#topup-packs')
    expect(html).toContain('Top up now')
    expect(html).toContain('Upgrade plan')
  })

  it('Test 5: critical band (percentUsed=95, 90-100) renders red warning + CTAs', () => {
    const { container, getByTestId } = render(<CreditBalanceCard percentUsed={95} tier="pro" />)
    expect(getByTestId('credit-low-warning')).toBeTruthy()
    const html = container.innerHTML
    expect(html).toContain(
      'You’ve nearly used up your usage for this cycle. Top up or upgrade to keep generating.'
    )
    expect(html).toContain('/settings/billing?topup=1#topup-packs')
    expect(html).toContain('Top up now')
    expect(html).toContain('Upgrade plan')
  })

  it('Test 6a: free tier reset caption', () => {
    const { container } = render(<CreditBalanceCard percentUsed={10} tier="free" />)
    expect(container.innerHTML).toContain('Usage resets when you upgrade to a paid plan.')
  })

  it('Test 6b: paid tier reset caption', () => {
    const { container } = render(<CreditBalanceCard percentUsed={10} tier="pro" />)
    expect(container.innerHTML).toContain('Usage resets at the start of your next billing cycle.')
  })

  it('Test 7 (CREDITUI-04 cardinal rule): never renders "$", a raw credit count, or markup/token', () => {
    const { container } = render(<CreditBalanceCard percentUsed={95} tier="pro" />)
    const html = container.innerHTML
    expect(html).not.toContain('$')
    expect(html).not.toMatch(/\d{2,}\s*credits?/i)
    expect(html.toLowerCase()).not.toContain('markup')
    expect(html.toLowerCase()).not.toContain('token')
  })
})

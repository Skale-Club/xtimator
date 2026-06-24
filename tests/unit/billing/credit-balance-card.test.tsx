import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

/**
 * Phase 115 Plan 02 — CreditBalanceCard (CREDITUI-01 / CREDITUI-02).
 *
 * The card is PURELY presentational (no DB) — props { balance, lowBalanceThresholds }.
 * We mock <T> to a passthrough so copy assertions run on plain English text, and
 * stub the top-up button (a separate client component) so the card renders
 * deterministically without its fetch logic. The plain top-up affordance is a
 * direct `<Link href="/settings/billing?topup=1">`, which is what we assert on.
 *
 * Cardinal rule under test: the owner NEVER sees token/cost math — no "$", no
 * "markup", no "token" anywhere in the render. Copy is INFORMATIONAL (enforcement
 * OFF) — never "blocked"/"denied"/"cannot".
 */

vi.mock('@/components/i18n/t', () => ({
  // Passthrough: render the string child (or `text` prop) verbatim.
  T: ({ children, text }: { children?: string; text?: string }) => <>{text ?? children}</>,
}))
vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s }),
}))
vi.mock('@/components/billing/top-up-button', () => ({
  TopUpButton: () => <button type="button">Top up credits</button>,
}))

const { CreditBalanceCard } = await import('@/components/billing/credit-balance-card')

describe('CreditBalanceCard (CREDITUI-01 / CREDITUI-02)', () => {
  it('Test 1 (CREDITUI-01 balance): shows the headline balance', () => {
    const { container } = render(
      <CreditBalanceCard balance={1240} lowBalanceThresholds={[200, 50]} />
    )
    const html = container.innerHTML
    // 1,240 (toLocaleString) or 1240 — either rendering of the balance is acceptable.
    expect(html.includes('1,240') || html.includes('1240')).toBe(true)
  })

  it('Test 2 (CREDITUI-01 guidance): static per-action range, no cost math', () => {
    const { container } = render(
      <CreditBalanceCard balance={1240} lowBalanceThresholds={[200, 50]} />
    )
    const html = container.innerHTML
    // "an estimate ≈ 10–15 credits" range.
    expect(html).toContain('10')
    expect(html).toContain('15')
    expect(html.toLowerCase()).toContain('credits')
    // Owner never sees cost math.
    expect(html).not.toContain('$')
    expect(html.toLowerCase()).not.toContain('markup')
    expect(html.toLowerCase()).not.toContain('token')
  })

  it('Test 3 (CREDITUI-02 low): warning + top-up CTA + upgrade CTA, no "blocked"', () => {
    const { container, getByTestId } = render(
      <CreditBalanceCard balance={40} lowBalanceThresholds={[200, 50]} />
    )
    const warning = getByTestId('credit-low-warning')
    expect(warning).toBeTruthy()
    const html = container.innerHTML
    // Top-up CTA links to the topup affordance, upgrade CTA links to billing.
    expect(html).toContain('/settings/billing?topup=1')
    expect(html).toContain('/settings/billing')
    // Informational copy only.
    const lower = html.toLowerCase()
    expect(lower).not.toContain('blocked')
    expect(lower).not.toContain('denied')
    expect(lower).not.toContain('cannot')
  })

  it('Test 4 (CREDITUI-02 healthy): no warning when balance is well above thresholds', () => {
    const { queryByTestId } = render(
      <CreditBalanceCard balance={5000} lowBalanceThresholds={[200, 50]} />
    )
    expect(queryByTestId('credit-low-warning')).toBeNull()
  })

  it('Test 5 (CREDITUI-02 zero): warning + top-up CTA present at zero balance', () => {
    const { container, getByTestId } = render(
      <CreditBalanceCard balance={0} lowBalanceThresholds={[200, 50]} />
    )
    expect(getByTestId('credit-low-warning')).toBeTruthy()
    expect(container.innerHTML).toContain('/settings/billing?topup=1')
  })
})

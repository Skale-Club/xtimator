import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

/**
 * Phase 156 Plan 01 (CREDITFIX-01) — TopUpPackCard regression guard.
 *
 * Repairs a confirmed v4.15 CREDITUI-04 violation: the card used to render
 * "≈ X credits" subtext beneath the dollar price. That subtext is gone — the
 * card must show ONLY the dollar amount, never a raw credit count.
 */

vi.mock('@/components/i18n/t', () => ({
  T: ({ children, text }: { children?: string; text?: string }) => <>{text ?? children}</>,
}))
vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s }),
}))

const { TopUpPackCard } = await import('@/components/billing/topup-pack-card')

describe('TopUpPackCard (CREDITFIX-01 / CREDITUI-04)', () => {
  it('Test A: renders "$20" and never a raw credit-count pattern or "≈"', () => {
    const { container } = render(
      <TopUpPackCard packIndex={0} priceCents={2000} credits={1300} />
    )
    const html = container.innerHTML
    expect(html).toContain('$20')
    expect(html).not.toMatch(/\d[\d,]*\s*credits?/i)
    expect(html).not.toContain('≈')
  })

  it('Test A2: a fractional-dollar pack renders two decimals via formatUsd ("$20.50")', () => {
    const { container } = render(
      <TopUpPackCard packIndex={0} priceCents={2050} credits={1300} />
    )
    expect(container.innerHTML).toContain('$20.50')
  })
})

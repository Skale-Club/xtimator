import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

/**
 * Phase 156 Plan 01 (CREDITFIX-01) — CreditHistoryList regression guard,
 * updated for CREDITFIX-06 (audit finding #2, current milestone).
 *
 * v4.15 (CREDITFIX-01) stripped the numeric delta down to a bare
 * TrendingUp/TrendingDown icon, on the theory that any number was "cost math"
 * the owner shouldn't see. That over-applied the rule: the CREDIT delta is
 * the tenant's own ledger entry, not the underlying real-cost/markup figure —
 * a tenant who just paid $100 for a top-up is entitled to see "+7,500", not
 * just an up-arrow. This suite now asserts the OPPOSITE of the old one: the
 * signed, formatted delta IS rendered, with tabular-nums so digits stay
 * column-aligned, while `real_cost_usd` / `markup` / `balance_after` (never
 * even selected by getCreditOverview's owner-safe projection) still never
 * appear.
 */

vi.mock('@/components/i18n/t', () => ({
  T: ({ children, text }: { children?: string; text?: string }) => <>{text ?? children}</>,
}))
vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s }),
}))

const { CreditHistoryList } = await import('@/components/billing/credit-history-list')

describe('CreditHistoryList (CREDITFIX-06)', () => {
  it('Test C: positive delta row renders label + date + "+7,500" + activity-positive testid', () => {
    const createdAt = '2026-01-01T00:00:00Z'
    const expectedDate = new Date(createdAt).toLocaleDateString('en-US', { dateStyle: 'medium' })
    const { container, getByTestId } = render(
      <CreditHistoryList
        rows={[
          {
            delta_credits: 7500,
            reason: 'topup',
            operation_type: null,
            created_at: createdAt,
          } as any,
        ]}
      />
    )
    const text = container.textContent ?? ''
    expect(text).toContain('Top-up')
    expect(text).toContain(expectedDate)
    expect(text).toContain('+7,500')
    expect(getByTestId('activity-positive')).toBeTruthy()
    expect(getByTestId('activity-delta').textContent).toBe('+7,500')
  })

  it('Test D: negative delta row renders "−12" (signed, thousands-separated) + activity-negative testid', () => {
    const createdAt = '2026-01-02T00:00:00Z'
    const { getByTestId } = render(
      <CreditHistoryList
        rows={[
          {
            delta_credits: -12,
            reason: 'adjust',
            operation_type: null,
            created_at: createdAt,
          } as any,
        ]}
      />
    )
    expect(getByTestId('activity-negative')).toBeTruthy()
    expect(getByTestId('activity-delta').textContent).toBe('−12')
  })

  it('Test E: empty rows still renders "No credit activity yet."', () => {
    const { container } = render(<CreditHistoryList rows={[]} />)
    expect(container.textContent).toContain('No credit activity yet.')
  })

  it('Test F: the delta amount uses tabular-nums for column alignment', () => {
    const { getByTestId } = render(
      <CreditHistoryList
        rows={[
          {
            delta_credits: -500,
            reason: 'debit',
            operation_type: 'estimate',
            created_at: '2026-01-03T00:00:00Z',
          } as any,
        ]}
      />
    )
    const el = getByTestId('activity-delta')
    expect(el.className).toContain('tabular-nums')
  })

  it('Test G (cardinal rule survives): never renders cost/markup terms', () => {
    const { container } = render(
      <CreditHistoryList
        rows={[
          {
            delta_credits: -9,
            reason: 'debit',
            operation_type: 'estimate',
            created_at: '2026-01-04T00:00:00Z',
          } as any,
        ]}
      />
    )
    const html = container.innerHTML.toLowerCase()
    expect(html).not.toContain('real_cost_usd')
    expect(html).not.toContain('markup')
    expect(html).not.toContain('balance_after')
    expect(html).not.toContain('$')
  })
})

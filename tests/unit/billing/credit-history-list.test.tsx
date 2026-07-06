import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

/**
 * Phase 156 Plan 01 (CREDITFIX-01) — CreditHistoryList regression guard.
 *
 * Repairs a confirmed v4.15 CREDITUI-04 violation: the "Recent activity" feed
 * used to render a signed numeric delta_credits per row. The feed is now
 * QUALITATIVE, not quantitative — a TrendingUp/TrendingDown icon replaces the
 * number. Row label + timestamp are unchanged.
 */

vi.mock('@/components/i18n/t', () => ({
  T: ({ children, text }: { children?: string; text?: string }) => <>{text ?? children}</>,
}))
vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s }),
}))

const { CreditHistoryList } = await import('@/components/billing/credit-history-list')

describe('CreditHistoryList (CREDITFIX-01 / CREDITUI-04)', () => {
  it('Test C: positive delta row renders label + date, no delta-derived digits, and activity-positive testid', () => {
    const createdAt = '2026-01-01T00:00:00Z'
    const expectedDate = new Date(createdAt).toLocaleDateString('en-US', { dateStyle: 'medium' })
    const { container, getByTestId } = render(
      <CreditHistoryList
        rows={[
          {
            delta_credits: 2000,
            reason: 'topup',
            operation_type: null,
            created_at: createdAt,
          } as any,
        ]}
      />
    )
    // Use textContent (not innerHTML) so SVG numeric attributes/path data
    // (e.g. width="24", path coordinates) don't produce false-positive digit
    // matches — only visible rendered text is under test here. The rendered
    // date legitimately contains digits (the day/year) — what must NEVER
    // appear is any digit sequence derived from delta_credits itself. We
    // assert this by removing the known-legitimate date substring first,
    // then requiring the remainder to be fully digit-free.
    const text = container.textContent ?? ''
    expect(text).toContain('Top-up')
    expect(text).toContain(expectedDate)
    expect(text).not.toContain('2000')
    expect(text).not.toContain('2,000')
    expect(text).not.toContain('+2000')
    const textWithoutDate = text.replace(expectedDate, '')
    expect(textWithoutDate).not.toMatch(/\d/)
    expect(getByTestId('activity-positive')).toBeTruthy()
  })

  it('Test D: negative delta row renders activity-negative testid and still no delta-derived digits', () => {
    const createdAt = '2026-01-02T00:00:00Z'
    const expectedDate = new Date(createdAt).toLocaleDateString('en-US', { dateStyle: 'medium' })
    const { container, getByTestId } = render(
      <CreditHistoryList
        rows={[
          {
            delta_credits: -500,
            reason: 'adjust',
            operation_type: null,
            created_at: createdAt,
          } as any,
        ]}
      />
    )
    const text = container.textContent ?? ''
    expect(text).not.toContain('500')
    expect(text).not.toContain('-500')
    const textWithoutDate = text.replace(expectedDate, '')
    expect(textWithoutDate).not.toMatch(/\d/)
    expect(getByTestId('activity-negative')).toBeTruthy()
  })

  it('Test E: empty rows still renders "No credit activity yet."', () => {
    const { container } = render(<CreditHistoryList rows={[]} />)
    expect(container.textContent).toContain('No credit activity yet.')
  })
})

import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('@/components/i18n/t', () => ({
  T: ({ children, text }: { children?: string; text?: string }) => <>{text ?? children}</>,
}))

const { CreditHistoryList } = await import('@/components/billing/credit-history-list')

describe('CreditHistoryList grouping', () => {
  it('folds a day of debits into one "Credits used" line with the day total', () => {
    const { container, getAllByTestId } = render(
      <CreditHistoryList
        rows={[
          { delta_credits: -460, reason: 'debit', operation_type: 'price_research', created_at: '2026-11-20T15:00:00Z' },
          { delta_credits: -7, reason: 'debit', operation_type: 'estimate', created_at: '2026-11-20T14:00:00Z' },
          { delta_credits: -1, reason: 'debit', operation_type: 'audio_minutes', created_at: '2026-11-20T13:00:00Z' },
          { delta_credits: -5, reason: 'debit', operation_type: 'estimate', created_at: '2026-11-19T13:00:00Z' },
          { delta_credits: 3000, reason: 'grant', operation_type: null, created_at: '2026-11-18T13:00:00Z' },
          { delta_credits: 10, reason: 'adjust', operation_type: null, created_at: '2026-11-17T13:00:00Z' },
        ]}
      />
    )
    const deltas = getAllByTestId('activity-delta').map((e) => e.textContent)
    expect(deltas).toEqual(['−468', '−5', '+3,000', '+10'])
    const text = container.textContent ?? ''
    expect(text.match(/Credits used/g)).toHaveLength(2)
    expect(text).toContain('Monthly credits')
    expect(text).toContain('Credit adjustment')
    expect(text).not.toMatch(/Price research|Audio|Estimate|Adjustments/)
  })
})

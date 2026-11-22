import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { EstimateStatusSummary } from '@/components/workspace/editor-frame/estimate-status-summary'

const base = {
  estimateId: 'est-1',
  createdAt: '2026-11-05T12:00:00.000Z',
  viewCount: 0,
  lastViewedAt: null as string | null,
  clientResponse: null as string | null,
  respondedAt: null as string | null,
  signedOnline: false,
  recordDisabled: false,
  onRecord: async () => {},
}

function step(key: string) {
  return screen.getByTestId('status-progress').querySelector(`[data-step="${key}"]`)!
}

describe('EstimateStatusSummary', () => {
  it('shows Created, Opened, Answered and the record hint before any open', () => {
    render(<EstimateStatusSummary {...base} />)
    expect(screen.getByRole('region', { name: 'Estimate status' })).toBeTruthy()
    for (const key of ['created', 'opened', 'answered']) expect(step(key)).toBeTruthy()
    expect(step('created').getAttribute('data-done')).toBe('true')
    expect(step('opened').getAttribute('data-done')).toBe('false')
    expect(screen.getByText('Got the answer by phone or in person? Record it here.')).toBeTruthy()
  })

  it('marks Opened done once the client opened it', () => {
    render(
      <EstimateStatusSummary {...base} viewCount={2} lastViewedAt={new Date(Date.now() - 3 * 3_600_000).toISOString()} />,
    )
    expect(step('opened').getAttribute('data-done')).toBe('true')
    expect(step('answered').getAttribute('data-done')).toBe('false')
  })

  it('shows the answer on the last step and hides the record hint when signed online', () => {
    render(
      <EstimateStatusSummary
        {...base}
        viewCount={4}
        lastViewedAt={new Date(Date.now() - 2 * 3_600_000).toISOString()}
        clientResponse="accepted"
        respondedAt="2026-11-16T15:00:00.000Z"
        signedOnline
      />,
    )
    expect(step('answered').getAttribute('data-done')).toBe('true')
    expect(step('answered').textContent).toContain('Accepted')
    expect(screen.queryByText('Got the answer by phone or in person? Record it here.')).toBeNull()
  })
})

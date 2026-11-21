import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { EstimateStatusSheet } from '@/components/workspace/editor-frame/estimate-status-sheet'

vi.mock('@/components/workspace/estimate/analytics/estimate-analytics-drawer', () => ({
  EstimateAnalyticsDrawer: ({ open }: { open: boolean }) => (open ? <div data-testid="own-drawer" /> : null),
}))

const base = {
  open: true,
  onOpenChange: () => {},
  estimateId: 'est-1',
  createdAt: '2026-11-05T12:00:00.000Z',
  sentAt: null as string | null,
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

describe('EstimateStatusSheet', () => {
  it('shows Created, Opened, Answered and the analytics entry before any open', () => {
    render(<EstimateStatusSheet {...base} />)
    expect(screen.getByRole('heading', { name: 'Estimate status' })).toBeTruthy()
    for (const key of ['created', 'opened', 'answered']) expect(step(key)).toBeTruthy()
    expect(screen.queryByText('Shared')).toBeNull()
    expect(step('created').getAttribute('data-done')).toBe('true')
    expect(step('opened').getAttribute('data-done')).toBe('false')
    expect(screen.getByRole('button', { name: 'Open analytics' })).toBeTruthy()
    expect(screen.queryByText(/Not shared yet/)).toBeNull()
  })

  it('marks Opened done once the client opened it', () => {
    render(
      <EstimateStatusSheet
        {...base}
        viewCount={2}
        lastViewedAt={new Date(Date.now() - 3 * 3_600_000).toISOString()}
      />,
    )
    expect(step('opened').getAttribute('data-done')).toBe('true')
    expect(step('answered').getAttribute('data-done')).toBe('false')
  })

  it('shows the answer on the last step and a compact engagement summary', () => {
    render(
      <EstimateStatusSheet
        {...base}
        sentAt="2026-11-06T09:00:00.000Z"
        viewCount={4}
        lastViewedAt={new Date(Date.now() - 2 * 3_600_000).toISOString()}
        clientResponse="accepted"
        respondedAt="2026-11-16T15:00:00.000Z"
        signedOnline
      />,
    )
    expect(step('answered').getAttribute('data-done')).toBe('true')
    expect(step('answered').textContent).toContain('Accepted')
    const eng = screen.getByTestId('status-engagement')
    expect(eng.textContent).toContain('Opens')
    expect(eng.textContent).toContain('4')
    expect(eng.textContent).toContain('2 h ago')
  })

  it('"Open analytics" calls the owner handler', () => {
    const onOpenAnalytics = vi.fn()
    render(
      <EstimateStatusSheet
        {...base}
        sentAt="2026-11-06T09:00:00.000Z"
        viewCount={1}
        lastViewedAt={new Date().toISOString()}
        onOpenAnalytics={onOpenAnalytics}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Open analytics' }))
    expect(onOpenAnalytics).toHaveBeenCalledTimes(1)
  })

  it('without an owner handler it closes itself and mounts its own drawer', () => {
    const onOpenChange = vi.fn()
    render(
      <EstimateStatusSheet
        {...base}
        onOpenChange={onOpenChange}
        sentAt="2026-11-06T09:00:00.000Z"
        viewCount={1}
        lastViewedAt={new Date().toISOString()}
      />,
    )
    expect(screen.queryByTestId('own-drawer')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Open analytics' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(screen.getByTestId('own-drawer')).toBeTruthy()
  })
})

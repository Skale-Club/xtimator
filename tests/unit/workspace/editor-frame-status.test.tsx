import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import {
  deriveEstimateStatus,
  EstimateStatusChip,
} from '@/components/workspace/editor-frame/estimate-status'

afterEach(cleanup)

describe('deriveEstimateStatus', () => {
  it('is unopened until the client opens it', () => {
    expect(deriveEstimateStatus({})).toBe('unopened')
    expect(deriveEstimateStatus({ sentAt: null, viewCount: 0, clientResponse: null })).toBe('unopened')
  })

  it('ignores sentAt: there is no draft or shared state', () => {
    expect(deriveEstimateStatus({ sentAt: '2026-11-16T09:00:00Z' })).toBe('unopened')
    expect(deriveEstimateStatus({ sentAt: '2026-11-16T09:00:00Z', viewCount: 1 })).toBe('viewed')
  })

  it('is viewed once the client opened it', () => {
    expect(deriveEstimateStatus({ viewCount: 2 })).toBe('viewed')
  })

  it('accepted and declined win over views', () => {
    expect(deriveEstimateStatus({ viewCount: 3, clientResponse: 'accepted' })).toBe('accepted')
    expect(deriveEstimateStatus({ clientResponse: 'declined' })).toBe('declined')
  })

  it('ignores unknown client responses', () => {
    expect(deriveEstimateStatus({ clientResponse: 'maybe' })).toBe('unopened')
  })
})

describe('EstimateStatusChip labels', () => {
  it('not opened yet', () => {
    render(<EstimateStatusChip />)
    expect(screen.getByText('Not opened yet')).toBeTruthy()
  })

  it('a send alone does not change the label', () => {
    render(<EstimateStatusChip sentAt="2026-11-16T09:00:00Z" viewCount={0} />)
    expect(screen.getByText('Not opened yet')).toBeTruthy()
  })

  it('viewed with a send shows only the views', () => {
    render(<EstimateStatusChip sentAt="2026-11-16T09:00:00Z" viewCount={3} />)
    expect(screen.getByText('Viewed 3×')).toBeTruthy()
  })

  it('viewed says how long ago the client last opened it', () => {
    render(<EstimateStatusChip viewCount={2} lastViewedAt={new Date(Date.now() - 2 * 3_600_000).toISOString()} />)
    expect(screen.getByText('Viewed 2× · 2 h ago')).toBeTruthy()
  })

  it('a clickable chip shows the analytics icon; a plain one does not', () => {
    const { rerender } = render(<EstimateStatusChip viewCount={1} onClick={() => {}} />)
    expect(screen.getByTestId('estimate-status-analytics-icon')).toBeTruthy()
    rerender(<EstimateStatusChip viewCount={1} />)
    expect(screen.queryByTestId('estimate-status-analytics-icon')).toBeNull()
  })

  it('viewed without sentAt', () => {
    render(<EstimateStatusChip sentAt={null} viewCount={2} />)
    expect(screen.getByText('Viewed 2×')).toBeTruthy()
  })

  it('accepted with a short date', () => {
    render(<EstimateStatusChip clientResponse="accepted" respondedAt="2026-11-16T15:00:00Z" />)
    const expected = new Date('2026-11-16T15:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    expect(screen.getByText(`Accepted · ${expected}`)).toBeTruthy()
  })

  it('accepted without a date omits the separator', () => {
    render(<EstimateStatusChip clientResponse="accepted" />)
    expect(screen.getByText('Accepted')).toBeTruthy()
  })

  it('declined with a short date', () => {
    render(<EstimateStatusChip clientResponse="declined" respondedAt="2026-11-16T15:00:00Z" />)
    expect(screen.getByText(/^Declined · /)).toBeTruthy()
  })

  it('is a button with an aria-label only when clickable', () => {
    const { rerender } = render(<EstimateStatusChip viewCount={2} />)
    expect(screen.queryByRole('button')).toBeNull()
    rerender(<EstimateStatusChip viewCount={2} onClick={() => {}} />)
    expect(screen.getByRole('button', { name: 'Estimate status: Viewed 2×' })).toBeTruthy()
  })
})

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import {
  deriveEstimateStatus,
  EstimateStatusChip,
} from '@/components/workspace/editor-frame/estimate-status'

afterEach(cleanup)

describe('deriveEstimateStatus', () => {
  it('is draft with nothing sent and no views', () => {
    expect(deriveEstimateStatus({})).toBe('draft')
    expect(deriveEstimateStatus({ sentAt: null, viewCount: 0, clientResponse: null })).toBe('draft')
  })

  it('is sent when sentAt is set', () => {
    expect(deriveEstimateStatus({ sentAt: '2026-11-16T09:00:00Z' })).toBe('sent')
  })

  it('is sent when only viewed (link copied, never marked sent)', () => {
    expect(deriveEstimateStatus({ sentAt: null, viewCount: 2 })).toBe('sent')
  })

  it('accepted and declined win over sent', () => {
    expect(deriveEstimateStatus({ sentAt: 'x', viewCount: 3, clientResponse: 'accepted' })).toBe('accepted')
    expect(deriveEstimateStatus({ sentAt: 'x', clientResponse: 'declined' })).toBe('declined')
  })

  it('ignores unknown client responses', () => {
    expect(deriveEstimateStatus({ clientResponse: 'maybe' })).toBe('draft')
  })
})

describe('EstimateStatusChip labels', () => {
  it('draft', () => {
    render(<EstimateStatusChip />)
    expect(screen.getByText('Draft')).toBeTruthy()
  })

  it('sent without views', () => {
    render(<EstimateStatusChip sentAt="2026-11-16T09:00:00Z" viewCount={0} />)
    expect(screen.getByText('Sent')).toBeTruthy()
  })

  it('sent with views', () => {
    render(<EstimateStatusChip sentAt="2026-11-16T09:00:00Z" viewCount={3} />)
    expect(screen.getByText('Sent · viewed 3×')).toBeTruthy()
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
    const { rerender } = render(<EstimateStatusChip sentAt="x" />)
    expect(screen.queryByRole('button')).toBeNull()
    rerender(<EstimateStatusChip sentAt="x" onClick={() => {}} />)
    expect(screen.getByRole('button', { name: 'Estimate status: Sent' })).toBeTruthy()
  })
})

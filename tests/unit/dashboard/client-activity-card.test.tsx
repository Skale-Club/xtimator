import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ClientActivityCard, clientActivityHref } from '@/components/dashboard/client-activity-card'
import { EstimateAnalyticsButton } from '@/components/projects/estimate-list-status'
import { toEstimateListStatus } from '@/lib/queries/estimate-list-status'
import type { ClientActivityRow } from '@/lib/queries/client-activity'

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))
vi.mock('@/components/workspace/estimate/analytics/estimate-analytics-drawer', () => ({
  EstimateAnalyticsDrawer: ({ open, estimateId }: { open: boolean; estimateId: string }) =>
    open ? <div data-testid="analytics-drawer">{estimateId}</div> : null,
}))
vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s }),
  useAppTranslation: () => ({ t: (s: string) => s }),
}))

function row(i: number, over: Partial<ClientActivityRow> = {}): ClientActivityRow {
  return {
    id: `ev:${i}`,
    kind: 'opened',
    at: new Date(Date.now() - i * 60_000 - 1000).toISOString(),
    estimateId: `e${i}`,
    projectId: `p${i}`,
    projectName: `Project ${i}`,
    clientName: `Client ${i}`,
    device: 'mobile',
    hot: false,
    count: 1,
    ...over,
  }
}

describe('ClientActivityCard', () => {
  it('shows the empty state', () => {
    render(<ClientActivityCard rows={[]} />)
    expect(screen.getByText('Client activity')).toBeTruthy()
    expect(screen.getByText("When a client opens an estimate, you'll see it here.")).toBeTruthy()
    expect(screen.queryByText('See all')).toBeNull()
  })

  it('renders rows with the analytics link, sentence, device and Hot marker', () => {
    render(<ClientActivityCard rows={[row(1, { hot: true }), row(2, { kind: 'accepted', device: null })]} />)
    const rows = screen.getAllByTestId('client-activity-row')
    expect(rows).toHaveLength(2)
    expect(rows[0].getAttribute('href')).toBe('/projects/p1?analytics=1')
    expect(rows[0].textContent).toContain('Client 1')
    expect(rows[0].textContent).toContain('opened')
    expect(rows[0].textContent).toContain('Project 1')
    expect(rows[0].textContent).toContain('phone')
    expect(rows[1].textContent).toContain('accepted')
    expect(screen.getAllByTestId('client-activity-hot')).toHaveLength(1)
    expect(clientActivityHref('abc')).toBe('/projects/abc?analytics=1')
  })

  it('falls back to "A client" without a client name', () => {
    render(<ClientActivityCard rows={[row(1, { clientName: null })]} />)
    expect(screen.getByTestId('client-activity-row').textContent).toContain('A client')
  })

  it('caps the inline list at 8 and opens the full list in a sheet', () => {
    render(<ClientActivityCard rows={Array.from({ length: 12 }, (_, i) => row(i + 1))} />)
    expect(screen.getAllByTestId('client-activity-row')).toHaveLength(8)
    fireEvent.click(screen.getByText('See all'))
    expect(screen.getByTestId('client-activity-sheet')).toBeTruthy()
    // 8 inline + 12 in the sheet
    expect(screen.getAllByTestId('client-activity-row')).toHaveLength(20)
  })
})

describe('EstimateAnalyticsButton', () => {
  const NOW = new Date()
  const base = { id: 'est-1', sent_at: null, view_count: 0, last_viewed_at: null, client_response: null, responded_at: null }
  const signals = (over = {}) => ({ uniqueVisitors: 1, distinctVisitDays: 1, signStarts: 0, pdfDownloads: 0, prints: 0, ...over })
  const button = () => screen.getByTestId('estimate-analytics-button')

  it('is grey with no badge before the client opens it, with or without a send', () => {
    const { rerender } = render(<EstimateAnalyticsButton status={toEstimateListStatus(base, NOW)} />)
    expect(button().getAttribute('data-state')).toBe('unopened')
    expect(button().getAttribute('aria-label')).toBe('Estimate analytics: Not opened yet')
    expect(screen.queryByTestId('estimate-analytics-count')).toBeNull()
    rerender(<EstimateAnalyticsButton status={toEstimateListStatus({ ...base, sent_at: NOW.toISOString() }, NOW)} />)
    expect(button().getAttribute('data-state')).toBe('unopened')
  })

  it('counts opens and says when, without Hot after one open', () => {
    const last = new Date(NOW.getTime() - 2 * 3_600_000).toISOString()
    render(<EstimateAnalyticsButton status={toEstimateListStatus({ ...base, view_count: 1, last_viewed_at: last }, NOW)} />)
    expect(screen.getByTestId('estimate-analytics-count').textContent).toBe('1')
    expect(button().getAttribute('title')).toBe('Viewed 1× · 2h ago')
    expect(screen.queryByTestId('glyph-hot')).toBeNull()
  })

  it('shows the flame and the Hot reasons in the tooltip', () => {
    const last = new Date(NOW.getTime() - 3_600_000).toISOString()
    render(
      <EstimateAnalyticsButton
        status={toEstimateListStatus({ ...base, view_count: 4, last_viewed_at: last }, NOW, signals({ uniqueVisitors: 2 }))}
      />,
    )
    expect(screen.getByTestId('glyph-hot')).toBeTruthy()
    expect(button().getAttribute('title')).toContain('Hot: ')
    expect(button().getAttribute('title')).toContain('Opened many times')
  })

  it('flags signing over Hot', () => {
    const last = new Date(NOW.getTime() - 3_600_000).toISOString()
    render(
      <EstimateAnalyticsButton
        status={toEstimateListStatus({ ...base, view_count: 2, last_viewed_at: last }, NOW, signals({ signStarts: 1 }))}
      />,
    )
    expect(screen.getByTestId('glyph-signing')).toBeTruthy()
    expect(screen.queryByTestId('glyph-hot')).toBeNull()
    expect(button().getAttribute('title')).toContain('Started signing')
  })

  it('shows the answer as a check or a cross, without the count', () => {
    const { rerender } = render(
      <EstimateAnalyticsButton
        status={toEstimateListStatus({ ...base, view_count: 6, last_viewed_at: NOW.toISOString(), client_response: 'accepted', responded_at: '2026-11-06T15:00:00Z' }, NOW)}
      />,
    )
    expect(screen.getByTestId('glyph-accepted')).toBeTruthy()
    expect(screen.queryByTestId('estimate-analytics-count')).toBeNull()
    expect(button().getAttribute('title')).toContain('Accepted · Nov 6')
    rerender(<EstimateAnalyticsButton status={toEstimateListStatus({ ...base, client_response: 'declined' }, NOW)} />)
    expect(screen.getByTestId('glyph-declined')).toBeTruthy()
  })

  it('opens the analytics drawer for that estimate', () => {
    render(<EstimateAnalyticsButton status={toEstimateListStatus({ ...base, view_count: 2, last_viewed_at: NOW.toISOString() }, NOW)} />)
    expect(screen.queryByTestId('analytics-drawer')).toBeNull()
    fireEvent.click(button())
    expect(screen.getByTestId('analytics-drawer').textContent).toBe('est-1')
  })

  it('keeps an empty slot without a status or estimate', () => {
    render(<EstimateAnalyticsButton status={null} />)
    expect(screen.queryByTestId('estimate-analytics-button')).toBeNull()
  })
})

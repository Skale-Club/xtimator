import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ClientActivityCard, clientActivityHref } from '@/components/dashboard/client-activity-card'
import { EstimateListStatusPill } from '@/components/projects/estimate-list-status'
import { toEstimateListStatus } from '@/lib/queries/estimate-list-status'
import type { ClientActivityRow } from '@/lib/queries/client-activity'

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>{children}</a>
  ),
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

describe('EstimateListStatusPill', () => {
  const NOW = new Date()
  const base = { sent_at: null, view_count: 0, last_viewed_at: null, client_response: null, responded_at: null }

  it('renders Not opened yet, with or without a send', () => {
    const { rerender } = render(<EstimateListStatusPill status={toEstimateListStatus(base, NOW)} />)
    expect(screen.getByTestId('estimate-list-status').textContent).toBe('Not opened yet')
    rerender(<EstimateListStatusPill status={toEstimateListStatus({ ...base, sent_at: NOW.toISOString() }, NOW)} />)
    expect(screen.getByTestId('estimate-list-status').textContent).toBe('Not opened yet')
  })

  it('renders Viewed N× with relative time, no Hot when only opened once', () => {
    const last = new Date(NOW.getTime() - 2 * 3_600_000).toISOString()
    render(<EstimateListStatusPill status={toEstimateListStatus({ ...base, view_count: 1, last_viewed_at: last }, NOW)} />)
    expect(screen.getByTestId('estimate-list-status').textContent).toContain('Viewed 1× · 2h ago')
    expect(screen.queryByTestId('estimate-hot')).toBeNull()
  })

  it('shows the Hot flame with the reasons in its title', () => {
    const last = new Date(NOW.getTime() - 3_600_000).toISOString()
    render(<EstimateListStatusPill status={toEstimateListStatus({ ...base, sent_at: last, view_count: 4, last_viewed_at: last }, NOW, { uniqueVisitors: 2, distinctVisitDays: 1, signStarts: 0, pdfDownloads: 0, prints: 0 })} />)
    const hot = screen.getByTestId('estimate-hot')
    expect(hot.getAttribute('title')).toContain('Hot')
    expect(hot.getAttribute('title')).toContain('Opened many times')
  })

  it('renders Accepted with the answer date and no Hot', () => {
    render(
      <EstimateListStatusPill
        status={toEstimateListStatus({ ...base, view_count: 6, last_viewed_at: NOW.toISOString(), client_response: 'accepted', responded_at: '2026-11-06T15:00:00Z' }, NOW)}
      />,
    )
    expect(screen.getByTestId('estimate-list-status').textContent).toContain('Accepted · Nov 6')
    expect(screen.queryByTestId('estimate-hot')).toBeNull()
  })

  it('renders nothing without a status', () => {
    const { container } = render(<EstimateListStatusPill status={null} />)
    expect(container.firstChild).toBeNull()
  })
})

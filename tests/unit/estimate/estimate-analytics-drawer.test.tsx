import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import React from 'react'
import { EstimateAnalyticsDrawer } from '@/components/workspace/estimate/analytics/estimate-analytics-drawer'
import { buildEstimateAnalytics, type AnalyticsEventRow } from '@/lib/estimate/analytics/build'
import type { EngagementEventType } from '@/lib/estimate/analytics/contracts'

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))

const mockAnalytics = vi.fn()
const mockContext = vi.fn()
const mockLabels = vi.fn()

vi.mock('@/lib/queries/engagement', () => ({
  getEstimateAnalytics: (...a: unknown[]) => mockAnalytics(...a),
  getEstimateAnalyticsContext: (...a: unknown[]) => mockContext(...a),
  getEstimateItemLabels: (...a: unknown[]) => mockLabels(...a),
  // The heatmap (closed here) imports these.
  aggregateDwellByDevice: () => ({ sectionDwell: {}, itemDwell: {} }),
  getEstimateClickPoints: async () => [],
  getEstimateDocumentForHeatmap: async () => null,
  getEstimateDwellRows: async () => [],
}))

const HOUR = 3_600_000
const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString()

function ev(
  session: string,
  type: EngagementEventType,
  msAgo: number,
  extra: Partial<AnalyticsEventRow> = {},
): AnalyticsEventRow {
  return {
    visitor_id: 'v1',
    session_id: session,
    event_type: type,
    target: null,
    device: null,
    metadata: null,
    created_at: iso(msAgo),
    ...extra,
  }
}

function richAnalytics() {
  const events: AnalyticsEventRow[] = [
    ev('s1', 'view', 5 * 24 * HOUR, { device: 'mobile' }),
    ev('s1', 'heartbeat', 5 * 24 * HOUR - 1000, { metadata: { seconds: 180 } }),
    ev('s1', 'scroll_depth', 5 * 24 * HOUR - 2000, { metadata: { pct: 100 } }),
    ev('s1', 'section_view', 5 * 24 * HOUR - 3000, { target: 'totals', metadata: { dwell_seconds: 75 } }),
    ev('s1', 'section_view', 5 * 24 * HOUR - 3500, { target: 'item:i1', metadata: { dwell_seconds: 40 } }),
    ev('s1', 'pdf_download', 5 * 24 * HOUR - 9000),
    ev('s2', 'view', 2 * HOUR, { device: 'desktop', visitor_id: 'v2' }),
    ev('s2', 'heartbeat', 2 * HOUR - 1000, { visitor_id: 'v2', metadata: { seconds: 60 } }),
    ev('s2', 'scroll_depth', 2 * HOUR - 2000, { visitor_id: 'v2', metadata: { pct: 60 } }),
    ev('s3', 'view', HOUR, { visitor_id: 'v2', device: 'desktop' }),
  ]
  return buildEstimateAnalytics({
    events,
    activity: [
      {
        event_type: 'estimate_sent',
        created_at: iso(6 * 24 * HOUR),
        metadata: { channel: 'email', to: 'sophia@example.com' },
      },
    ],
    estimate: {
      created_at: iso(7 * 24 * HOUR),
      sent_at: iso(6 * 24 * HOUR),
      client_response: null,
      responded_at: null,
    },
  })
}

function renderDrawer() {
  return render(<EstimateAnalyticsDrawer open onOpenChange={() => {}} estimateId="est-1" />)
}

const CONTEXT = {
  estimateNumber: '1042',
  clientName: 'Ava Thompson',
  clientPhone: '(555) 010-2020',
  clientEmail: 'ava@example.com',
  projectName: 'Kitchen remodel',
  total: 12500,
  currency: 'USD',
}

beforeEach(() => {
  mockAnalytics.mockReset()
  mockContext.mockReset().mockResolvedValue(CONTEXT)
  mockLabels.mockReset().mockResolvedValue({ i1: 'Interior wall paint' })
})

describe('EstimateAnalyticsDrawer', () => {
  it('shows a skeleton while loading, then the verdict, KPIs, charts and timeline', async () => {
    let resolve!: (v: unknown) => void
    mockAnalytics.mockReturnValue(new Promise((r) => (resolve = r)))
    renderDrawer()
    expect(screen.getByTestId('analytics-skeleton')).toBeTruthy()

    resolve(richAnalytics())
    await waitFor(() => expect(screen.queryByTestId('analytics-skeleton')).toBeNull())

    // header: client name, then project · number · total
    await waitFor(() => expect(screen.getByText('Ava Thompson')).toBeTruthy())
    expect(screen.getByText('Kitchen remodel · #1042 · $12,500.00')).toBeTruthy()

    const verdict = screen.getByTestId('analytics-summary')
    expect(within(verdict).getByText('Hot, a good moment to follow up')).toBeTruthy()
    expect(within(verdict).getByTestId('interest-meter')).toBeTruthy()
    expect(within(verdict).getByText('Downloaded or printed it')).toBeTruthy()

    const kpis = screen.getAllByTestId('analytics-kpi')
    expect(kpis).toHaveLength(4)
    expect(within(kpis[0]).getByText('Opens')).toBeTruthy()
    expect(within(kpis[0]).getByText('3')).toBeTruthy()
    expect(within(kpis[0]).getByText('by 2 people')).toBeTruthy()
    expect(within(kpis[1]).getByText('Reading time')).toBeTruthy()
    expect(within(kpis[1]).getByText('4m 00s')).toBeTruthy()
    expect(within(kpis[2]).getByText('Read to the end')).toBeTruthy()
    expect(within(kpis[2]).getByText('1/3')).toBeTruthy()
    expect(within(kpis[3]).getByText('Last opened')).toBeTruthy()
    expect(within(kpis[3]).getByText('1 h ago')).toBeTruthy()

    // timeline
    expect(screen.getByText('What happened')).toBeTruthy()
    expect(screen.getByText('Sent by email to sophia@example.com')).toBeTruthy()
    expect(screen.getByText('Downloaded the PDF')).toBeTruthy()
    expect(screen.getByText('First open')).toBeTruthy()
    expect(screen.getByText('Visitor B read it')).toBeTruthy()
    expect(screen.getByText('On phone')).toBeTruthy()
    expect(screen.getByText('Read 100%')).toBeTruthy()
    expect(screen.getByText('Most time on Totals')).toBeTruthy()
    expect(screen.getByText('Estimate created')).toBeTruthy()

    // what they read
    expect(screen.getByText('What they read')).toBeTruthy()
    await waitFor(() => expect(screen.getByText('Interior wall paint')).toBeTruthy())
    expect(screen.getByRole('button', { name: 'Open heatmap' })).toBeTruthy()
  })

  it('draws 14 bars per day and a tooltip on hover', async () => {
    mockAnalytics.mockResolvedValue(richAnalytics())
    renderDrawer()
    await waitFor(() => expect(screen.getByTestId('opens-per-day-chart')).toBeTruthy())
    expect(screen.getAllByTestId('opens-day-bar')).toHaveLength(14)
    const hits = screen.getAllByTestId('opens-day-hit')
    expect(hits).toHaveLength(14)
    expect(screen.getByTestId('opens-per-day-chart').getAttribute('aria-label')).toContain('Peak')
    expect(screen.queryByRole('tooltip')).toBeNull()
    // s2 and s3 happened within the last 2 hours: today (or the day before around midnight)
    const bars = screen.getAllByTestId('opens-day-bar')
    const total = bars.reduce((n, b) => n + Number(b.getAttribute('data-count')), 0)
    expect(total).toBe(3)
    const peakIndex = bars.findIndex((b) => Number(b.getAttribute('data-count')) === Math.max(...bars.map((x) => Number(x.getAttribute('data-count')))))
    fireEvent.mouseEnter(hits[peakIndex])
    expect(screen.getByRole('tooltip').textContent).toMatch(/: \d+ opens?$/)
    fireEvent.mouseLeave(hits[peakIndex])
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('shows the funnel counts, the visitors and the devices legend', async () => {
    mockAnalytics.mockResolvedValue(richAnalytics())
    renderDrawer()
    await waitFor(() => expect(screen.getAllByTestId('funnel-row')).toHaveLength(5))
    const rows = screen.getAllByTestId('funnel-row').map((r) => r.textContent)
    expect(rows[0]).toBe('Opened3')
    expect(rows[1]).toBe('Read past half2')
    expect(rows[2]).toBe('Read to the end1')
    expect(rows[3]).toBe('Started signing0')
    expect(rows[4]).toBe('Answered0')

    const visitors = screen.getAllByTestId('visitor-row')
    expect(visitors).toHaveLength(2)
    expect(visitors[0].textContent).toContain('Visitor A')
    expect(visitors[0].textContent).toContain('Phone · 1 open')
    expect(visitors[1].textContent).toContain('Visitor B')
    expect(visitors[1].textContent).toContain('Computer · 2 opens')
    expect(screen.getByTestId('devices-legend').textContent).toBe('Computer 2Phone 1')
  })

  it('offers Call, Text and Email only when the client has them', async () => {
    mockAnalytics.mockResolvedValue(richAnalytics())
    const { unmount } = renderDrawer()
    await waitFor(() => expect(screen.getByTestId('analytics-followup')).toBeTruthy())
    expect(screen.getByRole('link', { name: 'Call' }).getAttribute('href')).toBe('tel:5550102020')
    expect(screen.getByRole('link', { name: 'Text' }).getAttribute('href')).toBe('sms:5550102020')
    expect(screen.getByRole('link', { name: 'Email' }).getAttribute('href')).toBe('mailto:ava@example.com')
    unmount()

    mockContext.mockResolvedValue({ ...CONTEXT, clientPhone: null })
    renderDrawer()
    await waitFor(() => expect(screen.getByRole('link', { name: 'Email' })).toBeTruthy())
    expect(screen.queryByRole('link', { name: 'Call' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Text' })).toBeNull()
  })

  it('shows the answer instead of a verdict, and no follow-up buttons, once answered', async () => {
    mockAnalytics.mockResolvedValue(
      buildEstimateAnalytics({
        events: [
          ev('s1', 'view', 5 * HOUR, { device: 'desktop' }),
          ev('s1', 'heartbeat', 5 * HOUR - 1000, { metadata: { seconds: 90 } }),
        ],
        activity: [],
        estimate: {
          created_at: iso(24 * HOUR),
          sent_at: null,
          client_response: 'accepted',
          responded_at: iso(2 * HOUR),
        },
      }),
    )
    renderDrawer()
    await waitFor(() => expect(screen.getByTestId('analytics-summary')).toBeTruthy())
    const verdict = screen.getByTestId('analytics-summary')
    expect(within(verdict).getByText('Answered')).toBeTruthy()
    expect(within(verdict).getByText(/^Accepted · /)).toBeTruthy()
    expect(screen.queryByTestId('analytics-followup')).toBeNull()
    expect(screen.queryByTestId('interest-meter')).toBeNull()
  })

  it.each([
    [
      'warm',
      [ev('s1', 'view', 3 * HOUR, { device: 'mobile' }), ev('s1', 'heartbeat', 3 * HOUR - 1000, { metadata: { seconds: 30 } })],
      'Warm, keep an eye on it',
    ],
    [
      'cold',
      [
        ev('s1', 'view', 20 * 24 * HOUR, { device: 'mobile' }),
        ev('s1', 'heartbeat', 20 * 24 * HOUR - 1000, { metadata: { seconds: 30 } }),
      ],
      'Cold, a friendly check-in could help',
    ],
  ])('headlines a %s estimate', async (_level, events, headline) => {
    mockAnalytics.mockResolvedValue(
      buildEstimateAnalytics({
        events,
        activity: [],
        estimate: { created_at: iso(30 * 24 * HOUR), sent_at: null, client_response: null, responded_at: null },
      }),
    )
    renderDrawer()
    await waitFor(() => expect(screen.getByText(headline)).toBeTruthy())
  })

  it('shows the not-opened verdict and a friendly card, with no charts, when never opened', async () => {
    mockAnalytics.mockResolvedValue(
      buildEstimateAnalytics({
        events: [],
        activity: [],
        estimate: { created_at: iso(HOUR), sent_at: null, client_response: null, responded_at: null },
      }),
    )
    renderDrawer()
    await waitFor(() => expect(screen.getByTestId('analytics-empty')).toBeTruthy())
    expect(within(screen.getByTestId('analytics-summary')).getByText('Not opened yet')).toBeTruthy()
    expect(screen.getByText(/When your client opens the link/)).toBeTruthy()
    expect(screen.queryByTestId('analytics-kpi')).toBeNull()
    expect(screen.queryByTestId('opens-per-day-chart')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Open heatmap' })).toBeNull()
  })

  it('explains missing dwell data instead of hiding the card', async () => {
    mockAnalytics.mockResolvedValue(
      buildEstimateAnalytics({
        events: [
          ev('s1', 'view', 3 * HOUR, { device: 'mobile' }),
          ev('s1', 'heartbeat', 3 * HOUR - 1000, { metadata: { seconds: 30 } }),
        ],
        activity: [],
        estimate: { created_at: iso(24 * HOUR), sent_at: null, client_response: null, responded_at: null },
      }),
    )
    renderDrawer()
    await waitFor(() => expect(screen.getByText('What they read')).toBeTruthy())
    expect(screen.getByText(/only recorded for newer visits/)).toBeTruthy()
  })

  it('shows a quick-open run with "since" the first open', async () => {
    mockAnalytics.mockResolvedValue(
      buildEstimateAnalytics({
        events: [ev('s1', 'view', 30 * HOUR), ev('s2', 'view', 3 * HOUR, { device: 'mobile' })],
        activity: [],
        estimate: { created_at: iso(90 * HOUR), sent_at: null, client_response: null, responded_at: null },
      }),
    )
    renderDrawer()
    await waitFor(() => expect(screen.getByText('2 quick opens')).toBeTruthy())
    expect(screen.getByText(/^since /)).toBeTruthy()
  })

  it('shows an error with a retry that fetches again', async () => {
    mockAnalytics.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(richAnalytics())
    renderDrawer()
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.getByTestId('analytics-summary')).toBeTruthy())
    expect(mockAnalytics).toHaveBeenCalledTimes(2)
  })

  it('shows the status block (progress + record the answer) at the top, even while loading', () => {
    mockAnalytics.mockReturnValue(new Promise(() => {}))
    render(
      <EstimateAnalyticsDrawer
        open
        onOpenChange={() => {}}
        estimateId="est-1"
        status={{
          createdAt: iso(48 * HOUR),
          viewCount: 2,
          lastViewedAt: iso(HOUR),
          clientResponse: null,
          respondedAt: null,
          signedOnline: false,
          recordDisabled: false,
          onRecord: async () => {},
        }}
      />,
    )
    const summary = screen.getByTestId('estimate-status-summary')
    expect(summary.querySelector('[data-step="opened"]')?.getAttribute('data-done')).toBe('true')
    expect(screen.getByTestId('analytics-skeleton')).toBeTruthy()
  })

  it('has no status block when no status is passed (dashboard deep link)', () => {
    mockAnalytics.mockReturnValue(new Promise(() => {}))
    renderDrawer()
    expect(screen.queryByTestId('estimate-status-summary')).toBeNull()
  })

  it('does not fetch while closed', () => {
    render(<EstimateAnalyticsDrawer open={false} onOpenChange={() => {}} estimateId="est-1" />)
    expect(mockAnalytics).not.toHaveBeenCalled()
  })

  it('caps the timeline at 12 entries and expands with Show all', async () => {
    const events: AnalyticsEventRow[] = []
    for (let i = 0; i < 20; i++) {
      events.push(ev(`s${i}`, 'view', (30 + i) * HOUR, { device: 'desktop' }))
      events.push(ev(`s${i}`, 'heartbeat', (30 + i) * HOUR - 1000, { metadata: { seconds: 60 } }))
    }
    mockAnalytics.mockResolvedValue(
      buildEstimateAnalytics({
        events,
        activity: [],
        estimate: { created_at: iso(90 * HOUR), sent_at: null, client_response: null, responded_at: null },
      }),
    )
    renderDrawer()
    await waitFor(() => expect(screen.getAllByTestId('analytics-timeline-entry')).toHaveLength(12))
    fireEvent.click(screen.getByRole('button', { name: 'Show all 21 events' }))
    expect(screen.getAllByTestId('analytics-timeline-entry')).toHaveLength(21)
  })
})

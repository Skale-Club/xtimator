import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import React from 'react'
import { EstimateAnalyticsDrawer } from '@/components/workspace/estimate/analytics/estimate-analytics-drawer'
import { buildSummarySentence } from '@/components/workspace/estimate/analytics/analytics-content'
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

beforeEach(() => {
  mockAnalytics.mockReset()
  mockContext.mockReset().mockResolvedValue({ estimateNumber: '1042', clientName: 'Ava Thompson' })
  mockLabels.mockReset().mockResolvedValue({ i1: 'Interior wall paint' })
})

describe('EstimateAnalyticsDrawer', () => {
  it('shows a skeleton while loading, then labeled KPIs, summary and timeline', async () => {
    let resolve!: (v: unknown) => void
    mockAnalytics.mockReturnValue(new Promise((r) => (resolve = r)))
    renderDrawer()
    expect(screen.getByTestId('analytics-skeleton')).toBeTruthy()
    expect(screen.getByText('Estimate analytics')).toBeTruthy()

    resolve(richAnalytics())
    await waitFor(() => expect(screen.queryByTestId('analytics-skeleton')).toBeNull())

    const kpis = screen.getAllByTestId('analytics-kpi')
    expect(kpis).toHaveLength(4)
    expect(within(kpis[0]).getByText('Opens')).toBeTruthy()
    expect(within(kpis[0]).getByText('3')).toBeTruthy()
    expect(within(kpis[0]).getByText('2 people')).toBeTruthy()
    expect(within(kpis[1]).getByText('Reading time')).toBeTruthy()
    expect(within(kpis[1]).getByText('4m 00s')).toBeTruthy()
    expect(within(kpis[2]).getByText('Read to the end')).toBeTruthy()
    expect(within(kpis[2]).getByText('of 3 visits')).toBeTruthy()
    expect(within(kpis[3]).getByText('Last opened')).toBeTruthy()
    expect(within(kpis[3]).getByText('1 h ago')).toBeTruthy()

    const summary = screen.getByTestId('analytics-summary')
    expect(summary.textContent).toContain('Opened 3 times by 2 people.')
    expect(summary.textContent).toContain('read to the end')
    expect(summary.textContent).toContain('most time on Totals')
    expect(within(summary).getByText('Hot')).toBeTruthy()

    expect(screen.getByText('What happened')).toBeTruthy()
    expect(screen.getByText('Sent by email to sophia@example.com')).toBeTruthy()
    expect(screen.getByText('Downloaded the PDF')).toBeTruthy()
    expect(screen.getByText('First open')).toBeTruthy()
    expect(screen.getByText(/On phone · Person 1 · 3m 00s · Read 100% · Most time on Totals/)).toBeTruthy()
    expect(screen.getByText('Estimate created')).toBeTruthy()

    // header context is looked up when the caller gives none
    await waitFor(() => expect(screen.getByText('Ava Thompson · #1042')).toBeTruthy())
    // time spent + items + devices + heatmap entry
    expect(screen.getByText('Where they spent time')).toBeTruthy()
    await waitFor(() => expect(screen.getByText('Interior wall paint')).toBeTruthy())
    expect(screen.getByText('Devices')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open heatmap' })).toBeTruthy()
  })

  it('shows a friendly empty state when the estimate was never opened', async () => {
    mockAnalytics.mockResolvedValue(
      buildEstimateAnalytics({
        events: [],
        activity: [],
        estimate: { created_at: iso(HOUR), sent_at: null, client_response: null, responded_at: null },
      }),
    )
    renderDrawer()
    await waitFor(() => expect(screen.getByTestId('analytics-empty')).toBeTruthy())
    expect(screen.getByText(/When your client opens the link/)).toBeTruthy()
    expect(screen.queryByTestId('analytics-kpi')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Open heatmap' })).toBeNull()
  })

  it('explains missing dwell data instead of hiding the block', async () => {
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
    await waitFor(() => expect(screen.getByText('Where they spent time')).toBeTruthy())
    expect(screen.getByText(/only recorded for newer visits/)).toBeTruthy()
  })

  it('shows an error with a retry that fetches again', async () => {
    mockAnalytics.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(richAnalytics())
    renderDrawer()
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.getByTestId('analytics-summary')).toBeTruthy())
    expect(mockAnalytics).toHaveBeenCalledTimes(2)
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

describe('buildSummarySentence', () => {
  const t = (s: string) => s
  it('says "Opened once" and omits the people part for one person', () => {
    const a = buildEstimateAnalytics({
      events: [
        ev('s1', 'view', HOUR, { device: 'mobile' }),
        ev('s1', 'heartbeat', HOUR - 1000, { metadata: { seconds: 40 } }),
      ],
      activity: [],
      estimate: { created_at: iso(24 * HOUR), sent_at: null, client_response: null, responded_at: null },
    })
    expect(buildSummarySentence(a, t)).toBe('Opened once. Last visit 1 h ago.')
  })
})

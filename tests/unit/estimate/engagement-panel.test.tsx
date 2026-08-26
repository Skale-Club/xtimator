import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { EngagementPanel } from '@/components/workspace/estimate/engagement-panel'
import { Sheet } from '@/components/ui/sheet'
import type { EstimateEngagementSummary, EngagementVisit } from '@/lib/queries/engagement'

// Phase 193 Plan 03 (Task 2b) — panel renders stats + the empty state.
// The panel's own heatmap entry point (EngagementHeatmap) is mounted
// unconditionally but stays closed here, so its queries never fire — no
// need to mock the estimate-document renderers for this file.

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({}),
}))

const mockSummary = vi.fn()
const mockTimeline = vi.fn()
const mockClickPoints = vi.fn()
const mockDocument = vi.fn()

vi.mock('@/lib/queries/engagement', () => ({
  // The panel reads summary + visits through ONE fetch (a single row set feeds
  // both aggregators), so the mock composes them from the same two fixtures the
  // individual-query mocks below provide.
  getEstimateEngagementOverview: async (...args: unknown[]) => ({
    summary: await mockSummary(...args),
    visits: await mockTimeline(...args),
  }),
  getEstimateEngagementSummary: (...args: unknown[]) => mockSummary(...args),
  getEstimateViewTimeline: (...args: unknown[]) => mockTimeline(...args),
  getEstimateClickPoints: (...args: unknown[]) => mockClickPoints(...args),
  getEstimateDocumentForHeatmap: (...args: unknown[]) => mockDocument(...args),
}))

function emptySummary(): EstimateEngagementSummary {
  return {
    opens: 0,
    uniqueVisitors: 0,
    lastViewedAt: null,
    totalSeconds: 0,
    maxScrollPct: 0,
    sectionsViewed: 0,
    clicks: 0,
    deviceSplit: { mobile: 0, desktop: 0, unknown: 0 },
    unlockFails: 0,
  }
}

// EngagementPanel renders SheetHeader/SheetTitle, which require a Radix
// Dialog.Root context — production always mounts this as SheetContent's
// child inside <Sheet> (engagement-button.tsx). Mirror that here.
function renderPanel(estimateId: string) {
  return render(
    <Sheet open>
      <EngagementPanel estimateId={estimateId} />
    </Sheet>
  )
}

describe('EngagementPanel', () => {
  beforeEach(() => {
    mockSummary.mockReset()
    mockTimeline.mockReset()
    mockClickPoints.mockReset().mockResolvedValue([])
    mockDocument.mockReset().mockResolvedValue(null)
  })

  it('renders the empty state when the estimate was sent but never opened', async () => {
    mockSummary.mockResolvedValue(emptySummary())
    mockTimeline.mockResolvedValue([])

    renderPanel('est-1')

    expect(await screen.findByText('Sent — not opened yet')).toBeTruthy()
  })

  it('renders opens/unique-visitors/time/read-depth stat cards once data resolves, without crashing on the visits list', async () => {
    const summary: EstimateEngagementSummary = {
      opens: 5,
      uniqueVisitors: 3,
      lastViewedAt: '2026-08-24T10:00:00Z',
      totalSeconds: 125,
      maxScrollPct: 80,
      sectionsViewed: 2,
      clicks: 4,
      deviceSplit: { mobile: 2, desktop: 3, unknown: 0 },
      unlockFails: 0,
    }
    const visits: EngagementVisit[] = [
      { sessionId: 's1', startedAt: '2026-08-24T10:00:00Z', seconds: 60, device: 'desktop', maxScrollPct: 45 },
    ]
    mockSummary.mockResolvedValue(summary)
    mockTimeline.mockResolvedValue(visits)

    renderPanel('est-1')

    expect(await screen.findByText('Opens')).toBeTruthy()
    expect(screen.getByText('Unique visitors')).toBeTruthy()
    expect(screen.getByText('Total time')).toBeTruthy()
    expect(screen.getByText('Read depth')).toBeTruthy()
    expect(screen.getByText('80%')).toBeTruthy()
    expect(screen.getByText('45%')).toBeTruthy()
    expect(screen.getByText('View click heatmap')).toBeTruthy()
    // Interest badge: opens >= 3 → Hot.
    expect(screen.getByText('Hot')).toBeTruthy()
  })
})

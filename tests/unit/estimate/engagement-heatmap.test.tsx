import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { EngagementHeatmap } from '@/components/workspace/estimate/engagement-heatmap'
import type { EngagementHeatmapDocument } from '@/lib/queries/engagement'

// Phase 193 Plan 03 (Task 3) — heatmap dialog renders without crashing when
// there are zero click events, and mounts a canvas over the (stubbed)
// document renderer. The real EstimateDocument/EstimateDocumentModern
// renderers have their own extensive test coverage (tests/unit/estimate/
// document-*.test.tsx) — stubbed here so this file tests only the heatmap's
// own behavior (fetch → canvas → filter → bar list).

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({}),
}))

const mockClickPoints = vi.fn()
const mockDocument = vi.fn()
const mockDwellRows = vi.fn()

vi.mock('@/lib/queries/engagement', () => ({
  getEstimateClickPoints: (...args: unknown[]) => mockClickPoints(...args),
  getEstimateDocumentForHeatmap: (...args: unknown[]) => mockDocument(...args),
  getEstimateEngagementSummary: vi.fn(),
  getEstimateViewTimeline: vi.fn(),
  getEstimateDwellRows: (...args: unknown[]) => mockDwellRows(...args),
  aggregateDwellByDevice: (rows: Array<{ target: string | null; metadata: { dwell_seconds?: number } | null }>) => {
    const sectionDwell: Record<string, number> = {}
    for (const r of rows) {
      if (r.target && r.metadata?.dwell_seconds) sectionDwell[r.target] = (sectionDwell[r.target] ?? 0) + r.metadata.dwell_seconds
    }
    return { sectionDwell, itemDwell: {} }
  },
}))

vi.mock('@/components/workspace/estimate/estimate-document', () => ({
  EstimateDocument: () => <div data-testid="stub-classic-doc">classic doc</div>,
}))
vi.mock('@/components/share/estimate-document-modern', () => ({
  EstimateDocumentModern: () => <div data-testid="stub-modern-doc">modern doc</div>,
}))

function makeDoc(overrides: Partial<EngagementHeatmapDocument> = {}): EngagementHeatmapDocument {
  return {
    templateId: 'classic',
    data: {
      summary: null,
      notes: null,
      timeline: null,
      payment_terms: null,
      warranty_terms: null,
      discount_type: null,
      discount_value: 0,
      discount_amount: 0,
      tax_rate: 0,
      tax_amount: 0,
      subtotal: 1000,
      total: 1000,
      deposit_type: 'none',
      deposit_value: null,
      deposit: 0,
      balance_due: 1000,
      currency_code: 'USD',
      estimate_date: null,
      estimate_number: null,
      presentation_settings: null,
      sections: [],
    },
    company: {
      name: 'Acme Co',
      owner_name: null,
      phone: null,
      email: null,
      website: null,
      address: null,
      city: null,
      state: null,
      zip: null,
      logo_url: null,
      brand_primary_color: null,
    },
    client: null,
    projectName: 'Test Project',
    projectType: null,
    language: 'en',
    estimateVersion: 1,
    estimateSeq: 1,
    estimateCreatedAt: '2026-08-01T00:00:00Z',
    ...overrides,
  }
}

describe('EngagementHeatmap', () => {
  beforeEach(() => {
    mockClickPoints.mockReset()
    mockDocument.mockReset()
    mockDwellRows.mockReset().mockResolvedValue([])
  })

  it('renders the canvas over the document without crashing when there are zero click events', async () => {
    mockDocument.mockResolvedValue(makeDoc())
    mockClickPoints.mockResolvedValue([])

    render(<EngagementHeatmap open onOpenChange={() => {}} estimateId="est-1" />)

    expect(await screen.findByTestId('stub-classic-doc')).toBeTruthy()
    expect(screen.getByTestId('engagement-heatmap-canvas')).toBeTruthy()
    expect(screen.getByText('No clicks recorded yet.')).toBeTruthy()
  })

  it('selects the modern renderer when the document was authored with the modern template', async () => {
    mockDocument.mockResolvedValue(makeDoc({ templateId: 'modern' }))
    mockClickPoints.mockResolvedValue([])

    render(<EngagementHeatmap open onOpenChange={() => {}} estimateId="est-1" />)

    expect(await screen.findByTestId('stub-modern-doc')).toBeTruthy()
  })

  it('renders a graceful fallback (no crash) when the document is unavailable', async () => {
    mockDocument.mockResolvedValue(null)
    mockClickPoints.mockResolvedValue([])

    render(<EngagementHeatmap open onOpenChange={() => {}} estimateId="est-1" />)

    expect(await screen.findByText('No document to preview yet.')).toBeTruthy()
  })

  it('does not fetch while closed', () => {
    render(<EngagementHeatmap open={false} onOpenChange={() => {}} estimateId="est-1" />)
    expect(mockDocument).not.toHaveBeenCalled()
    expect(mockClickPoints).not.toHaveBeenCalled()
  })
  it('defaults to Clicks and switches to the Attention view with an empty state when no dwell exists', async () => {
    mockDocument.mockResolvedValue(makeDoc())
    mockClickPoints.mockResolvedValue([])

    render(<EngagementHeatmap open onOpenChange={() => {}} estimateId="est-1" />)

    expect(await screen.findByText('Click heatmap')).toBeTruthy()
    expect(mockDwellRows).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Attention' }))

    expect(await screen.findByText('No reading time recorded yet.')).toBeTruthy()
    expect(screen.getByText('Attention map')).toBeTruthy()
    expect(mockDwellRows).toHaveBeenCalledTimes(1)
  })

  it('draws a labeled overlay box for a target with dwell in Attention mode', async () => {
    mockDocument.mockResolvedValue(makeDoc())
    mockClickPoints.mockResolvedValue([])
    mockDwellRows.mockResolvedValue([
      { session_id: 's1', event_type: 'section_view', target: 'totals', device: null, metadata: { dwell_seconds: 75 } },
    ])
    // The stubbed document has no tracked sections, so inject one for measuring.
    const original = Element.prototype.getBoundingClientRect
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this.getAttribute('data-track-section')) {
        return { left: 10, top: 20, width: 100, height: 50, right: 110, bottom: 70, x: 10, y: 20, toJSON() {} } as DOMRect
      }
      return original.call(this)
    })

    render(<EngagementHeatmap open onOpenChange={() => {}} estimateId="est-1" />)
    const stub = await screen.findByTestId('stub-classic-doc')
    const tracked = document.createElement('div')
    tracked.setAttribute('data-track-section', 'totals')
    stub.parentElement!.appendChild(tracked)

    fireEvent.click(screen.getByRole('button', { name: 'Attention' }))
    expect(await screen.findByText('1:15')).toBeTruthy()
    expect(screen.getAllByTestId('engagement-attention-box')).toHaveLength(1)
    vi.restoreAllMocks()
  })
})

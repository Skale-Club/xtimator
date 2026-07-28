import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePaginatedPreview } from '@/components/workspace/estimate/use-paginated-preview'
import { computePageBreaks } from '@/lib/estimate/pagination/engine'
import type { EstimateDocumentData, DocumentCompany } from '@/lib/estimate/document/model'
import type { EstimateTemplateId } from '@/lib/estimate/templates/registry'
import { FIXTURE_COMPANY, buildFixtureEstimate, toFixtureDocumentData } from './fixtures/document-fixtures'

// Phase 185 Plan 04 (PGMODE-03) — proves usePaginatedPreview's
// immediate-vs-400ms-debounced trigger logic in isolation: the dynamically
// imported browser-estimator module is mocked (so this exercises ONLY the
// trigger-timing logic, never real font loading/measurement), and
// `computePageBreaks` (the real pipeline's entry point) is spied on via a
// partial mock so call counts prove exactly WHEN a recomputation happened.
//
// REQUIRED READING for reviewers: this plan's <interfaces> block (the
// widened hook signature + the exact immediate-vs-debounce trigger spec).

vi.mock('@/lib/estimate/pagination/measure/browser-estimator', () => ({
  createBrowserFontkitMeasurementProvider: vi.fn().mockResolvedValue({
    lineCount: () => 1,
  }),
}))

vi.mock('@/lib/estimate/pagination/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/estimate/pagination/engine')>()
  return { ...actual, computePageBreaks: vi.fn(actual.computePageBreaks) }
})

const company = FIXTURE_COMPANY as unknown as DocumentCompany
const templateId: EstimateTemplateId = 'classic'

function buildData(overrides: Record<string, unknown> = {}): EstimateDocumentData {
  return toFixtureDocumentData(buildFixtureEstimate(overrides)) as unknown as EstimateDocumentData
}

function baseProps(overrides: Partial<Parameters<typeof usePaginatedPreview>[0]> = {}) {
  return {
    data: buildData(),
    structuralEpoch: 0,
    company,
    templateId,
    preparedBy: null,
    language: 'en' as const,
    enabled: true,
    ...overrides,
  }
}

describe('usePaginatedPreview — immediate-vs-debounced repagination triggers (PGMODE-03)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(computePageBreaks).mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('recomputes IMMEDIATELY on first activation (zero timer delay)', async () => {
    const { result } = renderHook((props) => usePaginatedPreview(props), {
      initialProps: baseProps(),
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(computePageBreaks).toHaveBeenCalledTimes(1)
    expect(result.current.pages).not.toBeNull()
  })

  it('a text-only change (same structuralEpoch) does NOT recompute before 400ms, and recomputes exactly once at 400ms', async () => {
    const { rerender } = renderHook((props) => usePaginatedPreview(props), {
      initialProps: baseProps(),
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0) // flush the first-activation immediate recompute
    })
    vi.mocked(computePageBreaks).mockClear()

    rerender(baseProps({ data: buildData({ summary: 'edited once' }) }))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(399)
    })
    expect(computePageBreaks).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(computePageBreaks).toHaveBeenCalledTimes(1)
  })

  it('multiple rapid text-only changes within the 400ms window collapse into exactly ONE recomputation', async () => {
    const { rerender } = renderHook((props) => usePaginatedPreview(props), {
      initialProps: baseProps(),
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    vi.mocked(computePageBreaks).mockClear()

    rerender(baseProps({ data: buildData({ summary: 'edit 1' }) }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    rerender(baseProps({ data: buildData({ summary: 'edit 2' }) }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    rerender(baseProps({ data: buildData({ summary: 'edit 3' }) }))

    expect(computePageBreaks).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    expect(computePageBreaks).toHaveBeenCalledTimes(1)
  })

  it('a structural change (structuralEpoch bump) recomputes IMMEDIATELY, even with a text-debounce timer already pending', async () => {
    const { rerender } = renderHook((props) => usePaginatedPreview(props), {
      initialProps: baseProps(),
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    vi.mocked(computePageBreaks).mockClear()

    // Text-only change — schedules a 400ms debounce, still pending.
    rerender(baseProps({ data: buildData({ summary: 'mid-typing edit' }) }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    expect(computePageBreaks).not.toHaveBeenCalled()

    // A structural change lands while that debounce is still in flight.
    rerender(
      baseProps({
        data: buildData({ summary: 'mid-typing edit' }),
        structuralEpoch: 1,
      })
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(computePageBreaks).toHaveBeenCalledTimes(1)

    // The stale text-debounce timer must have been cleared — advancing past
    // where it would have fired must NOT produce a second recomputation.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    expect(computePageBreaks).toHaveBeenCalledTimes(1)
  })

  it('enabled=false does no work at all (pages stays null, no recompute)', async () => {
    const { result } = renderHook((props) => usePaginatedPreview(props), {
      initialProps: baseProps({ enabled: false }),
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })

    expect(computePageBreaks).not.toHaveBeenCalled()
    expect(result.current.pages).toBeNull()
  })
})

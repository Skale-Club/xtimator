import { describe, it, expect } from 'vitest'
import {
  MIN_MEDIAN_SAMPLES,
  computeJournalMedians,
  type MedianJournalRow,
} from '@/lib/estimate/journal-medians'

/**
 * 260927: typical durations for the checklist, measured as gaps between the
 * journal timestamps of each attempt (never `duration_ms`, which cannot see
 * sub-phases and was replay-corrupted for the generate step before 260806).
 */

const T0 = Date.parse('2026-09-01T12:00:00Z')

/** One healthy attempt: generation phases spaced by the given seconds. */
function attempt(
  id: string,
  opts: { transcribeSec: number; draftingSec: number; pricingSec: number; refineSec?: number }
): MedianJournalRow[] {
  let t = T0
  const row = (step: string, status: string, metadata: Record<string, unknown> | null = null) => ({
    attempt_id: id,
    step,
    status,
    created_at: new Date(t).toISOString(),
    metadata,
  })
  const rows: MedianJournalRow[] = []
  rows.push(row('transcribe', 'started'))
  t += opts.transcribeSec * 1000
  rows.push(row('transcribe', 'succeeded'))
  rows.push(row('generate_estimate', 'started'))
  rows.push(row('generate_estimate', 'started', { phase: 'context' }))
  t += 2_000
  rows.push(row('generate_estimate', 'started', { phase: 'drafting' }))
  t += opts.draftingSec * 1000
  rows.push(row('generate_estimate', 'started', { phase: 'pricing', candidates: 3 }))
  t += opts.pricingSec * 1000
  rows.push(row('generate_estimate', 'started', { phase: 'saving' }))
  t += 3_000
  rows.push(row('generate_estimate', 'started', { phase: 'reviewing' }))
  t += 1_000
  if (opts.refineSec) {
    rows.push(row('generate_estimate', 'started', { phase: 'refining', round: 1 }))
    rows.push(row('generate_estimate', 'started', { phase: 'drafting' }))
    t += opts.refineSec * 1000
  }
  rows.push(row('generate_estimate', 'succeeded'))
  return rows
}

describe('computeJournalMedians', () => {
  it('measures steps and first-pass phases from the timestamps of each attempt', () => {
    const rows = [
      ...attempt('a', { transcribeSec: 6, draftingSec: 50, pricingSec: 20 }),
      ...attempt('b', { transcribeSec: 8, draftingSec: 60, pricingSec: 10 }),
      ...attempt('c', { transcribeSec: 10, draftingSec: 90, pricingSec: 30 }),
    ]
    const medians = computeJournalMedians(rows)
    expect(medians.transcribe).toBe(8_000)
    expect(medians['generate_estimate:context']).toBe(2_000)
    expect(medians['generate_estimate:drafting']).toBe(60_000)
    expect(medians['generate_estimate:pricing']).toBe(20_000)
    expect(medians['generate_estimate:saving']).toBe(3_000)
    expect(medians['generate_estimate:reviewing']).toBe(1_000)
    // Whole generate step is 2 + drafting + pricing + 3 + 1 seconds per
    // attempt: 76s, 76s and 126s, so the median is 76s.
    expect(medians.generate_estimate).toBe(76_000)
  })

  it('measures the refine row as the whole second pass', () => {
    const rows = ['a', 'b', 'c'].flatMap((id) =>
      attempt(id, { transcribeSec: 5, draftingSec: 40, pricingSec: 10, refineSec: 70 })
    )
    expect(computeJournalMedians(rows)['generate_estimate:refining']).toBe(70_000)
  })

  it('omits keys with too few samples so the fallbacks apply', () => {
    const rows = attempt('only', { transcribeSec: 6, draftingSec: 50, pricingSec: 20 })
    expect(MIN_MEDIAN_SAMPLES).toBeGreaterThan(1)
    expect(computeJournalMedians(rows)).toEqual({})
  })

  it('does not mix rows of different attempts, whatever order they arrive in', () => {
    const rows = [
      ...attempt('a', { transcribeSec: 6, draftingSec: 50, pricingSec: 20 }),
      ...attempt('b', { transcribeSec: 6, draftingSec: 50, pricingSec: 20 }),
      ...attempt('c', { transcribeSec: 6, draftingSec: 50, pricingSec: 20 }),
    ].reverse()
    expect(computeJournalMedians(rows)['generate_estimate:drafting']).toBe(50_000)
  })

  it('drops implausible gaps from stuck or abandoned attempts', () => {
    const rows = ['a', 'b', 'c'].flatMap((id) =>
      attempt(id, { transcribeSec: 6, draftingSec: 50 * 60, pricingSec: 20 })
    )
    expect(computeJournalMedians(rows)['generate_estimate:drafting']).toBeUndefined()
  })

  it('ignores rows without an attempt id', () => {
    const rows = attempt('a', { transcribeSec: 6, draftingSec: 50, pricingSec: 20 }).map((r) => ({
      ...r,
      attempt_id: null,
    }))
    expect(computeJournalMedians([...rows, ...rows, ...rows])).toEqual({})
  })
})

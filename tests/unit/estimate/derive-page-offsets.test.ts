import { describe, it, expect } from 'vitest'
import { derivePageOffsets } from '@/components/workspace/estimate/paginated-document-overlay'
import { LETTER_HEIGHT_PX } from '@/lib/estimate/document/tokens'

// Phase 185 Plan 03 (PGMODE-02, plan-checker Blocker 3) — derivePageOffsets()
// is a genuinely PURE function: plain number-array fixtures in, plain
// number-array results out, zero DOM reads/mocking. This is the ONE place
// positional arithmetic correctness is proven at the unit level (the REAL
// browser-layout binding claim is proven separately by
// scripts/pagination-binding-check.ts).

const BASE_OPTS = {
  topReservationPx: 100,
  bottomReservationPx: 50,
  continuationHeaderPx: 30,
  pageGapPx: 32,
}

describe('derivePageOffsets — pure function', () => {
  it('page tops: page 0 uses its own natural offset unchanged (no spacer)', () => {
    const result = derivePageOffsets(
      {
        naturalOffsetsPx: [200, 1400, 2600],
        naturalScrollHeightPx: 3200,
        continuesTableByPage: [false, false, false],
      },
      BASE_OPTS
    )
    expect(result[0].contentTopPx).toBe(200)
    expect(result[0].spacerMarginTopPx).toBe(0)
  })

  it('page tops: contentTopPx[1]/[2] match the hand-computed cumulative formula for a 3-page fixture', () => {
    const naturalOffsetsPx = [200, 1400, 2600]
    const naturalScrollHeightPx = 3200
    const continuesTableByPage = [false, false, false]
    const result = derivePageOffsets({ naturalOffsetsPx, naturalScrollHeightPx, continuesTableByPage }, BASE_OPTS)

    // Pass 1 sheet heights (hand-computed): each page's measured span +
    // reservations (no continuation header, since continuesTableByPage is
    // all false), floored at LETTER_HEIGHT_PX.
    const measuredSpans = [1400 - 200, 2600 - 1400, 3200 - 2600]
    const reserved = BASE_OPTS.topReservationPx + BASE_OPTS.bottomReservationPx
    const expectedSheetHeights = measuredSpans.map((span) => Math.max(LETTER_HEIGHT_PX, span + reserved))

    const expectedContentTop1 = expectedSheetHeights[0] + BASE_OPTS.pageGapPx + BASE_OPTS.topReservationPx
    const expectedContentTop2 =
      expectedSheetHeights[0] +
      BASE_OPTS.pageGapPx +
      expectedSheetHeights[1] +
      BASE_OPTS.pageGapPx +
      BASE_OPTS.topReservationPx

    expect(result[1].contentTopPx).toBe(expectedContentTop1)
    expect(result[2].contentTopPx).toBe(expectedContentTop2)
  })

  it('sheet heights: a page whose natural span is SMALLER than LETTER_HEIGHT_PX floors at LETTER_HEIGHT_PX', () => {
    const result = derivePageOffsets(
      {
        // Tiny span (10px) + reservations (150px) is still far below LETTER_HEIGHT_PX.
        naturalOffsetsPx: [0],
        naturalScrollHeightPx: 10,
        continuesTableByPage: [false],
      },
      BASE_OPTS
    )
    expect(result[0].sheetHeightPx).toBe(LETTER_HEIGHT_PX)
  })

  it('overflow branch: a page whose measured span + reservations EXCEEDS LETTER_HEIGHT_PX is never clamped down', () => {
    const hugeSpan = LETTER_HEIGHT_PX + 500
    const result = derivePageOffsets(
      {
        naturalOffsetsPx: [0],
        naturalScrollHeightPx: hugeSpan,
        continuesTableByPage: [false],
      },
      BASE_OPTS
    )
    const expected = hugeSpan + BASE_OPTS.topReservationPx + BASE_OPTS.bottomReservationPx
    expect(result[0].sheetHeightPx).toBe(expected)
    expect(result[0].sheetHeightPx).toBeGreaterThan(LETTER_HEIGHT_PX)
  })

  it('gap accumulation: contentTopPx[k] for k>=1 correctly accumulates sheetHeightPx[j] + pageGapPx for every j < k', () => {
    const naturalOffsetsPx = [0, 1200, 2000, 2900]
    const naturalScrollHeightPx = 3600
    const continuesTableByPage = [false, false, false, false]
    const result = derivePageOffsets({ naturalOffsetsPx, naturalScrollHeightPx, continuesTableByPage }, BASE_OPTS)

    const measuredSpans = [1200 - 0, 2000 - 1200, 2900 - 2000, 3600 - 2900]
    const reserved = BASE_OPTS.topReservationPx + BASE_OPTS.bottomReservationPx
    const sheetHeights = measuredSpans.map((span) => Math.max(LETTER_HEIGHT_PX, span + reserved))

    let cumulative = 0
    for (let k = 1; k < result.length; k++) {
      cumulative += sheetHeights[k - 1] + BASE_OPTS.pageGapPx
      expect(result[k].contentTopPx).toBe(cumulative + BASE_OPTS.topReservationPx)
    }
  })

  it('continuation reservation: continuesTableByPage[k]=true adds exactly continuationHeaderPx vs. an otherwise-identical false fixture', () => {
    const measurements = {
      naturalOffsetsPx: [0, 1200, 2000],
      naturalScrollHeightPx: 2800,
    }
    const withoutContinuation = derivePageOffsets(
      { ...measurements, continuesTableByPage: [false, false, false] },
      BASE_OPTS
    )
    const withContinuation = derivePageOffsets(
      { ...measurements, continuesTableByPage: [false, true, false] },
      BASE_OPTS
    )
    expect(withContinuation[1].contentTopPx - withoutContinuation[1].contentTopPx).toBe(BASE_OPTS.continuationHeaderPx)
  })

  it('spacer clamping: a fixture where naturalOffsetsPx[k] already exceeds the computed contentTopPx[k] produces spacerMarginTopPx[k] === 0 (never negative)', () => {
    // Page 0's own natural offset (2000px) is already large relative to the
    // decorative cumulative coordinate system (which starts accumulating
    // from 0) — simulating page 0 sitting far down the natural flow (e.g.
    // after a tall company header) while its own content span is small
    // (floor engages: sheetHeightPx[0] === LETTER_HEIGHT_PX). By the time
    // page 1's contentTopPx is computed from the FLOORED sheet height, it
    // undershoots page 1's own (already-large) natural offset — the exact
    // "prior-page overflow" scenario spacerMarginTopPx must clamp to 0 for,
    // never going negative.
    const result = derivePageOffsets(
      {
        naturalOffsetsPx: [2000, 2050],
        naturalScrollHeightPx: 2200,
        continuesTableByPage: [false, false],
      },
      BASE_OPTS
    )
    // Hand-computed: sheetHeightPx[0] = max(1056, (2050-2000)+150) = 1056
    // (floor engages). contentTopPx[1] = 1056 + 32 + 100 = 1188, which is
    // LESS than naturalOffsetsPx[1] (2050) — so the spacer clamps to 0.
    expect(result[0].sheetHeightPx).toBe(LETTER_HEIGHT_PX)
    expect(result[1].contentTopPx).toBeLessThan(2050)
    expect(result[1].spacerMarginTopPx).toBe(0)
  })

  it('cascade correctness: applying every returned spacerMarginTopPx cumulatively (simulating real CSS block-flow, where an EARLIER anchor\'s marginTop also pushes every LATER anchor down) reproduces contentTopPx[i] exactly for every page', () => {
    // Found during this plan's execution (Task 3b, confirmed via
    // scripts/pagination-binding-check.ts against real Chromium layout): a
    // naive `spacerMarginTopPx = contentTopPx[i] - naturalOffsetsPx[i]`
    // (comparing against the fully-reset baseline alone) double-counts every
    // EARLIER page's own margin once the shell writes all margins
    // simultaneously and the browser cascades them through normal block
    // flow — by page 2+ the real rendered position overshoots contentTopPx
    // by the sum of every earlier spacer. This test simulates that real
    // cascading arithmetically (no DOM needed) and asserts it reproduces
    // contentTopPx[i] exactly for a 4-page, non-clamped fixture.
    const naturalOffsetsPx = [100, 500, 900, 1300]
    const naturalScrollHeightPx = 1700
    const continuesTableByPage = [false, false, false, false]
    const result = derivePageOffsets(
      { naturalOffsetsPx, naturalScrollHeightPx, continuesTableByPage },
      BASE_OPTS
    )

    let simulatedRealPosition = naturalOffsetsPx[0]
    let cumulativeAppliedShift = 0
    for (let i = 0; i < result.length; i++) {
      cumulativeAppliedShift += result[i].spacerMarginTopPx
      simulatedRealPosition = naturalOffsetsPx[i] + cumulativeAppliedShift
      expect(simulatedRealPosition).toBe(result[i].contentTopPx)
    }
  })
})

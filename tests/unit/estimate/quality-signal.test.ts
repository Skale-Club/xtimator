import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { TotalsDiscrepancy } from '@/lib/estimate/totals'

// WI-1 (HARDEN-OBS-01): the estimate-quality signal — a pure derivation
// (buildEstimateQualitySignal) plus a NEVER-THROW side-effecter (reportEstimateQuality)
// that ALWAYS emits the byte-identical console.info('[totals_discrepancy]', discrepancy)
// line and, on an anomaly (discrepancy over threshold OR low research hit-rate), raises a
// Sentry warning. No computed total is touched here — this is pure observability.

// No existing test mocks @sentry/nextjs — declare our own so we can assert captureMessage.
vi.mock('@sentry/nextjs', () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}))

import * as Sentry from '@sentry/nextjs'
import {
  buildEstimateQualitySignal,
  reportEstimateQuality,
  resolveQualityThresholds,
  DEFAULT_QUALITY_THRESHOLDS,
  type QualityThresholds,
} from '@/lib/estimate/quality/quality-signal'

const THRESHOLDS: QualityThresholds = {
  discrepancyWarnPct: 15,
  researchMinCandidates: 5,
  researchLowHitRate: 0.2,
}

function discrepancy(overrides: Partial<TotalsDiscrepancy> = {}): TotalsDiscrepancy {
  return {
    ai_grand: 1000,
    server_grand: 1000,
    delta: 0,
    delta_pct: 0,
    anchored_count: 0,
    clamped_count: 0,
    moved_by_guardrails: false,
    ...overrides,
  }
}

describe('buildEstimateQualitySignal (pure)', () => {
  it('delta_pct 14.9 (threshold 15) → discrepancyExceedsThreshold false (just under)', () => {
    const signal = buildEstimateQualitySignal(
      { discrepancy: discrepancy({ delta_pct: 14.9 }), flaggedUnpriced: 0 },
      THRESHOLDS
    )
    expect(signal.discrepancyExceedsThreshold).toBe(false)
  })

  it('delta_pct 15.1 (threshold 15) → discrepancyExceedsThreshold true (just over)', () => {
    const signal = buildEstimateQualitySignal(
      { discrepancy: discrepancy({ delta_pct: 15.1 }), flaggedUnpriced: 0 },
      THRESHOLDS
    )
    expect(signal.discrepancyExceedsThreshold).toBe(true)
  })

  it('delta_pct exactly 15 (threshold 15) → discrepancyExceedsThreshold true (>=)', () => {
    const signal = buildEstimateQualitySignal(
      { discrepancy: discrepancy({ delta_pct: 15 }), flaggedUnpriced: 0 },
      THRESHOLDS
    )
    expect(signal.discrepancyExceedsThreshold).toBe(true)
  })

  it('a negative delta_pct is compared by magnitude (abs) → -20 exceeds', () => {
    const signal = buildEstimateQualitySignal(
      { discrepancy: discrepancy({ delta_pct: -20 }), flaggedUnpriced: 0 },
      THRESHOLDS
    )
    expect(signal.discrepancyExceedsThreshold).toBe(true)
  })

  it('delta_pct null (aiGrand 0) → discrepancyExceedsThreshold false (never flag a null)', () => {
    const signal = buildEstimateQualitySignal(
      { discrepancy: discrepancy({ delta_pct: null }), flaggedUnpriced: 0 },
      THRESHOLDS
    )
    expect(signal.discrepancyExceedsThreshold).toBe(false)
  })

  it('research candidates=10 providerUsable=1 (ratio 0.1 < 0.2, candidates>=5) → researchHitRateLow true', () => {
    const signal = buildEstimateQualitySignal(
      {
        discrepancy: discrepancy(),
        flaggedUnpriced: 0,
        research: { candidates: 10, cacheHits: 0, providerUsable: 1, missed: 9 },
      },
      THRESHOLDS
    )
    expect(signal.researchHitRateLow).toBe(true)
  })

  it('research candidates=3 providerUsable=0 (candidates<5) → researchHitRateLow false (min-sample floor)', () => {
    const signal = buildEstimateQualitySignal(
      {
        discrepancy: discrepancy(),
        flaggedUnpriced: 0,
        research: { candidates: 3, cacheHits: 0, providerUsable: 0, missed: 3 },
      },
      THRESHOLDS
    )
    expect(signal.researchHitRateLow).toBe(false)
  })

  it('absent/undefined telemetry → researchHitRateLow false (no data ⇒ no alarm)', () => {
    const signal = buildEstimateQualitySignal(
      { discrepancy: discrepancy(), flaggedUnpriced: 0 },
      THRESHOLDS
    )
    expect(signal.researchHitRateLow).toBe(false)
  })

  it('healthy research hit-rate (candidates=10 providerUsable=8) → researchHitRateLow false', () => {
    const signal = buildEstimateQualitySignal(
      {
        discrepancy: discrepancy(),
        flaggedUnpriced: 0,
        research: { candidates: 10, cacheHits: 2, providerUsable: 8, missed: 0 },
      },
      THRESHOLDS
    )
    expect(signal.researchHitRateLow).toBe(false)
  })

  it('moved_by_guardrails carried true when anchored_count>0', () => {
    const signal = buildEstimateQualitySignal(
      { discrepancy: discrepancy({ anchored_count: 1, moved_by_guardrails: true }), flaggedUnpriced: 0 },
      THRESHOLDS
    )
    expect(signal.moved_by_guardrails).toBe(true)
  })

  it('moved_by_guardrails carried false when both counts 0', () => {
    const signal = buildEstimateQualitySignal(
      { discrepancy: discrepancy({ anchored_count: 0, clamped_count: 0, moved_by_guardrails: false }), flaggedUnpriced: 0 },
      THRESHOLDS
    )
    expect(signal.moved_by_guardrails).toBe(false)
  })

  it('carries the discrepancy fields + flagged_unpriced through the signal', () => {
    const signal = buildEstimateQualitySignal(
      {
        discrepancy: discrepancy({ delta: 45.3, delta_pct: 45.3, anchored_count: 2, clamped_count: 1, moved_by_guardrails: true }),
        flaggedUnpriced: 3,
      },
      THRESHOLDS
    )
    expect(signal.delta).toBe(45.3)
    expect(signal.delta_pct).toBe(45.3)
    expect(signal.anchored_count).toBe(2)
    expect(signal.clamped_count).toBe(1)
    expect(signal.flagged_unpriced).toBe(3)
  })
})

describe('resolveQualityThresholds (thin env read)', () => {
  const ORIGINAL = process.env.ESTIMATE_DISCREPANCY_WARN_PCT

  beforeEach(() => {
    delete process.env.ESTIMATE_DISCREPANCY_WARN_PCT
  })

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.ESTIMATE_DISCREPANCY_WARN_PCT
    else process.env.ESTIMATE_DISCREPANCY_WARN_PCT = ORIGINAL
  })

  it('defaults to DEFAULT_QUALITY_THRESHOLDS when the env var is unset', () => {
    expect(resolveQualityThresholds()).toEqual(DEFAULT_QUALITY_THRESHOLDS)
  })

  it('reads a finite, >0 ESTIMATE_DISCREPANCY_WARN_PCT override', () => {
    process.env.ESTIMATE_DISCREPANCY_WARN_PCT = '25'
    expect(resolveQualityThresholds().discrepancyWarnPct).toBe(25)
  })

  it('ignores a non-finite / non-positive override (falls back to default 15)', () => {
    process.env.ESTIMATE_DISCREPANCY_WARN_PCT = '-5'
    expect(resolveQualityThresholds().discrepancyWarnPct).toBe(15)
    process.env.ESTIMATE_DISCREPANCY_WARN_PCT = 'abc'
    expect(resolveQualityThresholds().discrepancyWarnPct).toBe(15)
  })
})

describe('reportEstimateQuality (never-throw side-effecter)', () => {
  let infoSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
  })

  afterEach(() => {
    infoSpy.mockRestore()
  })

  it("ALWAYS emits console.info('[totals_discrepancy]', discrepancy) with the SAME object", () => {
    const disc = discrepancy({ delta_pct: 2, anchored_count: 0, clamped_count: 0 })
    const signal = buildEstimateQualitySignal({ discrepancy: disc, flaggedUnpriced: 0 }, THRESHOLDS)

    reportEstimateQuality(disc, signal, { companyId: 'company-1', estimateId: 'estimate-1' })

    expect(infoSpy).toHaveBeenCalledWith('[totals_discrepancy]', disc)
  })

  it('raises a Sentry warning when discrepancyExceedsThreshold', () => {
    const disc = discrepancy({ delta_pct: 45.3 })
    const signal = buildEstimateQualitySignal({ discrepancy: disc, flaggedUnpriced: 0 }, THRESHOLDS)

    reportEstimateQuality(disc, signal, { companyId: 'company-1', estimateId: 'estimate-1' })

    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1)
    const [msg, opts] = vi.mocked(Sentry.captureMessage).mock.calls[0] as [string, Record<string, unknown>]
    expect(typeof msg).toBe('string')
    expect(opts.level).toBe('warning')
    const tags = opts.tags as Record<string, string>
    expect(tags.company_id).toBe('company-1')
    expect(tags.estimate_id).toBe('estimate-1')
    expect(opts.extra).toMatchObject({ discrepancyExceedsThreshold: true })
  })

  it('raises a Sentry warning when researchHitRateLow', () => {
    const disc = discrepancy()
    const signal = buildEstimateQualitySignal(
      { discrepancy: disc, flaggedUnpriced: 0, research: { candidates: 10, cacheHits: 0, providerUsable: 1, missed: 9 } },
      THRESHOLDS
    )

    reportEstimateQuality(disc, signal, { companyId: 'company-1', estimateId: null })

    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1)
    const [, opts] = vi.mocked(Sentry.captureMessage).mock.calls[0] as [string, Record<string, unknown>]
    const tags = opts.tags as Record<string, string>
    expect(tags.estimate_id).toBe('unknown') // null estimateId → 'unknown'
  })

  it('does NOT call Sentry when neither flag set (console.info still fires)', () => {
    const disc = discrepancy({ delta_pct: 5 })
    const signal = buildEstimateQualitySignal({ discrepancy: disc, flaggedUnpriced: 0 }, THRESHOLDS)

    reportEstimateQuality(disc, signal, { companyId: 'company-1', estimateId: 'estimate-1' })

    expect(Sentry.captureMessage).not.toHaveBeenCalled()
    expect(infoSpy).toHaveBeenCalledWith('[totals_discrepancy]', disc)
  })

  it('NEVER throws — a Sentry mock that throws does not rethrow (console.info still fired)', () => {
    vi.mocked(Sentry.captureMessage).mockImplementationOnce(() => {
      throw new Error('sentry down')
    })
    const disc = discrepancy({ delta_pct: 45.3 })
    const signal = buildEstimateQualitySignal({ discrepancy: disc, flaggedUnpriced: 0 }, THRESHOLDS)

    expect(() =>
      reportEstimateQuality(disc, signal, { companyId: 'company-1', estimateId: 'estimate-1' })
    ).not.toThrow()
    expect(infoSpy).toHaveBeenCalledWith('[totals_discrepancy]', disc)
  })
})

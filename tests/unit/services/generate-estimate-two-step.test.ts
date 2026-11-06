import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { EstimateOutput } from '@/lib/ai/types'
import type { ScopePlan } from '@/lib/ai/scope-plan'
import { makeServiceMock } from './generate-harness'

// SEED-057 Phase C (E1): two-step generation is behind ESTIMATOR_TWO_STEP and
// OFF by default. Off must be byte-for-byte the single-step path.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const generateEstimateMock = vi.fn()
const planScopeMock = vi.fn()
const phaseMock = vi.fn()

vi.mock('@/lib/supabase/service', () => ({ requireServiceClient: vi.fn() }))
vi.mock('@/lib/queries/recording', () => ({ getProjectRecordings: vi.fn() }))
vi.mock('@/lib/queries/photo', () => ({ getProjectPhotos: vi.fn() }))
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}))
vi.mock('@/lib/ai', () => ({ getAIProvider: vi.fn() }))
vi.mock('@/lib/ai/provider-with-fallback', () => ({ getAIProviderWithFallback: vi.fn() }))
vi.mock('@/lib/estimate/public-url', () => ({ generatePublicSlugToken: vi.fn().mockReturnValue('tok') }))
vi.mock('@/lib/ai/plan-scope', () => ({ planScope: (...a: unknown[]) => planScopeMock(...a) }))
vi.mock('@/lib/observability/generation-phase', () => ({ reportGeneratePhase: (...a: unknown[]) => phaseMock(...a) }))
vi.mock('@/lib/knowledge/retrieve', () => ({ retrieve: vi.fn().mockResolvedValue([]) }))

import { generateEstimateForProject } from '@/lib/services/generate-estimate'
import { requireServiceClient } from '@/lib/supabase/service'
import { getProjectRecordings } from '@/lib/queries/recording'
import { getProjectPhotos } from '@/lib/queries/photo'
import { getAIProviderWithFallback } from '@/lib/ai/provider-with-fallback'

const OUTPUT: EstimateOutput = {
  suggested_project_name: 'Roof',
  suggested_client_name: null,
  summary: 'Re-roof of the main house.',
  sections: [{ title: 'Shingles', items: [{ description: 'Shingles', quantity: 22, unit: 'sq ft', unit_price: 100, price_source: 'ai_estimate' }] }],
}

const PLAN: ScopePlan = {
  detected_trade: 'roofing',
  measurements: [{ subject: 'roof', value: 2240, unit: 'sq ft', source: 'stated', from: 'audio' }],
  sections: [{ title: 'Tear-off' }, { title: 'Shingles' }],
  assumptions: ['One layer of shingles'],
  exclusions: ['Gutters'],
  open_questions: [{ question: 'Is there a second layer?', impact: 'high' }],
  scope_confidence: 'medium',
}

let mock: ReturnType<typeof makeServiceMock>

function run() {
  return generateEstimateForProject('company-1', 'project-1', { costContext: { attemptId: 'att-1' } })
}

describe('generateEstimateForProject - two-step generation (SEED-057 C)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    delete process.env.ESTIMATOR_TWO_STEP
    generateEstimateMock.mockResolvedValue(OUTPUT)
    vi.mocked(getAIProviderWithFallback).mockResolvedValue({
      generateEstimate: generateEstimateMock,
      refineEstimate: vi.fn(),
    } as never)
    vi.mocked(getProjectRecordings).mockResolvedValue([{ id: 'r', transcript: 'Re-roof the house, about two thousand square feet.' } as never])
    vi.mocked(getProjectPhotos).mockResolvedValue([])
    mock = makeServiceMock({ company: { industry: 'painting' } })
    vi.mocked(requireServiceClient).mockReturnValue({ from: mock.from } as never)
  })
  afterEach(() => {
    delete process.env.ESTIMATOR_TWO_STEP
  })

  it('flag OFF (default): no planning call, no plan on the input, no planning phase', async () => {
    await run()
    expect(planScopeMock).not.toHaveBeenCalled()
    const input = generateEstimateMock.mock.calls[0][0] as Record<string, unknown>
    expect('plan' in input).toBe(false)
    expect('playbookTrade' in input).toBe(false)
    expect(phaseMock.mock.calls.map((c) => (c[0] as { phase: string }).phase)).not.toContain('planning')
  })

  it('flag OFF: an explicit "0" or "false" is still off', async () => {
    for (const v of ['0', 'false', '']) {
      process.env.ESTIMATOR_TWO_STEP = v
      planScopeMock.mockClear()
      await run()
      expect(planScopeMock).not.toHaveBeenCalled()
    }
  })

  it('flag ON: plans first, then hands the plan and its trade to the estimator', async () => {
    process.env.ESTIMATOR_TWO_STEP = '1'
    planScopeMock.mockResolvedValue(PLAN)
    await run()

    expect(planScopeMock).toHaveBeenCalledOnce()
    const input = generateEstimateMock.mock.calls[0][0] as { plan?: ScopePlan; playbookTrade?: string }
    expect(input.plan).toEqual(PLAN)
    expect(input.playbookTrade).toBe('roofing')

    const phases = phaseMock.mock.calls.map((c) => (c[0] as { phase: string }).phase)
    expect(phases.indexOf('planning')).toBeGreaterThan(phases.indexOf('context'))
    expect(phases.indexOf('planning')).toBeLessThan(phases.indexOf('drafting'))
  })

  it('flag ON: planning that fails or is unusable falls back to one step', async () => {
    process.env.ESTIMATOR_TWO_STEP = 'true'
    planScopeMock.mockResolvedValue(null)
    const result = await run()
    expect(result.estimateId).toBe('estimate-1')
    const input = generateEstimateMock.mock.calls[0][0] as Record<string, unknown>
    expect('plan' in input).toBe(false)
    expect('playbookTrade' in input).toBe(false)
  })

  it("flag ON: the plan's assumptions, exclusions and questions are not lost if the estimator drops them", async () => {
    process.env.ESTIMATOR_TWO_STEP = '1'
    planScopeMock.mockResolvedValue(PLAN)
    const result = await run()

    expect(mock.estimateInserts[0].ai_meta).toMatchObject({
      assumptions: ['One layer of shingles'],
      exclusions: ['Gutters'],
      open_questions: [{ question: 'Is there a second layer?', impact: 'high' }],
      scope_confidence: 'medium',
    })
    expect(result.openQuestions).toEqual(['Is there a second layer?'])
  })

  it("flag ON: the estimator's own lists win over the plan's", async () => {
    process.env.ESTIMATOR_TWO_STEP = '1'
    planScopeMock.mockResolvedValue(PLAN)
    generateEstimateMock.mockResolvedValue({ ...OUTPUT, assumptions: ['Its own assumption'] })
    await run()
    expect((mock.estimateInserts[0].ai_meta as { assumptions: string[] }).assumptions).toEqual(['Its own assumption'])
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { EstimateOutput } from '@/lib/ai/types'
import type { ScopePlan } from '@/lib/ai/scope-plan'
import { makeServiceMock } from './generate-harness'

// Phase 4g: Opus escalation of the draft call. Disabled by default; never
// escalates unless ai_config.metadata.escalation is enabled.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const generateEstimateMock = vi.fn()
const planScopeMock = vi.fn()
const phaseMock = vi.fn()
const escalationCfgMock = vi.fn()
const langfuseGen = vi.fn(() => ({ end: vi.fn() }))

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
vi.mock('@/lib/ai/step-models', () => ({ getEscalationConfig: () => escalationCfgMock() }))
vi.mock('@/lib/observability/langfuse', () => ({ langfuseClient: { generation: (...a: unknown[]) => langfuseGen(...(a as [])), flushAsync: async () => {} } }))
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

const OPUS = 'anthropic/claude-opus-5'
const providerArgs = () => vi.mocked(getAIProviderWithFallback).mock.calls[0]
const BIG_PLAN: ScopePlan = { ...PLAN, sections: Array.from({ length: 8 }, (_, i) => ({ title: `S${i}` })) }

describe('generateEstimateForProject - Opus escalation (Phase 4g)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    delete process.env.ESTIMATOR_TWO_STEP
    escalationCfgMock.mockResolvedValue(null)
    langfuseGen.mockImplementation(() => ({ end: vi.fn() }))
    generateEstimateMock.mockResolvedValue(OUTPUT)
    vi.mocked(getAIProviderWithFallback).mockResolvedValue({
      generateEstimate: generateEstimateMock,
      refineEstimate: vi.fn(),
    } as never)
    vi.mocked(getProjectRecordings).mockResolvedValue([{ id: 'r', transcript: 'Re-roof the house, about two thousand square feet.' } as never])
    vi.mocked(getProjectPhotos).mockResolvedValue([])
    mock = makeServiceMock({ company: { industry: 'painting' } })
    vi.mocked(requireServiceClient).mockReturnValue({ from: mock.from } as never)
    vi.spyOn(console, 'info').mockImplementation(() => {})
  })
  afterEach(() => {
    delete process.env.ESTIMATOR_TWO_STEP
  })

  it('DEFAULT (nothing configured): provider resolved with the company id only, no model override, no decision logged', async () => {
    await run()
    expect(providerArgs()).toEqual(['company-1'])
    expect(langfuseGen).not.toHaveBeenCalled()
  })

  it('disabled config (null) never escalates even for a huge job', async () => {
    vi.mocked(getProjectRecordings).mockResolvedValue([{ id: 'r', transcript: 'x'.repeat(50_000) } as never])
    await run()
    expect(providerArgs()).toEqual(['company-1'])
  })

  it('enabled + plan with enough sections: escalates to the Opus model and logs the decision', async () => {
    process.env.ESTIMATOR_TWO_STEP = '1'
    planScopeMock.mockResolvedValue({ plan: BIG_PLAN, costUsd: null })
    escalationCfgMock.mockResolvedValue({ enabled: true, model: OPUS, minSections: 6 })
    await run()
    expect(providerArgs()).toEqual(['company-1', { modelOverride: OPUS }])
    expect(langfuseGen).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'draft_model_decision', metadata: expect.objectContaining({ escalated: true, model: OPUS, reason: 'plan_sections>=6' }) })
    )
    expect(console.info).toHaveBeenCalledWith('[draft_escalation]', expect.objectContaining({ escalated: true }))
  })

  it('enabled + plan below threshold: no escalation, decision still logged', async () => {
    process.env.ESTIMATOR_TWO_STEP = '1'
    planScopeMock.mockResolvedValue({ plan: PLAN, costUsd: null })
    escalationCfgMock.mockResolvedValue({ enabled: true, model: OPUS, minSections: 6 })
    await run()
    expect(providerArgs()).toEqual(['company-1'])
    expect(langfuseGen).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ escalated: false, model: null }) })
    )
  })

  it('enabled + low scope confidence (flag on): escalates', async () => {
    process.env.ESTIMATOR_TWO_STEP = '1'
    planScopeMock.mockResolvedValue({ plan: { ...PLAN, scope_confidence: 'low' }, costUsd: null })
    escalationCfgMock.mockResolvedValue({ enabled: true, model: OPUS, onLowScopeConfidence: true })
    await run()
    expect(providerArgs()).toEqual(['company-1', { modelOverride: OPUS }])
  })

  it('enabled, no plan: only very long source text escalates', async () => {
    escalationCfgMock.mockResolvedValue({ enabled: true, model: OPUS, minSections: 1 })
    await run()
    expect(providerArgs()).toEqual(['company-1'])

    vi.mocked(getAIProviderWithFallback).mockClear()
    vi.mocked(getProjectRecordings).mockResolvedValue([{ id: 'r', transcript: 'paint the walls. '.repeat(1000) } as never])
    await run()
    expect(providerArgs()).toEqual(['company-1', { modelOverride: OPUS }])
  })

  it('a failing config read never breaks generation', async () => {
    escalationCfgMock.mockRejectedValue(new Error('boom'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await run()
    expect(result.estimateId).toBe('estimate-1')
    expect(providerArgs()).toEqual(['company-1'])
  })
})

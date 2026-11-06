import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { EstimateOutput } from '@/lib/ai/types'
import { makeServiceMock } from './generate-harness'

// SEED-057 E5: the company's Knowledge base reaches the estimator.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const generateEstimateMock = vi.fn()
const retrieveMock = vi.fn()

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
vi.mock('@/lib/knowledge/retrieve', () => ({ retrieve: (...a: unknown[]) => retrieveMock(...a) }))

import { generateEstimateForProject } from '@/lib/services/generate-estimate'
import { requireServiceClient } from '@/lib/supabase/service'
import { getProjectRecordings } from '@/lib/queries/recording'
import { getProjectPhotos } from '@/lib/queries/photo'
import { getAIProviderWithFallback } from '@/lib/ai/provider-with-fallback'

const OUTPUT: EstimateOutput = {
  suggested_project_name: 'Repaint',
  suggested_client_name: null,
  summary: 'Repaint.',
  sections: [{ title: 'Painting', items: [{ description: 'Paint walls', quantity: 1, unit_price: 500, price_source: 'ai_estimate' }] }],
}

describe('generateEstimateForProject - company knowledge (SEED-057 E5)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    generateEstimateMock.mockResolvedValue(OUTPUT)
    vi.mocked(getAIProviderWithFallback).mockResolvedValue({
      generateEstimate: generateEstimateMock,
      refineEstimate: vi.fn(),
    } as never)
    vi.mocked(getProjectRecordings).mockResolvedValue([{ id: 'r', transcript: 'Repaint the living room walls.' } as never])
    vi.mocked(getProjectPhotos).mockResolvedValue([])
    const mock = makeServiceMock({ company: { industry: 'painting', industries: ['painting', 'drywall'] } })
    vi.mocked(requireServiceClient).mockReturnValue({ from: mock.from } as never)
  })

  it('retrieves for the trusted company and its industries, and hands the entries to the estimator', async () => {
    retrieveMock.mockResolvedValue([
      { id: 'k1', title: 'Minimum charge', body: 'Our minimum is $150.', source: null, scope: 'company', similarity: 0.9 },
    ])
    await generateEstimateForProject('company-1', 'project-1')

    expect(retrieveMock).toHaveBeenCalledOnce()
    const [query, ctx] = retrieveMock.mock.calls[0]
    expect(query).toContain('Repaint the living room walls.')
    expect(ctx).toEqual({ industries: ['painting', 'drywall'], companyId: 'company-1', k: 5 })

    const input = generateEstimateMock.mock.calls[0][0] as { knowledge?: unknown }
    expect(input.knowledge).toEqual([{ title: 'Minimum charge', body: 'Our minimum is $150.' }])
  })

  it('an empty knowledge base leaves the input untouched', async () => {
    retrieveMock.mockResolvedValue([])
    await generateEstimateForProject('company-1', 'project-1')
    const input = generateEstimateMock.mock.calls[0][0] as Record<string, unknown>
    expect('knowledge' in input).toBe(false)
  })

  it('a knowledge outage never fails the estimate', async () => {
    retrieveMock.mockImplementation(async () => {
      throw new Error('vector search down')
    })
    const result = await generateEstimateForProject('company-1', 'project-1')
    expect(result.estimateId).toBe('estimate-1')
    const input = generateEstimateMock.mock.calls[0][0] as Record<string, unknown>
    expect('knowledge' in input).toBe(false)
  })
})

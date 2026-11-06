import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { EstimateOutput } from '@/lib/ai/types'
import { makeServiceMock } from './generate-harness'

// SEED-057 Phase A persistence: assumptions / exclusions / open questions land
// in estimates.ai_meta and per-line confidence / basis / optional on the item
// rows, and a deploy that lands BEFORE the migration keeps generating (the
// insert is retried without the new columns).
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const generateEstimateMock = vi.fn()

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

import { generateEstimateForProject } from '@/lib/services/generate-estimate'
import { requireServiceClient } from '@/lib/supabase/service'
import { getProjectRecordings } from '@/lib/queries/recording'
import { getProjectPhotos } from '@/lib/queries/photo'
import { getAIProviderWithFallback } from '@/lib/ai/provider-with-fallback'

const RICH: EstimateOutput = {
  suggested_project_name: 'Living Room Repaint',
  suggested_client_name: null,
  summary: 'Repaint of one living room.',
  assumptions: ['Assumes standard 8 ft ceilings'],
  exclusions: ['Furniture moving'],
  open_questions: [{ question: 'Is the ceiling included?', impact: 'high' }],
  scope_confidence: 'medium',
  sections: [
    {
      title: 'Painting',
      items: [
        {
          description: 'Paint walls, two coats',
          quantity: 400,
          unit: 'sq ft',
          unit_price: 1.5,
          price_source: 'ai_estimate',
          confidence: 'high',
          basis: '12 x 14 ft room stated in the audio',
        },
        { description: 'Protect floors', quantity: 1, unit: 'job', unit_price: 60, price_source: 'ai_estimate' },
      ],
    },
  ],
}

const LEGACY: EstimateOutput = {
  suggested_project_name: 'Living Room Repaint',
  suggested_client_name: null,
  summary: 'Repaint of one living room.',
  sections: [
    { title: 'Painting', items: [{ description: 'Paint walls', quantity: 1, unit_price: 500, price_source: 'ai_estimate' }] },
  ],
}

function setup(output: EstimateOutput) {
  generateEstimateMock.mockResolvedValue(output)
  vi.mocked(getAIProviderWithFallback).mockResolvedValue({
    generateEstimate: generateEstimateMock,
    refineEstimate: vi.fn(),
  } as never)
  vi.mocked(getProjectRecordings).mockResolvedValue([{ id: 'r1', transcript: 'Repaint the living room.' } as never])
  vi.mocked(getProjectPhotos).mockResolvedValue([])
}

describe('generateEstimateForProject - ai_meta and per-line metadata (SEED-057 A)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('writes ai_meta on the estimate row and confidence/basis on the item rows', async () => {
    setup(RICH)
    const mock = makeServiceMock()
    vi.mocked(requireServiceClient).mockReturnValue({ from: mock.from } as never)

    await generateEstimateForProject('company-1', 'project-1')

    expect(mock.estimateInserts).toHaveLength(1)
    expect(mock.estimateInserts[0].ai_meta).toMatchObject({
      v: 1,
      assumptions: ['Assumes standard 8 ft ceilings'],
      exclusions: ['Furniture moving'],
      open_questions: [{ question: 'Is the ceiling included?', impact: 'high' }],
      scope_confidence: 'medium',
    })
    const rows = mock.itemInserts[0]
    expect(rows[0]).toMatchObject({ confidence: 'high', basis: '12 x 14 ft room stated in the audio' })
    expect(rows[0]).not.toHaveProperty('optional')
    expect(rows[1]).not.toHaveProperty('confidence')
    expect(rows[1]).not.toHaveProperty('basis')
  })

  it('a legacy output writes exactly the pre-SEED-057 rows (no new keys at all)', async () => {
    setup(LEGACY)
    const mock = makeServiceMock()
    vi.mocked(requireServiceClient).mockReturnValue({ from: mock.from } as never)

    await generateEstimateForProject('company-1', 'project-1')

    expect(mock.estimateInserts[0]).not.toHaveProperty('ai_meta')
    for (const key of ['confidence', 'basis', 'optional']) {
      expect(mock.itemInserts[0][0]).not.toHaveProperty(key)
    }
  })

  it('retries the estimate insert without ai_meta when the column does not exist yet', async () => {
    setup(RICH)
    const mock = makeServiceMock({
      estimateInsertErrors: [{ code: 'PGRST204', message: "Could not find the 'ai_meta' column of 'estimates' in the schema cache" }],
    })
    vi.mocked(requireServiceClient).mockReturnValue({ from: mock.from } as never)

    const result = await generateEstimateForProject('company-1', 'project-1')

    expect(result.estimateId).toBe('estimate-1')
    expect(mock.estimateInserts).toHaveLength(2)
    expect(mock.estimateInserts[0]).toHaveProperty('ai_meta')
    expect(mock.estimateInserts[1]).not.toHaveProperty('ai_meta')
  })

  it('retries the item insert without the new columns when they do not exist yet', async () => {
    setup(RICH)
    const mock = makeServiceMock({
      itemInsertErrors: [{ code: '42703', message: 'column "basis" of relation "estimate_items" does not exist' }],
    })
    vi.mocked(requireServiceClient).mockReturnValue({ from: mock.from } as never)

    await generateEstimateForProject('company-1', 'project-1')

    expect(mock.itemInserts).toHaveLength(2)
    expect(mock.itemInserts[0][0]).toHaveProperty('basis')
    for (const row of mock.itemInserts[1]) {
      for (const key of ['confidence', 'basis', 'optional']) expect(row).not.toHaveProperty(key)
      expect(row).toHaveProperty('description')
    }
  })

  it('an unrelated insert error still fails the generation', async () => {
    setup(RICH)
    const mock = makeServiceMock({ estimateInsertErrors: [{ code: '23503', message: 'foreign key violation' }] })
    vi.mocked(requireServiceClient).mockReturnValue({ from: mock.from } as never)

    await expect(generateEstimateForProject('company-1', 'project-1')).rejects.toThrow('Failed to save estimate')
    expect(mock.estimateInserts).toHaveLength(1)
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { EstimateOutput, EstimateSectionOutput } from '@/lib/ai/types'

// Loads the real generate-estimate service (heavy AI/provider chain) at runtime; under
// vitest's reused forked worker the import can exceed the 5s default (import latency
// under contention, not a mock leak). Per-file timeout keeps it deterministic.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

// Hoisted so the vi.mock factory below (itself hoisted) can close over researchMock.
const { generateEstimateMock, researchMock } = vi.hoisted(() => ({
  generateEstimateMock: vi.fn(),
  researchMock: vi.fn(),
}))

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(),
}))

vi.mock('@/lib/queries/recording', () => ({
  getProjectRecordings: vi.fn(),
}))

vi.mock('@/lib/queries/photo', () => ({
  getProjectPhotos: vi.fn(),
}))

vi.mock('@/lib/queries/price-book', () => ({
  getPriceBookItems: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/ai/provider-with-fallback', () => ({
  getAIProviderWithFallback: vi.fn(),
}))

// The orchestrator under test for the wire — controlled per-case so we can assert the
// integration order, region/currency/companyId args, the non-fatal contract, and the
// flagged→awaiting_details routing without any real cache/provider/quota.
vi.mock('@/lib/estimate/price-research/orchestrator', () => ({
  researchUnmatchedPrices: researchMock,
}))

import { generateEstimateForProject } from '@/lib/services/generate-estimate'
import { requireServiceClient } from '@/lib/supabase/service'
import { getProjectRecordings } from '@/lib/queries/recording'
import { getProjectPhotos } from '@/lib/queries/photo'
import { getPriceBookItems } from '@/lib/queries/price-book'
import { getAIProviderWithFallback } from '@/lib/ai/provider-with-fallback'

const AI_OUTPUT: EstimateOutput = {
  suggested_project_name: 'Smith Couch Cleaning',
  suggested_client_name: null,
  summary: 'Couch cleaning estimate',
  sections: [
    {
      title: 'Cleaning',
      items: [
        {
          description: 'Couch cleaning 8 seats',
          quantity: 1,
          unit_price: 0, // the originating $0 the model produced
          price_source: 'ai_estimate',
        },
      ],
    },
  ],
}

// Re-tag the single ai_estimate item to a researched $180 price — what the orchestrator
// returns when research found a regional market price.
function researchedTo180(sections: EstimateSectionOutput[]): EstimateSectionOutput[] {
  return sections.map((section) => ({
    ...section,
    items: section.items.map((item) =>
      item.price_source === 'ai_estimate'
        ? { ...item, unit_price: 180, price_source: 'researched' as const }
        : item
    ),
  }))
}

/**
 * Chainable, capture-based Supabase service mock. Captures the persisted estimate header
 * (estimates.insert) and the projects.status update so the tests can assert the totals
 * carried the researched price and the status routing.
 */
function makeSupabaseMock() {
  const captured: {
    estimateInsert?: Record<string, unknown>
    projectStatusUpdate?: Record<string, unknown>
  } = {}

  const projectsUpdateSpy = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
    // The final status write carries { status, total }.
    if (payload && 'status' in payload && 'total' in payload) {
      captured.projectStatusUpdate = payload
    }
    return { eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }), then: undefined }
  })
  // .update(...).eq(...) returns a resolved promise for the simple (non-status) updates.
  const projectsUpdateChain = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
    if (payload && 'status' in payload && 'total' in payload) {
      captured.projectStatusUpdate = payload
    }
    return { eq: vi.fn().mockResolvedValue({ error: null }) }
  })

  const fromMock = vi.fn().mockImplementation((table: string) => {
    if (table === 'projects') {
      const projectData = {
        id: 'project-1',
        name: 'Smith Couch',
        project_type: 'Cleaning',
        target_budget: null,
        client: {
          name: 'Smith',
          email: null,
          phone: null,
          address: null,
          city: 'Austin',
          state: 'TX',
          zip: null,
          preferred_language: null,
        },
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: projectData, error: null }),
          }),
        }),
        update: projectsUpdateChain,
      }
    }

    if (table === 'companies') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                industry: 'cleaning',
                currency_code: 'USD',
                default_tax_rate: 0,
                default_payment_terms: 'Net 30',
                default_warranty_terms: '1 year',
                name: 'Test Co',
                default_estimate_language: null,
              },
              error: null,
            }),
          }),
        }),
      }
    }

    if (table === 'clients') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }
    }

    if (table === 'estimates') {
      return {
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
        insert: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
          captured.estimateInsert = payload
          return {
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: 'estimate-1' }, error: null }),
            }),
          }
        }),
      }
    }

    if (table === 'estimate_sections') {
      return {
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'section-1' }, error: null }),
          }),
        }),
      }
    }

    if (table === 'estimate_items') {
      return { insert: vi.fn().mockResolvedValue({ error: null }) }
    }

    if (table === 'estimate_activity') {
      return { insert: vi.fn().mockResolvedValue({ error: null }) }
    }

    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null, error: null }) }),
      }),
    }
  })

  return { fromMock, captured, projectsUpdateSpy }
}

function setupDefaults() {
  generateEstimateMock.mockResolvedValue(AI_OUTPUT)
  vi.mocked(getAIProviderWithFallback).mockResolvedValue({
    generateEstimate: generateEstimateMock,
    refineEstimate: vi.fn(),
  } as never)
  vi.mocked(getProjectRecordings).mockResolvedValue([
    { id: 'rec-1', transcript: 'Clean an 8 seat couch' } as never,
  ])
  vi.mocked(getProjectPhotos).mockResolvedValue([])
  vi.mocked(getPriceBookItems).mockResolvedValue([])
  // Default: research re-tags the ai_estimate item to $180, nothing flagged.
  researchMock.mockImplementation(async (sections: EstimateSectionOutput[]) => ({
    sections: researchedTo180(sections),
    flaggedUnpriced: 0,
  }))
}

describe('generateEstimateForProject — price research wire (108-04)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    setupDefaults()
  })

  it('Test 1 (insertion order): persisted subtotal/total reflect the researched price (research ran BEFORE totals)', async () => {
    const { fromMock, captured } = makeSupabaseMock()
    vi.mocked(requireServiceClient).mockReturnValue({ from: fromMock } as never)

    await generateEstimateForProject('company-1', 'project-1')

    expect(researchMock).toHaveBeenCalledOnce()
    expect(captured.estimateInsert).toBeDefined()
    // Researched $180 × qty 1, tax 0 → subtotal/total = 180 (NOT the model's $0).
    expect(captured.estimateInsert!.subtotal).toBe(180)
    expect(captured.estimateInsert!.total).toBe(180)
  })

  it('Test 2 (non-fatal): a rejecting orchestrator does not break generation; anchored sections persist', async () => {
    researchMock.mockRejectedValue(new Error('research boom'))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { fromMock, captured } = makeSupabaseMock()
    vi.mocked(requireServiceClient).mockReturnValue({ from: fromMock } as never)

    const result = await generateEstimateForProject('company-1', 'project-1')

    expect(result.estimateId).toBe('estimate-1')
    // Pre-research (anchored) price was $0 → totals fall back to 0, no throw bubbles out.
    expect(captured.estimateInsert!.total).toBe(0)
    warnSpy.mockRestore()
  })

  it('Test 3 (region/currency/companyId): orchestrator receives client city+state, currencyCode, the companyId param', async () => {
    const { fromMock } = makeSupabaseMock()
    vi.mocked(requireServiceClient).mockReturnValue({ from: fromMock } as never)

    await generateEstimateForProject('company-1', 'project-1')

    expect(researchMock).toHaveBeenCalledOnce()
    const ctx = researchMock.mock.calls[0][1] as {
      companyId: string
      region: { city: string | null; state: string | null }
      currency: string
      projectId?: string
    }
    expect(ctx.companyId).toBe('company-1')
    expect(ctx.region).toEqual({ city: 'Austin', state: 'TX' })
    expect(ctx.currency).toBe('USD')
    expect(ctx.projectId).toBe('project-1')
  })

  it('Test 4a (flagged + total>0): routes projects.status to awaiting_details', async () => {
    // Research re-tags to $180 but ALSO flags one unpriced item → total>0 + flagged>0.
    researchMock.mockImplementation(async (sections: EstimateSectionOutput[]) => ({
      sections: researchedTo180(sections),
      flaggedUnpriced: 1,
    }))

    const { fromMock, captured } = makeSupabaseMock()
    vi.mocked(requireServiceClient).mockReturnValue({ from: fromMock } as never)

    await generateEstimateForProject('company-1', 'project-1')

    expect(captured.projectStatusUpdate).toBeDefined()
    expect(captured.projectStatusUpdate!.status).toBe('awaiting_details')
    expect(captured.projectStatusUpdate!.total).toBe(180)
  })

  it('Test 4b (no flag): projects.status stays estimate_ready', async () => {
    // Default research mock: re-tags to $180, flaggedUnpriced 0.
    const { fromMock, captured } = makeSupabaseMock()
    vi.mocked(requireServiceClient).mockReturnValue({ from: fromMock } as never)

    await generateEstimateForProject('company-1', 'project-1')

    expect(captured.projectStatusUpdate!.status).toBe('estimate_ready')
    expect(captured.projectStatusUpdate!.total).toBe(180)
  })

  it('Test 4c (flagged but total===0): stays estimate_ready (not blocked, not awaiting_details)', async () => {
    // Nothing got priced (all $0) but an item is flagged → total 0 → NOT awaiting_details
    // (the vagueness gate owns the empty/all-$0 case; the wire only routes total>0).
    researchMock.mockImplementation(async (sections: EstimateSectionOutput[]) => ({
      sections,
      flaggedUnpriced: 1,
    }))

    const { fromMock, captured } = makeSupabaseMock()
    vi.mocked(requireServiceClient).mockReturnValue({ from: fromMock } as never)

    await generateEstimateForProject('company-1', 'project-1')

    expect(captured.projectStatusUpdate!.status).toBe('estimate_ready')
    expect(captured.projectStatusUpdate!.total).toBe(0)
  })
})

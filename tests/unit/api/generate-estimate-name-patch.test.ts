import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { EstimateOutput } from '@/lib/ai/types'

// Module-level mock function references
const generateEstimateMock = vi.fn()
const refineEstimateMock = vi.fn()

// Auth client
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

// Recording + Photo queries
vi.mock('@/lib/queries/recording', () => ({
  getProjectRecordings: vi.fn(),
}))

vi.mock('@/lib/queries/photo', () => ({
  getProjectPhotos: vi.fn(),
}))

// next/cache - revalidatePath
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

// Mock the AI provider layer — replaces direct Anthropic SDK dependency (D-09)
vi.mock('@/lib/ai', () => ({
  getAIProvider: vi.fn(),
}))

import { POST } from '@/app/api/generate-estimate/route'
import { createClient } from '@/lib/supabase/server'
import { getProjectRecordings } from '@/lib/queries/recording'
import { getProjectPhotos } from '@/lib/queries/photo'
import { getAIProvider } from '@/lib/ai'

function makeRequest(projectId: string) {
  return new Request('http://localhost/api/generate-estimate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId }),
  })
}

const DEFAULT_AI_OUTPUT: EstimateOutput = {
  suggested_project_name: 'Smith Kitchen Reno',
  summary: 'Kitchen renovation',
  sections: [
    {
      title: 'Labor',
      items: [
        {
          description: 'Demo',
          quantity: 1,
          unit_price: 500,
          price_source: 'ai_estimate',
        },
      ],
    },
  ],
}

/**
 * Factory to build a supabase mock with configurable project name and update spy.
 */
function makeSupabaseMock(projectName: string) {
  const updateSpy = vi.fn()

  function eqThenSingle(resolveWith: unknown) {
    return {
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue(resolveWith),
      }),
    }
  }

  // The UPDATE chain: .update({...}).eq('id', projectId) → resolves void
  const updateChain = {
    eq: vi.fn().mockResolvedValue({ error: null }),
  }
  updateSpy.mockReturnValue(updateChain)

  // Build from() dispatcher
  const fromMock = vi.fn().mockImplementation((table: string) => {
    if (table === 'companies') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'company-1',
                industry: 'construction',
                default_tax_rate: 0,
                default_payment_terms: null,
                default_warranty_terms: null,
                name: 'Test Co',
              },
              error: null,
            }),
          }),
        }),
      }
    }

    if (table === 'company_price_book') {
      // getPriceBookItems: .select().eq().order().order() → returns empty array
      const innerOrderChain = {
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue(innerOrderChain),
          }),
        }),
      }
    }

    if (table === 'projects') {
      // Needs to handle multiple calls:
      // 1) Initial parallel SELECT for project info
      // 2) SELECT name (for the patch check)
      // 3) UPDATE { status, total } (Step 7)
      // 4) UPDATE { name } (name-patcher, conditional)
      return {
        select: vi.fn().mockImplementation((cols: string) => {
          if (cols === 'name') {
            // This is the name-patch check
            return {
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { name: projectName },
                  error: null,
                }),
              }),
            }
          }
          // Default: full project fetch
          return {
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: 'project-1',
                  name: projectName,
                  project_type: 'General',
                  target_budget: null,
                  client: { name: 'Smith', email: null, phone: null, address: null, city: null, state: null, zip: null },
                },
                error: null,
              }),
            }),
          }
        }),
        update: updateSpy,
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
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'estimate-1' },
              error: null,
            }),
          }),
        }),
      }
    }

    if (table === 'estimate_sections') {
      return {
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'section-1' },
              error: null,
            }),
          }),
        }),
      }
    }

    if (table === 'estimate_items') {
      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
      }
    }

    if (table === 'estimate_activity') {
      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
      }
    }

    // Default fallback
    return {
      select: vi.fn().mockReturnValue(eqThenSingle({ data: null, error: null })),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      update: updateSpy,
    }
  })

  return { fromMock, updateSpy }
}

function setupDefaults() {
  generateEstimateMock.mockResolvedValue(DEFAULT_AI_OUTPUT)
  refineEstimateMock.mockResolvedValue(DEFAULT_AI_OUTPUT)
  vi.mocked(getAIProvider).mockResolvedValue({ generateEstimate: generateEstimateMock, refineEstimate: refineEstimateMock })
  vi.mocked(getProjectRecordings).mockResolvedValue([
    { id: 'rec-1', transcript: 'Replace the kitchen cabinets and countertops' } as never,
  ])
  vi.mocked(getProjectPhotos).mockResolvedValue([])
}

describe('generate-estimate tool schema (D-05)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    setupDefaults()
  })

  it('route calls getAIProvider and generateEstimate returns suggested_project_name', async () => {
    const { fromMock } = makeSupabaseMock('Untitled project — 5/5/2026')

    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: { claims: { sub: 'user-1' } },
        }),
      },
      from: fromMock,
    } as unknown as Awaited<ReturnType<typeof createClient>>)

    const res = await POST(makeRequest('project-1'))
    expect(res.status).toBe(200)

    // The provider's generateEstimate was called once
    expect(generateEstimateMock).toHaveBeenCalledOnce()

    // priceBookItems was passed in the EstimateInput
    const call = generateEstimateMock.mock.calls[0]
    const input = call[0] as { priceBookItems: unknown[] }
    expect(input.priceBookItems).toBeDefined()
    expect(Array.isArray(input.priceBookItems)).toBe(true)
  })
})

describe('project name patch logic (D-05)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    setupDefaults()
  })

  it('updates project name when current name starts with placeholder prefix', async () => {
    const { fromMock, updateSpy } = makeSupabaseMock('Untitled project — 5/5/2026')

    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: { claims: { sub: 'user-1' } },
        }),
      },
      from: fromMock,
    } as unknown as Awaited<ReturnType<typeof createClient>>)

    const res = await POST(makeRequest('project-1'))
    expect(res.status).toBe(200)

    // Find the update call that passed { name: ... }
    const nameUpdateCall = updateSpy.mock.calls.find(
      (args: unknown[]) =>
        args[0] &&
        typeof args[0] === 'object' &&
        'name' in (args[0] as object)
    )
    expect(nameUpdateCall).toBeDefined()
    expect((nameUpdateCall![0] as { name: string }).name).toBe('Smith Kitchen Reno')
  })

  it('preserves user-edited project name (does not call update with name when name is custom)', async () => {
    const { fromMock, updateSpy } = makeSupabaseMock('Smith Bathroom — Phase 2')

    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: { claims: { sub: 'user-1' } },
        }),
      },
      from: fromMock,
    } as unknown as Awaited<ReturnType<typeof createClient>>)

    const res = await POST(makeRequest('project-1'))
    expect(res.status).toBe(200)

    // Assert no update was called with a `name` field (i.e. no name-patch)
    const nameUpdateCall = updateSpy.mock.calls.find(
      (args: unknown[]) =>
        args[0] &&
        typeof args[0] === 'object' &&
        'name' in (args[0] as object)
    )
    expect(nameUpdateCall).toBeUndefined()
  })
})

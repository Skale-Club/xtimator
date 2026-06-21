import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { EstimateOutput } from '@/lib/ai/types'

// Imports the real generate-estimate service (heavy AI/provider chain) at runtime;
// under vitest's reused forked worker the import can exceed the 5s default (import
// latency under contention, not a mock leak). Per-file timeout keeps it deterministic.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const generateEstimateMock = vi.fn()

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(),
}))

vi.mock('@/lib/queries/recording', () => ({
  getProjectRecordings: vi.fn(),
}))

vi.mock('@/lib/queries/photo', () => ({
  getProjectPhotos: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/ai', () => ({
  getAIProvider: vi.fn(),
}))

import { generateEstimateForProject } from '@/lib/services/generate-estimate'
import { requireServiceClient } from '@/lib/supabase/service'
import { getProjectRecordings } from '@/lib/queries/recording'
import { getProjectPhotos } from '@/lib/queries/photo'
import { getAIProvider } from '@/lib/ai'

const DEFAULT_AI_OUTPUT: EstimateOutput = {
  suggested_project_name: 'Smith Kitchen Reno',
  // GUARD-01: EstimateOutput is now single-sourced from estimateOutputSchema, whose
  // suggested_client_name transform always yields string | null (present in output).
  suggested_client_name: null,
  summary: 'Kitchen renovation estimate',
  sections: [
    {
      title: 'Labor',
      items: [
        {
          description: 'Demolition',
          quantity: 1,
          unit_price: 500,
          price_source: 'ai_estimate',
        },
      ],
    },
  ],
}

function makeSupabaseMock({
  projectName = 'Untitled project — 5/5/2026',
  hasClient = true,
  existingClients = [] as Array<{ id: string; name: string }>,
  clientIdUpdateError = null as { message: string } | null,
}: {
  projectName?: string
  hasClient?: boolean
  existingClients?: Array<{ id: string; name: string }>
  clientIdUpdateError?: { message: string } | null
} = {}) {
  const updateSpy = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
    // When updating client_id (auto-link path), respect the configurable error.
    if (clientIdUpdateError && payload && 'client_id' in payload) {
      return {
        eq: vi.fn().mockResolvedValue({ error: clientIdUpdateError }),
      }
    }
    return {
      eq: vi.fn().mockResolvedValue({ error: null }),
    }
  })

  const fromMock = vi.fn().mockImplementation((table: string) => {
    if (table === 'projects') {
      const projectData = {
        id: 'project-1',
        name: projectName,
        project_type: 'General',
        target_budget: null,
        client: hasClient
          ? { name: 'Smith', email: null, phone: null, address: null, city: null, state: null, zip: null }
          : null,
      }
      return {
        select: vi.fn().mockImplementation((cols: string) => {
          if (cols === 'name') {
            return {
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { name: projectName },
                  error: null,
                }),
              }),
            }
          }
          return {
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: projectData, error: null }),
            }),
          }
        }),
        update: updateSpy,
      }
    }

    if (table === 'companies') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                industry: 'construction',
                default_tax_rate: 0.1,
                default_payment_terms: 'Net 30',
                default_warranty_terms: '1 year',
                name: 'Test Co',
              },
              error: null,
            }),
          }),
        }),
      }
    }

    if (table === 'company_price_book') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
      }
    }

    if (table === 'clients') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: existingClients, error: null }),
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
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'estimate-1' }, error: null }),
          }),
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

  return { fromMock, updateSpy }
}

function setupDefaults() {
  generateEstimateMock.mockResolvedValue(DEFAULT_AI_OUTPUT)
  vi.mocked(getAIProvider).mockResolvedValue({
    generateEstimate: generateEstimateMock,
    refineEstimate: vi.fn(),
  })
  vi.mocked(getProjectRecordings).mockResolvedValue([
    { id: 'rec-1', transcript: 'Replace kitchen cabinets' } as never,
  ])
  vi.mocked(getProjectPhotos).mockResolvedValue([])
}

describe('generateEstimateForProject', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    setupDefaults()
  })

  it('returns estimateId and version on success', async () => {
    const { fromMock } = makeSupabaseMock()
    vi.mocked(requireServiceClient).mockReturnValue({ from: fromMock } as never)

    const result = await generateEstimateForProject('company-1', 'project-1')

    expect(result.estimateId).toBe('estimate-1')
    expect(result.version).toBe(1)
    expect(result.clientSuggestion).toBeNull()
  })

  it('calls generateEstimate with correct input fields', async () => {
    const { fromMock } = makeSupabaseMock()
    vi.mocked(requireServiceClient).mockReturnValue({ from: fromMock } as never)

    await generateEstimateForProject('company-1', 'project-1')

    expect(generateEstimateMock).toHaveBeenCalledOnce()
    const input = generateEstimateMock.mock.calls[0][0] as { industry: string; priceBookItems: unknown[] }
    expect(input.industry).toBe('construction')
    expect(Array.isArray(input.priceBookItems)).toBe(true)
  })

  it('throws when project not found', async () => {
    const { fromMock } = makeSupabaseMock()
    // Override projects table to return null
    vi.mocked(requireServiceClient).mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'projects') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }
        }
        return fromMock(table)
      }),
    } as never)

    await expect(
      generateEstimateForProject('company-1', 'project-1')
    ).rejects.toThrow('Project not found')
  })

  it('throws when no transcripts and no photos', async () => {
    const { fromMock } = makeSupabaseMock()
    vi.mocked(requireServiceClient).mockReturnValue({ from: fromMock } as never)
    vi.mocked(getProjectRecordings).mockResolvedValue([])
    vi.mocked(getProjectPhotos).mockResolvedValue([])

    await expect(
      generateEstimateForProject('company-1', 'project-1')
    ).rejects.toThrow('At least one audio transcript, photo, or prompt is required')
  })

  it('accepts photos-only input (no transcript)', async () => {
    const { fromMock } = makeSupabaseMock()
    vi.mocked(requireServiceClient).mockReturnValue({ from: fromMock } as never)
    vi.mocked(getProjectRecordings).mockResolvedValue([])
    vi.mocked(getProjectPhotos).mockResolvedValue([
      { id: 'photo-1', ai_description: 'Kitchen with damaged cabinets' } as never,
    ])

    const result = await generateEstimateForProject('company-1', 'project-1')
    expect(result.estimateId).toBe('estimate-1')
  })

  it('patches placeholder project name from AI suggestion', async () => {
    const { fromMock, updateSpy } = makeSupabaseMock({
      projectName: 'Untitled project — 5/5/2026',
    })
    vi.mocked(requireServiceClient).mockReturnValue({ from: fromMock } as never)

    await generateEstimateForProject('company-1', 'project-1')

    const nameUpdate = updateSpy.mock.calls.find(
      (args: unknown[]) =>
        args[0] && typeof args[0] === 'object' && 'name' in (args[0] as object)
    )
    expect(nameUpdate).toBeDefined()
    expect((nameUpdate![0] as { name: string }).name).toBe('Smith Kitchen Reno')
  })

  it('preserves user-edited project name', async () => {
    const { fromMock, updateSpy } = makeSupabaseMock({
      projectName: 'Smith Bathroom — Phase 2',
    })
    vi.mocked(requireServiceClient).mockReturnValue({ from: fromMock } as never)

    await generateEstimateForProject('company-1', 'project-1')

    const nameUpdate = updateSpy.mock.calls.find(
      (args: unknown[]) =>
        args[0] && typeof args[0] === 'object' && 'name' in (args[0] as object)
    )
    expect(nameUpdate).toBeUndefined()
  })

  it('returns clientSuggestion when AI detects name and project has no client', async () => {
    generateEstimateMock.mockResolvedValue({
      ...DEFAULT_AI_OUTPUT,
      suggested_client_name: 'Johnson',
    })
    vi.mocked(getAIProvider).mockResolvedValue({
      generateEstimate: generateEstimateMock,
      refineEstimate: vi.fn(),
    })

    const { fromMock } = makeSupabaseMock({ hasClient: false })
    vi.mocked(requireServiceClient).mockReturnValue({ from: fromMock } as never)

    const result = await generateEstimateForProject('company-1', 'project-1')
    expect(result.clientSuggestion).not.toBeNull()
    expect(result.clientSuggestion!.detectedName).toBe('Johnson')
    expect(result.clientSuggestion!.matchedClientId).toBeNull()
    expect(result.clientSuggestion!.autoLinked).toBe(false)
  })

  it('does not return clientSuggestion when project already has a client', async () => {
    generateEstimateMock.mockResolvedValue({
      ...DEFAULT_AI_OUTPUT,
      suggested_client_name: 'Smith',
    })
    vi.mocked(getAIProvider).mockResolvedValue({
      generateEstimate: generateEstimateMock,
      refineEstimate: vi.fn(),
    })

    const { fromMock } = makeSupabaseMock({ hasClient: true })
    vi.mocked(requireServiceClient).mockReturnValue({ from: fromMock } as never)

    const result = await generateEstimateForProject('company-1', 'project-1')
    expect(result.clientSuggestion).toBeNull()
  })

  it('auto-links matched client when AI detects existing name and project has no client', async () => {
    generateEstimateMock.mockResolvedValue({
      ...DEFAULT_AI_OUTPUT,
      suggested_client_name: 'Johnson',
    })
    vi.mocked(getAIProvider).mockResolvedValue({
      generateEstimate: generateEstimateMock,
      refineEstimate: vi.fn(),
    })

    const { fromMock, updateSpy } = makeSupabaseMock({
      hasClient: false,
      existingClients: [{ id: 'client-99', name: 'Johnson' }],
    })
    vi.mocked(requireServiceClient).mockReturnValue({ from: fromMock } as never)

    const result = await generateEstimateForProject('company-1', 'project-1')

    expect(result.clientSuggestion).not.toBeNull()
    expect(result.clientSuggestion!.detectedName).toBe('Johnson')
    expect(result.clientSuggestion!.matchedClientId).toBe('client-99')
    expect(result.clientSuggestion!.matchedClientName).toBe('Johnson')
    expect(result.clientSuggestion!.autoLinked).toBe(true)

    const clientIdUpdate = updateSpy.mock.calls.find(
      (args: unknown[]) =>
        args[0] && typeof args[0] === 'object' && 'client_id' in (args[0] as object)
    )
    expect(clientIdUpdate).toBeDefined()
    expect((clientIdUpdate![0] as { client_id: string }).client_id).toBe('client-99')
  })

  it('falls back to autoLinked:false when project update errors', async () => {
    generateEstimateMock.mockResolvedValue({
      ...DEFAULT_AI_OUTPUT,
      suggested_client_name: 'Johnson',
    })
    vi.mocked(getAIProvider).mockResolvedValue({
      generateEstimate: generateEstimateMock,
      refineEstimate: vi.fn(),
    })

    const { fromMock } = makeSupabaseMock({
      hasClient: false,
      existingClients: [{ id: 'client-99', name: 'Johnson' }],
      clientIdUpdateError: { message: 'boom' },
    })
    vi.mocked(requireServiceClient).mockReturnValue({ from: fromMock } as never)

    // Silence the expected console.warn from the auto-link failure path.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await generateEstimateForProject('company-1', 'project-1')

    expect(result.clientSuggestion).not.toBeNull()
    expect(result.clientSuggestion!.detectedName).toBe('Johnson')
    expect(result.clientSuggestion!.matchedClientId).toBe('client-99')
    expect(result.clientSuggestion!.matchedClientName).toBe('Johnson')
    expect(result.clientSuggestion!.autoLinked).toBe(false)

    warnSpy.mockRestore()
  })
})
